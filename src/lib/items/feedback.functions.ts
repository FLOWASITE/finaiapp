/**
 * KTV feedback loop cho item resolution.
 *
 * - submitLineFeedback: lưu verdict (approved/rejected/corrected) vào
 *   item_resolution_log, đồng thời cập nhật supplier_item_mappings để
 *   resolver lần sau tin/giảm tin theo phản hồi.
 * - getLineFeedbackStats: thống kê tiến độ review cho UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeName } from "./normalize";

const VerdictSchema = z.enum(["approved", "rejected", "corrected"]);
const KindSchema = z.enum(["goods", "ccdc", "asset", "service"]);

export const submitLineFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        line_id: z.string().uuid(),
        verdict: VerdictSchema,
        reason: z.string().max(500).optional(),
        corrected_product_id: z.string().uuid().nullable().optional(),
        corrected_kind: KindSchema.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Tìm log mới nhất cho line này
    const { data: log, error: logErr } = await supabase
      .from("item_resolution_log")
      .select(
        "id, tenant_id, supplier_id, raw_name, raw_unit, resolved_product_id, method, score",
      )
      .eq("invoice_line_id", data.line_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logErr) throw new Error(logErr.message);
    if (!log) {
      throw new Error("Chưa có resolution log cho dòng này — hãy chạy resolve trước.");
    }

    // 2. Update verdict + audit
    const { error: updErr } = await supabase
      .from("item_resolution_log")
      .update({
        verdict: data.verdict,
        feedback_reason: data.reason ?? null,
        corrected_product_id: data.corrected_product_id ?? null,
        corrected_kind: data.corrected_kind ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", log.id);
    if (updErr) throw new Error(updErr.message);

    // 3. Nếu KTV đổi kind → ghi đè trên invoice_lines
    if (data.corrected_kind !== undefined && data.corrected_kind !== null) {
      await supabase
        .from("invoice_lines")
        .update({ user_override_kind: data.corrected_kind })
        .eq("id", data.line_id);
    }

    // 4. Hiệu chỉnh supplier_item_mappings (chỉ khi có supplier)
    if (log.supplier_id && log.raw_name) {
      const rawNorm = normalizeName(log.raw_name);

      if (data.verdict === "approved" && log.resolved_product_id) {
        // Tăng tin tưởng / match_count
        const { data: existing } = await supabase
          .from("supplier_item_mappings")
          .select("id, confidence, match_count")
          .eq("tenant_id", log.tenant_id)
          .eq("supplier_id", log.supplier_id)
          .eq("raw_name_norm", rawNorm)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("supplier_item_mappings")
            .update({
              confidence: Math.min(0.99, Number(existing.confidence) + 0.02),
              match_count: (existing.match_count ?? 0) + 1,
              last_seen: new Date().toISOString(),
              source: "user_confirm",
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("supplier_item_mappings").insert({
            tenant_id: log.tenant_id,
            supplier_id: log.supplier_id,
            raw_name: log.raw_name,
            raw_name_norm: rawNorm,
            raw_unit: log.raw_unit,
            product_id: log.resolved_product_id,
            confidence: 0.9,
            match_count: 1,
            source: "user_confirm",
            created_by: userId,
          });
        }
      } else if (data.verdict === "rejected") {
        // Giảm tin tưởng mapping hiện có (nếu có)
        const { data: existing } = await supabase
          .from("supplier_item_mappings")
          .select("id, confidence")
          .eq("tenant_id", log.tenant_id)
          .eq("supplier_id", log.supplier_id)
          .eq("raw_name_norm", rawNorm)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("supplier_item_mappings")
            .update({
              confidence: Math.max(0.3, Number(existing.confidence) - 0.1),
            })
            .eq("id", existing.id);
        }
      } else if (data.verdict === "corrected" && data.corrected_product_id) {
        // Đè mapping bằng product mà KTV chọn
        const { data: existing } = await supabase
          .from("supplier_item_mappings")
          .select("id")
          .eq("tenant_id", log.tenant_id)
          .eq("supplier_id", log.supplier_id)
          .eq("raw_name_norm", rawNorm)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("supplier_item_mappings")
            .update({
              product_id: data.corrected_product_id,
              confidence: 0.9,
              match_count: 1,
              last_seen: new Date().toISOString(),
              source: "user_confirm",
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("supplier_item_mappings").insert({
            tenant_id: log.tenant_id,
            supplier_id: log.supplier_id,
            raw_name: log.raw_name,
            raw_name_norm: rawNorm,
            raw_unit: log.raw_unit,
            product_id: data.corrected_product_id,
            confidence: 0.9,
            match_count: 1,
            source: "user_confirm",
            created_by: userId,
          });
        }
      }
    }

    return { ok: true };
  });

export type LineFeedbackEntry = {
  line_id: string;
  verdict: "approved" | "rejected" | "corrected" | null;
  reason: string | null;
  reviewed_at: string | null;
};

export const getLineFeedbackStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ invoice_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lines, error: lerr } = await supabase
      .from("invoice_lines")
      .select("id")
      .eq("invoice_id", data.invoice_id);
    if (lerr) throw new Error(lerr.message);
    const lineIds = (lines ?? []).map((l) => l.id);
    if (lineIds.length === 0) {
      return { total: 0, approved: 0, rejected: 0, corrected: 0, pending: 0, entries: [] as LineFeedbackEntry[] };
    }

    const { data: logs, error } = await supabase
      .from("item_resolution_log")
      .select("invoice_line_id, verdict, feedback_reason, reviewed_at, created_at")
      .in("invoice_line_id", lineIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Lấy log mới nhất / line
    const latest = new Map<string, any>();
    for (const r of logs ?? []) {
      if (!r.invoice_line_id) continue;
      if (!latest.has(r.invoice_line_id)) latest.set(r.invoice_line_id, r);
    }

    let approved = 0,
      rejected = 0,
      corrected = 0,
      pending = 0;
    const entries: LineFeedbackEntry[] = [];
    for (const id of lineIds) {
      const r = latest.get(id);
      const v = r?.verdict ?? null;
      if (v === "approved") approved++;
      else if (v === "rejected") rejected++;
      else if (v === "corrected") corrected++;
      else pending++;
      entries.push({
        line_id: id,
        verdict: v,
        reason: r?.feedback_reason ?? null,
        reviewed_at: r?.reviewed_at ?? null,
      });
    }

    return {
      total: lineIds.length,
      approved,
      rejected,
      corrected,
      pending,
      entries,
    };
  });

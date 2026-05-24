import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountToKind, vsicToKindHint, type LineKind } from "@/lib/ai/classify-line";

const normalizeTaxId = (s: string) => (s || "").replace(/\D+/g, "");

const Input = z.object({
  supplier_tax_id: z.string().min(1).max(20),
});

export type SupplierSignals = {
  industry_code: string | null;
  industry_hint: { kind: LineKind; label: string } | null;
  history_dist: Partial<Record<LineKind, number>>;
  history_total: number;
};

/**
 * Đọc industry_code của NCC + lịch sử 12 tháng → trả về tín hiệu
 * dùng cho classifyLine (ngành nghề + lịch sử).
 */
export const lookupSupplierSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }): Promise<SupplierSignals> => {
    const { supabase, userId } = context as any;
    const tax = normalizeTaxId(data.supplier_tax_id);
    const empty: SupplierSignals = {
      industry_code: null,
      industry_hint: null,
      history_dist: {},
      history_total: 0,
    };
    if (!tax) return empty;

    const { data: prof } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = prof?.active_tenant_id ?? null;
    if (!tenantId) return empty;

    const { data: sup } = await supabase
      .from("suppliers")
      .select("id, industry_code")
      .eq("tenant_id", tenantId)
      .eq("tax_id", tax)
      .maybeSingle();

    const industry_code = sup?.industry_code ?? null;
    const industry_hint = vsicToKindHint(industry_code);

    // History 12 tháng: dựng historyDist theo expense_account của invoices
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const sinceDate = since.toISOString().slice(0, 10);

    let dist: Partial<Record<LineKind, number>> = {};
    let total = 0;
    if (sup?.id) {
      const { data: hist } = await supabase
        .from("invoices")
        .select("expense_account, total")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", sup.id)
        .gte("issue_date", sinceDate)
        .neq("status", "void")
        .not("expense_account", "is", null)
        .limit(300);
      for (const r of (hist ?? []) as any[]) {
        const kind = accountToKind(r.expense_account);
        if (!kind) continue;
        const w = Math.max(1, Math.round(Number(r.total) || 0));
        dist[kind] = (dist[kind] ?? 0) + w;
        total += w;
      }
    }
    return {
      industry_code,
      industry_hint,
      history_dist: dist,
      history_total: total,
    };
  });

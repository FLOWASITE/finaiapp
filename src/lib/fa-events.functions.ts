import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { z } from "zod";

// ============== Payload schemas per event type ==============
const TransferPayload = z.object({
  from_department_id: z.string().uuid().nullable().optional(),
  to_department_id: z.string().uuid().nullable().optional(),
  from_branch_id: z.string().uuid().nullable().optional(),
  to_branch_id: z.string().uuid().nullable().optional(),
  from_assignee_id: z.string().uuid().nullable().optional(),
  to_assignee_id: z.string().uuid().nullable().optional(),
  from_location: z.string().max(255).nullable().optional(),
  to_location: z.string().max(255).nullable().optional(),
});

const RevaluationPayload = z.object({
  old_cost: z.number().min(0),
  new_cost: z.number().min(0),
  revaluation_account: z.string().min(1).max(20).default("412"), // Chênh lệch đánh giá lại tài sản
});

const MajorRepairPayload = z.object({
  source_account: z.string().min(1).max(20).default("2413"), // XDCB dở dang (sửa chữa lớn)
  asset_account: z.string().min(1).max(20).default("211"),
});

const PartialDisposalPayload = z.object({
  disposal_ratio: z.number().min(0.0001).max(1), // 0..1 (e.g., 0.3 = 30%)
  proceeds: z.number().min(0).default(0),
  proceeds_account: z.string().min(1).max(20).default("1111"),
  other_income_account: z.string().min(1).max(20).default("711"),
  other_expense_account: z.string().min(1).max(20).default("811"),
});

const EventInput = z.object({
  asset_id: z.string().uuid(),
  event_type: z.enum(["TRANSFER", "REVALUATION", "MAJOR_REPAIR", "PARTIAL_DISPOSAL"]),
  event_date: z.string(),
  description: z.string().max(500).nullable().optional(),
  amount: z.number().nullable().optional(),
  payload: z.record(z.string(), z.any()).default({}),
});

export const listAssetEvents = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { assetId?: string; eventType?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("fa_events")
      .select("*, asset:fixed_assets(id, code, name)")
      .eq("tenant_id", tenantId)
      .order("event_date", { ascending: false })
      .limit(500);
    if (data.assetId) q = q.eq("asset_id", data.assetId);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Generic helper: create journal entry + lines, return id
async function postJE(
  supabase: any,
  ctx: { tenantId: string; userId: string },
  args: {
    entry_date: string;
    description: string;
    lines: Array<{ account_code: string; debit?: number; credit?: number; branch_id?: string | null; department_id?: string | null; project_id?: string | null; cost_center_id?: string | null }>;
  }
): Promise<string | null> {
  const { data: entry, error } = await supabase.from("journal_entries").insert({
    user_id: ctx.userId,
    tenant_id: ctx.tenantId,
    entry_date: args.entry_date,
    description: args.description,
  }).select("id").single();
  if (error || !entry) return null;
  await supabase.from("journal_lines").insert(
    args.lines.map((l, i) => ({
      entry_id: entry.id,
      account_code: l.account_code,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      line_order: i,
      branch_id: l.branch_id ?? null,
      department_id: l.department_id ?? null,
      project_id: l.project_id ?? null,
      cost_center_id: l.cost_center_id ?? null,
    }))
  );
  return entry.id;
}

export const createAssetEvent = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => EventInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;

    const { data: asset } = await supabase
      .from("fixed_assets")
      .select("*")
      .eq("id", data.asset_id)
      .eq("tenant_id", tenantId)
      .single();
    if (!asset) throw new Error("Không tìm thấy tài sản");

    let jeId: string | null = null;
    let amount = data.amount ?? null;
    const dimCtx = {
      branch_id: asset.branch_id ?? null,
      department_id: asset.department_id ?? null,
      project_id: asset.project_id ?? null,
      cost_center_id: asset.cost_center_id ?? null,
    };
    const ctx = { tenantId, userId };
    let payload: any = data.payload;
    const desc = data.description ?? `${data.event_type} — ${asset.name} (${asset.code})`;

    switch (data.event_type) {
      case "TRANSFER": {
        payload = TransferPayload.parse(data.payload);
        const update: any = {};
        if (payload.to_department_id !== undefined) update.department_id = payload.to_department_id;
        if (payload.to_branch_id !== undefined) update.branch_id = payload.to_branch_id;
        if (payload.to_assignee_id !== undefined) update.assignee_id = payload.to_assignee_id;
        if (payload.to_location !== undefined) update.location = payload.to_location;
        if (Object.keys(update).length) {
          await supabase.from("fixed_assets").update(update).eq("id", asset.id);
        }
        break;
      }

      case "REVALUATION": {
        payload = RevaluationPayload.parse(data.payload);
        const diff = Number(payload.new_cost) - Number(payload.old_cost);
        amount = diff;
        const abs = Math.abs(diff);
        if (abs > 0) {
          const lines = diff > 0
            ? [
                { account_code: asset.asset_account || "211", debit: abs, ...dimCtx },
                { account_code: payload.revaluation_account, credit: abs },
              ]
            : [
                { account_code: payload.revaluation_account, debit: abs },
                { account_code: asset.asset_account || "211", credit: abs, ...dimCtx },
              ];
          jeId = await postJE(supabase, ctx, {
            entry_date: data.event_date,
            description: `Đánh giá lại ${asset.name} (${asset.code}): ${payload.old_cost} → ${payload.new_cost}`,
            lines,
          });
        }
        await supabase.from("fixed_assets").update({ cost: payload.new_cost }).eq("id", asset.id);
        await supabase
          .from("fa_asset_books")
          .update({ cost_basis: payload.new_cost })
          .eq("asset_id", asset.id);
        break;
      }

      case "MAJOR_REPAIR": {
        payload = MajorRepairPayload.parse(data.payload);
        const amt = Number(data.amount ?? 0);
        if (amt <= 0) throw new Error("Số tiền sửa chữa lớn phải > 0");
        amount = amt;
        jeId = await postJE(supabase, ctx, {
          entry_date: data.event_date,
          description: `Sửa chữa lớn ghi tăng nguyên giá ${asset.name} (${asset.code})`,
          lines: [
            { account_code: payload.asset_account, debit: amt, ...dimCtx },
            { account_code: payload.source_account, credit: amt },
          ],
        });
        const newCost = Number(asset.cost) + amt;
        await supabase.from("fixed_assets").update({ cost: newCost }).eq("id", asset.id);
        await supabase
          .from("fa_asset_books")
          .update({ cost_basis: newCost })
          .eq("asset_id", asset.id);
        break;
      }

      case "PARTIAL_DISPOSAL": {
        payload = PartialDisposalPayload.parse(data.payload);
        const ratio = Number(payload.disposal_ratio);
        // Accum from primary book entries
        const { data: prim } = await supabase
          .from("fa_depreciation_books")
          .select("id, post_to_gl")
          .eq("tenant_id", tenantId)
          .eq("is_primary", true)
          .maybeSingle();
        const { data: deps } = await supabase
          .from("depreciation_entries")
          .select("amount")
          .eq("asset_id", asset.id)
          .eq("book_id", prim?.id ?? null);
        const accum = (deps ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0)
          + Number(asset.opening_accumulated ?? 0);

        const costReduce = Number(asset.cost) * ratio;
        const accumReduce = accum * ratio;
        const proceeds = Number(payload.proceeds ?? 0);
        const residual = costReduce - accumReduce; // remaining NBV being disposed
        const gainLoss = proceeds - residual; // >0 gain (711), <0 loss (811)
        amount = costReduce;

        const lines: any[] = [];
        // Nợ 214 (accumReduce) — Nợ 811 (residual nếu không có proceeds, hoặc residual - proceeds nếu loss) — Có 211 (costReduce)
        // Khi có proceeds: Nợ 111/112 (proceeds) / Có 711 (gain) hoặc giảm 811
        if (accumReduce > 0) lines.push({ account_code: asset.accumulated_account || "214", debit: accumReduce });
        if (residual > 0) lines.push({ account_code: payload.other_expense_account, debit: residual, ...dimCtx });
        lines.push({ account_code: asset.asset_account || "211", credit: costReduce, ...dimCtx });
        if (proceeds > 0) {
          lines.push({ account_code: payload.proceeds_account, debit: proceeds });
          lines.push({ account_code: payload.other_income_account, credit: proceeds });
        }
        jeId = await postJE(supabase, ctx, {
          entry_date: data.event_date,
          description: `Ghi giảm ${(ratio * 100).toFixed(2)}% tài sản ${asset.name} (${asset.code})`,
          lines,
        });

        const newCost = Math.max(0, Number(asset.cost) - costReduce);
        await supabase
          .from("fixed_assets")
          .update({
            cost: newCost,
            status: ratio >= 0.9999 ? "disposed" : asset.status,
          })
          .eq("id", asset.id);
        await supabase
          .from("fa_asset_books")
          .update({ cost_basis: newCost })
          .eq("asset_id", asset.id);
        // Reduce opening_accumulated proportionally to keep books coherent
        await supabase
          .from("fa_asset_books")
          .update({ opening_accumulated: Math.max(0, Number(asset.opening_accumulated ?? 0) * (1 - ratio)) })
          .eq("asset_id", asset.id);

        payload = { ...payload, accum_at_event: accum, cost_reduced: costReduce, accum_reduced: accumReduce, residual, gain_loss: gainLoss };
        break;
      }
    }

    const { data: out, error } = await supabase
      .from("fa_events")
      .insert({
        tenant_id: tenantId,
        asset_id: asset.id,
        event_type: data.event_type,
        event_date: data.event_date,
        amount,
        description: desc,
        payload,
        journal_entry_id: jeId,
        status: "posted",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: out!.id, journal_entry_id: jeId };
  });

export const voidAssetEvent = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; reason?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("fa_events")
      .update({ status: "void", void_reason: data.reason ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

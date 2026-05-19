import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { assertPeriodOpen } from "@/lib/period-lock";
import { z } from "zod";


const DisposalInput = z.object({
  asset_id: z.string().uuid(),
  disposal_date: z.string(),
  disposal_type: z.enum(["liquidation", "sale", "loss", "donation", "capital_contribution"]),
  reason: z.string().max(500).nullable().optional(),
  buyer_party_id: z.string().uuid().nullable().optional(),
  sale_amount: z.number().min(0).default(0),
  sale_vat: z.number().min(0).default(0),
  proceeds_account: z.string().min(1).max(20).default("1111"),
  vat_output_account: z.string().min(1).max(20).default("33311"),
  disposal_cost: z.number().min(0).default(0),
  disposal_cost_account: z.string().min(1).max(20).default("1111"),
  other_income_account: z.string().min(1).max(20).default("711"),
  other_expense_account: z.string().min(1).max(20).default("811"),
  notes: z.string().max(2000).nullable().optional(),
});

async function snapshot(supabase: any, tenantId: string, assetId: string) {
  const { data: a } = await supabase.from("fixed_assets").select("*").eq("id", assetId).eq("tenant_id", tenantId).single();
  if (!a) throw new Error("Không tìm thấy tài sản");
  const { data: prim } = await supabase
    .from("fa_depreciation_books").select("id").eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
  const { data: deps } = prim?.id
    ? await supabase.from("depreciation_entries").select("amount").eq("asset_id", assetId).eq("book_id", prim.id)
    : { data: [] as any[] };
  const accum = (deps ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0)
    + Number(a.opening_accumulated ?? 0);
  return { asset: a, cost: Number(a.cost), accumulated: accum, residual: Math.max(0, Number(a.cost) - accum) };
}

export const previewDisposal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { asset_id: string; sale_amount?: number; disposal_cost?: number }) => i)
  .handler(async ({ data, context }) => {
    const s = await snapshot(context.supabase, context.tenantId, data.asset_id);
    const proceeds = Number(data.sale_amount ?? 0);
    const cost = Number(data.disposal_cost ?? 0);
    const gainLoss = proceeds - s.residual - cost;
    return { ...s, proceeds, cost, gain_loss: gainLoss };
  });

export const listDisposals = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fa_disposals")
      .select("*, asset:fixed_assets(id, code, name)")
      .eq("tenant_id", context.tenantId)
      .order("disposal_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createDisposal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => DisposalInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const snap = await snapshot(supabase, tenantId, data.asset_id);
    const a = snap.asset;
    const dim = {
      branch_id: a.branch_id ?? null, department_id: a.department_id ?? null,
      project_id: a.project_id ?? null, cost_center_id: a.cost_center_id ?? null,
    };
    const proceeds = Number(data.sale_amount ?? 0);
    const vat = Number(data.sale_vat ?? 0);
    const cost = Number(data.disposal_cost ?? 0);
    const residual = snap.residual;
    const gainLoss = proceeds - residual - cost;

    const assetAcct = a.asset_account || "211";
    const accumAcct = a.accumulated_account || "214";

    // Build JE
    const lines: any[] = [];
    // Ghi giảm TSCĐ: Nợ 214 (accum), Nợ 811 (residual), Có 211 (cost)
    if (snap.accumulated > 0) lines.push({ account_code: accumAcct, debit: snap.accumulated });
    if (residual > 0) lines.push({ account_code: data.other_expense_account, debit: residual, ...dim });
    lines.push({ account_code: assetAcct, credit: snap.cost, ...dim });
    // Thu nhập từ bán: Nợ 111/131 (proceeds + vat), Có 711 (proceeds), Có 33311 (vat)
    if (proceeds > 0 || vat > 0) {
      if (proceeds + vat > 0) lines.push({ account_code: data.proceeds_account, debit: proceeds + vat });
      if (proceeds > 0) lines.push({ account_code: data.other_income_account, credit: proceeds });
      if (vat > 0) lines.push({ account_code: data.vat_output_account, credit: vat });
    }
    // Chi phí thanh lý: Nợ 811 / Có 111
    if (cost > 0) {
      lines.push({ account_code: data.other_expense_account, debit: cost, ...dim });
      lines.push({ account_code: data.disposal_cost_account, credit: cost });
    }

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      user_id: userId, tenant_id: tenantId,
      entry_date: data.disposal_date,
      description: `Thanh lý/nhượng bán ${a.name} (${a.code})`,
    }).select("id").single();
    if (jeErr) throw new Error(jeErr.message);
    await supabase.from("journal_lines").insert(
      lines.map((l, i) => ({
        entry_id: je!.id,
        account_code: l.account_code,
        debit: l.debit ?? 0, credit: l.credit ?? 0,
        line_order: i,
        branch_id: l.branch_id ?? null, department_id: l.department_id ?? null,
        project_id: l.project_id ?? null, cost_center_id: l.cost_center_id ?? null,
      }))
    );

    const { data: out, error } = await supabase.from("fa_disposals").insert({
      tenant_id: tenantId,
      asset_id: data.asset_id,
      disposal_date: data.disposal_date,
      disposal_type: data.disposal_type,
      reason: data.reason ?? null,
      buyer_party_id: data.buyer_party_id ?? null,
      sale_amount: proceeds, sale_vat: vat,
      proceeds_account: data.proceeds_account,
      vat_output_account: data.vat_output_account,
      disposal_cost: cost,
      disposal_cost_account: data.disposal_cost_account,
      cost_snapshot: snap.cost,
      accumulated_snapshot: snap.accumulated,
      residual_value: residual,
      gain_loss: gainLoss,
      other_income_account: data.other_income_account,
      other_expense_account: data.other_expense_account,
      asset_account: assetAcct, accumulated_account: accumAcct,
      journal_entry_id: je!.id,
      status: "posted",
      notes: data.notes ?? null,
      created_by: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    await supabase.from("fixed_assets").update({ status: "disposed", cost: 0 }).eq("id", data.asset_id);
    await supabase.from("fa_asset_books").update({ cost_basis: 0 }).eq("asset_id", data.asset_id);
    return { id: out!.id, journal_entry_id: je!.id, gain_loss: gainLoss };
  });

export const voidDisposal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; reason?: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fa_disposals")
      .update({ status: "void", void_reason: data.reason ?? null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

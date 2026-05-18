import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { z } from "zod";

const ReclassInput = z.object({
  asset_id: z.string().uuid(),
  reclass_date: z.string(),
  direction: z.enum(["fa_to_tool", "tool_to_fa"]),
  target_account: z.string().min(1).max(20), // 153 hoặc 242 (fa_to_tool); 211 (tool_to_fa)
  allocation_months: z.number().int().min(0).default(0),
  expense_account: z.string().min(1).max(20).default("6422"),
  reason: z.string().max(500).nullable().optional(),
  // tool_to_fa: nguyên giá mới
  new_cost: z.number().min(0).optional(),
});

export const listReclassifications = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fa_reclassifications")
      .select("*, asset:fixed_assets(id, code, name)")
      .eq("tenant_id", context.tenantId)
      .order("reclass_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createReclassification = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => ReclassInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: a } = await supabase.from("fixed_assets").select("*")
      .eq("id", data.asset_id).eq("tenant_id", tenantId).single();
    if (!a) throw new Error("Không tìm thấy tài sản");

    const { data: prim } = await supabase
      .from("fa_depreciation_books").select("id").eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
    const { data: deps } = prim?.id
      ? await supabase.from("depreciation_entries").select("amount").eq("asset_id", data.asset_id).eq("book_id", prim.id)
      : { data: [] as any[] };
    const accum = (deps ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0)
      + Number(a.opening_accumulated ?? 0);
    const cost = Number(a.cost);
    const residual = Math.max(0, cost - accum);

    const dim = {
      branch_id: a.branch_id ?? null, department_id: a.department_id ?? null,
      project_id: a.project_id ?? null, cost_center_id: a.cost_center_id ?? null,
    };

    const assetAcct = a.asset_account || "211";
    const accumAcct = a.accumulated_account || "214";

    const lines: any[] = [];
    let description = "";

    if (data.direction === "fa_to_tool") {
      // Ghi giảm TSCĐ — kết chuyển sang CCDC (153) hoặc CP trả trước (242)
      // Nợ 214 (accum) / Nợ 153 hoặc 242 (residual) / Có 211 (cost)
      if (accum > 0) lines.push({ account_code: accumAcct, debit: accum });
      if (residual > 0) lines.push({ account_code: data.target_account, debit: residual, ...dim });
      lines.push({ account_code: assetAcct, credit: cost, ...dim });
      description = `Chuyển TSCĐ → ${data.target_account === "153" ? "CCDC" : "CP trả trước"}: ${a.name} (${a.code})`;
    } else {
      // tool_to_fa: ghi nhận TSCĐ từ CCDC. Nợ 211 / Có 153 (hoặc 242)
      const newCost = Number(data.new_cost ?? cost);
      if (newCost <= 0) throw new Error("Nguyên giá mới phải > 0");
      lines.push({ account_code: assetAcct, debit: newCost, ...dim });
      lines.push({ account_code: data.target_account, credit: newCost });
      description = `Chuyển CCDC → TSCĐ: ${a.name} (${a.code})`;
    }

    const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
      user_id: userId, tenant_id: tenantId,
      entry_date: data.reclass_date,
      description,
    }).select("id").single();
    if (jeErr) throw new Error(jeErr.message);
    await supabase.from("journal_lines").insert(
      lines.map((l, i) => ({
        entry_id: je!.id, account_code: l.account_code,
        debit: l.debit ?? 0, credit: l.credit ?? 0, line_order: i,
        branch_id: l.branch_id ?? null, department_id: l.department_id ?? null,
        project_id: l.project_id ?? null, cost_center_id: l.cost_center_id ?? null,
      }))
    );

    const { data: out, error } = await supabase.from("fa_reclassifications").insert({
      tenant_id: tenantId,
      asset_id: data.asset_id,
      reclass_date: data.reclass_date,
      direction: data.direction,
      target_account: data.target_account,
      allocation_months: data.allocation_months,
      cost_snapshot: cost,
      accumulated_snapshot: accum,
      residual_value: residual,
      asset_account: assetAcct,
      accumulated_account: accumAcct,
      expense_account: data.expense_account,
      reason: data.reason ?? null,
      journal_entry_id: je!.id,
      status: "posted",
      created_by: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    if (data.direction === "fa_to_tool") {
      await supabase.from("fixed_assets").update({ status: "disposed" }).eq("id", data.asset_id);
    } else if (data.new_cost) {
      await supabase.from("fixed_assets").update({ cost: data.new_cost, status: "active" }).eq("id", data.asset_id);
      await supabase.from("fa_asset_books").update({ cost_basis: data.new_cost }).eq("asset_id", data.asset_id);
    }

    return { id: out!.id, journal_entry_id: je!.id };
  });

export const voidReclassification = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; reason?: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fa_reclassifications")
      .update({ status: "void", void_reason: data.reason ?? null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

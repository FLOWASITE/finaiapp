import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const Category = z.enum(["ccdc", "rent", "insurance", "license", "repair", "interest", "other"]);
const SourceType = z.enum([
  "purchase_invoice",
  "inventory_issue",
  "fa_conversion",
  "direct_expense",
  "opening_balance",
]);
const PeriodUnit = z.enum(["month", "quarter", "year"]);
const Method = z.enum(["straight_line", "custom_ratio"]);
const Status = z.enum(["active", "suspended", "disposed", "finished"]);

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  category: Category.default("ccdc"),
  source_type: SourceType.default("direct_expense"),
  source_doc_table: z.string().max(64).optional().nullable(),
  source_doc_id: z.string().uuid().optional().nullable(),
  quantity: z.number().min(0).default(1),
  unit: z.string().max(32).optional().nullable(),
  cost: z.number().min(0),
  periods_total: z.number().int().min(1).max(600),
  period_unit: PeriodUnit.default("month"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: Method.default("straight_line"),
  prepaid_account: z.string().min(1).max(20).default("242"),
  expense_account: z.string().min(1).max(20).default("6423"),
  status: Status.default("active"),
  branch_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const listAllocatedAssets = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { status?: string; category?: string; q?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("allocated_assets")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.category && data.category !== "all") q = q.eq("category", data.category);
    if (data.q?.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`code.ilike.${term},name.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      ...r,
      remaining: Number(r.cost) - Number(r.allocated),
    }));
  });

export const getAllocatedAsset = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: asset, error } = await supabase
      .from("allocated_assets")
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !asset) throw new Error("Không tìm thấy CCDC/CPTT");
    const [{ data: targets }, { data: entries }, { data: adjustments }] = await Promise.all([
      supabase.from("allocated_asset_targets").select("*").eq("asset_id", data.id),
      supabase
        .from("allocation_entries")
        .select("*")
        .eq("asset_id", data.id)
        .order("period_month", { ascending: true }),
      supabase
        .from("allocated_asset_adjustments")
        .select("*")
        .eq("asset_id", data.id)
        .order("adj_date", { ascending: false }),
    ]);
    return {
      asset: { ...asset, remaining: Number(asset.cost) - Number(asset.allocated) },
      targets: targets ?? [],
      entries: entries ?? [],
      adjustments: adjustments ?? [],
    };
  });

export const upsertAllocatedAsset = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => UpsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const payload = {
      ...data,
      tenant_id: tenantId,
      user_id: userId,
    };
    if (data.id) {
      const { id, ...rest } = payload;
      const { data: row, error } = await supabase
        .from("allocated_assets")
        .update(rest)
        .eq("id", id!)
        .eq("tenant_id", tenantId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("allocated_assets")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAllocatedAsset = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: asset } = await supabase
      .from("allocated_assets")
      .select("periods_done")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();
    if (asset && Number(asset.periods_done) > 0) {
      throw new Error("CCDC/CPTT đã có bút toán phân bổ — không thể xoá. Hãy thanh lý.");
    }
    const { error } = await supabase
      .from("allocated_assets")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const allocatedAssetsSummary = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data: rows } = await supabase
      .from("allocated_assets")
      .select("cost,allocated,status,periods_total,periods_done")
      .eq("tenant_id", tenantId);
    const list = rows ?? [];
    const totalCost = list.reduce((s, r) => s + Number(r.cost), 0);
    const totalAllocated = list.reduce((s, r) => s + Number(r.allocated), 0);
    const active = list.filter((r) => r.status === "active").length;
    const endingSoon = list.filter(
      (r) =>
        r.status === "active" &&
        Number(r.periods_total) - Number(r.periods_done) > 0 &&
        Number(r.periods_total) - Number(r.periods_done) <= 3,
    ).length;
    return {
      total_cost: totalCost,
      total_allocated: totalAllocated,
      remaining: totalCost - totalAllocated,
      active,
      ending_soon: endingSoon,
      count: list.length,
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { z } from "zod";

const AssetInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  category_id: z.string().uuid().nullable().optional(),
  asset_kind: z.enum(["tangible", "intangible"]).default("tangible"),
  cost: z.number().positive(),
  salvage_value: z.number().min(0).default(0),
  useful_life_months: z.number().int().positive(),
  start_date: z.string(),
  method: z.enum(["straight_line", "declining_balance", "units_of_production"]).default("straight_line"),
  asset_account: z.string().min(1).max(20).default("211"),
  accumulated_account: z.string().min(1).max(20).default("214"),
  expense_account: z.string().min(1).max(20).default("6422"),
  // Quản trị
  supplier_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  serial_no: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  manufacturer: z.string().max(100).nullable().optional(),
  origin_country: z.string().max(50).nullable().optional(),
  mfg_year: z.number().int().min(1900).max(2100).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  quantity: z.number().positive().default(1),
  unit: z.string().max(20).nullable().optional(),
  acquired_date: z.string().nullable().optional(),
  in_service_date: z.string().nullable().optional(),
  source_type: z.enum(["manual", "purchase_invoice", "construction", "capital_contribution", "donation", "transfer"]).default("manual"),
  source_doc_table: z.string().max(50).nullable().optional(),
  source_doc_id: z.string().uuid().nullable().optional(),
  funding_source: z.string().max(100).nullable().optional(),
  opening_accumulated: z.number().min(0).default(0),
  opening_months: z.number().int().min(0).default(0),
  image_url: z.string().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "suspended", "disposed"]).default("active"),
});

export const listFixedAssets = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("fixed_assets")
      .select("id, code, name, cost, status, asset_account, accumulated_account, expense_account, location, department_id, branch_id, assignee_id")
      .eq("tenant_id", tenantId)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });


export const upsertFixedAsset = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => AssetInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const row: any = { ...data, user_id: userId, tenant_id: tenantId };
    if (data.id) {
      const { error } = await supabase.from("fixed_assets").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: out, error } = await supabase
      .from("fixed_assets").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: out!.id };
  });

// Run monthly depreciation. Respects opening_months (số tháng đã trích trước khi nhập sổ).
export const runMonthlyDepreciation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { upToMonth: string }) => i) // YYYY-MM
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const [yStr, mStr] = data.upToMonth.split("-");
    const targetY = Number(yStr), targetM = Number(mStr);
    if (!targetY || !targetM) throw new Error("upToMonth phải có dạng YYYY-MM");

    const { data: assets } = await supabase
      .from("fixed_assets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    let created = 0;
    for (const a of assets ?? []) {
      const life = Number(a.useful_life_months);
      const openingMonths = Number(a.opening_months ?? 0);
      const monthlyAmount = (Number(a.cost) - Number(a.salvage_value)) / life;
      const start = new Date(a.start_date);
      // First period to post = start + opening_months (months already depreciated outside the system)
      const firstPostMonth = new Date(start.getFullYear(), start.getMonth() + openingMonths, 1);
      const { data: existing } = await supabase
        .from("depreciation_entries")
        .select("period_month")
        .eq("asset_id", a.id);
      const done = new Set((existing ?? []).map((e: any) => e.period_month));

      let cur = new Date(firstPostMonth);
      const target = new Date(targetY, targetM - 1, 1);
      let monthsPosted = openingMonths;
      while (cur <= target && monthsPosted < life) {
        const period = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
        if (!done.has(period)) {
          const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
          const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
            user_id: userId,
            tenant_id: tenantId,
            entry_date: lastDay.toISOString().slice(0, 10),
            description: `Trích khấu hao ${a.name} (${a.code}) tháng ${String(cur.getMonth() + 1).padStart(2, "0")}/${cur.getFullYear()}`,
          }).select("id").single();
          if (eErr || !entry) continue;
          await supabase.from("journal_lines").insert([
            { entry_id: entry.id, account_code: a.expense_account, debit: monthlyAmount, credit: 0, line_order: 0,
              branch_id: a.branch_id, department_id: a.department_id, project_id: a.project_id, cost_center_id: a.cost_center_id },
            { entry_id: entry.id, account_code: a.accumulated_account, debit: 0, credit: monthlyAmount, line_order: 1 },
          ]);
          await supabase.from("depreciation_entries").insert({
            asset_id: a.id,
            period_month: period,
            amount: monthlyAmount,
            journal_entry_id: entry.id,
          });
          created++;
        }
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        monthsPosted++;
      }
    }
    return { created };
  });

// =========== Bulk import TSCĐ đầu kỳ (.xlsx) ===========
const BulkRow = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  asset_kind: z.enum(["tangible", "intangible"]).default("tangible"),
  category_code: z.string().max(50).nullable().optional(),
  cost: z.number().positive(),
  salvage_value: z.number().min(0).default(0),
  useful_life_months: z.number().int().positive(),
  start_date: z.string(),
  in_service_date: z.string().nullable().optional(),
  method: z.enum(["straight_line", "declining_balance", "units_of_production"]).default("straight_line"),
  asset_account: z.string().min(1).max(20).default("211"),
  accumulated_account: z.string().min(1).max(20).default("214"),
  expense_account: z.string().min(1).max(20).default("6422"),
  department_code: z.string().max(50).nullable().optional(),
  branch_code: z.string().max(50).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  serial_no: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  manufacturer: z.string().max(100).nullable().optional(),
  origin_country: z.string().max(50).nullable().optional(),
  mfg_year: z.number().int().min(1900).max(2100).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  quantity: z.number().positive().default(1),
  funding_source: z.string().max(100).nullable().optional(),
  opening_accumulated: z.number().min(0).default(0),
  opening_months: z.number().int().min(0).default(0),
  notes: z.string().max(2000).nullable().optional(),
});

export const bulkImportFixedAssets = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { rows: unknown[] }) => ({ rows: z.array(BulkRow).max(2000).parse(i.rows) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    if (!data.rows.length) return { inserted: 0, updated: 0, errors: [] as any[] };

    // Pre-fetch categories / departments / branches lookups
    const [{ data: cats }, { data: depts }, { data: brs }, { data: existing }] = await Promise.all([
      supabase.from("fa_categories").select("id, code").eq("tenant_id", tenantId),
      supabase.from("departments").select("id, code").eq("tenant_id", tenantId),
      supabase.from("branches").select("id, code").eq("tenant_id", tenantId),
      supabase.from("fixed_assets").select("id, code").eq("tenant_id", tenantId),
    ]);
    const catMap = new Map((cats ?? []).map((c: any) => [c.code, c.id]));
    const deptMap = new Map((depts ?? []).map((d: any) => [d.code, d.id]));
    const brMap = new Map((brs ?? []).map((b: any) => [b.code, b.id]));
    const existMap = new Map((existing ?? []).map((e: any) => [e.code, e.id]));

    const errors: { row: number; code: string; message: string }[] = [];
    let inserted = 0, updated = 0;

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const payload: any = {
          tenant_id: tenantId, user_id: userId,
          code: r.code, name: r.name, asset_kind: r.asset_kind,
          cost: r.cost, salvage_value: r.salvage_value,
          useful_life_months: r.useful_life_months,
          start_date: r.start_date,
          in_service_date: r.in_service_date ?? r.start_date,
          method: r.method,
          asset_account: r.asset_account, accumulated_account: r.accumulated_account,
          expense_account: r.expense_account,
          category_id: r.category_code ? catMap.get(r.category_code) ?? null : null,
          department_id: r.department_code ? deptMap.get(r.department_code) ?? null : null,
          branch_id: r.branch_code ? brMap.get(r.branch_code) ?? null : null,
          location: r.location ?? null,
          serial_no: r.serial_no ?? null, model: r.model ?? null,
          manufacturer: r.manufacturer ?? null, origin_country: r.origin_country ?? null,
          mfg_year: r.mfg_year ?? null,
          unit: r.unit ?? null, quantity: r.quantity,
          funding_source: r.funding_source ?? null,
          opening_accumulated: r.opening_accumulated,
          opening_months: r.opening_months,
          notes: r.notes ?? null,
          source_type: "manual" as const,
          status: "active" as const,
        };
        const id = existMap.get(r.code);
        if (id) {
          const { error } = await supabase.from("fixed_assets").update(payload).eq("id", id);
          if (error) throw new Error(error.message);
          updated++;
        } else {
          const { error } = await supabase.from("fixed_assets").insert(payload);
          if (error) throw new Error(error.message);
          inserted++;
        }
      } catch (e: any) {
        errors.push({ row: i + 2, code: r.code, message: e.message });
      }
    }

    return { inserted, updated, errors };
  });

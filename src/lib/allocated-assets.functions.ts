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

// ---------- Helpers ----------
function monthsPerUnit(unit: string): number {
  if (unit === "quarter") return 3;
  if (unit === "year") return 12;
  return 1;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastDayOf(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

/**
 * Build the list of period start-dates that still need posting for one asset,
 * from start_date up to (and including) the period containing upToMonth.
 */
function pendingPeriodsForAsset(
  asset: {
    start_date: string;
    period_unit: string;
    periods_total: number;
    periods_done: number;
  },
  done: Set<string>,
  upToMonth: { y: number; m: number },
): Date[] {
  const step = monthsPerUnit(asset.period_unit);
  const start = new Date(asset.start_date);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const target = new Date(upToMonth.y, upToMonth.m - 1, 1);
  const out: Date[] = [];
  let idx = 0;
  while (idx < Number(asset.periods_total)) {
    if (cursor > target) break;
    if (!done.has(ymd(cursor))) out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + step);
    idx++;
  }
  return out;
}

// ---------- Preview ----------
export const previewAllocation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { upToMonth: string }) =>
    z.object({ upToMonth: z.string().regex(/^\d{4}-\d{2}$/) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const [yS, mS] = data.upToMonth.split("-");
    const target = { y: Number(yS), m: Number(mS) };

    const { data: assets, error } = await supabase
      .from("allocated_assets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const result: Array<{
      id: string;
      code: string;
      name: string;
      periods: number;
      total_amount: number;
    }> = [];
    let grand = 0;
    let totalPeriods = 0;
    for (const a of assets ?? []) {
      const { data: existing } = await supabase
        .from("allocation_entries")
        .select("period_month")
        .eq("asset_id", a.id);
      const done = new Set((existing ?? []).map((e) => e.period_month));
      const pending = pendingPeriodsForAsset(a as any, done, target);
      if (pending.length === 0) continue;
      const perPeriod = Number(a.cost) / Number(a.periods_total);
      const remainingCost = Number(a.cost) - Number(a.allocated);
      // amount approximation; last-period remainder applied at run-time
      const amount = Math.min(perPeriod * pending.length, remainingCost);
      result.push({
        id: a.id,
        code: a.code,
        name: a.name,
        periods: pending.length,
        total_amount: amount,
      });
      grand += amount;
      totalPeriods += pending.length;
    }
    return { items: result, total_amount: grand, total_periods: totalPeriods };
  });

// ---------- Run monthly allocation ----------
export const runMonthlyAllocation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { upToMonth: string }) =>
    z.object({ upToMonth: z.string().regex(/^\d{4}-\d{2}$/) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const [yS, mS] = data.upToMonth.split("-");
    const target = { y: Number(yS), m: Number(mS) };

    const { data: assets, error } = await supabase
      .from("allocated_assets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    let createdEntries = 0;
    let touchedAssets = 0;
    let postedAmount = 0;

    for (const a of assets ?? []) {
      const { data: existing } = await supabase
        .from("allocation_entries")
        .select("period_month")
        .eq("asset_id", a.id);
      const done = new Set((existing ?? []).map((e) => e.period_month));
      const pending = pendingPeriodsForAsset(a as any, done, target);
      if (pending.length === 0) continue;

      let assetAllocated = Number(a.allocated);
      let assetPeriodsDone = Number(a.periods_done);
      const periodsTotal = Number(a.periods_total);
      const cost = Number(a.cost);
      const perPeriod = Math.round((cost / periodsTotal) * 100) / 100;

      for (const periodStart of pending) {
        assetPeriodsDone += 1;
        // last period gets the remainder so total equals cost exactly
        const isLast = assetPeriodsDone >= periodsTotal;
        const amount = isLast ? Math.round((cost - assetAllocated) * 100) / 100 : perPeriod;
        if (amount <= 0) continue;

        const periodMonthStr = ymd(periodStart);
        const entryDate = lastDayOf(periodStart);
        const desc = `Phân bổ ${a.name} (${a.code}) kỳ ${String(
          periodStart.getMonth() + 1,
        ).padStart(2, "0")}/${periodStart.getFullYear()}`;

        const { data: je, error: jErr } = await supabase
          .from("journal_entries")
          .insert({
            user_id: userId,
            tenant_id: tenantId,
            entry_date: entryDate,
            description: desc,
          })
          .select("id")
          .single();
        if (jErr || !je) continue;

        const { error: lErr } = await supabase.from("journal_lines").insert([
          {
            entry_id: je.id,
            account_code: a.expense_account,
            debit: amount,
            credit: 0,
            line_order: 0,
            branch_id: a.branch_id,
            department_id: a.department_id,
            project_id: a.project_id,
            cost_center_id: a.cost_center_id,
          },
          {
            entry_id: je.id,
            account_code: a.prepaid_account,
            debit: 0,
            credit: amount,
            line_order: 1,
          },
        ]);
        if (lErr) continue;

        await supabase.from("allocation_entries").insert({
          asset_id: a.id,
          period_month: periodMonthStr,
          amount,
          journal_entry_id: je.id,
        });

        assetAllocated = Math.round((assetAllocated + amount) * 100) / 100;
        createdEntries += 1;
        postedAmount += amount;
      }

      const newStatus =
        assetPeriodsDone >= periodsTotal ? "finished" : a.status;
      await supabase
        .from("allocated_assets")
        .update({
          allocated: assetAllocated,
          periods_done: assetPeriodsDone,
          status: newStatus,
        })
        .eq("id", a.id);
      touchedAssets += 1;
    }

    return {
      created_entries: createdEntries,
      assets_touched: touchedAssets,
      total_amount: postedAmount,
    };
  });

// ---------- Dispose ----------
export const disposeAllocatedAsset = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        dispose_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        write_off_account: z.string().min(1).max(20).default("811"),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: a, error } = await supabase
      .from("allocated_assets")
      .select("*")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !a) throw new Error("Không tìm thấy CCDC/CPTT");
    if (a.status === "disposed") throw new Error("Tài sản đã thanh lý");

    const remaining = Math.round((Number(a.cost) - Number(a.allocated)) * 100) / 100;

    if (remaining > 0) {
      // Nợ <write_off_account> / Có <prepaid_account>
      const { data: je, error: jErr } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          entry_date: data.dispose_date,
          description: `Thanh lý ${a.name} (${a.code}) — kết chuyển giá trị còn lại${data.reason ? `: ${data.reason}` : ""}`,
        })
        .select("id")
        .single();
      if (jErr || !je) throw new Error(jErr?.message ?? "Không tạo được bút toán");
      await supabase.from("journal_lines").insert([
        {
          entry_id: je.id,
          account_code: data.write_off_account,
          debit: remaining,
          credit: 0,
          line_order: 0,
        },
        {
          entry_id: je.id,
          account_code: a.prepaid_account,
          debit: 0,
          credit: remaining,
          line_order: 1,
        },
      ]);
      await supabase.from("allocated_asset_adjustments").insert({
        asset_id: a.id,
        adj_date: data.dispose_date,
        type: "disposal",
        delta_cost: -remaining,
        delta_periods: 0,
        reason: data.reason ?? null,
        journal_entry_id: je.id,
      });
    }

    await supabase
      .from("allocated_assets")
      .update({
        status: "disposed",
        allocated: Number(a.cost),
        periods_done: Number(a.periods_total),
      })
      .eq("id", a.id);

    return { ok: true, written_off: remaining };
  });

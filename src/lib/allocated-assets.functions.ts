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

// ---------- Reports ----------
export const allocationSchedule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { fromMonth?: string; toMonth?: string; status?: string }) =>
    z
      .object({
        fromMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        toMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        status: z.string().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("allocated_assets")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("code", { ascending: true });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: assets, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (assets ?? []).map((a) => a.id);
    const postedByAsset = new Map<string, Map<string, number>>();
    if (ids.length > 0) {
      const { data: entries } = await supabase
        .from("allocation_entries")
        .select("asset_id,period_month,amount")
        .in("asset_id", ids);
      for (const e of entries ?? []) {
        const m = postedByAsset.get(e.asset_id) ?? new Map();
        m.set(String(e.period_month).slice(0, 7), Number(e.amount));
        postedByAsset.set(e.asset_id, m);
      }
    }

    const from = data.fromMonth ?? null;
    const to = data.toMonth ?? null;

    const rows = (assets ?? []).map((a) => {
      const step = monthsPerUnit(a.period_unit);
      const startDate = new Date(a.start_date);
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const perPeriod = Number(a.cost) / Number(a.periods_total);
      const posted = postedByAsset.get(a.id) ?? new Map();
      const periods: Array<{
        period: string;
        planned: number;
        posted: number;
      }> = [];
      let plannedAcc = 0;
      for (let i = 0; i < Number(a.periods_total); i++) {
        const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const isLast = i === Number(a.periods_total) - 1;
        const planned = isLast
          ? Math.round((Number(a.cost) - plannedAcc) * 100) / 100
          : Math.round(perPeriod * 100) / 100;
        plannedAcc += planned;
        if ((!from || period >= from) && (!to || period <= to)) {
          periods.push({
            period,
            planned,
            posted: posted.get(period) ?? 0,
          });
        }
        cursor.setMonth(cursor.getMonth() + step);
      }
      const sumPlanned = periods.reduce((s, p) => s + p.planned, 0);
      const sumPosted = periods.reduce((s, p) => s + p.posted, 0);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.category,
        prepaid_account: a.prepaid_account,
        expense_account: a.expense_account,
        cost: Number(a.cost),
        allocated: Number(a.allocated),
        periods_total: Number(a.periods_total),
        periods_done: Number(a.periods_done),
        status: a.status,
        periods,
        sum_planned: sumPlanned,
        sum_posted: sumPosted,
        diff: Math.round((sumPosted - sumPlanned) * 100) / 100,
      };
    });

    return {
      rows: rows.filter((r) => r.periods.length > 0),
      total_planned: rows.reduce((s, r) => s + r.sum_planned, 0),
      total_posted: rows.reduce((s, r) => s + r.sum_posted, 0),
    };
  });

export const reconcile242 = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { fromMonth: string; toMonth: string; account?: string }) =>
    z
      .object({
        fromMonth: z.string().regex(/^\d{4}-\d{2}$/),
        toMonth: z.string().regex(/^\d{4}-\d{2}$/),
        account: z.string().min(1).max(20).default("242"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const fromDate = `${data.fromMonth}-01`;
    const [tY, tM] = data.toMonth.split("-").map(Number);
    const toDate = new Date(tY, tM, 0).toISOString().slice(0, 10);

    // Allocation entries side: sum amount per period_month for assets whose prepaid_account = data.account
    const { data: assets } = await supabase
      .from("allocated_assets")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("prepaid_account", data.account);
    const ids = (assets ?? []).map((a) => a.id);

    const subBy = new Map<string, number>();
    if (ids.length > 0) {
      const { data: entries } = await supabase
        .from("allocation_entries")
        .select("period_month,amount")
        .in("asset_id", ids)
        .gte("period_month", fromDate)
        .lte("period_month", toDate);
      for (const e of entries ?? []) {
        const k = String(e.period_month).slice(0, 7);
        subBy.set(k, (subBy.get(k) ?? 0) + Number(e.amount));
      }
    }

    // Journal lines side: credit on `account` in journal_entries within range
    const { data: lines } = await supabase
      .from("journal_lines")
      .select("credit, debit, journal_entries!inner(tenant_id, entry_date)")
      .eq("account_code", data.account)
      .eq("journal_entries.tenant_id", tenantId)
      .gte("journal_entries.entry_date", fromDate)
      .lte("journal_entries.entry_date", toDate);

    const jeCreditBy = new Map<string, number>();
    const jeDebitBy = new Map<string, number>();
    for (const l of lines ?? []) {
      const je: any = (l as any).journal_entries;
      const k = String(je.entry_date).slice(0, 7);
      jeCreditBy.set(k, (jeCreditBy.get(k) ?? 0) + Number(l.credit));
      jeDebitBy.set(k, (jeDebitBy.get(k) ?? 0) + Number(l.debit));
    }

    const months: string[] = [];
    const cur = new Date(Number(data.fromMonth.split("-")[0]), Number(data.fromMonth.split("-")[1]) - 1, 1);
    const end = new Date(tY, tM - 1, 1);
    while (cur <= end) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
      cur.setMonth(cur.getMonth() + 1);
    }

    const rows = months.map((m) => {
      const sub = subBy.get(m) ?? 0;
      const credit = jeCreditBy.get(m) ?? 0;
      const debit = jeDebitBy.get(m) ?? 0;
      return {
        month: m,
        sub_ledger: sub,
        je_credit: credit,
        je_debit: debit,
        diff: Math.round((credit - sub) * 100) / 100,
      };
    });
    return {
      account: data.account,
      rows,
      total_sub: rows.reduce((s, r) => s + r.sub_ledger, 0),
      total_credit: rows.reduce((s, r) => s + r.je_credit, 0),
      total_debit: rows.reduce((s, r) => s + r.je_debit, 0),
    };
  });

// ============================================================
// Step 4: Tích hợp với Hoá đơn mua hàng (purchase invoices)
// ============================================================

const InvoiceLineSelection = z.object({
  invoice_line_id: z.string().uuid(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  category: Category.default("ccdc"),
  quantity: z.number().min(0).default(1),
  unit: z.string().max(32).optional().nullable(),
  cost: z.number().min(0),
  periods_total: z.number().int().min(1).max(600),
  period_unit: PeriodUnit.default("month"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expense_account: z.string().min(1).max(20).default("6423"),
  prepaid_account: z.string().min(1).max(20).default("242"),
});

export const listInvoicesForAllocation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { q?: string; from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("invoices")
      .select("id, invoice_no, supplier_name, issue_date, total, status, payment_status")
      .eq("tenant_id", tenantId)
      .in("status", ["reviewed", "posted"])
      .order("issue_date", { ascending: false })
      .limit(200);
    if (data.from) q = q.gte("issue_date", data.from);
    if (data.to) q = q.lte("issue_date", data.to);
    if (data.q?.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`invoice_no.ilike.${term},supplier_name.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    let usedSet = new Set<string>();
    if (ids.length) {
      const { data: used } = await supabase
        .from("allocated_assets")
        .select("source_doc_id")
        .eq("tenant_id", tenantId)
        .eq("source_doc_table", "invoices")
        .in("source_doc_id", ids);
      usedSet = new Set((used ?? []).map((u) => u.source_doc_id as string));
    }
    return (rows ?? []).map((r) => ({ ...r, has_allocation: usedSet.has(r.id) }));
  });

export const getInvoiceLinesForAllocation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { invoice_id: string }) =>
    z.object({ invoice_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: inv, error: e1 } = await supabase
      .from("invoices")
      .select(
        "id, invoice_no, supplier_name, issue_date, total, subtotal, expense_account, branch_id, department_id, project_id, cost_center_id",
      )
      .eq("id", data.invoice_id)
      .eq("tenant_id", tenantId)
      .single();
    if (e1 || !inv) throw new Error("Không tìm thấy hoá đơn");

    const { data: lines, error: e2 } = await supabase
      .from("invoice_lines")
      .select("id, description, qty, unit_price, amount, line_type")
      .eq("invoice_id", data.invoice_id);
    if (e2) throw new Error(e2.message);

    const { data: existing } = await supabase
      .from("allocated_assets")
      .select("id, code, name, source_doc_id")
      .eq("tenant_id", tenantId)
      .eq("source_doc_table", "invoices")
      .eq("source_doc_id", data.invoice_id);

    return {
      invoice: inv,
      lines: lines ?? [],
      existing_assets: existing ?? [],
    };
  });

export const createAllocatedAssetsFromInvoice = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        items: z.array(InvoiceLineSelection).min(1).max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    // Verify invoice belongs to tenant
    const { data: inv, error: ie } = await supabase
      .from("invoices")
      .select("id, branch_id, department_id, project_id, cost_center_id")
      .eq("id", data.invoice_id)
      .eq("tenant_id", tenantId)
      .single();
    if (ie || !inv) throw new Error("Không tìm thấy hoá đơn");

    const rows = data.items.map((it) => ({
      tenant_id: tenantId,
      user_id: userId,
      code: it.code,
      name: it.name,
      category: it.category,
      source_type: "purchase_invoice" as const,
      source_doc_table: "invoices",
      source_doc_id: data.invoice_id,
      quantity: it.quantity,
      unit: it.unit ?? null,
      cost: it.cost,
      allocated: 0,
      periods_total: it.periods_total,
      periods_done: 0,
      period_unit: it.period_unit,
      start_date: it.start_date,
      method: "straight_line" as const,
      prepaid_account: it.prepaid_account,
      expense_account: it.expense_account,
      status: "active" as const,
      branch_id: inv.branch_id ?? null,
      department_id: inv.department_id ?? null,
      project_id: inv.project_id ?? null,
      cost_center_id: inv.cost_center_id ?? null,
    }));

    const { data: created, error } = await supabase
      .from("allocated_assets")
      .insert(rows)
      .select("id, code, name");
    if (error) throw new Error(error.message);
    return { created: created ?? [] };
  });

// ============================================================
// Step 5: Chuyển đổi TSCĐ → CCDC/CPTT (fa_conversion)
// ============================================================

export const listFixedAssetsForConversion = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { q?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("fixed_assets")
      .select(
        "id, code, name, cost, salvage_value, useful_life_months, start_date, status, asset_account, accumulated_account, branch_id, department_id",
      )
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("code", { ascending: true })
      .limit(500);
    if (data.q?.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`code.ilike.${term},name.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    let depBy = new Map<string, number>();
    if (ids.length) {
      const { data: deps } = await supabase
        .from("depreciation_entries")
        .select("asset_id, amount")
        .in("asset_id", ids);
      for (const d of deps ?? []) {
        depBy.set(d.asset_id as string, (depBy.get(d.asset_id as string) ?? 0) + Number(d.amount));
      }
    }
    return (rows ?? []).map((r) => {
      const accumulated = Math.round((depBy.get(r.id) ?? 0) * 100) / 100;
      const remaining = Math.round((Number(r.cost) - accumulated) * 100) / 100;
      return { ...r, accumulated, remaining };
    });
  });

export const convertFixedAssetToAllocated = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        fixed_asset_id: z.string().uuid(),
        convert_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        code: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(255),
        category: Category.default("ccdc"),
        periods_total: z.number().int().min(1).max(600),
        period_unit: PeriodUnit.default("month"),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        prepaid_account: z.string().min(1).max(20).default("242"),
        expense_account: z.string().min(1).max(20).default("6423"),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: fa, error } = await supabase
      .from("fixed_assets")
      .select("*")
      .eq("id", data.fixed_asset_id)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !fa) throw new Error("Không tìm thấy TSCĐ");
    if (fa.status !== "active") throw new Error("TSCĐ không ở trạng thái hoạt động");

    const { data: deps } = await supabase
      .from("depreciation_entries")
      .select("amount")
      .eq("asset_id", fa.id);
    const accumulated =
      Math.round(((deps ?? []).reduce((s, d) => s + Number(d.amount), 0)) * 100) / 100;
    const cost = Number(fa.cost);
    const remaining = Math.round((cost - accumulated) * 100) / 100;
    if (remaining <= 0) throw new Error("Giá trị còn lại = 0, không cần chuyển đổi");

    // 1) JE write-off TSCĐ: Nợ 214 (accumulated), Nợ 242 (remaining), Có 211 (cost)
    const { data: je, error: jErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        entry_date: data.convert_date,
        description: `Chuyển TSCĐ ${fa.name} (${fa.code}) sang CCDC/CPTT${data.reason ? `: ${data.reason}` : ""}`,
      })
      .select("id")
      .single();
    if (jErr || !je) throw new Error(jErr?.message ?? "Không tạo được bút toán");

    const lines: Array<{
      entry_id: string;
      account_code: string;
      debit: number;
      credit: number;
      line_order: number;
    }> = [];
    let order = 0;
    if (accumulated > 0) {
      lines.push({
        entry_id: je.id,
        account_code: fa.accumulated_account,
        debit: accumulated,
        credit: 0,
        line_order: order++,
      });
    }
    lines.push({
      entry_id: je.id,
      account_code: data.prepaid_account,
      debit: remaining,
      credit: 0,
      line_order: order++,
    });
    lines.push({
      entry_id: je.id,
      account_code: fa.asset_account,
      debit: 0,
      credit: cost,
      line_order: order++,
    });
    const { error: lErr } = await supabase.from("journal_lines").insert(lines);
    if (lErr) throw new Error(lErr.message);

    // 2) Create allocated_asset with cost = remaining
    const { data: created, error: cErr } = await supabase
      .from("allocated_assets")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        code: data.code,
        name: data.name,
        category: data.category,
        source_type: "fa_conversion",
        source_doc_table: "fixed_assets",
        source_doc_id: fa.id,
        quantity: 1,
        cost: remaining,
        allocated: 0,
        periods_total: data.periods_total,
        periods_done: 0,
        period_unit: data.period_unit,
        start_date: data.start_date,
        method: "straight_line",
        prepaid_account: data.prepaid_account,
        expense_account: data.expense_account,
        status: "active",
        branch_id: fa.branch_id ?? null,
        department_id: fa.department_id ?? null,
        notes: `Chuyển từ TSCĐ ${fa.code}. NG ${cost}, KH luỹ kế ${accumulated}, GTCL ${remaining}`,
      })
      .select("id, code, name")
      .single();
    if (cErr) throw new Error(cErr.message);

    // 3) Mark fixed asset disposed
    await supabase
      .from("fixed_assets")
      .update({ status: "disposed" })
      .eq("id", fa.id);

    return { ok: true, created, journal_entry_id: je.id, accumulated, remaining };
  });

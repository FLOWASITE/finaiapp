import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { withLatency } from "@/lib/with-latency";
import { B01_TT99, B01_TT133, B02_TT99, B02_TT133, B03_TT99, B03_TT133, type BSItem, type ISItem, type CFItem } from "./report-mappings";

async function resolveTenantStandard(supabase: any, tenantId: string): Promise<"TT99" | "TT133"> {
  const { data: t } = await supabase.from("tenants").select("accounting_standard").eq("id", tenantId).maybeSingle();
  if ((t as any)?.accounting_standard === "TT133") return "TT133";
  return "TT99";
}

async function resolveBsMapping(supabase: any, tenantId: string): Promise<{ mapping: BSItem[]; circular: "TT99" | "TT133"; totalAssetCode: string; totalEquityCode: string }> {
  const std = await resolveTenantStandard(supabase, tenantId);
  if (std === "TT133") return { mapping: B01_TT133, circular: "TT133", totalAssetCode: "200", totalEquityCode: "500" };
  return { mapping: B01_TT99, circular: "TT99", totalAssetCode: "280", totalEquityCode: "440" };
}

async function resolveIsMapping(supabase: any, tenantId: string): Promise<{ mapping: ISItem[]; circular: "TT99" | "TT133" }> {
  const std = await resolveTenantStandard(supabase, tenantId);
  if (std === "TT133") return { mapping: B02_TT133, circular: "TT133" };
  return { mapping: B02_TT99, circular: "TT99" };
}

async function resolveCfMapping(supabase: any, tenantId: string): Promise<{ mapping: CFItem[]; circular: "TT99" | "TT133" }> {
  const std = await resolveTenantStandard(supabase, tenantId);
  if (std === "TT133") return { mapping: B03_TT133, circular: "TT133" };
  return { mapping: B03_TT99, circular: "TT99" };
}

// ============ Drill-down: lấy danh sách bút toán cấu thành 1 chỉ tiêu BCTC ============
export const drilldownReportItem = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { report: "B01" | "B02" | "B03"; ma_so: string; from?: string; to?: string; asOf?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;

    // ===== B03 drill: replay cash-flow assignment, collect entries for chosen ma_so =====
    if (data.report === "B03") {
      const { mapping: b03Mapping } = await resolveCfMapping(supabase, tenantId);
      const item = b03Mapping.find((x) => x.ma_so === data.ma_so) as any;
      if (!item || !item.counterpart) {
        return { item: item ? { ma_so: item.ma_so, name: item.name } : null, lines: [], total: 0, prefixes: [] };
      }
      try { setResponseHeader("Cache-Control", "private, max-age=60"); } catch {}

      let cashQ = supabase
        .from("journal_lines")
        .select("entry_id, journal_entries!inner(tenant_id, entry_date)")
        .eq("journal_entries.tenant_id", tenantId)
        .or("account_code.like.111%,account_code.like.112%");
      if (data.from) cashQ = cashQ.gte("journal_entries.entry_date", data.from);
      if (data.to) cashQ = cashQ.lte("journal_entries.entry_date", data.to);
      const { data: cashRows, error: cashErr } = await cashQ;
      if (cashErr) throw cashErr;
      const entryIds = Array.from(new Set((cashRows ?? []).map((r: any) => r.entry_id)));
      if (entryIds.length === 0) {
        return { item: { ma_so: item.ma_so, name: item.name }, prefixes: item.counterpart.prefixes, lines: [], total: 0 };
      }

      const { data: entries, error } = await supabase
        .from("journal_entries")
        .select("id, entry_date, description, journal_lines(account_code, debit, credit)")
        .eq("tenant_id", tenantId)
        .in("id", entryIds)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      type B = { entry_id: string; entry_date: string; description: string | null; cash_code: string; counter: string; amount: number };
      const inflows: B[] = []; const outflows: B[] = [];
      for (const e of entries ?? []) {
        const lines = ((e as any).journal_lines ?? []) as Array<{ account_code: string; debit: number; credit: number }>;
        const cashLines = lines.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112"));
        const nonCash = lines.filter(l => !(l.account_code.startsWith("111") || l.account_code.startsWith("112")));
        if (cashLines.length === 0) continue;
        const cashDelta = cashLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
        if (Math.abs(cashDelta) < 0.5) continue;
        const counter = nonCash[0]?.account_code ?? "";
        const b: B = { entry_id: (e as any).id, entry_date: (e as any).entry_date, description: (e as any).description, cash_code: cashLines[0].account_code, counter, amount: Math.abs(cashDelta) };
        (cashDelta > 0 ? inflows : outflows).push(b);
      }
      const usedIn = new Set<number>(); const usedOut = new Set<number>();
      type DLine = { entry_id: string; entry_date: string; description: string | null; account_code: string; counter_account: string; debit: number; credit: number; contribution: number };
      const collected: DLine[] = [];
      let total = 0;
      for (const it of b03Mapping) {
        if (!it.counterpart) continue;
        const { prefixes, direction } = it.counterpart;
        const target = it.ma_so === data.ma_so;
        if (direction === "inflow" || direction === "net") {
          inflows.forEach((f, i) => {
            if (usedIn.has(i) || !prefixes.some(p => f.counter.startsWith(p))) return;
            usedIn.add(i);
            if (target) {
              const contrib = f.amount;
              collected.push({ entry_id: f.entry_id, entry_date: f.entry_date, description: f.description, account_code: f.cash_code, counter_account: f.counter, debit: f.amount, credit: 0, contribution: contrib });
              total += contrib;
            }
          });
        }
        if (direction === "outflow" || direction === "net") {
          outflows.forEach((f, i) => {
            if (usedOut.has(i) || !prefixes.some(p => f.counter.startsWith(p))) return;
            usedOut.add(i);
            if (target) {
              const contrib = direction === "net" ? -f.amount : f.amount;
              collected.push({ entry_id: f.entry_id, entry_date: f.entry_date, description: f.description, account_code: f.cash_code, counter_account: f.counter, debit: 0, credit: f.amount, contribution: contrib });
              total += contrib;
            }
          });
        }
        if (target) break;
      }
      return {
        item: { ma_so: item.ma_so, name: item.name },
        prefixes: item.counterpart.prefixes,
        lines: collected.sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
        total: Math.round(total),
      };
    }

    let b01Mapping: BSItem[] = B01_TT99;
    let b02Mapping: ISItem[] = B02_TT99;
    if (data.report === "B01") {
      const r = await resolveBsMapping(supabase, tenantId);
      b01Mapping = r.mapping;
    } else if (data.report === "B02") {
      const r = await resolveIsMapping(supabase, tenantId);
      b02Mapping = r.mapping;
    }
    const item = (data.report === "B01" ? b01Mapping : b02Mapping).find((x) => x.ma_so === data.ma_so) as any;
    if (!item || !item.accounts || item.accounts.length === 0) {
      return { item: item ? { ma_so: item.ma_so, name: item.name } : null, lines: [], total: 0, prefixes: [] };
    }
    const prefixes: Array<{ prefix: string; sign: 1 | -1; nature: string }> = item.accounts;

    let q = supabase
      .from("journal_entries")
      .select("id, entry_date, description, journal_lines(account_code, debit, credit, line_order)")
      .eq("tenant_id", tenantId)
      .order("entry_date", { ascending: true });
    if (data.report === "B01") {
      if (data.asOf) q = q.lte("entry_date", data.asOf);
    } else {
      if (data.from) q = q.gte("entry_date", data.from);
      if (data.to) q = q.lte("entry_date", data.to);
    }
    const { data: entries, error } = await q;
    if (error) throw error;

    type DrillLine = {
      entry_id: string; entry_date: string; description: string | null;
      account_code: string; debit: number; credit: number; contribution: number;
    };
    const lines: DrillLine[] = [];
    let total = 0;
    for (const e of entries ?? []) {
      for (const l of (e as any).journal_lines ?? []) {
        const code = l.account_code as string;
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        for (const p of prefixes) {
          if (!code.startsWith(p.prefix)) continue;
          let contrib = 0;
          if (data.report === "B01") {
            contrib = (p.nature === "debit" ? debit - credit : credit - debit) * p.sign;
          } else {
            contrib = (p.nature === "revenue" ? credit - debit : debit - credit) * p.sign;
          }
          if (Math.abs(contrib) < 0.005) break;
          lines.push({
            entry_id: (e as any).id, entry_date: (e as any).entry_date, description: (e as any).description,
            account_code: code, debit, credit, contribution: contrib,
          });
          total += contrib;
          break;
        }
      }
    }
    return {
      item: { ma_so: item.ma_so, name: item.name },
      prefixes: prefixes.map((p) => p.prefix),
      lines, total: Math.round(total),
    };
  });


type LineRow = { account_code: string; debit: number; credit: number; entry_date: string };
export type DimFilter = {
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  cost_center_id?: string | null;
};
const hasDims = (d?: DimFilter) =>
  !!(d && (d.branch_id || d.department_id || d.project_id || d.cost_center_id));

async function fetchLines(supabase: any, tenantId: string, from?: string, to?: string, dims?: DimFilter): Promise<LineRow[]> {
  if (hasDims(dims)) {
    let q = supabase
      .from("journal_lines")
      .select("account_code, debit, credit, journal_entries!inner(entry_date, tenant_id)")
      .eq("journal_entries.tenant_id", tenantId);
    if (from) q = q.gte("journal_entries.entry_date", from);
    if (to) q = q.lte("journal_entries.entry_date", to);
    if (dims!.branch_id) q = q.eq("branch_id", dims!.branch_id);
    if (dims!.department_id) q = q.eq("department_id", dims!.department_id);
    if (dims!.project_id) q = q.eq("project_id", dims!.project_id);
    if (dims!.cost_center_id) q = q.eq("cost_center_id", dims!.cost_center_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((l: any) => ({
      account_code: l.account_code,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      entry_date: l.journal_entries.entry_date,
    }));
  }
  let q = supabase
    .from("journal_entries")
    .select("entry_date, journal_lines(account_code, debit, credit)")
    .eq("tenant_id", tenantId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  const { data, error } = await q;
  if (error) throw error;
  const rows: LineRow[] = [];
  for (const e of data ?? []) {
    for (const l of e.journal_lines ?? []) {
      rows.push({ account_code: l.account_code, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, entry_date: e.entry_date });
    }
  }
  return rows;
}

function balanceForPrefix(lines: LineRow[], prefix: string, nature: "debit" | "credit"): number {
  let d = 0, c = 0;
  for (const l of lines) if (l.account_code.startsWith(prefix)) { d += l.debit; c += l.credit; }
  return nature === "debit" ? d - c : c - d;
}

function periodAmountForPrefix(lines: LineRow[], prefix: string, nature: "revenue" | "expense"): number {
  let d = 0, c = 0;
  for (const l of lines) if (l.account_code.startsWith(prefix)) { d += l.debit; c += l.credit; }
  return nature === "revenue" ? c - d : d - c;
}

// ============ B01 — Báo cáo tình hình tài chính ============
export const getBalanceSheetTT99 = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { asOf?: string; compareAsOf?: string }) => i)
  .handler(withLatency("getBalanceSheetTT99", async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const cur = await fetchLines(supabase, tenantId, undefined, data.asOf);
    const prev = data.compareAsOf ? await fetchLines(supabase, tenantId, undefined, data.compareAsOf) : [];

    const computeNetIncome = (lines: LineRow[]) => {
      let rev = 0, exp = 0;
      for (const l of lines) {
        const c = l.account_code;
        if (c.startsWith("5") || c.startsWith("7")) rev += l.credit - l.debit;
        else if (c.startsWith("6") || c.startsWith("8")) exp += l.debit - l.credit;
      }
      return rev - exp;
    };
    const niCur = computeNetIncome(cur);
    const niPrev = computeNetIncome(prev);

    const computeItem = (item: BSItem, lines: LineRow[], ni: number): number => {
      if (item.accounts) {
        let total = 0;
        for (const a of item.accounts) {
          let v = balanceForPrefix(lines, a.prefix, a.nature) * a.sign;
          if (a.prefix === "421" && a.nature === "credit") v += ni;
          total += v;
        }
        return total;
      }
      return 0;
    };

    const valuesCur: Record<string, number> = {};
    const valuesPrev: Record<string, number> = {};

    const { mapping, circular, totalAssetCode, totalEquityCode } = await resolveBsMapping(supabase, tenantId);

    for (const item of mapping) {
      if (item.accounts) {
        valuesCur[item.ma_so] = computeItem(item, cur, niCur);
        valuesPrev[item.ma_so] = computeItem(item, prev, niPrev);
      }
    }
    for (const item of mapping) {
      if (item.formula) {
        valuesCur[item.ma_so] = item.formula.reduce((s, m) => s + (valuesCur[m] ?? 0), 0);
        valuesPrev[item.ma_so] = item.formula.reduce((s, m) => s + (valuesPrev[m] ?? 0), 0);
      }
    }

    const items = mapping.map(it => ({
      ma_so: it.ma_so, name: it.name, level: it.level, group: it.group, bold: !!it.bold,
      current: Math.round(valuesCur[it.ma_so] ?? 0),
      previous: Math.round(valuesPrev[it.ma_so] ?? 0),
    }));

    return {
      items, asOf: data.asOf ?? null, compareAsOf: data.compareAsOf ?? null,
      balanced: Math.abs((valuesCur[totalAssetCode] ?? 0) - (valuesCur[totalEquityCode] ?? 0)) < 1,
      circular,
    };
  }));

// ============ B02 — Kết quả hoạt động kinh doanh ============
export const getIncomeStatementTT99 = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { from?: string; to?: string; compareFrom?: string; compareTo?: string; dims?: DimFilter }) => i)
  .handler(withLatency("getIncomeStatementTT99", async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { mapping, circular } = await resolveIsMapping(supabase, tenantId);
    const cur = await fetchLines(supabase, tenantId, data.from, data.to, data.dims);
    const prev = data.compareFrom ? await fetchLines(supabase, tenantId, data.compareFrom, data.compareTo, data.dims) : [];

    const computeItem = (item: ISItem, lines: LineRow[], values: Record<string, number>): number => {
      if (item.accounts) {
        return item.accounts.reduce((s, a) => s + periodAmountForPrefix(lines, a.prefix, a.nature) * a.sign, 0);
      }
      if (item.formula) {
        return item.formula.reduce((s, f) => s + (values[f.ma_so] ?? 0) * f.sign, 0);
      }
      return 0;
    };

    const vCur: Record<string, number> = {};
    const vPrev: Record<string, number> = {};
    for (const item of mapping) {
      vCur[item.ma_so] = computeItem(item, cur, vCur);
      vPrev[item.ma_so] = computeItem(item, prev, vPrev);
    }

    return {
      items: mapping.map(it => ({
        ma_so: it.ma_so, name: it.name, bold: !!it.bold,
        current: Math.round(vCur[it.ma_so] ?? 0),
        previous: Math.round(vPrev[it.ma_so] ?? 0),
      })),
      period: { from: data.from ?? null, to: data.to ?? null },
      comparePeriod: data.compareFrom ? { from: data.compareFrom, to: data.compareTo } : null,
      circular,
    };
  }));

// ============ B03 — Lưu chuyển tiền tệ (phương pháp trực tiếp) ============
export const getCashFlowDirect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(withLatency("getCashFlowDirect", async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("journal_entries")
      .select("id, entry_date, journal_lines(account_code, debit, credit)")
      .eq("tenant_id", tenantId);
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    const { data: entries, error } = await q;
    if (error) throw error;

    type Bucket = { inflows: { code: string; counter: string; amount: number }[]; outflows: { code: string; counter: string; amount: number }[] };
    const allBuckets: Bucket = { inflows: [], outflows: [] };

    for (const e of entries ?? []) {
      const lines = ((e as any).journal_lines ?? []) as Array<{ account_code: string; debit: number; credit: number }>;
      const cashLines = lines.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112"));
      const nonCash = lines.filter(l => !(l.account_code.startsWith("111") || l.account_code.startsWith("112")));
      if (cashLines.length === 0) continue;
      const cashDelta = cashLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
      if (Math.abs(cashDelta) < 0.5) continue;
      const counter = nonCash[0]?.account_code ?? "";
      if (cashDelta > 0) allBuckets.inflows.push({ code: cashLines[0].account_code, counter, amount: cashDelta });
      else allBuckets.outflows.push({ code: cashLines[0].account_code, counter, amount: -cashDelta });
    }

    const openingLines = data.from ? await fetchLines(supabase, tenantId, undefined, new Date(new Date(data.from).getTime() - 86400000).toISOString().slice(0, 10)) : [];
    const closingLines = await fetchLines(supabase, tenantId, undefined, data.to);
    const cashBalance = (ls: LineRow[]) => ls.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112")).reduce((s, l) => s + l.debit - l.credit, 0);
    const opening = cashBalance(openingLines);
    const closing = cashBalance(closingLines);

    const { mapping: cfMapping, circular } = await resolveCfMapping(supabase, tenantId);
    const values: Record<string, number> = {};
    let usedInflow = new Set<number>();
    let usedOutflow = new Set<number>();

    for (const item of cfMapping) {
      if (item.cashBalance === "opening") { values[item.ma_so] = opening; continue; }
      if (item.counterpart) {
        const { prefixes, direction } = item.counterpart;
        let total = 0;
        if (direction === "inflow" || direction === "net") {
          allBuckets.inflows.forEach((f, i) => {
            if (!usedInflow.has(i) && prefixes.some(p => f.counter.startsWith(p))) { total += f.amount; usedInflow.add(i); }
          });
        }
        if (direction === "outflow" || direction === "net") {
          allBuckets.outflows.forEach((f, i) => {
            if (!usedOutflow.has(i) && prefixes.some(p => f.counter.startsWith(p))) {
              total += direction === "net" ? -f.amount : f.amount; usedOutflow.add(i);
            }
          });
        }
        values[item.ma_so] = total;
      }
    }
    for (const item of cfMapping) {
      if (item.formula) values[item.ma_so] = item.formula.reduce((s, f) => s + (values[f.ma_so] ?? 0) * f.sign, 0);
    }
    if (Math.abs((values["70"] ?? 0) - closing) > 0.5) values["70"] = closing;

    return {
      items: cfMapping.map(it => ({
        ma_so: it.ma_so, name: it.name, section: it.section, bold: !!it.bold,
        amount: Math.round(values[it.ma_so] ?? 0),
      })),
      period: { from: data.from ?? null, to: data.to ?? null },
      circular,
    };
  }));

// ============ Profile (header báo cáo) — lấy theo tenant ============
export const getCompanyProfile = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data } = await supabase
      .from("tenants")
      .select("company_name, tax_id, address, phone, base_currency, fiscal_year_start, accounting_standard, legal_rep_name, chief_accountant_name, preparer_name, signature_url, stamp_url, logo_url")
      .eq("id", tenantId)
      .maybeSingle();
    return data ?? { fiscal_year_start: 1, base_currency: "VND" };
  });

// ============ B09 — Thuyết minh BCTC ============
export const getNotesData = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const [profile, assets, products, payables, receivables, notes, lines, dep] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase.from("fixed_assets").select("id, code, name, cost, useful_life_months, start_date, status, asset_account, accumulated_account, salvage_value, created_at").eq("tenant_id", tenantId),
      supabase.from("products").select("id, code, name, on_hand, unit_cost").eq("tenant_id", tenantId),
      supabase.from("invoices").select("supplier_name, total, payment_status, issue_date").eq("tenant_id", tenantId),
      supabase.from("sales_invoices").select("customer_name, total, status, issue_date").eq("tenant_id", tenantId),
      supabase.from("report_notes").select("section, content").eq("tenant_id", tenantId),
      fetchLines(supabase, tenantId, data.from, data.to),
      supabase.from("depreciation_entries").select("amount, period_month, fixed_assets!inner(tenant_id)").eq("fixed_assets.tenant_id", tenantId),
    ]);

    const inPeriod = (d?: string) => d && (!data.from || d >= data.from) && (!data.to || d <= data.to);
    const allAssets = assets.data ?? [];
    const fixedAssets = allAssets.map((a: any) => ({
      code: a.code, name: a.name, cost: Number(a.cost) || 0, life: a.useful_life_months,
      start: a.start_date, status: a.status, account: a.asset_account,
      addedInPeriod: inPeriod(a.created_at),
    }));
    const tscdSummary = {
      openingCount: allAssets.filter((a: any) => !inPeriod(a.created_at)).length,
      additionsCount: allAssets.filter((a: any) => inPeriod(a.created_at)).length,
      disposalsCount: allAssets.filter((a: any) => a.status === "disposed").length,
      totalCost: allAssets.reduce((s: number, a: any) => s + (Number(a.cost) || 0), 0),
      totalDepreciation: (dep.data ?? []).reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0),
    };

    const inventory = (products.data ?? []).map((p: any) => ({
      code: p.code, name: p.name, qty: Number(p.on_hand) || 0, value: (Number(p.on_hand) || 0) * (Number(p.unit_cost) || 0),
    })).filter((p: any) => p.qty > 0);
    const inventoryTotal = inventory.reduce((s: number, p: any) => s + p.value, 0);

    const today = data.to ?? new Date().toISOString().slice(0, 10);
    const ageDays = (d: string) => Math.max(0, Math.floor((new Date(today).getTime() - new Date(d).getTime()) / 86400000));
    const bucket = (days: number) => days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    const apList = (payables.data ?? []).filter((i: any) => i.payment_status !== "paid");
    const arList = (receivables.data ?? []).filter((i: any) => i.status !== "paid");
    const aging = (list: any[]) => {
      const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      for (const x of list) buckets[bucket(ageDays(x.issue_date ?? today))] += Number(x.total) || 0;
      return buckets;
    };
    const apAging = aging(apList);
    const arAging = aging(arList);

    const revenueByMonth: Record<string, number> = {};
    const expenseByAccount: Record<string, number> = {};
    const accountNames: Record<string, string> = {
      "511": "Doanh thu bán hàng & CCDV", "515": "Doanh thu tài chính", "711": "Thu nhập khác",
      "632": "Giá vốn hàng bán", "635": "Chi phí tài chính", "641": "Chi phí bán hàng",
      "642": "Chi phí quản lý DN", "6421": "Chi phí bán hàng", "6422": "Chi phí QLDN",
      "811": "Chi phí khác", "821": "Chi phí thuế TNDN",
    };
    for (const l of lines) {
      const c = l.account_code;
      if (c.startsWith("511")) {
        const m = l.entry_date.slice(0, 7);
        revenueByMonth[m] = (revenueByMonth[m] ?? 0) + (l.credit - l.debit);
      }
      for (const prefix of Object.keys(accountNames)) {
        if (c.startsWith(prefix)) {
          const amt = prefix.startsWith("5") || prefix.startsWith("7") ? l.credit - l.debit : l.debit - l.credit;
          expenseByAccount[prefix] = (expenseByAccount[prefix] ?? 0) + amt;
          break;
        }
      }
    }
    const expenseByType = Object.entries(expenseByAccount).map(([code, amount]) => ({ code, name: accountNames[code] ?? code, amount: Math.round(amount) })).filter(x => Math.abs(x.amount) > 0.5);
    const revenueMonthly = Object.entries(revenueByMonth).sort().map(([month, amount]) => ({ month, amount: Math.round(amount) }));

    const equityBalances: Record<string, number> = {};
    const equityCodes = ["4111", "4112", "4118", "412", "413", "414", "418", "419", "421", "441"];
    const fullLines = await fetchLines(supabase, tenantId, undefined, data.to);
    for (const code of equityCodes) {
      equityBalances[code] = balanceForPrefix(fullLines, code, "credit");
    }

    const taxBreakdown: Record<string, number> = {};
    const taxNames: Record<string, string> = { "3331": "GTGT đầu ra phải nộp", "3332": "Thuế tiêu thụ đặc biệt", "3333": "Thuế XNK", "3334": "Thuế TNDN", "3335": "Thuế TNCN", "3336": "Thuế tài nguyên", "3337": "Thuế nhà đất", "3338": "Thuế khác", "3339": "Phí, lệ phí" };
    for (const code of Object.keys(taxNames)) {
      const bal = balanceForPrefix(fullLines, code, "credit");
      if (Math.abs(bal) > 0.5) taxBreakdown[code] = Math.round(bal);
    }

    const ap = apList.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
    const ar = arList.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);

    const userNotes: Record<string, string> = {};
    for (const n of notes.data ?? []) userNotes[n.section] = n.content;

    return {
      profile: profile.data ?? null,
      inventory, inventoryTotal: Math.round(inventoryTotal),
      fixedAssets, tscdSummary: { ...tscdSummary, totalCost: Math.round(tscdSummary.totalCost), totalDepreciation: Math.round(tscdSummary.totalDepreciation), netBookValue: Math.round(tscdSummary.totalCost - tscdSummary.totalDepreciation) },
      apAging, arAging,
      revenueMonthly, expenseByType,
      equityBalances: Object.fromEntries(Object.entries(equityBalances).map(([k, v]) => [k, Math.round(v)])),
      taxBreakdown,
      summary: { totalPayables: Math.round(ap), totalReceivables: Math.round(ar) },
      userNotes,
      period: { from: data.from ?? null, to: data.to ?? null },
    };
  });

// ============ Notes CRUD ============
export const upsertReportNote = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { section: string; content: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { error } = await supabase.from("report_notes").upsert(
      { tenant_id: tenantId, user_id: userId, section: data.section, content: data.content, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,section" }
    );
    if (error) throw error;
    return { ok: true };
  });

// ============ Snapshots ============
export const saveReportSnapshot = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { report_type: string; period_from?: string; period_to: string; payload: any }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: row, error } = await supabase.from("report_snapshots").insert({
      tenant_id: tenantId, user_id: userId, report_type: data.report_type, period_from: data.period_from ?? null,
      period_to: data.period_to, payload: data.payload,
    }).select("id").single();
    if (error) throw error;
    return row;
  });

export const listReportSnapshots = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { report_type?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase.from("report_snapshots").select("id, report_type, period_from, period_to, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    if (data.report_type) q = q.eq("report_type", data.report_type);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ============ Legacy aliases ============
export const getBalanceSheet = getBalanceSheetTT99;
export const getIncomeStatement = getIncomeStatementTT99;
export const getCashFlow = getCashFlowDirect;

// ============ Excel Export ============
export const exportReportXlsx = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { report: "B01" | "B02" | "B03"; from?: string; to?: string; asOf?: string }) => i)
  .handler(async ({ data, context }) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(data.report);

    const { supabase, tenantId } = context;
    const profile = (await supabase.from("tenants").select("company_name, tax_id, address").eq("id", tenantId).maybeSingle()).data;

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    const tenantStd = await resolveTenantStandard(supabase, tenantId);
    const b02Label = tenantStd === "TT133" ? "B02-DNN" : "B02-DN";
    const b03Label = tenantStd === "TT133" ? "B03-DNN" : "B03-DN";
    const title = data.report === "B01" ? "BÁO CÁO TÌNH HÌNH TÀI CHÍNH (B01-DN)"
      : data.report === "B02" ? `BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (${b02Label})`
      : `BÁO CÁO LƯU CHUYỂN TIỀN TỆ (${b03Label})`;
    ws.getCell("A5").value = title;
    ws.getCell("A5").font = { bold: true, size: 12 };
    ws.mergeCells("A5:D5");
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.getCell("A7").value = "Chỉ tiêu";
    ws.getCell("B7").value = "Mã số";
    ws.getCell("C7").value = "Kỳ này";
    ws.getCell("D7").value = "Kỳ trước";
    ["A7", "B7", "C7", "D7"].forEach(c => { ws.getCell(c).font = { bold: true }; ws.getCell(c).border = { bottom: { style: "thin" } }; });

    let row = 8;
    if (data.report === "B01") {
      const cur = await fetchLines(supabase, tenantId, undefined, data.asOf);
      const niCur = (() => { let r = 0, e = 0; for (const l of cur) { const c = l.account_code; if (c.startsWith("5") || c.startsWith("7")) r += l.credit - l.debit; else if (c.startsWith("6") || c.startsWith("8")) e += l.debit - l.credit; } return r - e; })();
      const v: Record<string, number> = {};
      const { mapping: bsMap } = await resolveBsMapping(supabase, tenantId);
      for (const it of bsMap) if (it.accounts) v[it.ma_so] = it.accounts.reduce((s, a) => { let x = balanceForPrefix(cur, a.prefix, a.nature) * a.sign; if (a.prefix === "421" && a.nature === "credit") x += niCur; return s + x; }, 0);
      for (const it of bsMap) if (it.formula) v[it.ma_so] = it.formula.reduce((s, m) => s + (v[m] ?? 0), 0);
      for (const it of bsMap) {
        ws.getCell(`A${row}`).value = (it.level === 2 ? "      " : it.level === 1 ? "  " : "") + it.name;
        ws.getCell(`B${row}`).value = it.ma_so;
        ws.getCell(`C${row}`).value = Math.round(v[it.ma_so] ?? 0);
        ws.getCell(`C${row}`).numFmt = "#,##0;(#,##0);-";
        if (it.bold) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`C${row}`).font = { bold: true }; }
        row++;
      }
    } else if (data.report === "B02") {
      const lines = await fetchLines(supabase, tenantId, data.from, data.to);
      const v: Record<string, number> = {};
      const { mapping: isMap } = await resolveIsMapping(supabase, tenantId);
      for (const it of isMap) {
        if (it.accounts) v[it.ma_so] = it.accounts.reduce((s, a) => s + periodAmountForPrefix(lines, a.prefix, a.nature) * a.sign, 0);
        else if (it.formula) v[it.ma_so] = it.formula.reduce((s, f) => s + (v[f.ma_so] ?? 0) * f.sign, 0);
      }
      for (const it of isMap) {
        ws.getCell(`A${row}`).value = it.name;
        ws.getCell(`B${row}`).value = it.ma_so;
        ws.getCell(`C${row}`).value = Math.round(v[it.ma_so] ?? 0);
        ws.getCell(`C${row}`).numFmt = "#,##0;(#,##0);-";
        if (it.bold) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`C${row}`).font = { bold: true }; }
        row++;
      }
    } else {
      let q = supabase.from("journal_entries").select("id, entry_date, journal_lines(account_code, debit, credit)").eq("tenant_id", tenantId);
      if (data.from) q = q.gte("entry_date", data.from);
      if (data.to) q = q.lte("entry_date", data.to);
      const entries = (await q).data ?? [];
      const ins: any[] = [], outs: any[] = [];
      for (const e of entries as any[]) {
        const ls = (e.journal_lines ?? []) as any[];
        const cash = ls.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112"));
        const nc = ls.filter(l => !(l.account_code.startsWith("111") || l.account_code.startsWith("112")));
        if (cash.length === 0) continue;
        const delta = cash.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(delta) < 0.5) continue;
        const counter = nc[0]?.account_code ?? "";
        if (delta > 0) ins.push({ counter, amount: delta }); else outs.push({ counter, amount: -delta });
      }
      const usedI = new Set<number>(), usedO = new Set<number>();
      const v: Record<string, number> = {};
      const openL = data.from ? await fetchLines(supabase, tenantId, undefined, new Date(new Date(data.from).getTime() - 86400000).toISOString().slice(0, 10)) : [];
      const closeL = await fetchLines(supabase, tenantId, undefined, data.to);
      const cashBal = (ls: any[]) => ls.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112")).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
      const opening = cashBal(openL), closing = cashBal(closeL);
      const { mapping: cfMap } = await resolveCfMapping(supabase, tenantId);
      for (const it of cfMap) {
        if (it.cashBalance === "opening") { v[it.ma_so] = opening; continue; }
        if (it.counterpart) {
          const { prefixes, direction } = it.counterpart;
          let total = 0;
          if (direction !== "outflow") ins.forEach((f, i) => { if (!usedI.has(i) && prefixes.some(p => f.counter.startsWith(p))) { total += f.amount; usedI.add(i); } });
          if (direction !== "inflow") outs.forEach((f, i) => { if (!usedO.has(i) && prefixes.some(p => f.counter.startsWith(p))) { total += direction === "net" ? -f.amount : f.amount; usedO.add(i); } });
          v[it.ma_so] = total;
        } else if (it.formula) v[it.ma_so] = it.formula.reduce((s, f) => s + (v[f.ma_so] ?? 0) * f.sign, 0);
      }
      if (Math.abs((v["70"] ?? 0) - closing) > 0.5) v["70"] = closing;
      for (const it of cfMap) {
        ws.getCell(`A${row}`).value = it.name;
        ws.getCell(`B${row}`).value = it.ma_so;
        ws.getCell(`C${row}`).value = Math.round(v[it.ma_so] ?? 0);
        ws.getCell(`C${row}`).numFmt = "#,##0;(#,##0);-";
        if (it.bold) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`C${row}`).font = { bold: true }; }
        row++;
      }
    }

    ws.getColumn(1).width = 55;
    ws.getColumn(2).width = 10;
    ws.getColumn(3).width = 20;
    ws.getColumn(4).width = 20;

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { filename: `${data.report}_${data.to ?? data.asOf ?? "report"}.xlsx`, base64 };
  });

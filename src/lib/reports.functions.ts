import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Line = { account_code: string; debit: number; credit: number };

async function fetchAll(supabase: any, userId: string, from?: string, to?: string) {
  let q = supabase
    .from("journal_entries")
    .select("id, entry_date, description, journal_lines(account_code, debit, credit)")
    .eq("user_id", userId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function fetchCoa(supabase: any) {
  const { data } = await supabase.from("chart_of_accounts").select("code, name, type");
  return data ?? [];
}

function aggregate(entries: any[]): Map<string, { debit: number; credit: number }> {
  const m = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    for (const l of e.journal_lines ?? []) {
      const cur = m.get(l.account_code) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit) || 0;
      cur.credit += Number(l.credit) || 0;
      m.set(l.account_code, cur);
    }
  }
  return m;
}

// Balance sheet (B01) — simplified TT133. Assets = Debit - Credit for asset accounts (1xx, 2xx).
// Liabilities + Equity = Credit - Debit for 3xx, 4xx.
export const getBalanceSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { asOf?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const entries = await fetchAll(supabase, userId, undefined, data.asOf);
    const coa = await fetchCoa(supabase);
    const coaMap = new Map(coa.map((c: any) => [c.code, c]));
    const agg = aggregate(entries);

    const rows: Array<{ code: string; name: string; group: string; amount: number }> = [];
    for (const [code, v] of agg.entries()) {
      const meta: any = coaMap.get(code) ?? coaMap.get(code.slice(0, 3));
      const head = code[0];
      let group = "other";
      let amount = 0;
      if (head === "1" || head === "2") {
        group = "assets";
        amount = v.debit - v.credit;
      } else if (head === "3") {
        group = "liabilities";
        amount = v.credit - v.debit;
      } else if (head === "4") {
        group = "equity";
        amount = v.credit - v.debit;
      } else continue;
      if (Math.abs(amount) < 0.01) continue;
      rows.push({ code, name: meta?.name ?? code, group, amount });
    }

    // Net income → equity
    let revenue = 0, expense = 0;
    for (const [code, v] of agg.entries()) {
      if (code.startsWith("5") || code.startsWith("7")) revenue += v.credit - v.debit;
      if (code.startsWith("6") || code.startsWith("8")) expense += v.debit - v.credit;
    }
    const netIncome = revenue - expense;
    if (Math.abs(netIncome) > 0.01) {
      rows.push({ code: "4212", name: "LN chưa phân phối kỳ này", group: "equity", amount: netIncome });
    }

    const totals = {
      assets: rows.filter(r => r.group === "assets").reduce((s, r) => s + r.amount, 0),
      liabilities: rows.filter(r => r.group === "liabilities").reduce((s, r) => s + r.amount, 0),
      equity: rows.filter(r => r.group === "equity").reduce((s, r) => s + r.amount, 0),
    };
    return { rows: rows.sort((a, b) => a.code.localeCompare(b.code)), totals, asOf: data.asOf ?? null };
  });

// Income statement (B02)
export const getIncomeStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const entries = await fetchAll(supabase, userId, data.from, data.to);
    const coa = await fetchCoa(supabase);
    const coaMap = new Map(coa.map((c: any) => [c.code, c]));
    const agg = aggregate(entries);

    const revenue: any[] = [];
    const expense: any[] = [];
    for (const [code, v] of agg.entries()) {
      const name = (coaMap.get(code) as any)?.name ?? code;
      if (code.startsWith("5") || code.startsWith("7")) {
        const a = v.credit - v.debit;
        if (Math.abs(a) > 0.01) revenue.push({ code, name, amount: a });
      } else if (code.startsWith("6") || code.startsWith("8")) {
        const a = v.debit - v.credit;
        if (Math.abs(a) > 0.01) expense.push({ code, name, amount: a });
      }
    }
    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
    return {
      revenue: revenue.sort((a, b) => a.code.localeCompare(b.code)),
      expense: expense.sort((a, b) => a.code.localeCompare(b.code)),
      totalRevenue,
      totalExpense,
      netIncome: totalRevenue - totalExpense,
      period: { from: data.from ?? null, to: data.to ?? null },
    };
  });

// Cash flow (B03) — simplified: net change in 111/112 across the period, broken down by counter-account category.
export const getCashFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const entries = await fetchAll(supabase, userId, data.from, data.to);

    type Bucket = { inflow: number; outflow: number };
    const buckets: Record<string, Bucket> = {
      operating: { inflow: 0, outflow: 0 },
      investing: { inflow: 0, outflow: 0 },
      financing: { inflow: 0, outflow: 0 },
    };

    const classify = (code: string): keyof typeof buckets => {
      if (code.startsWith("21") || code.startsWith("22") || code.startsWith("24")) return "investing";
      if (code.startsWith("34") || code.startsWith("41") || code.startsWith("411")) return "financing";
      return "operating";
    };

    let netCash = 0;
    for (const e of entries) {
      const lines: Line[] = (e.journal_lines ?? []) as Line[];
      const cashLines = lines.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112"));
      const nonCash = lines.filter(l => !(l.account_code.startsWith("111") || l.account_code.startsWith("112")));
      if (cashLines.length === 0) continue;
      const cashDelta = cashLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
      netCash += cashDelta;
      // attribute to counter-side account category
      const counter = nonCash[0]?.account_code ?? "511";
      const cat = classify(counter);
      if (cashDelta > 0) buckets[cat].inflow += cashDelta;
      else buckets[cat].outflow += -cashDelta;
    }

    return { buckets, netCash, period: { from: data.from ?? null, to: data.to ?? null } };
  });

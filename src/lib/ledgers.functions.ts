import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withLatency } from "@/lib/with-latency";

export type DimFilter = {
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  cost_center_id?: string | null;
};

type LineRow = {
  account_code: string;
  debit: number;
  credit: number;
  entry_date: string;
  entry_id: string;
  description: string | null;
  line_order: number;
};

const hasDims = (d?: DimFilter) =>
  !!(d && (d.branch_id || d.department_id || d.project_id || d.cost_center_id));

async function fetchLines(
  supabase: any,
  userId: string,
  opts: { from?: string; to?: string; accountPrefix?: string; dims?: DimFilter }
): Promise<LineRow[]> {
  // Query journal_lines directly so we can filter both by date (via inner join)
  // and by management dimensions in the same query.
  let q = supabase
    .from("journal_lines")
    .select(
      "account_code, debit, credit, line_order, entry_id, journal_entries!inner(id, entry_date, description, user_id)"
    )
    .eq("journal_entries.user_id", userId);
  if (opts.from) q = q.gte("journal_entries.entry_date", opts.from);
  if (opts.to) q = q.lte("journal_entries.entry_date", opts.to);
  if (opts.accountPrefix) q = q.like("account_code", `${opts.accountPrefix}%`);
  const d = opts.dims;
  if (d?.branch_id) q = q.eq("branch_id", d.branch_id);
  if (d?.department_id) q = q.eq("department_id", d.department_id);
  if (d?.project_id) q = q.eq("project_id", d.project_id);
  if (d?.cost_center_id) q = q.eq("cost_center_id", d.cost_center_id);
  const { data, error } = await q;
  if (error) throw error;
  const rows: LineRow[] = [];
  for (const l of data ?? []) {
    const e: any = l.journal_entries;
    rows.push({
      account_code: l.account_code,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      entry_date: e.entry_date,
      entry_id: e.id,
      description: e.description,
      line_order: Number(l.line_order) || 0,
    });
  }
  return rows;
}

// ============ 1. Nhật ký chung ============
export const getJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; search?: string; dims?: DimFilter }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    type JLine = { account_code: string; debit: number; credit: number };
    type JEntry = { id: string; entry_date: string; description: string | null; lines: JLine[] };

    // When dimensions are applied, restrict to entries that have at least one
    // matching line; otherwise return all entries in the date range.
    let entryIds: string[] | null = null;
    if (hasDims(data.dims)) {
      const lines = await fetchLines(supabase, userId, {
        from: data.from, to: data.to, dims: data.dims,
      });
      entryIds = Array.from(new Set(lines.map((l) => l.entry_id)));
      if (entryIds.length === 0) {
        return { entries: [], totalDebit: 0, totalCredit: 0 };
      }
    }

    let q = supabase
      .from("journal_entries")
      .select("id, entry_date, description, created_at, journal_lines(account_code, debit, credit, line_order)")
      .eq("user_id", userId)
      .gte("entry_date", data.from)
      .lte("entry_date", data.to)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (entryIds) q = q.in("id", entryIds);
    const { data: rows, error } = await q;
    if (error) throw error;
    const entries: JEntry[] = (rows ?? []).map((e: any) => ({
      id: e.id,
      entry_date: e.entry_date,
      description: e.description,
      lines: ((e.journal_lines ?? []) as any[])
        .sort((a, b) => (a.line_order ?? 0) - (b.line_order ?? 0))
        .map((l) => ({
          account_code: l.account_code,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
    }));
    const filtered: JEntry[] = data.search
      ? entries.filter((e) =>
          (e.description ?? "").toLowerCase().includes(data.search!.toLowerCase()) ||
          e.lines.some((l: JLine) => l.account_code.includes(data.search!))
        )
      : entries;
    const totalDebit = filtered.reduce((s, e) => s + e.lines.reduce((x: number, l: JLine) => x + l.debit, 0), 0);
    const totalCredit = filtered.reduce((s, e) => s + e.lines.reduce((x: number, l: JLine) => x + l.credit, 0), 0);
    return { entries: filtered, totalDebit, totalCredit };
  });

// Detect month-aligned date range (from = first of month, to = last of its month or later)
function isMonthAligned(from: string, to: string): boolean {
  const f = new Date(from);
  const t = new Date(to);
  const firstDay = f.getDate() === 1;
  const lastDay = t.getDate() === new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return firstDay && lastDay;
}

function ym(d: Date) {
  return { y: d.getFullYear(), p: d.getMonth() + 1 };
}

// ============ 2. Sổ cái — gom theo TK ============
export const getGeneralLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; accountPrefix?: string; dims?: DimFilter }) => i)
  .handler(withLatency("getGeneralLedger", async ({ data, context }) => {
    const { supabase, userId } = context;
    const byAcc = new Map<string, { opening: number; debit: number; credit: number }>();

    // Fast path: no dim filter + month-aligned range → use account_period_balances
    if (!hasDims(data.dims) && isMonthAligned(data.from, data.to)) {
      const fromYm = ym(new Date(data.from));
      const toYm = ym(new Date(data.to));
      // Opening: cumulative sum BEFORE fromYm
      let q1 = supabase.from("account_period_balances").select("account_code, year, period_no, debit, credit");
      const beforeFilter = `or(year.lt.${fromYm.y},and(year.eq.${fromYm.y},period_no.lt.${fromYm.p}))`;
      const periodFilter = `or(and(year.eq.${fromYm.y},period_no.gte.${fromYm.p},year.lte.${toYm.y}),and(year.gt.${fromYm.y},year.lt.${toYm.y}),and(year.eq.${toYm.y},period_no.lte.${toYm.p}))`;
      // Simpler: fetch all rows and bucket in JS (one query, tenant-scoped via RLS)
      const { data: rows } = await supabase
        .from("account_period_balances")
        .select("account_code, year, period_no, debit, credit")
        .like("account_code", data.accountPrefix ? `${data.accountPrefix}%` : "%");
      for (const r of rows ?? []) {
        const code = r.account_code as string;
        const yy = Number(r.year);
        const pp = Number(r.period_no);
        const dr = Number(r.debit) || 0;
        const cr = Number(r.credit) || 0;
        const m = byAcc.get(code) ?? { opening: 0, debit: 0, credit: 0 };
        const before = yy < fromYm.y || (yy === fromYm.y && pp < fromYm.p);
        const after = yy > toYm.y || (yy === toYm.y && pp > toYm.p);
        if (before) m.opening += dr - cr;
        else if (!after) { m.debit += dr; m.credit += cr; }
        byAcc.set(code, m);
      }
      // unused vars guard
      void beforeFilter; void periodFilter; void q1;
    } else {
      const before = await fetchLines(supabase, userId, { to: prevDay(data.from), accountPrefix: data.accountPrefix, dims: data.dims });
      const period = await fetchLines(supabase, userId, { from: data.from, to: data.to, accountPrefix: data.accountPrefix, dims: data.dims });
      for (const l of before) {
        const m = byAcc.get(l.account_code) ?? { opening: 0, debit: 0, credit: 0 };
        m.opening += l.debit - l.credit;
        byAcc.set(l.account_code, m);
      }
      for (const l of period) {
        const m = byAcc.get(l.account_code) ?? { opening: 0, debit: 0, credit: 0 };
        m.debit += l.debit;
        m.credit += l.credit;
        byAcc.set(l.account_code, m);
      }
    }

    const { data: coa } = await supabase
      .from("chart_of_accounts")
      .select("code, name, type");
    const nameMap = new Map((coa ?? []).map((r: any) => [r.code, { name: r.name as string, type: r.type as string }]));
    const accounts = Array.from(byAcc.entries())
      .map(([code, v]) => ({
        code,
        name: (nameMap.get(code) as any)?.name ?? "",
        type: (nameMap.get(code) as any)?.type ?? "",
        opening: v.opening,
        debit: v.debit,
        credit: v.credit,
        closing: v.opening + v.debit - v.credit,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { accounts };
  }));


// ============ 3. Sổ chi tiết 1 TK ============
export const getAccountLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account: string; from: string; to: string; dims?: DimFilter }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const before = await fetchLines(supabase, userId, { to: prevDay(data.from), accountPrefix: data.account, dims: data.dims });
    const period = await fetchLines(supabase, userId, { from: data.from, to: data.to, accountPrefix: data.account, dims: data.dims });
    const exact = (rows: LineRow[]) => rows.filter((r) => r.account_code === data.account);
    const opening = exact(before).reduce((s, l) => s + l.debit - l.credit, 0);
    const pRows = exact(period).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    let running = opening;
    const lines = pRows.map((l) => {
      running += l.debit - l.credit;
      return {
        entry_date: l.entry_date,
        entry_id: l.entry_id,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        running,
      };
    });
    return {
      account: data.account,
      opening,
      lines,
      totalDebit: pRows.reduce((s, l) => s + l.debit, 0),
      totalCredit: pRows.reduce((s, l) => s + l.credit, 0),
      closing: running,
    };
  });

// ============ 4. Bảng cân đối số phát sinh ============
export const getTrialBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; dims?: DimFilter }) => i)
  .handler(withLatency("getTrialBalance", async ({ data, context }) => {
    const { supabase, userId } = context;
    const map = new Map<string, { opening: number; debit: number; credit: number }>();

    if (!hasDims(data.dims) && isMonthAligned(data.from, data.to)) {
      const fromYm = ym(new Date(data.from));
      const toYm = ym(new Date(data.to));
      const { data: rows } = await supabase
        .from("account_period_balances")
        .select("account_code, year, period_no, debit, credit");
      for (const r of rows ?? []) {
        const code = r.account_code as string;
        const yy = Number(r.year);
        const pp = Number(r.period_no);
        const dr = Number(r.debit) || 0;
        const cr = Number(r.credit) || 0;
        const m = map.get(code) ?? { opening: 0, debit: 0, credit: 0 };
        const before = yy < fromYm.y || (yy === fromYm.y && pp < fromYm.p);
        const after = yy > toYm.y || (yy === toYm.y && pp > toYm.p);
        if (before) m.opening += dr - cr;
        else if (!after) { m.debit += dr; m.credit += cr; }
        map.set(code, m);
      }
    } else {
      const before = await fetchLines(supabase, userId, { to: prevDay(data.from), dims: data.dims });
      const period = await fetchLines(supabase, userId, { from: data.from, to: data.to, dims: data.dims });
      for (const l of before) {
        const m = map.get(l.account_code) ?? { opening: 0, debit: 0, credit: 0 };
        m.opening += l.debit - l.credit;
        map.set(l.account_code, m);
      }
      for (const l of period) {
        const m = map.get(l.account_code) ?? { opening: 0, debit: 0, credit: 0 };
        m.debit += l.debit;
        m.credit += l.credit;
        map.set(l.account_code, m);
      }
    }
    const { data: coa } = await supabase.from("chart_of_accounts").select("code, name");
    const nameMap = new Map((coa ?? []).map((r: any) => [r.code, r.name as string]));
    const rows = Array.from(map.entries())
      .map(([code, v]) => {
        const closing = v.opening + v.debit - v.credit;
        return {
          code,
          name: nameMap.get(code) ?? "",
          openingDebit: v.opening > 0 ? v.opening : 0,
          openingCredit: v.opening < 0 ? -v.opening : 0,
          debit: v.debit,
          credit: v.credit,
          closingDebit: closing > 0 ? closing : 0,
          closingCredit: closing < 0 ? -closing : 0,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    const totals = rows.reduce(
      (s, r) => ({
        openingDebit: s.openingDebit + r.openingDebit,
        openingCredit: s.openingCredit + r.openingCredit,
        debit: s.debit + r.debit,
        credit: s.credit + r.credit,
        closingDebit: s.closingDebit + r.closingDebit,
        closingCredit: s.closingCredit + r.closingCredit,
      }),
      { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 }
    );
    return { rows, totals, balanced: Math.abs(totals.debit - totals.credit) < 1 };
  }));


function prevDay(d: string): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return x.toISOString().slice(0, 10);
}

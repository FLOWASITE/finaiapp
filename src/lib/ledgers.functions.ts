import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LineRow = {
  account_code: string;
  debit: number;
  credit: number;
  entry_date: string;
  entry_id: string;
  description: string | null;
  line_order: number;
};

async function fetchLines(
  supabase: any,
  userId: string,
  opts: { from?: string; to?: string; accountPrefix?: string }
): Promise<LineRow[]> {
  let q = supabase
    .from("journal_entries")
    .select("id, entry_date, description, journal_lines(account_code, debit, credit, line_order)")
    .eq("user_id", userId)
    .order("entry_date", { ascending: true });
  if (opts.from) q = q.gte("entry_date", opts.from);
  if (opts.to) q = q.lte("entry_date", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  const rows: LineRow[] = [];
  for (const e of data ?? []) {
    for (const l of e.journal_lines ?? []) {
      if (opts.accountPrefix && !l.account_code.startsWith(opts.accountPrefix)) continue;
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
  }
  return rows;
}

// ============ 1. Nhật ký chung ============
export const getJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; search?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("journal_entries")
      .select("id, entry_date, description, created_at, journal_lines(account_code, debit, credit, line_order)")
      .eq("user_id", userId)
      .gte("entry_date", data.from)
      .lte("entry_date", data.to)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw error;
    type JLine = { account_code: string; debit: number; credit: number };
    type JEntry = { id: string; entry_date: string; description: string | null; lines: JLine[] };
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

// ============ 2. Sổ cái — gom theo TK ============
export const getGeneralLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; accountPrefix?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const before = await fetchLines(supabase, userId, { to: prevDay(data.from), accountPrefix: data.accountPrefix });
    const period = await fetchLines(supabase, userId, { from: data.from, to: data.to, accountPrefix: data.accountPrefix });

    const byAcc = new Map<string, { opening: number; debit: number; credit: number }>();
    for (const l of before) {
      const k = l.account_code;
      const m = byAcc.get(k) ?? { opening: 0, debit: 0, credit: 0 };
      m.opening += l.debit - l.credit;
      byAcc.set(k, m);
    }
    for (const l of period) {
      const k = l.account_code;
      const m = byAcc.get(k) ?? { opening: 0, debit: 0, credit: 0 };
      m.debit += l.debit;
      m.credit += l.credit;
      byAcc.set(k, m);
    }
    const { data: coa } = await supabase
      .from("chart_of_accounts")
      .select("code, name, type");
    const nameMap = new Map((coa ?? []).map((r: any) => [r.code, { name: r.name as string, type: r.type as string }]));
    const accounts = Array.from(byAcc.entries())
      .map(([code, v]) => ({
        code,
        name: nameMap.get(code)?.name ?? "",
        type: nameMap.get(code)?.type ?? "",
        opening: v.opening,
        debit: v.debit,
        credit: v.credit,
        closing: v.opening + v.debit - v.credit,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { accounts };
  });

// ============ 3. Sổ chi tiết 1 TK ============
export const getAccountLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account: string; from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const before = await fetchLines(supabase, userId, { to: prevDay(data.from), accountPrefix: data.account });
    const period = await fetchLines(supabase, userId, { from: data.from, to: data.to, accountPrefix: data.account });
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
  .inputValidator((i: { from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const before = await fetchLines(supabase, userId, { to: prevDay(data.from) });
    const period = await fetchLines(supabase, userId, { from: data.from, to: data.to });
    const map = new Map<string, { opening: number; debit: number; credit: number }>();
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
  });

function prevDay(d: string): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return x.toISOString().slice(0, 10);
}

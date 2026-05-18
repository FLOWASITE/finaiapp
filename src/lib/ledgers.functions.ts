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
  invoice_id: string | null;
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
      "account_code, debit, credit, line_order, entry_id, journal_entries!inner(id, entry_date, description, user_id, invoice_id)"
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
      invoice_id: e.invoice_id ?? null,
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
        invoice_id: l.invoice_id,
        doc_type: (l.invoice_id ? "invoice" : "manual") as "invoice" | "manual",
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


// ============ 4b. Xuất Excel Bảng cân đối số phát sinh ============
export const exportTrialBalanceXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; dims?: DimFilter; hideZero?: boolean }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Tái tính trial balance (cùng logic getTrialBalance)
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
        m.debit += l.debit; m.credit += l.credit;
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

    const filtered = data.hideZero
      ? rows.filter((r) =>
          r.openingDebit !== 0 || r.openingCredit !== 0 ||
          r.debit !== 0 || r.credit !== 0 ||
          r.closingDebit !== 0 || r.closingCredit !== 0
        )
      : rows;

    const totals = filtered.reduce(
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

    const profile = (await supabase
      .from("profiles")
      .select("company_name, tax_id, address")
      .eq("id", userId)
      .maybeSingle()).data;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BCDPS");

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    ws.mergeCells("A5:H5");
    ws.getCell("A5").value = "BẢNG CÂN ĐỐI SỐ PHÁT SINH";
    ws.getCell("A5").font = { bold: true, size: 13 };
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.mergeCells("A6:H6");
    ws.getCell("A6").value = `Kỳ từ ${data.from} đến ${data.to}`;
    ws.getCell("A6").alignment = { horizontal: "center" };

    // Header 2 dòng (gộp ô)
    ws.mergeCells("A8:A9");
    ws.mergeCells("B8:B9");
    ws.mergeCells("C8:D8");
    ws.mergeCells("E8:F8");
    ws.mergeCells("G8:H8");
    ws.getCell("A8").value = "Mã TK";
    ws.getCell("B8").value = "Tên tài khoản";
    ws.getCell("C8").value = "Số dư đầu kỳ";
    ws.getCell("E8").value = "Phát sinh trong kỳ";
    ws.getCell("G8").value = "Số dư cuối kỳ";
    ws.getCell("C9").value = "Nợ";
    ws.getCell("D9").value = "Có";
    ws.getCell("E9").value = "Nợ";
    ws.getCell("F9").value = "Có";
    ws.getCell("G9").value = "Nợ";
    ws.getCell("H9").value = "Có";
    ["A8","B8","C8","E8","G8","C9","D9","E9","F9","G9","H9"].forEach(c => {
      const cell = ws.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    let row = 10;
    for (const r of filtered) {
      ws.getCell(`A${row}`).value = r.code;
      ws.getCell(`B${row}`).value = r.name;
      ws.getCell(`C${row}`).value = Math.round(r.openingDebit);
      ws.getCell(`D${row}`).value = Math.round(r.openingCredit);
      ws.getCell(`E${row}`).value = Math.round(r.debit);
      ws.getCell(`F${row}`).value = Math.round(r.credit);
      ws.getCell(`G${row}`).value = Math.round(r.closingDebit);
      ws.getCell(`H${row}`).value = Math.round(r.closingCredit);
      ["C","D","E","F","G","H"].forEach(col => {
        ws.getCell(`${col}${row}`).numFmt = "#,##0;(#,##0);-";
      });
      row++;
    }

    // Tổng cộng
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = "Tổng cộng";
    ws.getCell(`C${row}`).value = Math.round(totals.openingDebit);
    ws.getCell(`D${row}`).value = Math.round(totals.openingCredit);
    ws.getCell(`E${row}`).value = Math.round(totals.debit);
    ws.getCell(`F${row}`).value = Math.round(totals.credit);
    ws.getCell(`G${row}`).value = Math.round(totals.closingDebit);
    ws.getCell(`H${row}`).value = Math.round(totals.closingCredit);
    ["A","B","C","D","E","F","G","H"].forEach(col => {
      const cell = ws.getCell(`${col}${row}`);
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
      if (col !== "A" && col !== "B") cell.numFmt = "#,##0;(#,##0);-";
    });

    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 40;
    for (let c = 3; c <= 8; c++) ws.getColumn(c).width = 16;

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { filename: `BCDPS_${data.from}_${data.to}.xlsx`, base64 };
  });

// ============ 5. Phát hiện bút toán lệch cân (Nợ ≠ Có) ============
export type UnbalancedEntry = {
  entry_id: string;
  entry_date: string;
  description: string | null;
  totalDebit: number;
  totalCredit: number;
  delta: number; // debit - credit
  lineCount: number;
  reason: string; // gợi ý nguyên nhân
};

export const getUnbalancedEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; limit?: number }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("journal_entries")
      .select("id, entry_date, description, journal_lines(debit, credit)")
      .eq("user_id", userId)
      .gte("entry_date", data.from)
      .lte("entry_date", data.to)
      .order("entry_date", { ascending: false });
    if (error) throw error;

    const results: UnbalancedEntry[] = [];
    for (const e of (rows ?? []) as any[]) {
      const ls = (e.journal_lines ?? []) as Array<{ debit: number | string; credit: number | string }>;
      let td = 0, tc = 0;
      for (const l of ls) {
        td += Number(l.debit) || 0;
        tc += Number(l.credit) || 0;
      }
      const delta = td - tc;
      if (Math.abs(delta) < 0.5) continue;

      // Gợi ý nguyên nhân
      let reason = "Tổng Nợ ≠ Tổng Có";
      if (ls.length === 0) reason = "Bút toán không có dòng hạch toán nào";
      else if (ls.length === 1) reason = "Chỉ có 1 dòng — thiếu vế đối ứng";
      else if (Math.abs(delta) < 100) reason = "Chênh lệch nhỏ — có thể do làm tròn / nhập sai số lẻ";
      else if (td === 0) reason = "Thiếu toàn bộ vế Nợ";
      else if (tc === 0) reason = "Thiếu toàn bộ vế Có";
      else {
        const maxSide = Math.max(td, tc);
        const ratio = Math.abs(delta) / maxSide;
        if (ratio > 0.4) reason = "Chênh lệch lớn — có thể nhập sai số tiền 1 dòng";
        else reason = "Sai số tiền / thiếu dòng đối ứng";
      }

      results.push({
        entry_id: e.id,
        entry_date: e.entry_date,
        description: e.description,
        totalDebit: td,
        totalCredit: tc,
        delta,
        lineCount: ls.length,
        reason,
      });
    }

    results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const limit = data.limit ?? 100;
    return {
      entries: results.slice(0, limit),
      totalCount: results.length,
      totalDelta: results.reduce((s, r) => s + r.delta, 0),
    };
  });

// Xuất Excel chi tiết phát sinh theo tài khoản (drill-down)
export const exportAccountLedgerXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { account: string; from: string; to: string; dims?: DimFilter }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Số dư đầu kỳ
    const before = await fetchLines(supabase, userId, {
      to: prevDay(data.from), accountPrefix: data.account, dims: data.dims,
    });
    const period = await fetchLines(supabase, userId, {
      from: data.from, to: data.to, accountPrefix: data.account, dims: data.dims,
    });
    let opening = 0;
    for (const l of before) opening += l.debit - l.credit;

    const sorted = period.slice().sort((a, b) => {
      if (a.entry_date !== b.entry_date) return a.entry_date.localeCompare(b.entry_date);
      return a.line_order - b.line_order;
    });
    let running = opening;
    const lines = sorted.map((l) => {
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
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    const closing = opening + totalDebit - totalCredit;

    const { data: coa } = await supabase
      .from("chart_of_accounts")
      .select("name")
      .eq("code", data.account)
      .maybeSingle();
    const accountName = (coa?.name as string | undefined) ?? "";

    const profile = (await supabase
      .from("profiles")
      .select("company_name, tax_id, address")
      .eq("id", userId)
      .maybeSingle()).data;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("SoChiTiet");

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    ws.mergeCells("A5:E5");
    ws.getCell("A5").value = `SỔ CHI TIẾT TÀI KHOẢN ${data.account}${accountName ? ` — ${accountName}` : ""}`;
    ws.getCell("A5").font = { bold: true, size: 13 };
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.mergeCells("A6:E6");
    ws.getCell("A6").value = `Kỳ từ ${data.from} đến ${data.to}`;
    ws.getCell("A6").alignment = { horizontal: "center" };

    const headers = ["Ngày", "Chứng từ / Diễn giải", "PS Nợ", "PS Có", "Lũy kế"];
    headers.forEach((h, i) => {
      const cell = ws.getCell(8, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    // Số dư đầu kỳ
    let row = 9;
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = "Số dư đầu kỳ";
    ws.getCell(`A${row}`).font = { italic: true };
    ws.getCell(`E${row}`).value = Math.round(opening);
    ws.getCell(`E${row}`).numFmt = "#,##0;(#,##0);-";
    ws.getCell(`E${row}`).font = { italic: true };
    row++;

    for (const l of lines) {
      ws.getCell(`A${row}`).value = l.entry_date;
      ws.getCell(`B${row}`).value = l.description ?? "";
      ws.getCell(`C${row}`).value = Math.round(l.debit);
      ws.getCell(`D${row}`).value = Math.round(l.credit);
      ws.getCell(`E${row}`).value = Math.round(l.running);
      ["C", "D", "E"].forEach((col) => {
        ws.getCell(`${col}${row}`).numFmt = "#,##0;(#,##0);-";
      });
      row++;
    }

    // Tổng cộng
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).value = "Tổng cộng";
    ws.getCell(`C${row}`).value = Math.round(totalDebit);
    ws.getCell(`D${row}`).value = Math.round(totalCredit);
    ws.getCell(`E${row}`).value = Math.round(closing);
    ["A", "B", "C", "D", "E"].forEach((col) => {
      const cell = ws.getCell(`${col}${row}`);
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
      if (col === "C" || col === "D" || col === "E") cell.numFmt = "#,##0;(#,##0);-";
    });
    row++;

    ws.mergeCells(`A${row}:D${row}`);
    ws.getCell(`A${row}`).value = "Số dư cuối kỳ";
    ws.getCell(`A${row}`).font = { italic: true };
    ws.getCell(`E${row}`).value = Math.round(closing);
    ws.getCell(`E${row}`).numFmt = "#,##0;(#,##0);-";
    ws.getCell(`E${row}`).font = { italic: true, bold: true };

    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 18;

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { filename: `SoChiTiet_${data.account}_${data.from}_${data.to}.xlsx`, base64 };
  });

function prevDay(d: string): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return x.toISOString().slice(0, 10);
}

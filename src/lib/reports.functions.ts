import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { B01_TT99, B02_TT99, B03_TT99, type BSItem, type ISItem, type CFItem } from "./report-mappings";

type LineRow = { account_code: string; debit: number; credit: number; entry_date: string };

async function fetchLines(supabase: any, userId: string, from?: string, to?: string): Promise<LineRow[]> {
  let q = supabase
    .from("journal_entries")
    .select("entry_date, journal_lines(account_code, debit, credit)")
    .eq("user_id", userId);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { asOf?: string; compareAsOf?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cur = await fetchLines(supabase, userId, undefined, data.asOf);
    const prev = data.compareAsOf ? await fetchLines(supabase, userId, undefined, data.compareAsOf) : [];

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
          // Cộng LN chưa phân phối kỳ này vào 421
          if (a.prefix === "421" && a.nature === "credit") v += ni;
          total += v;
        }
        return total;
      }
      return 0;
    };

    const valuesCur: Record<string, number> = {};
    const valuesPrev: Record<string, number> = {};

    for (const item of B01_TT99) {
      if (item.accounts) {
        valuesCur[item.ma_so] = computeItem(item, cur, niCur);
        valuesPrev[item.ma_so] = computeItem(item, prev, niPrev);
      }
    }
    for (const item of B01_TT99) {
      if (item.formula) {
        valuesCur[item.ma_so] = item.formula.reduce((s, m) => s + (valuesCur[m] ?? 0), 0);
        valuesPrev[item.ma_so] = item.formula.reduce((s, m) => s + (valuesPrev[m] ?? 0), 0);
      }
    }

    const items = B01_TT99.map(it => ({
      ma_so: it.ma_so, name: it.name, level: it.level, group: it.group, bold: !!it.bold,
      current: Math.round(valuesCur[it.ma_so] ?? 0),
      previous: Math.round(valuesPrev[it.ma_so] ?? 0),
    }));

    return {
      items, asOf: data.asOf ?? null, compareAsOf: data.compareAsOf ?? null,
      balanced: Math.abs((valuesCur["280"] ?? 0) - (valuesCur["440"] ?? 0)) < 1,
    };
  });

// ============ B02 — Kết quả hoạt động kinh doanh ============
export const getIncomeStatementTT99 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string; compareFrom?: string; compareTo?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cur = await fetchLines(supabase, userId, data.from, data.to);
    const prev = data.compareFrom ? await fetchLines(supabase, userId, data.compareFrom, data.compareTo) : [];

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
    for (const item of B02_TT99) {
      vCur[item.ma_so] = computeItem(item, cur, vCur);
      vPrev[item.ma_so] = computeItem(item, prev, vPrev);
    }

    return {
      items: B02_TT99.map(it => ({
        ma_so: it.ma_so, name: it.name, bold: !!it.bold,
        current: Math.round(vCur[it.ma_so] ?? 0),
        previous: Math.round(vPrev[it.ma_so] ?? 0),
      })),
      period: { from: data.from ?? null, to: data.to ?? null },
      comparePeriod: data.compareFrom ? { from: data.compareFrom, to: data.compareTo } : null,
    };
  });

// ============ B03 — Lưu chuyển tiền tệ (phương pháp trực tiếp) ============
export const getCashFlowDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("journal_entries")
      .select("id, entry_date, journal_lines(account_code, debit, credit)")
      .eq("user_id", userId);
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    const { data: entries, error } = await q;
    if (error) throw error;

    type Bucket = { inflows: { code: string; counter: string; amount: number }[]; outflows: { code: string; counter: string; amount: number }[] };
    const allBuckets: Bucket = { inflows: [], outflows: [] };

    for (const e of entries ?? []) {
      const lines = (e.journal_lines ?? []) as Array<{ account_code: string; debit: number; credit: number }>;
      const cashLines = lines.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112"));
      const nonCash = lines.filter(l => !(l.account_code.startsWith("111") || l.account_code.startsWith("112")));
      if (cashLines.length === 0) continue;
      const cashDelta = cashLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
      if (Math.abs(cashDelta) < 0.5) continue;
      const counter = nonCash[0]?.account_code ?? "";
      if (cashDelta > 0) allBuckets.inflows.push({ code: cashLines[0].account_code, counter, amount: cashDelta });
      else allBuckets.outflows.push({ code: cashLines[0].account_code, counter, amount: -cashDelta });
    }

    // Số dư tiền đầu kỳ và cuối kỳ
    const openingLines = data.from ? await fetchLines(supabase, userId, undefined, new Date(new Date(data.from).getTime() - 86400000).toISOString().slice(0, 10)) : [];
    const closingLines = await fetchLines(supabase, userId, undefined, data.to);
    const cashBalance = (ls: LineRow[]) => ls.filter(l => l.account_code.startsWith("111") || l.account_code.startsWith("112")).reduce((s, l) => s + l.debit - l.credit, 0);
    const opening = cashBalance(openingLines);
    const closing = cashBalance(closingLines);

    const values: Record<string, number> = {};
    let usedInflow = new Set<number>();
    let usedOutflow = new Set<number>();

    for (const item of B03_TT99) {
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
    for (const item of B03_TT99) {
      if (item.formula) values[item.ma_so] = item.formula.reduce((s, f) => s + (values[f.ma_so] ?? 0) * f.sign, 0);
    }

    return {
      items: B03_TT99.map(it => ({
        ma_so: it.ma_so, name: it.name, section: it.section, bold: !!it.bold,
        amount: Math.round(values[it.ma_so] ?? 0),
      })),
      period: { from: data.from ?? null, to: data.to ?? null },
    };
  });

// ============ B09 — Thuyết minh BCTC (dữ liệu sinh tự động) ============
export const getNotesData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [profile, assets, products, payables, receivables, notes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("fixed_assets").select("id, code, name, cost, useful_life_months, start_date, status").eq("user_id", userId),
      supabase.from("products").select("id, code, name, on_hand, unit_cost").eq("user_id", userId),
      supabase.from("invoices").select("supplier_name, total, payment_status, issue_date").eq("user_id", userId),
      supabase.from("sales_invoices").select("customer_name, total, status, issue_date").eq("user_id", userId),
      supabase.from("report_notes").select("section, content").eq("user_id", userId),
    ]);

    const inventory = (products.data ?? []).map((p: any) => ({
      code: p.code, name: p.name, qty: Number(p.on_hand) || 0, value: (Number(p.on_hand) || 0) * (Number(p.unit_cost) || 0),
    })).filter((p: any) => p.qty > 0);

    const fixedAssets = (assets.data ?? []).map((a: any) => ({
      code: a.code, name: a.name, cost: Number(a.cost) || 0, life: a.useful_life_months, start: a.start_date, status: a.status,
    }));

    const ap = (payables.data ?? []).filter((i: any) => i.payment_status !== "paid").reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
    const ar = (receivables.data ?? []).filter((i: any) => i.status !== "paid").reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);

    const userNotes: Record<string, string> = {};
    for (const n of notes.data ?? []) userNotes[n.section] = n.content;

    return {
      profile: profile.data ?? null,
      inventory, fixedAssets,
      summary: { totalPayables: Math.round(ap), totalReceivables: Math.round(ar) },
      userNotes,
      period: { from: data.from ?? null, to: data.to ?? null },
    };
  });

// ============ Notes CRUD ============
export const upsertReportNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { section: string; content: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("report_notes").upsert(
      { user_id: userId, section: data.section, content: data.content, updated_at: new Date().toISOString() },
      { onConflict: "user_id,section" }
    );
    if (error) throw error;
    return { ok: true };
  });

// ============ Snapshots ============
export const saveReportSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { report_type: string; period_from?: string; period_to: string; payload: any }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("report_snapshots").insert({
      user_id: userId, report_type: data.report_type, period_from: data.period_from ?? null,
      period_to: data.period_to, payload: data.payload,
    }).select("id").single();
    if (error) throw error;
    return row;
  });

export const listReportSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { report_type?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("report_snapshots").select("id, report_type, period_from, period_to, created_at").eq("user_id", userId).order("created_at", { ascending: false });
    if (data.report_type) q = q.eq("report_type", data.report_type);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ============ Legacy aliases (giữ tương thích route cũ) ============
export const getBalanceSheet = getBalanceSheetTT99;
export const getIncomeStatement = getIncomeStatementTT99;
export const getCashFlow = getCashFlowDirect;

// ============ Excel Export ============
export const exportReportXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { report: "B01" | "B02" | "B03"; from?: string; to?: string; asOf?: string }) => i)
  .handler(async ({ data, context }) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(data.report);

    const { supabase, userId } = context;
    const profile = (await supabase.from("profiles").select("company_name, tax_id, address").eq("id", userId).maybeSingle()).data;

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    const title = data.report === "B01" ? "BÁO CÁO TÌNH HÌNH TÀI CHÍNH (B01-DN)"
      : data.report === "B02" ? "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (B02-DN)"
      : "BÁO CÁO LƯU CHUYỂN TIỀN TỆ (B03-DN)";
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
      const cur = await fetchLines(supabase, userId, undefined, data.asOf);
      const niCur = (() => { let r = 0, e = 0; for (const l of cur) { const c = l.account_code; if (c.startsWith("5") || c.startsWith("7")) r += l.credit - l.debit; else if (c.startsWith("6") || c.startsWith("8")) e += l.debit - l.credit; } return r - e; })();
      const v: Record<string, number> = {};
      for (const it of B01_TT99) if (it.accounts) v[it.ma_so] = it.accounts.reduce((s, a) => { let x = balanceForPrefix(cur, a.prefix, a.nature) * a.sign; if (a.prefix === "421" && a.nature === "credit") x += niCur; return s + x; }, 0);
      for (const it of B01_TT99) if (it.formula) v[it.ma_so] = it.formula.reduce((s, m) => s + (v[m] ?? 0), 0);
      for (const it of B01_TT99) {
        ws.getCell(`A${row}`).value = (it.level === 2 ? "      " : it.level === 1 ? "  " : "") + it.name;
        ws.getCell(`B${row}`).value = it.ma_so;
        ws.getCell(`C${row}`).value = Math.round(v[it.ma_so] ?? 0);
        ws.getCell(`C${row}`).numFmt = "#,##0;(#,##0);-";
        if (it.bold) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`C${row}`).font = { bold: true }; }
        row++;
      }
    } else if (data.report === "B02") {
      const lines = await fetchLines(supabase, userId, data.from, data.to);
      const v: Record<string, number> = {};
      for (const it of B02_TT99) {
        if (it.accounts) v[it.ma_so] = it.accounts.reduce((s, a) => s + periodAmountForPrefix(lines, a.prefix, a.nature) * a.sign, 0);
        else if (it.formula) v[it.ma_so] = it.formula.reduce((s, f) => s + (v[f.ma_so] ?? 0) * f.sign, 0);
      }
      for (const it of B02_TT99) {
        ws.getCell(`A${row}`).value = it.name;
        ws.getCell(`B${row}`).value = it.ma_so;
        ws.getCell(`C${row}`).value = Math.round(v[it.ma_so] ?? 0);
        ws.getCell(`C${row}`).numFmt = "#,##0;(#,##0);-";
        if (it.bold) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`C${row}`).font = { bold: true }; }
        row++;
      }
    } else {
      // B03 — chạy lại logic CF trực tiếp
      let q = supabase.from("journal_entries").select("id, entry_date, journal_lines(account_code, debit, credit)").eq("user_id", userId);
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
      for (const it of B03_TT99) {
        if (it.counterpart) {
          const { prefixes, direction } = it.counterpart;
          let total = 0;
          if (direction !== "outflow") ins.forEach((f, i) => { if (!usedI.has(i) && prefixes.some(p => f.counter.startsWith(p))) { total += f.amount; usedI.add(i); } });
          if (direction !== "inflow") outs.forEach((f, i) => { if (!usedO.has(i) && prefixes.some(p => f.counter.startsWith(p))) { total += direction === "net" ? -f.amount : f.amount; usedO.add(i); } });
          v[it.ma_so] = total;
        } else if (it.formula) v[it.ma_so] = it.formula.reduce((s, f) => s + (v[f.ma_so] ?? 0) * f.sign, 0);
      }
      for (const it of B03_TT99) {
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

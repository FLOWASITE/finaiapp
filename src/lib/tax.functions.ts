import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

async function loadVatData(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string,
) {
  const { data: purchases } = await supabase
    .from("invoices")
    .select("id, invoice_no, issue_date, supplier_name, supplier_tax_id, subtotal, vat_amount, total")
    .eq("user_id", userId)
    .gte("issue_date", from)
    .lte("issue_date", to);

  const { data: sales } = await supabase
    .from("sales_invoices")
    .select("id, einvoice_code, invoice_no, issue_date, customer_name, customer_tax_id, subtotal, vat_amount, total")
    .eq("user_id", userId)
    .eq("status", "issued")
    .gte("issue_date", from)
    .lte("issue_date", to);

  // Phân bổ doanh thu theo thuế suất từ sales_invoice_lines
  const salesIds = (sales ?? []).map((s: any) => s.id);
  const byRate: Record<string, { base: number; vat: number }> = {
    "0": { base: 0, vat: 0 }, "5": { base: 0, vat: 0 }, "8": { base: 0, vat: 0 }, "10": { base: 0, vat: 0 }, "exempt": { base: 0, vat: 0 },
  };
  if (salesIds.length) {
    const { data: lines } = await supabase
      .from("sales_invoice_lines")
      .select("amount, vat_rate, invoice_id")
      .in("invoice_id", salesIds);
    for (const l of lines ?? []) {
      const rate = Number(l.vat_rate) || 0;
      const key = rate === 0 ? "0" : rate === 5 ? "5" : rate === 8 ? "8" : rate === 10 ? "10" : "exempt";
      const base = Number(l.amount) || 0;
      byRate[key].base += base;
      byRate[key].vat += base * rate / 100;
    }
  }

  const inputVat = (purchases ?? []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
  const outputVat = (sales ?? []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
  const inputBase = (purchases ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const outputBase = (sales ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0);

  return {
    summary: {
      outputBase, outputVat, inputBase, inputVat,
      payable: Math.max(0, outputVat - inputVat),
      carryForward: Math.max(0, inputVat - outputVat),
      byRate,
    },
    purchases: purchases ?? [],
    sales: sales ?? [],
  };
}

export const getVatReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const result = await loadVatData(context.supabase, context.userId, data.from, data.to);
    return { period: { from: data.from, to: data.to }, ...result };
  });

// ============ CIT — Quyết toán TNDN ============
export const getCITReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year: number }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("entry_date, journal_lines(account_code, debit, credit)")
      .eq("user_id", userId)
      .gte("entry_date", from)
      .lte("entry_date", to);
    let revenue = 0, expense = 0, financeIncome = 0, financeExpense = 0, otherIncome = 0, otherExpense = 0;
    for (const e of entries ?? []) {
      for (const l of (e as any).journal_lines ?? []) {
        const c = l.account_code as string;
        const d = Number(l.debit) || 0;
        const cr = Number(l.credit) || 0;
        if (c.startsWith("511") || c.startsWith("512")) revenue += cr - d;
        else if (c.startsWith("515")) financeIncome += cr - d;
        else if (c.startsWith("711")) otherIncome += cr - d;
        else if (c.startsWith("632") || c.startsWith("641") || c.startsWith("642")) expense += d - cr;
        else if (c.startsWith("635")) financeExpense += d - cr;
        else if (c.startsWith("811")) otherExpense += d - cr;
      }
    }
    const accountingProfit = revenue + financeIncome + otherIncome - expense - financeExpense - otherExpense;

    // Lấy điều chỉnh từ report_notes
    const { data: noteRows } = await supabase
      .from("report_notes")
      .select("section, content")
      .eq("user_id", userId)
      .like("section", `tax.cit.${data.year}.%`);
    const notes: Record<string, string> = {};
    for (const n of noteRows ?? []) notes[(n as any).section.replace(`tax.cit.${data.year}.`, "")] = (n as any).content;
    const adjAdd = Number(notes["adjAdd"]) || 0;
    const adjSub = Number(notes["adjSub"]) || 0;
    const taxRate = Number(notes["taxRate"]) || 20;
    const lossCarry = Number(notes["lossCarry"]) || 0;

    const taxableIncome = Math.max(0, accountingProfit + adjAdd - adjSub - lossCarry);
    const taxPayable = taxableIncome * taxRate / 100;

    return {
      year: data.year,
      revenue, expense, financeIncome, financeExpense, otherIncome, otherExpense,
      accountingProfit, adjAdd, adjSub, lossCarry, taxRate, taxableIncome, taxPayable, notes,
    };
  });

// ============ PIT — Quyết toán TNCN ============
export const getPITAnnual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year: number }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("id, period_month, payroll_lines(employee_id, gross, taxable, pit, bhxh_emp, bhyt_emp, bhtn_emp, dependents)")
      .eq("user_id", userId)
      .gte("period_month", from)
      .lte("period_month", to);

    const byEmp = new Map<string, { gross: number; taxable: number; pit: number; insurance: number; dependents: number }>();
    for (const r of runs ?? []) {
      for (const l of (r as any).payroll_lines ?? []) {
        const k = l.employee_id;
        const m = byEmp.get(k) ?? { gross: 0, taxable: 0, pit: 0, insurance: 0, dependents: 0 };
        m.gross += Number(l.gross) || 0;
        m.taxable += Number(l.taxable) || 0;
        m.pit += Number(l.pit) || 0;
        m.insurance += (Number(l.bhxh_emp) || 0) + (Number(l.bhyt_emp) || 0) + (Number(l.bhtn_emp) || 0);
        m.dependents = Math.max(m.dependents, Number(l.dependents) || 0);
        byEmp.set(k, m);
      }
    }

    const empIds = Array.from(byEmp.keys());
    let emps: any[] = [];
    if (empIds.length) {
      const { data: e } = await supabase
        .from("employees")
        .select("id, code, full_name, tax_id, citizen_id")
        .in("id", empIds);
      emps = e ?? [];
    }
    const empMap = new Map(emps.map((e: any) => [e.id, e]));
    const rows = Array.from(byEmp.entries()).map(([id, v]) => ({
      id,
      code: empMap.get(id)?.code ?? "",
      full_name: empMap.get(id)?.full_name ?? "",
      tax_id: empMap.get(id)?.tax_id ?? "",
      citizen_id: empMap.get(id)?.citizen_id ?? "",
      ...v,
    }));
    const totals = rows.reduce(
      (s, r) => ({
        gross: s.gross + r.gross, taxable: s.taxable + r.taxable, pit: s.pit + r.pit, insurance: s.insurance + r.insurance,
      }),
      { gross: 0, taxable: 0, pit: 0, insurance: 0 }
    );
    return { year: data.year, employees: rows, totals };
  });

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!)
  );
}

async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("company_name, tax_id, address")
    .eq("id", userId)
    .single();
  return data;
}

export const buildVatXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await getProfile(supabase, userId);
    const { summary, purchases, sales } = await loadVatData(supabase, userId, data.from, data.to);
    const period = data.from.slice(0, 7);
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<HSoThueDTu>`);
    lines.push(`  <HSoKhaiThue>`);
    lines.push(`    <TTinChung>`);
    lines.push(`      <TTinTKhaiThue>`);
    lines.push(`        <maTKhai>01/GTGT</maTKhai>`);
    lines.push(`        <kyKKhaiThue><kieuKy>M</kieuKy><kyKKhai>${period}</kyKKhai></kyKKhaiThue>`);
    lines.push(`        <mst>${esc(profile?.tax_id)}</mst>`);
    lines.push(`        <tenNNT>${esc(profile?.company_name)}</tenNNT>`);
    lines.push(`        <dchiNNT>${esc(profile?.address)}</dchiNNT>`);
    lines.push(`      </TTinTKhaiThue>`);
    lines.push(`    </TTinChung>`);
    lines.push(`    <CTieuTKhaiChinh>`);
    lines.push(`      <ct23>${summary.outputBase.toFixed(0)}</ct23>`);
    lines.push(`      <ct24>${summary.outputVat.toFixed(0)}</ct24>`);
    lines.push(`      <ct25>${summary.inputBase.toFixed(0)}</ct25>`);
    lines.push(`      <ct26>${summary.inputVat.toFixed(0)}</ct26>`);
    lines.push(`      <ct27>${summary.byRate["0"].base.toFixed(0)}</ct27>`);
    lines.push(`      <ct29>${summary.byRate["5"].base.toFixed(0)}</ct29>`);
    lines.push(`      <ct30>${summary.byRate["5"].vat.toFixed(0)}</ct30>`);
    lines.push(`      <ct31>${summary.byRate["8"].base.toFixed(0)}</ct31>`);
    lines.push(`      <ct32>${summary.byRate["8"].vat.toFixed(0)}</ct32>`);
    lines.push(`      <ct33>${summary.byRate["10"].base.toFixed(0)}</ct33>`);
    lines.push(`      <ct34>${summary.byRate["10"].vat.toFixed(0)}</ct34>`);
    lines.push(`      <ct40>${summary.payable.toFixed(0)}</ct40>`);
    lines.push(`      <ct43>${summary.carryForward.toFixed(0)}</ct43>`);
    lines.push(`    </CTieuTKhaiChinh>`);
    lines.push(`  </HSoKhaiThue>`);
    lines.push(`  <BangKeBanRa>`);
    for (const s of sales) {
      lines.push(`    <CTietHDon><shdon>${esc(s.einvoice_code || s.invoice_no)}</shdon><nlhdon>${s.issue_date}</nlhdon><tenNMua>${esc(s.customer_name)}</tenNMua><mstNMua>${esc(s.customer_tax_id)}</mstNMua><dtcthue>${Number(s.subtotal).toFixed(0)}</dtcthue><thueGTGT>${Number(s.vat_amount).toFixed(0)}</thueGTGT></CTietHDon>`);
    }
    lines.push(`  </BangKeBanRa>`);
    lines.push(`  <BangKeMuaVao>`);
    for (const p of purchases) {
      lines.push(`    <CTietHDon><shdon>${esc(p.invoice_no)}</shdon><nlhdon>${p.issue_date}</nlhdon><tenNBan>${esc(p.supplier_name)}</tenNBan><mstNBan>${esc(p.supplier_tax_id)}</mstNBan><dtcthue>${Number(p.subtotal).toFixed(0)}</dtcthue><thueGTGT>${Number(p.vat_amount).toFixed(0)}</thueGTGT></CTietHDon>`);
    }
    lines.push(`  </BangKeMuaVao>`);
    lines.push(`</HSoThueDTu>`);
    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "tax",
        action: `Tạo tờ khai 01/GTGT kỳ ${period}`,
        result: "success",
        metadata: { period, payable: summary.payable, sales: sales.length, purchases: purchases.length },
      });
    } catch {}
    return { xml: lines.join("\n"), filename: `01-GTGT-${period}.xml` };
  });

export const buildCITXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year: number }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await getProfile(supabase, userId);

    // Re-compute CIT inline (avoid calling other server fn)
    const from = `${data.year}-01-01`, to = `${data.year}-12-31`;
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("entry_date, journal_lines(account_code, debit, credit)")
      .eq("user_id", userId).gte("entry_date", from).lte("entry_date", to);
    let revenue = 0, expense = 0, financeIncome = 0, financeExpense = 0, otherIncome = 0, otherExpense = 0;
    for (const e of entries ?? []) for (const l of (e as any).journal_lines ?? []) {
      const c = l.account_code as string; const d = Number(l.debit) || 0; const cr = Number(l.credit) || 0;
      if (c.startsWith("511") || c.startsWith("512")) revenue += cr - d;
      else if (c.startsWith("515")) financeIncome += cr - d;
      else if (c.startsWith("711")) otherIncome += cr - d;
      else if (c.startsWith("632") || c.startsWith("641") || c.startsWith("642")) expense += d - cr;
      else if (c.startsWith("635")) financeExpense += d - cr;
      else if (c.startsWith("811")) otherExpense += d - cr;
    }
    const accountingProfit = revenue + financeIncome + otherIncome - expense - financeExpense - otherExpense;
    const { data: noteRows } = await supabase.from("report_notes")
      .select("section, content").eq("user_id", userId).like("section", `tax.cit.${data.year}.%`);
    const notes: Record<string, string> = {};
    for (const n of noteRows ?? []) notes[(n as any).section.replace(`tax.cit.${data.year}.`, "")] = (n as any).content;
    const adjAdd = Number(notes["adjAdd"]) || 0, adjSub = Number(notes["adjSub"]) || 0;
    const taxRate = Number(notes["taxRate"]) || 20, lossCarry = Number(notes["lossCarry"]) || 0;
    const taxableIncome = Math.max(0, accountingProfit + adjAdd - adjSub - lossCarry);
    const taxPayable = taxableIncome * taxRate / 100;

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<HSoThueDTu>`,
      `  <HSoKhaiThue>`,
      `    <TTinChung><TTinTKhaiThue>`,
      `      <maTKhai>03/TNDN</maTKhai>`,
      `      <kyKKhaiThue><kieuKy>Y</kieuKy><kyKKhai>${data.year}</kyKKhai></kyKKhaiThue>`,
      `      <mst>${esc(profile?.tax_id)}</mst>`,
      `      <tenNNT>${esc(profile?.company_name)}</tenNNT>`,
      `    </TTinTKhaiThue></TTinChung>`,
      `    <CTieuTKhaiChinh>`,
      `      <ctA1>${revenue.toFixed(0)}</ctA1>`,
      `      <ctB1>${accountingProfit.toFixed(0)}</ctB1>`,
      `      <ctB2>${adjAdd.toFixed(0)}</ctB2>`,
      `      <ctB3>${adjSub.toFixed(0)}</ctB3>`,
      `      <ctB7>${lossCarry.toFixed(0)}</ctB7>`,
      `      <ctC1>${taxableIncome.toFixed(0)}</ctC1>`,
      `      <ctC9>${taxRate}</ctC9>`,
      `      <ctD>${taxPayable.toFixed(0)}</ctD>`,
      `    </CTieuTKhaiChinh>`,
      `  </HSoKhaiThue>`,
      `</HSoThueDTu>`,
    ].join("\n");
    return { xml, filename: `03-TNDN-${data.year}.xml` };
  });

export const buildPITXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year: number }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await getProfile(supabase, userId);
    const from = `${data.year}-01-01`, to = `${data.year}-12-31`;
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("id, payroll_lines(employee_id, gross, taxable, pit)")
      .eq("user_id", userId).gte("period_month", from).lte("period_month", to);
    const byEmp = new Map<string, { gross: number; taxable: number; pit: number }>();
    for (const r of runs ?? []) for (const l of (r as any).payroll_lines ?? []) {
      const k = l.employee_id;
      const m = byEmp.get(k) ?? { gross: 0, taxable: 0, pit: 0 };
      m.gross += Number(l.gross) || 0; m.taxable += Number(l.taxable) || 0; m.pit += Number(l.pit) || 0;
      byEmp.set(k, m);
    }
    const ids = Array.from(byEmp.keys());
    let emps: any[] = [];
    if (ids.length) {
      const { data: e } = await supabase.from("employees").select("id, full_name, tax_id, citizen_id").in("id", ids);
      emps = e ?? [];
    }
    const empMap = new Map(emps.map((e: any) => [e.id, e]));

    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<HSoThueDTu><HSoKhaiThue>`);
    lines.push(`  <TTinChung><TTinTKhaiThue>`);
    lines.push(`    <maTKhai>05/QTT-TNCN</maTKhai>`);
    lines.push(`    <kyKKhaiThue><kieuKy>Y</kieuKy><kyKKhai>${data.year}</kyKKhai></kyKKhaiThue>`);
    lines.push(`    <mst>${esc(profile?.tax_id)}</mst>`);
    lines.push(`    <tenNNT>${esc(profile?.company_name)}</tenNNT>`);
    lines.push(`  </TTinTKhaiThue></TTinChung>`);
    lines.push(`  <BangKeChiTiet>`);
    for (const [id, v] of byEmp.entries()) {
      const e = empMap.get(id);
      lines.push(`    <NLDong><hotenNLD>${esc(e?.full_name)}</hotenNLD><mstNLD>${esc(e?.tax_id)}</mstNLD><cmtNLD>${esc(e?.citizen_id)}</cmtNLD><tongTNCT>${v.gross.toFixed(0)}</tongTNCT><tongTNCTinhThue>${v.taxable.toFixed(0)}</tongTNCTinhThue><tongThueDaKhauTru>${v.pit.toFixed(0)}</tongThueDaKhauTru></NLDong>`);
    }
    lines.push(`  </BangKeChiTiet>`);
    lines.push(`</HSoKhaiThue></HSoThueDTu>`);
    return { xml: lines.join("\n"), filename: `05-QTT-TNCN-${data.year}.xml` };
  });

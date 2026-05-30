import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VatFreq = "monthly" | "quarterly";
export type VatMethod = "deduction" | "direct_revenue" | "direct_value";

export type VatRateKey = "0" | "5" | "8" | "10" | "exempt" | "no_declare";

export type VatSummary = {
  outputBase: number;
  outputVat: number;
  inputBase: number;
  inputVat: number;
  disallowedInputVat: number;
  payable: number;
  carryForward: number;
  byRate: Record<VatRateKey, { base: number; vat: number }>;
};

export type VatWarning = {
  rule: "tax-001" | "tax-002" | "reconcile_3331" | "reconcile_133";
  severity: "error" | "warn";
  message: string;
  invoiceIds?: string[];
  delta?: number;
};

const CASH_THRESHOLD = 20_000_000;

// ===== Helpers =====
function emptyByRate(): Record<VatRateKey, { base: number; vat: number }> {
  return {
    "0": { base: 0, vat: 0 },
    "5": { base: 0, vat: 0 },
    "8": { base: 0, vat: 0 },
    "10": { base: 0, vat: 0 },
    exempt: { base: 0, vat: 0 },
    no_declare: { base: 0, vat: 0 },
  };
}

function rateKey(rate: number | null | undefined): VatRateKey {
  const r = Number(rate) || 0;
  if (r === 0) return "0";
  if (r === 5) return "5";
  if (r === 8) return "8";
  if (r === 10) return "10";
  return "exempt";
}

/** Suy ra khoảng ngày từ kỳ ("YYYY-MM" | "YYYY-Qn" | "YYYY"). */
export function periodRange(period: string): { from: string; to: string; freq: VatFreq } {
  const qMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) {
    const y = Number(qMatch[1]);
    const q = Number(qMatch[2]);
    const startMonth = (q - 1) * 3;
    const from = new Date(Date.UTC(y, startMonth, 1));
    const to = new Date(Date.UTC(y, startMonth + 3, 0));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), freq: "quarterly" };
  }
  const mMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) {
    const y = Number(mMatch[1]);
    const m = Number(mMatch[2]) - 1;
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 0));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), freq: "monthly" };
  }
  throw new Error(`Kỳ không hợp lệ: ${period}`);
}

async function getTenantVatConfig(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("tenants")
    .select("id, vat_method, vat_declaration_freq, name, tax_id, address")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (data) {
    return {
      tenantId: data.id as string,
      method: (data.vat_method ?? "deduction") as VatMethod,
      freq: (data.vat_declaration_freq ?? "monthly") as VatFreq,
      name: data.name as string | null,
      taxId: data.tax_id as string | null,
      address: data.address as string | null,
    };
  }
  // Fallback từ profiles
  const { data: p } = await supabase
    .from("profiles")
    .select("company_name, tax_id, address")
    .eq("id", userId)
    .maybeSingle();
  return {
    tenantId: null as string | null,
    method: "deduction" as VatMethod,
    freq: "monthly" as VatFreq,
    name: p?.company_name ?? null,
    taxId: p?.tax_id ?? null,
    address: p?.address ?? null,
  };
}

async function loadVatPeriodData(supabase: SupabaseClient, userId: string, from: string, to: string) {
  const [purchasesRes, salesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_no, issue_date, supplier_name, supplier_tax_id, subtotal, vat_amount, total, status")
      .eq("user_id", userId)
      .gte("issue_date", from)
      .lte("issue_date", to),
    supabase
      .from("sales_invoices")
      .select("id, einvoice_code, invoice_no, issue_date, customer_name, customer_tax_id, subtotal, vat_amount, total, status")
      .eq("user_id", userId)
      .gte("issue_date", from)
      .lte("issue_date", to),
  ]);

  const purchases = (purchasesRes.data ?? []).filter((p: any) => p.status !== "voided");
  const sales = (salesRes.data ?? []).filter((s: any) => s.status === "issued" || s.status === "adjusted");

  const byRate = emptyByRate();

  // Phân bổ thuế suất từ sales_invoice_lines
  const salesIds = sales.map((s: any) => s.id);
  if (salesIds.length) {
    const { data: lines } = await supabase
      .from("sales_invoice_lines")
      .select("amount, vat_rate, vat_amount, invoice_id")
      .in("invoice_id", salesIds);
    for (const l of lines ?? []) {
      const k = rateKey(l.vat_rate);
      byRate[k].base += Number(l.amount) || 0;
      byRate[k].vat += Number(l.vat_amount ?? (Number(l.amount) * (Number(l.vat_rate) || 0) / 100));
    }
  }

  // Kiểm tra điều kiện khấu trừ VAT đầu vào
  const noTaxId: string[] = [];
  const cashOver20m: string[] = [];
  let disallowedInputVat = 0;
  for (const p of purchases) {
    const vat = Number(p.vat_amount) || 0;
    if (vat > 0 && !p.supplier_tax_id) {
      noTaxId.push(p.id);
      disallowedInputVat += vat;
    }
    if (Number(p.total) >= CASH_THRESHOLD) {
      cashOver20m.push(p.id);
    }
  }

  // Đối chiếu sổ cái 3331/133
  const { data: jLines } = await supabase
    .from("journal_lines")
    .select("account_code, debit, credit, journal_entries!inner(entry_date, user_id)")
    .eq("journal_entries.user_id", userId)
    .gte("journal_entries.entry_date", from)
    .lte("journal_entries.entry_date", to);
  let outputVatLedger = 0;
  let inputVatLedger = 0;
  for (const l of (jLines as any[]) ?? []) {
    const c = String(l.account_code || "");
    const d = Number(l.debit) || 0;
    const cr = Number(l.credit) || 0;
    if (c.startsWith("3331")) outputVatLedger += cr - d;
    else if (c.startsWith("133")) inputVatLedger += d - cr;
  }

  const inputVat = purchases.reduce((s, r: any) => s + (Number(r.vat_amount) || 0), 0);
  const outputVat = sales.reduce((s, r: any) => s + (Number(r.vat_amount) || 0), 0);
  const inputBase = purchases.reduce((s, r: any) => s + (Number(r.subtotal) || 0), 0);
  const outputBase = sales.reduce((s, r: any) => s + (Number(r.subtotal) || 0), 0);
  const deductibleInputVat = Math.max(0, inputVat - disallowedInputVat);

  const summary: VatSummary = {
    outputBase,
    outputVat,
    inputBase,
    inputVat,
    disallowedInputVat,
    payable: Math.max(0, outputVat - deductibleInputVat),
    carryForward: Math.max(0, deductibleInputVat - outputVat),
    byRate,
  };

  const warnings: VatWarning[] = [];
  if (noTaxId.length) {
    warnings.push({
      rule: "tax-001",
      severity: "error",
      message: `${noTaxId.length} hóa đơn mua không có MST nhà cung cấp → loại VAT khấu trừ ${disallowedInputVat.toLocaleString("vi-VN")} đ`,
      invoiceIds: noTaxId,
    });
  }
  if (cashOver20m.length) {
    warnings.push({
      rule: "tax-002",
      severity: "warn",
      message: `${cashOver20m.length} hóa đơn ≥20 triệu — cần chứng từ thanh toán không dùng tiền mặt để được khấu trừ`,
      invoiceIds: cashOver20m,
    });
  }
  const deltaOut = Math.round(outputVatLedger - outputVat);
  if (Math.abs(deltaOut) > 1000) {
    warnings.push({
      rule: "reconcile_3331",
      severity: "warn",
      message: `Chênh lệch VAT đầu ra: sổ cái 3331 = ${outputVatLedger.toLocaleString("vi-VN")} đ, hoá đơn = ${outputVat.toLocaleString("vi-VN")} đ`,
      delta: deltaOut,
    });
  }
  const deltaIn = Math.round(inputVatLedger - inputVat);
  if (Math.abs(deltaIn) > 1000) {
    warnings.push({
      rule: "reconcile_133",
      severity: "warn",
      message: `Chênh lệch VAT đầu vào: sổ cái 133 = ${inputVatLedger.toLocaleString("vi-VN")} đ, hoá đơn = ${inputVatLedger.toLocaleString("vi-VN")} đ`,
      delta: deltaIn,
    });
  }

  return {
    summary,
    purchases,
    sales,
    warnings,
    reconcile: { outputVatLedger, outputVatInvoices: outputVat, inputVatLedger, inputVatInvoices: inputVat },
    deductible: { noTaxIdIds: noTaxId, cashOver20mIds: cashOver20m },
  };
}

// ============== Server functions ==============

export const getVatPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { period: string }) =>
    z.object({ period: z.string().regex(/^\d{4}(-\d{2}|-Q[1-4])$/) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { from, to, freq } = periodRange(data.period);
    const cfg = await getTenantVatConfig(supabase, userId);
    const result = await loadVatPeriodData(supabase, userId, from, to);

    const [adjRes, filingRes] = await Promise.all([
      supabase
        .from("vat_filing_adjustments")
        .select("*")
        .eq("user_id", userId)
        .eq("filing_period", data.period)
        .order("created_at"),
      supabase
        .from("vat_filings")
        .select("*")
        .eq("user_id", userId)
        .eq("period", data.period)
        .in("status", ["committed", "submitted", "draft"])
        .order("committed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      period: data.period,
      from,
      to,
      freq,
      config: cfg,
      ...result,
      adjustments: adjRes.data ?? [],
      filing: filingRes.data ?? null,
    };
  });

export const listVatFilings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { year?: number }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const year = data.year ?? new Date().getFullYear();
    const { data: rows } = await supabase
      .from("vat_filings")
      .select("id, period, freq, method, status, committed_at, submitted_at, ack_code, snapshot")
      .eq("user_id", userId)
      .like("period", `${year}%`)
      .order("period", { ascending: false });
    const items = (rows ?? []).map((r: any) => ({
      ...r,
      payable: r.snapshot?.summary?.payable ?? 0,
      carryForward: r.snapshot?.summary?.carryForward ?? 0,
    }));
    const totalPayable = items.reduce((s, r) => s + (Number(r.payable) || 0), 0);
    return { items, totalPayable };
  });

export const commitVatFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { period: string; notes?: string }) =>
    z.object({ period: z.string(), notes: z.string().max(1000).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cfg = await getTenantVatConfig(supabase, userId);
    const { from, to, freq } = periodRange(data.period);
    const result = await loadVatPeriodData(supabase, userId, from, to);

    // Chặn nếu đã có bản đã chốt/đã nộp cho kỳ này
    const { data: existing } = await supabase
      .from("vat_filings")
      .select("id, status")
      .eq("user_id", userId)
      .eq("period", data.period)
      .in("status", ["committed", "submitted"])
      .maybeSingle();
    if (existing) throw new Error(`Kỳ ${data.period} đã được chốt trước đó.`);

    const xml = buildVatXmlString({ cfg, period: data.period, freq, summary: result.summary, sales: result.sales, purchases: result.purchases });

    const { data: row, error } = await supabase
      .from("vat_filings")
      .insert({
        user_id: userId,
        tenant_id: cfg.tenantId,
        period: data.period,
        freq,
        method: cfg.method,
        snapshot: {
          summary: result.summary,
          reconcile: result.reconcile,
          warnings: result.warnings,
          saleIds: result.sales.map((s: any) => s.id),
          purchaseIds: result.purchases.map((p: any) => p.id),
        },
        xml,
        status: "committed",
        committed_by: userId,
        committed_at: new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      tenant_id: cfg.tenantId,
      action: "tax.vat.commit",
      table_name: "vat_filings",
      record_id: row.id,
      after: { period: data.period, payable: result.summary.payable },
    });

    return row;
  });

export const reopenVatFiling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { filingId: string }) => z.object({ filingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("vat_filings")
      .update({ status: "reopened" })
      .eq("id", data.filingId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      user_id: userId,
      tenant_id: row.tenant_id,
      action: "tax.vat.reopen",
      table_name: "vat_filings",
      record_id: row.id,
    });
    return row;
  });

export const markVatSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { filingId: string; ackCode?: string }) =>
    z.object({ filingId: z.string().uuid(), ackCode: z.string().max(100).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("vat_filings")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), ack_code: data.ackCode ?? null })
      .eq("id", data.filingId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const addVatAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    filing_period: string;
    original_period: string;
    original_invoice_no?: string;
    kind: "sales" | "purchase";
    direction: "increase" | "decrease";
    base_amount: number;
    vat_amount: number;
    reason?: string;
  }) =>
    z.object({
      filing_period: z.string(),
      original_period: z.string(),
      original_invoice_no: z.string().max(100).optional(),
      kind: z.enum(["sales", "purchase"]),
      direction: z.enum(["increase", "decrease"]),
      base_amount: z.number(),
      vat_amount: z.number(),
      reason: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cfg = await getTenantVatConfig(supabase, userId);
    const { data: row, error } = await supabase
      .from("vat_filing_adjustments")
      .insert({ ...data, user_id: userId, tenant_id: cfg.tenantId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeVatAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("vat_filing_adjustments")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== XML builder ==============
function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!),
  );
}

function buildVatXmlString(opts: {
  cfg: { name: string | null; taxId: string | null; address: string | null; method: VatMethod };
  period: string;
  freq: VatFreq;
  summary: VatSummary;
  sales: any[];
  purchases: any[];
}): string {
  const { cfg, period, freq, summary, sales, purchases } = opts;
  const isQuarter = freq === "quarterly";
  const kyKKhai = isQuarter ? period.replace("-Q", "/") : period;
  const maTKhai = cfg.method === "deduction" ? "01/GTGT" : "04/GTGT";
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<HSoThueDTu>`);
  lines.push(`  <HSoKhaiThue>`);
  lines.push(`    <TTinChung><TTinTKhaiThue>`);
  lines.push(`      <maTKhai>${maTKhai}</maTKhai>`);
  lines.push(`      <kyKKhaiThue><kieuKy>${isQuarter ? "Q" : "M"}</kieuKy><kyKKhai>${kyKKhai}</kyKKhai></kyKKhaiThue>`);
  lines.push(`      <mst>${esc(cfg.taxId)}</mst>`);
  lines.push(`      <tenNNT>${esc(cfg.name)}</tenNNT>`);
  lines.push(`      <dchiNNT>${esc(cfg.address)}</dchiNNT>`);
  lines.push(`    </TTinTKhaiThue></TTinChung>`);
  lines.push(`    <CTieuTKhaiChinh>`);
  if (cfg.method === "deduction") {
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
  } else {
    // 04/GTGT: trực tiếp trên doanh thu
    lines.push(`      <ct21>${summary.outputBase.toFixed(0)}</ct21>`);
    lines.push(`      <ct22>${summary.outputVat.toFixed(0)}</ct22>`);
    lines.push(`      <ct40>${summary.outputVat.toFixed(0)}</ct40>`);
  }
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
  return lines.join("\n");
}

export const buildVatXmlPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { period: string }) => z.object({ period: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cfg = await getTenantVatConfig(supabase, userId);
    const { from, to, freq } = periodRange(data.period);

    // Nếu đã chốt → trả XML đã lưu
    const { data: filing } = await supabase
      .from("vat_filings")
      .select("xml, period")
      .eq("user_id", userId)
      .eq("period", data.period)
      .in("status", ["committed", "submitted"])
      .maybeSingle();
    if (filing?.xml) {
      const filename = `${cfg.method === "deduction" ? "01-GTGT" : "04-GTGT"}-${data.period}.xml`;
      return { xml: filing.xml, filename };
    }

    const result = await loadVatPeriodData(supabase, userId, from, to);
    const xml = buildVatXmlString({ cfg, period: data.period, freq, summary: result.summary, sales: result.sales, purchases: result.purchases });
    const filename = `${cfg.method === "deduction" ? "01-GTGT" : "04-GTGT"}-${data.period}.xml`;
    return { xml, filename };
  });

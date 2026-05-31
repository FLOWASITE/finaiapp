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
    .select(
      "id, vat_method, vat_declaration_freq, name, tax_id, address, phone, fax, email, legal_rep_name, tax_authority_code, tax_authority_name, province_code, province_name, district_code, district_name, ward_name",
    )
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
      phone: (data as any).phone as string | null,
      fax: (data as any).fax as string | null,
      email: (data as any).email as string | null,
      legalRepName: (data as any).legal_rep_name as string | null,
      taxAuthorityCode: (data as any).tax_authority_code as string | null,
      taxAuthorityName: (data as any).tax_authority_name as string | null,
      provinceCode: (data as any).province_code as string | null,
      provinceName: (data as any).province_name as string | null,
      districtCode: (data as any).district_code as string | null,
      districtName: (data as any).district_name as string | null,
      wardName: (data as any).ward_name as string | null,
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
    phone: null, fax: null, email: null, legalRepName: null,
    taxAuthorityCode: null, taxAuthorityName: null,
    provinceCode: null, provinceName: null,
    districtCode: null, districtName: null, wardName: null,
  };
}

type TenantVatConfig = Awaited<ReturnType<typeof getTenantVatConfig>>;

/** Gom các dòng có thuế suất 8% theo từng hóa đơn — phục vụ Phụ lục NQ giảm thuế. */
async function load8PctBreakdown(
  supabase: SupabaseClient,
  purchaseIds: string[],
  salesIds: string[],
) {
  const purchases8: Array<{ name: string; base: number; tax: number }> = [];
  const sales8: Array<{ name: string; base: number; tax: number }> = [];

  if (purchaseIds.length) {
    const { data: pLines } = await supabase
      .from("invoice_lines")
      .select("invoice_id, description, amount, vat_rate, invoices!inner(invoice_no, supplier_name)")
      .in("invoice_id", purchaseIds)
      .eq("vat_rate", 8);
    const byInv = new Map<string, { name: string; base: number; tax: number }>();
    for (const l of (pLines as any[]) ?? []) {
      const id = l.invoice_id as string;
      const base = Number(l.amount) || 0;
      const tax = Math.round(base * 0.08);
      const prev = byInv.get(id);
      if (prev) { prev.base += base; prev.tax += tax; }
      else {
        const inv = l.invoices ?? {};
        const desc = (l.description || "").toString().trim();
        const name = desc || `${inv.supplier_name ?? "HHDV mua vào"} - HD${inv.invoice_no ?? ""}`;
        byInv.set(id, { name, base, tax });
      }
    }
    for (const v of byInv.values()) purchases8.push({ ...v, tax: Math.round(v.tax) });
  }

  if (salesIds.length) {
    const { data: sLines } = await supabase
      .from("sales_invoice_lines")
      .select("invoice_id, description, pre_vat_amount, line_vat_amount, vat_code")
      .in("invoice_id", salesIds)
      .eq("vat_code", "8");
    const byInv = new Map<string, { name: string; base: number; tax: number }>();
    for (const l of (sLines as any[]) ?? []) {
      const id = l.invoice_id as string;
      const base = Number(l.pre_vat_amount) || 0;
      const tax = Number(l.line_vat_amount) || Math.round(base * 0.08);
      const prev = byInv.get(id);
      if (prev) { prev.base += base; prev.tax += tax; }
      else {
        const desc = (l.description || "").toString().trim();
        byInv.set(id, { name: desc || "Dịch vụ bán ra", base, tax });
      }
    }
    for (const v of byInv.values()) sales8.push({ ...v, tax: Math.round(v.tax) });
  }

  return { purchases8, sales8 };
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
      message: `Chênh lệch VAT đầu vào: sổ cái 133 = ${inputVatLedger.toLocaleString("vi-VN")} đ, hoá đơn = ${inputVat.toLocaleString("vi-VN")} đ`,
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

    const breakdown = await load8PctBreakdown(
      supabase,
      result.purchases.map((p: any) => p.id),
      result.sales.map((s: any) => s.id),
    );
    const adjustments = await loadAdjustmentsForPeriod(supabase, userId, data.period);
    const meta = resolveMeta(undefined, cfg);
    const xml = buildVatXmlString({
      cfg, period: data.period, freq,
      summary: result.summary, adjustments,
      purchases8: breakdown.purchases8, sales8: breakdown.sales8,
      meta,
    });

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

// ============== XML builder (HTKK 5.5.6 — TT80/2021, mẫu 01/GTGT mã 842) ==============
function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!),
  );
}

const round0 = (n: number) => Math.round(Number(n) || 0);
const intStr = (n: number) => String(round0(n));

function tag(name: string, value: string | number | null | undefined, indent = ""): string {
  const v = value === null || value === undefined || value === "" ? "" : esc(value);
  return v === "" ? `${indent}<${name} />` : `${indent}<${name}>${v}</${name}>`;
}

function formatKyKKhai(period: string, freq: VatFreq): { kieuKy: "Q" | "M"; kyKKhai: string; tuNgay: string; denNgay: string } {
  const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  if (freq === "quarterly") {
    const [y, q] = period.split("-Q");
    const year = Number(y); const qn = Number(q);
    const startMonth = (qn - 1) * 3;
    const from = new Date(Date.UTC(year, startMonth, 1));
    const to = new Date(Date.UTC(year, startMonth + 3, 0));
    return { kieuKy: "Q", kyKKhai: `${qn}/${year}`, tuNgay: fmt(from), denNgay: fmt(to) };
  }
  const [y, m] = period.split("-");
  const year = Number(y); const mn = Number(m);
  const from = new Date(Date.UTC(year, mn - 1, 1));
  const to = new Date(Date.UTC(year, mn, 0));
  return { kieuKy: "M", kyKKhai: `${String(mn).padStart(2, "0")}/${year}`, tuNgay: fmt(from), denNgay: fmt(to) };
}

type XmlBuilderOptions = {
  cfg: TenantVatConfig;
  period: string;
  freq: VatFreq;
  summary: VatSummary;
  adjustments?: Array<{ direction: "increase" | "decrease"; vat_amount: number }>;
  purchases8: Array<{ name: string; base: number; tax: number }>;
  sales8: Array<{ name: string; base: number; tax: number }>;
  meta: {
    loaiTKhai: "C" | "B";
    soLan: number;
    ngayLap: string;
    ngayKy: string;
    nguoiKy: string;
  };
};

function buildPlNq142(opts: { purchases8: XmlBuilderOptions["purchases8"]; sales8: XmlBuilderOptions["sales8"] }): string {
  const { purchases8, sales8 } = opts;
  if (purchases8.length === 0 && sales8.length === 0) return "";

  const lines: string[] = [];
  lines.push(`    <PLuc>`);
  lines.push(`      <PL_NQ142_GTGT>`);
  lines.push(`        <HH_DV_MuaVaoTrongKy>`);
  let muaBase = 0, muaTax = 0;
  purchases8.forEach((it, idx) => {
    muaBase += it.base; muaTax += it.tax;
    lines.push(`          <BangKeTenHHDV ID="ID_${idx + 1}">`);
    lines.push(`            <tenHHDVMuaVao>${esc(it.name)}</tenHHDVMuaVao>`);
    lines.push(`            <giaTriHHDVMuaVao>${intStr(it.base)}</giaTriHHDVMuaVao>`);
    lines.push(`            <thueGTGTHHDV>${intStr(it.tax)}</thueGTGTHHDV>`);
    lines.push(`          </BangKeTenHHDV>`);
  });
  lines.push(`          <tongCongGiaTriHHDVMuaVao>${intStr(muaBase)}</tongCongGiaTriHHDVMuaVao>`);
  lines.push(`          <tongCongThueGTGTHHDV>${intStr(muaTax)}</tongCongThueGTGTHHDV>`);
  lines.push(`        </HH_DV_MuaVaoTrongKy>`);

  lines.push(`        <HH_DV_BanRaTrongKy>`);
  let banBase = 0, banTax = 0;
  sales8.forEach((it, idx) => {
    banBase += it.base; banTax += it.tax;
    lines.push(`          <BangKeTenHHDV ID="ID_${idx + 1}">`);
    lines.push(`            <tenHHDV>${esc(it.name)}</tenHHDV>`);
    lines.push(`            <giaTriHHDV>${intStr(it.base)}</giaTriHHDV>`);
    lines.push(`            <thueSuatTheoQuyDinh>10</thueSuatTheoQuyDinh>`);
    lines.push(`            <thueSuatSauGiam>8</thueSuatSauGiam>`);
    lines.push(`            <thueGTGTDuocGiam>${intStr(it.tax)}</thueGTGTDuocGiam>`);
    lines.push(`          </BangKeTenHHDV>`);
  });
  lines.push(`          <tongCongGiaTriHHDV>${intStr(banBase)}</tongCongGiaTriHHDV>`);
  lines.push(`          <tongCongThueGTGTDuocGiam>${intStr(banTax)}</tongCongThueGTGTDuocGiam>`);
  lines.push(`        </HH_DV_BanRaTrongKy>`);

  const ct9 = round0(banTax) - round0(banBase * 0.08);
  lines.push(`        <ChenhLech>`);
  lines.push(`          <ct9>${intStr(ct9)}</ct9>`);
  lines.push(`        </ChenhLech>`);
  lines.push(`      </PL_NQ142_GTGT>`);
  lines.push(`    </PLuc>`);
  return lines.join("\n");
}

function buildVatXmlString(opts: XmlBuilderOptions): string {
  const { cfg, period, freq, summary, adjustments = [], purchases8, sales8, meta } = opts;

  if (cfg.method !== "deduction") {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<HSoThueDTu xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://kekhaithue.gdt.gov.vn/TKhaiThue">`,
      `  <HSoKhaiThue id="ID-NODETOSIGN-XML">`,
      `    <TTinChung><TTinTKhaiThue>`,
      `      <TKhaiThue><maTKhai>04/GTGT</maTKhai></TKhaiThue>`,
      `      <NNT>${tag("mst", cfg.taxId).trim()}${tag("tenNNT", cfg.name).trim()}${tag("dchiNNT", cfg.address).trim()}</NNT>`,
      `    </TTinTKhaiThue></TTinChung>`,
      `    <CTieuTKhaiChinh>`,
      `      <ct21>${intStr(summary.outputBase)}</ct21>`,
      `      <ct22>${intStr(summary.outputVat)}</ct22>`,
      `      <ct40>${intStr(summary.outputVat)}</ct40>`,
      `    </CTieuTKhaiChinh>`,
      `  </HSoKhaiThue>`,
      `</HSoThueDTu>`,
    ].join("\n");
  }

  const ky = formatKyKKhai(period, freq);
  const ct22 = round0(summary.inputBase);
  const ct23 = round0(summary.inputBase);
  const ct24 = round0(summary.inputVat);
  const ct23a = 0, ct24a = 0;
  const ct25 = Math.max(0, round0(summary.inputVat - summary.disallowedInputVat));
  const ct26 = round0(summary.byRate["exempt"].base + summary.byRate["no_declare"].base);
  const ct29 = round0(summary.byRate["0"].base);
  const ct30 = round0(summary.byRate["5"].base);
  const ct31 = round0(summary.byRate["5"].vat);
  const ct32 = round0(summary.byRate["10"].base + summary.byRate["8"].base);
  const ct33 = round0(summary.byRate["10"].vat + summary.byRate["8"].base * 0.10);
  const ct32a = 0;
  const ct27 = ct30 + ct32;
  const ct28 = ct31 + ct33;
  const ct34 = ct26 + ct27 + ct29;
  const ct35 = ct28;
  const ct36 = Math.max(0, ct35 - ct25);
  let ct37 = 0, ct38 = 0;
  for (const a of adjustments) {
    if (a.direction === "increase") ct37 += round0(a.vat_amount);
    else ct38 += round0(a.vat_amount);
  }
  const ct39a = 0;
  const ct40a = Math.max(0, ct36 + ct37 - ct38 - ct39a);
  const ct40b = 0;
  const ct40 = ct40a + ct40b;
  const ct41 = ct35 - ct25 < 0 ? Math.abs(ct35 - ct25) + ct38 - ct37 : 0;
  const ct42 = 0;
  const ct43 = Math.max(0, ct41 - ct42);

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<HSoThueDTu xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://kekhaithue.gdt.gov.vn/TKhaiThue">`);
  out.push(`  <HSoKhaiThue id="ID-NODETOSIGN-XML">`);
  out.push(`    <TTinChung>`);
  out.push(`      <TTinDVu>`);
  out.push(`        <maDVu>HTKK</maDVu>`);
  out.push(`        <tenDVu>HỖ TRỢ KÊ KHAI THUẾ</tenDVu>`);
  out.push(`        <pbanDVu>5.5.6</pbanDVu>`);
  out.push(`        <ttinNhaCCapDVu>FINAI</ttinNhaCCapDVu>`);
  out.push(`      </TTinDVu>`);
  out.push(`      <TTinTKhaiThue>`);
  out.push(`        <TKhaiThue>`);
  out.push(`          <maTKhai>842</maTKhai>`);
  out.push(`          <tenTKhai>TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (Mẫu số 01/GTGT)</tenTKhai>`);
  out.push(`          <moTaBMau>(Ban hành kèm theo Thông tư số 80/2021/TT-BTC ngày 29 tháng 9 năm 2021 của Bộ trưởng Bộ Tài chính)</moTaBMau>`);
  out.push(`          <pbanTKhaiXML>2.8.3</pbanTKhaiXML>`);
  out.push(`          <loaiTKhai>${meta.loaiTKhai}</loaiTKhai>`);
  out.push(`          <soLan>${meta.soLan}</soLan>`);
  out.push(`          <KyKKhaiThue>`);
  out.push(`            <kieuKy>${ky.kieuKy}</kieuKy>`);
  out.push(`            <kyKKhai>${ky.kyKKhai}</kyKKhai>`);
  out.push(`            <kyKKhaiTuNgay>${ky.tuNgay}</kyKKhaiTuNgay>`);
  out.push(`            <kyKKhaiDenNgay>${ky.denNgay}</kyKKhaiDenNgay>`);
  out.push(`            <kyKKhaiTuThang />`);
  out.push(`            <kyKKhaiDenThang />`);
  out.push(`          </KyKKhaiThue>`);
  out.push(tag("maCQTNoiNop", cfg.taxAuthorityCode, "          "));
  out.push(tag("tenCQTNoiNop", cfg.taxAuthorityName, "          "));
  out.push(`          <ngayLapTKhai>${meta.ngayLap}</ngayLapTKhai>`);
  out.push(`          <GiaHan>`);
  out.push(`            <maLyDoGiaHan />`);
  out.push(`            <lyDoGiaHan />`);
  out.push(`          </GiaHan>`);
  out.push(tag("nguoiKy", meta.nguoiKy, "          "));
  out.push(`          <ngayKy>${meta.ngayKy}</ngayKy>`);
  out.push(`          <nganhNgheKD />`);
  out.push(`        </TKhaiThue>`);
  out.push(`        <NNT>`);
  out.push(tag("mst", cfg.taxId, "          "));
  out.push(tag("tenNNT", cfg.name, "          "));
  out.push(tag("dchiNNT", cfg.address, "          "));
  out.push(tag("phuongXa", cfg.wardName, "          "));
  out.push(tag("maHuyenNNT", cfg.districtCode, "          "));
  out.push(tag("tenHuyenNNT", cfg.districtName, "          "));
  out.push(tag("maTinhNNT", cfg.provinceCode, "          "));
  out.push(tag("tenTinhNNT", cfg.provinceName, "          "));
  out.push(tag("dthoaiNNT", cfg.phone, "          "));
  out.push(tag("faxNNT", cfg.fax, "          "));
  out.push(tag("emailNNT", cfg.email, "          "));
  out.push(`        </NNT>`);
  out.push(`      </TTinTKhaiThue>`);
  out.push(`    </TTinChung>`);
  out.push(`    <CTieuTKhaiChinh>`);
  out.push(`      <ma_NganhNghe>00</ma_NganhNghe>`);
  out.push(`      <ten_NganhNghe>Hoạt động sản xuất kinh doanh thông thường</ten_NganhNghe>`);
  out.push(`      <tieuMucHachToan>1701</tieuMucHachToan>`);
  out.push(`      <Header>`);
  out.push(`        <ct09 />`);
  out.push(`        <ct10 />`);
  out.push(`        <DiaChiHDSXKDKhacTinhNDTSC>`);
  out.push(`          <ct11a_phuongXa_ma />`);
  out.push(`          <ct11a_phuongXa_ten />`);
  out.push(`          <ct11b_quanHuyen_ma />`);
  out.push(`          <ct11b_quanHuyen_ten />`);
  out.push(`          <ct11c_tinhTP_ma />`);
  out.push(`          <ct11c_tinhTP_ten />`);
  out.push(`        </DiaChiHDSXKDKhacTinhNDTSC>`);
  out.push(`      </Header>`);
  out.push(`      <ct21>0</ct21>`);
  out.push(`      <ct22>${intStr(ct22)}</ct22>`);
  out.push(`      <GiaTriVaThueGTGTHHDVMuaVao><ct23>${intStr(ct23)}</ct23><ct24>${intStr(ct24)}</ct24></GiaTriVaThueGTGTHHDVMuaVao>`);
  out.push(`      <HangHoaDichVuNhapKhau><ct23a>${intStr(ct23a)}</ct23a><ct24a>${intStr(ct24a)}</ct24a></HangHoaDichVuNhapKhau>`);
  out.push(`      <ct25>${intStr(ct25)}</ct25>`);
  out.push(`      <ct26>${intStr(ct26)}</ct26>`);
  out.push(`      <HHDVBRaChiuThueGTGT><ct27>${intStr(ct27)}</ct27><ct28>${intStr(ct28)}</ct28></HHDVBRaChiuThueGTGT>`);
  out.push(`      <ct29>${intStr(ct29)}</ct29>`);
  out.push(`      <HHDVBRaChiuTSuat5><ct30>${intStr(ct30)}</ct30><ct31>${intStr(ct31)}</ct31></HHDVBRaChiuTSuat5>`);
  out.push(`      <HHDVBRaChiuTSuat10><ct32>${intStr(ct32)}</ct32><ct33>${intStr(ct33)}</ct33></HHDVBRaChiuTSuat10>`);
  out.push(`      <ct32a>${intStr(ct32a)}</ct32a>`);
  out.push(`      <TongDThuVaThueGTGTHHDVBRa><ct34>${intStr(ct34)}</ct34><ct35>${intStr(ct35)}</ct35></TongDThuVaThueGTGTHHDVBRa>`);
  out.push(`      <ct36>${intStr(ct36)}</ct36>`);
  out.push(`      <ct37>${intStr(ct37)}</ct37>`);
  out.push(`      <ct38>${intStr(ct38)}</ct38>`);
  out.push(`      <ct39a>${intStr(ct39a)}</ct39a>`);
  out.push(`      <ct40a>${intStr(ct40a)}</ct40a>`);
  out.push(`      <ct40b>${intStr(ct40b)}</ct40b>`);
  out.push(`      <ct40>${intStr(ct40)}</ct40>`);
  out.push(`      <ct41>${intStr(ct41)}</ct41>`);
  out.push(`      <ct42>${intStr(ct42)}</ct42>`);
  out.push(`      <ct43>${intStr(ct43)}</ct43>`);
  out.push(`    </CTieuTKhaiChinh>`);

  const pluc = buildPlNq142({ purchases8, sales8 });
  if (pluc) out.push(pluc);

  out.push(`  </HSoKhaiThue>`);
  out.push(`</HSoThueDTu>`);
  return out.join("\n");
}

function todayUtcPlus7(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const xmlMetaSchema = z.object({
  loaiTKhai: z.enum(["C", "B"]).default("C"),
  soLan: z.number().int().min(0).max(99).default(0),
  ngayLap: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ngayKy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nguoiKy: z.string().max(200).optional(),
});

async function loadAdjustmentsForPeriod(supabase: SupabaseClient, userId: string, period: string) {
  const { data } = await supabase
    .from("vat_filing_adjustments")
    .select("direction, vat_amount")
    .eq("user_id", userId)
    .eq("filing_period", period);
  return (data ?? []) as Array<{ direction: "increase" | "decrease"; vat_amount: number }>;
}

function resolveMeta(input: z.input<typeof xmlMetaSchema> | undefined, cfg: TenantVatConfig) {
  const m = (input ?? {}) as any;
  const today = todayUtcPlus7();
  return {
    loaiTKhai: (m.loaiTKhai ?? "C") as "C" | "B",
    soLan: Number(m.soLan ?? 0),
    ngayLap: m.ngayLap ?? today,
    ngayKy: m.ngayKy ?? today,
    nguoiKy: (m.nguoiKy ?? cfg.legalRepName ?? "").toString(),
  };
}

export const buildVatXmlPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { period: string; meta?: z.input<typeof xmlMetaSchema> }) =>
    z.object({ period: z.string(), meta: xmlMetaSchema.optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cfg = await getTenantVatConfig(supabase, userId);
    const { from, to, freq } = periodRange(data.period);

    const { data: filing } = await supabase
      .from("vat_filings")
      .select("xml")
      .eq("user_id", userId)
      .eq("period", data.period)
      .in("status", ["committed", "submitted"])
      .maybeSingle();
    if (filing?.xml) {
      return { xml: filing.xml, filename: `01-GTGT-${data.period}.xml` };
    }

    const result = await loadVatPeriodData(supabase, userId, from, to);
    const breakdown = await load8PctBreakdown(
      supabase,
      result.purchases.map((p: any) => p.id),
      result.sales.map((s: any) => s.id),
    );
    const adjustments = await loadAdjustmentsForPeriod(supabase, userId, data.period);
    const meta = resolveMeta(data.meta, cfg);

    const xml = buildVatXmlString({
      cfg, period: data.period, freq,
      summary: result.summary, adjustments,
      purchases8: breakdown.purchases8, sales8: breakdown.sales8,
      meta,
    });
    const filename = `${cfg.method === "deduction" ? "01-GTGT" : "04-GTGT"}-${data.period}.xml`;
    return { xml, filename };
  });

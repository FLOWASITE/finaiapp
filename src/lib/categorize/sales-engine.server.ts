/**
 * Engine đề xuất bút toán cho hoá đơn BÁN RA (sales_invoices).
 * Server-only. Pattern chuẩn TT200:
 *   Nợ 131 (KH) hoặc 111/112 (đã thu) = total
 *   Có 511x = subtotal (gom theo loại: 5111 hàng, 5112 thành phẩm, 5113 dịch vụ)
 *   Có 3331 = vat_amount (nếu > 0)
 *
 * Warning code mới: cat-011 — không xác định được loại doanh thu, fallback 5118.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyCalibratedConfidence,
  decideBand,
  getCalibration,
  type SignalFeatures,
} from "./calibration.server";
import type {
  JournalProposalDTO,
  ProposalEntry,
  ProposalLine,
  ProposalSignal,
  ProposalWarning,
  ProposalAlternative,
} from "./types";

const ACCOUNT_RECEIVABLE = "131";
const ACCOUNT_CASH = "111";
const ACCOUNT_BANK = "112";
const ACCOUNT_VAT_OUTPUT = "3331";
const REVENUE_GOODS = "5111";
const REVENUE_PRODUCT = "5112";
const REVENUE_SERVICE = "5113";
const REVENUE_OTHER = "5118";

type SalesLine = {
  id: string;
  description: string;
  amount: number;
  qty: number;
  unit_price: number;
  vat_rate: number;
  vat_code: string;
  pre_vat_amount: number;
  line_vat_amount: number;
  product_id: string | null;
};

export type LoadedSalesInvoice = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_tax_id: string | null;
  invoice_no: string | null;
  issue_date: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_status: string;
  notes: string | null;
  lines: SalesLine[];
};

async function loadSalesInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<LoadedSalesInvoice | null> {
  const { data: inv } = await supabase
    .from("sales_invoices")
    .select(
      "id, tenant_id, customer_id, customer_name, customer_tax_id, invoice_no, issue_date, subtotal, vat_amount, total, payment_status, notes",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return null;
  const { data: lines } = await supabase
    .from("sales_invoice_lines")
    .select(
      "id, description, qty, unit_price, amount, vat_rate, vat_code, pre_vat_amount, line_vat_amount, product_id",
    )
    .eq("invoice_id", invoiceId);
  return mapSalesInvoice(inv, lines ?? []);
}

function mapSalesInvoice(inv: any, lines: any[]): LoadedSalesInvoice {
  return {
    id: inv.id,
    tenant_id: inv.tenant_id ?? "",
    customer_id: inv.customer_id ?? null,
    customer_name: inv.customer_name ?? null,
    customer_tax_id: inv.customer_tax_id ?? null,
    invoice_no: inv.invoice_no ?? null,
    issue_date: inv.issue_date ?? null,
    subtotal: Number(inv.subtotal ?? 0),
    vat_amount: Number(inv.vat_amount ?? 0),
    total: Number(inv.total ?? 0),
    payment_status: inv.payment_status ?? "unpaid",
    notes: inv.notes ?? null,
    lines: (lines as any[]).map((l) => ({
      id: l.id,
      description: String(l.description ?? ""),
      qty: Number(l.qty ?? 0),
      unit_price: Number(l.unit_price ?? 0),
      amount: Number(l.amount ?? 0),
      vat_rate: Number(l.vat_rate ?? 0),
      vat_code: String(l.vat_code ?? "10"),
      pre_vat_amount: Number(l.pre_vat_amount ?? 0),
      line_vat_amount: Number(l.line_vat_amount ?? 0),
      product_id: l.product_id ?? null,
    })),
  };
}

/** Đoán TK doanh thu theo mô tả + product kind hint. */
function pickRevenueAccount(
  line: SalesLine,
  productKindMap: Map<string, string>,
): { account: string; reason: string } {
  if (line.product_id) {
    const kind = productKindMap.get(line.product_id);
    if (kind === "service") return { account: REVENUE_SERVICE, reason: "Dịch vụ (theo sản phẩm)" };
    if (kind === "product" || kind === "finished_good")
      return { account: REVENUE_PRODUCT, reason: "Thành phẩm (theo sản phẩm)" };
    if (kind === "goods" || kind === "merchandise")
      return { account: REVENUE_GOODS, reason: "Hàng hoá (theo sản phẩm)" };
  }
  const d = line.description.toLowerCase();
  if (
    /(dịch vụ|tư vấn|phí|thuê|gia công|sửa chữa|bảo trì|vận chuyển|lắp đặt|đào tạo|hosting|license|phần mềm)/.test(d)
  )
    return { account: REVENUE_SERVICE, reason: "Dịch vụ (theo mô tả)" };
  if (/(sản xuất|thành phẩm|chế tạo)/.test(d))
    return { account: REVENUE_PRODUCT, reason: "Thành phẩm (theo mô tả)" };
  // Mặc định: hàng hoá
  return { account: REVENUE_GOODS, reason: "Hàng hoá (mặc định)" };
}

function pickCashOrReceivable(inv: LoadedSalesInvoice): { account: string; label: string } {
  if (inv.payment_status === "paid_cash") return { account: ACCOUNT_CASH, label: "Đã thu tiền mặt" };
  if (inv.payment_status === "paid_bank" || inv.payment_status === "paid")
    return { account: ACCOUNT_BANK, label: "Đã thu qua NH" };
  return { account: ACCOUNT_RECEIVABLE, label: "Phải thu khách hàng" };
}

async function getProductKindMap(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;
  const { data } = await supabase
    .from("products")
    .select("id, item_type")
    .in("id", productIds);
  for (const p of (data ?? []) as any[]) {
    if (p?.id && p?.item_type) map.set(p.id, String(p.item_type));
  }
  return map;
}

function composeSalesEntries(
  inv: LoadedSalesInvoice,
  productKindMap: Map<string, string>,
): { entries: ProposalEntry[]; warnings: ProposalWarning[]; signals: ProposalSignal[] } {
  const warnings: ProposalWarning[] = [];
  const signals: ProposalSignal[] = [];
  const entryDate = inv.issue_date ?? new Date().toISOString().slice(0, 10);
  const customerLabel = inv.customer_name ?? "Khách hàng";
  const counterpart = pickCashOrReceivable(inv);

  // Gom revenue theo TK
  const revenueGroups = new Map<string, { amount: number; vat: number; names: string[]; reason: string }>();
  let fallbackUsed = false;

  if (inv.lines.length === 0) {
    // Fallback: 1 dòng 5111 = subtotal
    revenueGroups.set(REVENUE_OTHER, {
      amount: inv.subtotal || inv.total - inv.vat_amount,
      vat: inv.vat_amount,
      names: ["Doanh thu (không có chi tiết dòng)"],
      reason: "Không có chi tiết dòng",
    });
    fallbackUsed = true;
  } else {
    for (const l of inv.lines) {
      const pick = pickRevenueAccount(l, productKindMap);
      const cur = revenueGroups.get(pick.account) ?? { amount: 0, vat: 0, names: [], reason: pick.reason };
      const lineNet = l.pre_vat_amount || l.amount;
      cur.amount += lineNet;
      cur.vat += l.line_vat_amount;
      cur.names.push(l.description.slice(0, 60));
      revenueGroups.set(pick.account, cur);
    }
  }

  // Build lines
  const lines: ProposalLine[] = [];
  // Debit: TK phải thu / tiền
  lines.push({
    account_code: counterpart.account,
    debit: Math.round(inv.total),
    credit: 0,
    memo: `${counterpart.label} ${customerLabel}${inv.invoice_no ? ` — HĐ ${inv.invoice_no}` : ""}`,
  });
  // Credit: 511x
  const sortedRev = Array.from(revenueGroups.entries()).sort((a, b) => b[1].amount - a[1].amount);
  for (const [acc, info] of sortedRev) {
    lines.push({
      account_code: acc,
      debit: 0,
      credit: Math.round(info.amount),
      memo: info.names.slice(0, 2).join("; ") + (info.names.length > 2 ? ` +${info.names.length - 2}` : ""),
    });
  }
  // Credit: 3331 nếu có VAT
  if (inv.vat_amount > 0) {
    lines.push({
      account_code: ACCOUNT_VAT_OUTPUT,
      debit: 0,
      credit: Math.round(inv.vat_amount),
      memo: "Thuế GTGT đầu ra",
    });
  }

  // Bù chênh lệch làm tròn vào dòng 511 lớn nhất
  const sumD = lines.reduce((s, l) => s + l.debit, 0);
  const sumC = lines.reduce((s, l) => s + l.credit, 0);
  if (sumD !== sumC && sortedRev.length > 0) {
    const diff = sumD - sumC;
    const target = lines.find((l) => l.account_code === sortedRev[0][0]);
    if (target) target.credit += diff;
  }

  if (fallbackUsed) {
    warnings.push({
      code: "cat-011",
      severity: "warn",
      message: "Không có chi tiết dòng — engine dùng 5118 (DT khác) làm fallback",
    });
  }
  if (sortedRev.some(([acc]) => acc === REVENUE_OTHER) && !fallbackUsed) {
    warnings.push({
      code: "cat-011",
      severity: "info",
      message: "Một số dòng không xác định được loại doanh thu, đang dùng 5118",
    });
  }

  signals.push({
    label: `Bán cho ${customerLabel}${counterpart.account !== ACCOUNT_RECEIVABLE ? " (đã thu)" : ""}`,
    weight: 20,
    ok: true,
  });
  if (revenueGroups.size > 1) {
    signals.push({
      label: `Doanh thu chia ${revenueGroups.size} loại TK (${sortedRev.map(([a]) => a).join(", ")})`,
      weight: 15,
      ok: true,
    });
  }
  if (inv.vat_amount > 0) {
    signals.push({ label: `VAT đầu ra ${inv.vat_amount.toLocaleString("vi-VN")}đ → 3331`, weight: 10, ok: true });
  }

  const entry: ProposalEntry = {
    description: `Bán hàng/dịch vụ cho ${customerLabel}${inv.invoice_no ? ` — HĐ ${inv.invoice_no}` : ""}`,
    entry_date: entryDate,
    lines,
    nature: revenueGroups.size > 1 ? "mixed" : sortedRev[0]?.[0] === REVENUE_SERVICE ? "service" : "goods",
  };

  return { entries: [entry], warnings, signals };
}

/** MAIN — đề xuất bút toán cho 1 hoá đơn bán. */
export async function proposeJournalForSalesInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  preloaded?: LoadedSalesInvoice,
  productKindMap?: Map<string, string>,
): Promise<JournalProposalDTO> {
  const inv = preloaded ?? (await loadSalesInvoice(supabase, invoiceId));
  if (!inv) throw new Error(`Không tìm thấy hoá đơn bán ${invoiceId}`);
  if (!inv.tenant_id) throw new Error("Hoá đơn không có tenant_id");

  const productIds = Array.from(
    new Set(inv.lines.map((l) => l.product_id).filter((x): x is string => !!x)),
  );
  const pmap = productKindMap ?? (await getProductKindMap(supabase, productIds));

  const { entries, warnings, signals } = composeSalesEntries(inv, pmap);
  const alternatives: ProposalAlternative[] = [];

  // Alternative: nếu đang dùng 131 nhưng đã có khách hàng quen → gợi ý 111/112
  if (inv.payment_status === "unpaid" && entries[0]?.lines[0]?.account_code === ACCOUNT_RECEIVABLE) {
    const altLines = entries[0].lines.map((l, i) =>
      i === 0 ? { ...l, account_code: ACCOUNT_CASH, memo: l.memo?.replace("Phải thu", "Thu tiền mặt") ?? "" } : l,
    );
    alternatives.push({
      label: "Khách trả ngay bằng tiền mặt (111)",
      entries: [{ ...entries[0], lines: altLines }],
      confidence: 0.4,
      source: "ai_fallback",
    });
  }

  const hasError = warnings.some((w) => w.severity === "error");
  let base = inv.lines.length > 0 ? 0.85 : 0.5;
  if (warnings.some((w) => w.code === "cat-011" && w.severity === "warn")) base = 0.6;
  if (hasError) base = Math.min(base, 0.4);

  const cal = await getCalibration(supabase, inv.tenant_id);
  const features: SignalFeatures = {
    classify_rule: 1,
    partner_history: inv.customer_tax_id ? 1 : 0,
    vat_match: inv.vat_amount > 0 ? 1 : 0,
    has_warning: warnings.some((w) => w.severity !== "info") ? 1 : 0,
    missing_partner: inv.customer_tax_id ? 0 : 1,
    ai_fallback: inv.lines.length === 0 ? 1 : 0,
  };
  const confidence = applyCalibratedConfidence(base, features, cal.signal_weights);
  const band = decideBand(confidence, cal);

  return {
    invoice_id: invoiceId,
    source: "classify_rule",
    entries,
    confidence,
    base_confidence: base,
    warnings,
    signals,
    signal_features: features as Record<string, number>,
    band,
    alternatives,
    applied_rules: ["sales-engine-v1"],
    recommend_auto_post: false, // sales bao giờ cũng cần KTT review
    generated_at: new Date().toISOString(),
  };
}

/** Batch: load nhiều sales invoices + propose. */
export async function proposeSalesJournalBatch(
  supabase: SupabaseClient,
  invoiceIds: string[],
): Promise<Map<string, JournalProposalDTO>> {
  const out = new Map<string, JournalProposalDTO>();
  if (invoiceIds.length === 0) return out;
  const { data: invs } = await supabase
    .from("sales_invoices")
    .select(
      "id, tenant_id, customer_id, customer_name, customer_tax_id, invoice_no, issue_date, subtotal, vat_amount, total, payment_status, notes",
    )
    .in("id", invoiceIds);
  const { data: allLines } = await supabase
    .from("sales_invoice_lines")
    .select(
      "id, invoice_id, description, qty, unit_price, amount, vat_rate, vat_code, pre_vat_amount, line_vat_amount, product_id",
    )
    .in("invoice_id", invoiceIds);
  const linesByInvoice = new Map<string, any[]>();
  for (const l of (allLines ?? []) as any[]) {
    const arr = linesByInvoice.get(l.invoice_id) ?? [];
    arr.push(l);
    linesByInvoice.set(l.invoice_id, arr);
  }
  // Preload product kinds across the batch
  const allProductIds = Array.from(
    new Set(
      ((allLines ?? []) as any[])
        .map((l) => l.product_id)
        .filter((x): x is string => !!x),
    ),
  );
  const pmap = await getProductKindMap(supabase, allProductIds);

  for (const inv of (invs ?? []) as any[]) {
    try {
      const loaded = mapSalesInvoice(inv, linesByInvoice.get(inv.id) ?? []);
      const dto = await proposeJournalForSalesInvoice(supabase, inv.id, loaded, pmap);
      out.set(inv.id, dto);
    } catch {
      // skip
    }
  }
  return out;
}

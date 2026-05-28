import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildBankItem,
  buildDocumentItem,
  buildInsightItem,
  buildSalesInvoiceItem,
  loadActiveRules,
  type InboxItem,
} from "@/lib/ai/inbox-reason.server";
import {
  classifyLineV2,
  type LineKindV2,
  type ClassifyContextV2,
} from "@/lib/ai/classify-line-v2";
import {
  getTenantClassifyContext,
  getVendorRolesAndVsic,
  buildClassifyContextV2,
} from "@/lib/categorize/classify-context.server";
import type { MissingProductSuggestion, MissingItemTypeGuess } from "@/lib/ai/inbox-types";

/** Map LineKindV2 (engine) → MissingItemTypeGuess (UI / products table). */
function kindV2ToItemType(k: LineKindV2): MissingItemTypeGuess {
  switch (k) {
    case "service": return "service";
    case "raw_material": return "material";
    case "tools": return "tool";
    case "prepaid": return "asset_alloc";
    case "goods_for_resale": return "goods";
    case "fixed_asset_tangible": return "asset_tangible";
    case "fixed_asset_intangible": return "asset_intangible";
  }
}

const KIND_V2_LABEL: Record<LineKindV2, string> = {
  service: "Dịch vụ",
  raw_material: "Nguyên vật liệu",
  tools: "Công cụ dụng cụ",
  prepaid: "Tài sản phân bổ",
  goods_for_resale: "Hàng hoá",
  fixed_asset_tangible: "TSCĐ hữu hình",
  fixed_asset_intangible: "TSCĐ vô hình",
};


import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";
const activeTenant = (supabase: any, userId: string) =>
  resolveActiveTenantId(supabase, userId);

/**
 * Materialize a row in `sales_invoices` (+ lines) from a parsed XML e-invoice
 * document, so it shows up in "Trung tâm bán hàng → Hoá đơn bán" after the
 * user duyệt & ghi sổ in Inbox AI. Idempotent: returns existing id if already
 * linked or matching (tenant_id, invoice_no, customer_tax_id).
 */
async function materializeSalesInvoiceFromDocument(
  supabase: any,
  opts: {
    documentId: string;
    tenantId: string;
    userId: string;
    entryDate: string;
    journalEntryId: string;
  },
): Promise<string | null> {
  const { documentId, tenantId, userId, entryDate, journalEntryId } = opts;

  let { data: doc } = await supabase
    .from("documents")
    .select("id, doc_kind, ai_upload_id, sales_invoice_id, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  if (doc.doc_kind !== "sales_invoice") {
    if (!doc.ai_upload_id) return null;
    const { data: sibling } = await supabase
      .from("documents")
      .select("id, doc_kind, ai_upload_id, sales_invoice_id, original_filename")
      .eq("ai_upload_id", doc.ai_upload_id)
      .eq("doc_kind", "sales_invoice")
      .maybeSingle();
    if (!sibling) return null;
    doc = sibling;
  }

  if (doc.sales_invoice_id) {
    await supabase
      .from("sales_invoices")
      .update({ journal_entry_id: journalEntryId, status: "posted", posted_at: new Date().toISOString() })
      .eq("id", doc.sales_invoice_id);
    return doc.sales_invoice_id as string;
  }

  if (!doc.ai_upload_id) return null;
  const { data: up } = await supabase
    .from("ai_uploads")
    .select("parsed")
    .eq("id", doc.ai_upload_id)
    .maybeSingle();
  const ein = up?.parsed?._einvoice ?? null;
  if (!ein) return null;

  const buyer = ein.buyer ?? {};
  const totals = ein.totals ?? {};
  const rawLines: any[] = Array.isArray(ein.lines) ? ein.lines : [];

  const invoiceNo: string | null = ein.invoice_no ?? null;
  const series: string | null = ein.series ?? null;
  const issueDate: string = ein.issue_date ?? entryDate;
  const subtotal = Number(totals.subtotal ?? up?.parsed?.subtotal ?? 0);
  const vat = Number(totals.vat_amount ?? 0);
  const total = Number(totals.total ?? up?.parsed?.total ?? subtotal + vat);

  if (invoiceNo) {
    const { data: existing } = await supabase
      .from("sales_invoices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("invoice_no", invoiceNo)
      .eq("customer_tax_id", buyer.tax_id ?? "")
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("sales_invoices")
        .update({ journal_entry_id: journalEntryId, status: "posted", posted_at: new Date().toISOString() })
        .eq("id", existing.id);
      await supabase.from("documents").update({ sales_invoice_id: existing.id }).eq("id", documentId);
      return existing.id as string;
    }
  }

  let customerId: string | null = null;
  if (buyer.tax_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("tax_id", buyer.tax_id)
      .maybeSingle();
    if (cust?.id) {
      customerId = cust.id;
    } else {
      const { data: created } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          name: buyer.name ?? "Khách hàng",
          tax_id: buyer.tax_id,
          email: buyer.email || null,
          phone: buyer.phone || null,
          address: buyer.address || null,
        })
        .select("id")
        .single();
      customerId = created?.id ?? null;
    }
  }

  const { data: inv, error: invErr } = await supabase
    .from("sales_invoices")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      customer_id: customerId,
      customer_name: buyer.name ?? null,
      customer_tax_id: buyer.tax_id ?? null,
      customer_email: buyer.email || null,
      billing_address: buyer.address || null,
      invoice_series: series,
      invoice_no: invoiceNo,
      issue_date: issueDate,
      currency: ein.currency ?? "VND",
      fx_rate: 1,
      subtotal,
      vat_amount: vat,
      total,
      discount_percent: 0,
      discount_amount: 0,
      shipping_fee: 0,
      other_fees: 0,
      payment_status: "unpaid",
      paid_amount: 0,
      status: "posted",
      send_status: "not_sent",
      posted_at: new Date().toISOString(),
      journal_entry_id: journalEntryId,
      einvoice_code: ein.cqt_code ?? null,
      notes: `Tự tạo từ XML HĐĐT (${doc.original_filename ?? ""}).`,
    })
    .select("id")
    .single();
  if (invErr || !inv) {
    console.error("[materializeSalesInvoice] insert failed", invErr);
    return null;
  }

  if (rawLines.length > 0) {
    const lineRows = rawLines.map((l: any) => {
      const qty = Number(l.qty ?? 1);
      const unitPrice = Number(l.unit_price ?? 0);
      const amount = Number(l.amount ?? qty * unitPrice);
      const vatRate = Number(l.vat_rate ?? 0);
      const lineVat = Number(l.vat_amount ?? (amount * vatRate) / 100);
      return {
        invoice_id: inv.id,
        description: l.description ?? "",
        qty,
        unit_price: unitPrice,
        amount,
        vat_rate: vatRate,
        line_discount_percent: 0,
        line_discount_amount: 0,
        pre_vat_amount: amount,
        line_vat_amount: lineVat,
      };
    });
    const { error: lErr } = await supabase.from("sales_invoice_lines").insert(lineRows);
    if (lErr) console.error("[materializeSalesInvoice] lines insert failed", lErr);
  }

  await supabase.from("documents").update({ sales_invoice_id: inv.id }).eq("id", documentId);
  return inv.id as string;
}

/**
 * Materialize a row in `sales_vouchers` (+ lines) — đây mới là bảng mà
 * trang "Trung tâm bán hàng → Phiếu bán hàng" (/sales/vouchers) đọc.
 * Idempotent theo `tenant_id + voucher_no` hoặc theo journal_entry_id.
 * Throw nếu insert fail để approveInboxItem không nuốt lỗi.
 */
async function materializeSalesVoucherFromDocument(
  supabase: any,
  opts: {
    documentId: string;
    tenantId: string;
    userId: string;
    entryDate: string;
    journalEntryId: string;
    salesInvoiceId: string | null;
  },
): Promise<string | null> {
  const { documentId, tenantId, userId, entryDate, journalEntryId } = opts;

  let { data: doc } = await supabase
    .from("documents")
    .select("id, doc_kind, ai_upload_id, ocr_extracted, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  if (doc.doc_kind !== "sales_invoice") {
    if (!doc.ai_upload_id) return null;
    const { data: sibling } = await supabase
      .from("documents")
      .select("id, doc_kind, ai_upload_id, ocr_extracted, original_filename")
      .eq("ai_upload_id", doc.ai_upload_id)
      .eq("doc_kind", "sales_invoice")
      .maybeSingle();
    if (!sibling) return null;
    doc = sibling;
  }

  // Đã có phiếu liên kết bút toán này → trả về
  const { data: existingByEntry } = await supabase
    .from("sales_vouchers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("journal_entry_id", journalEntryId)
    .maybeSingle();
  if (existingByEntry?.id) return existingByEntry.id as string;

  // Lấy dữ liệu eInvoice
  let ein: any = null;
  if (doc.ai_upload_id) {
    const { data: up } = await supabase
      .from("ai_uploads")
      .select("parsed")
      .eq("id", doc.ai_upload_id)
      .maybeSingle();
    ein = up?.parsed?._einvoice ?? null;
  }
  const ext = (doc.ocr_extracted ?? {}) as any;
  const buyer = ein?.buyer ?? ext?.buyer ?? {};
  const totals = ein?.totals ?? {};
  const rawLines: any[] = Array.isArray(ein?.lines)
    ? ein.lines
    : Array.isArray(ext?.items)
    ? ext.items
    : Array.isArray(ext?.lines)
    ? ext.lines
    : Array.isArray(ext?.line_items)
    ? ext.line_items
    : [];

  const series: string | null = ein?.series ?? ext?.invoice_series ?? null;
  const invoiceNo: string | null = ein?.invoice_no ?? ext?.invoice_no ?? ext?.invoice_number ?? null;
  const rawDate = ein?.issue_date ?? ext?.invoice_date ?? ext?.issue_date ?? entryDate;
  const issueDate = (() => {
    if (!rawDate || typeof rawDate !== "string") return entryDate;
    const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : rawDate.slice(0, 10);
  })();

  const subtotal = Number(totals.subtotal ?? ext.subtotal ?? 0);
  const vat = Number(totals.vat_amount ?? ext.vat_amount ?? 0);
  const total = Number(
    totals.total ?? ext.total_amount ?? ext.total ?? subtotal + vat,
  );

  // === Customer: luôn tự tạo nếu chưa có ===
  let customerId: string | null = null;
  const buyerName: string = (buyer.name ?? "Khách hàng lẻ").toString().trim();
  const buyerTaxId: string | null = buyer.tax_id ? String(buyer.tax_id).trim() : null;
  const buyerAddress: string | null = buyer.address ? String(buyer.address).trim() : null;

  if (buyerTaxId) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("tax_id", buyerTaxId)
      .maybeSingle();
    if (cust?.id) customerId = cust.id;
  } else {
    // Không có MST: thử khớp theo tên
    const { data: matches } = await supabase
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", buyerName)
      .limit(1);
    if (matches && matches.length > 0) customerId = matches[0].id;
  }
  if (!customerId) {
    const { data: lastCust } = await supabase
      .from("customers")
      .select("code")
      .eq("tenant_id", tenantId)
      .ilike("code", "KH%")
      .order("code", { ascending: false })
      .limit(1)
      .maybeSingle();
    let n = 1;
    if (lastCust?.code) {
      const m = /(\d+)$/.exec(lastCust.code);
      if (m) n = parseInt(m[1], 10) + 1;
    }
    const code = `KH${String(n).padStart(5, "0")}`;
    const { data: created, error: cErr } = await supabase
      .from("customers")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        code,
        name: buyerName,
        tax_id: buyerTaxId,
        email: buyer.email || null,
        phone: buyer.phone || null,
        address: buyerAddress,
      })
      .select("id")
      .single();
    if (cErr) throw new Error("Không tạo được khách hàng: " + cErr.message);
    customerId = created?.id ?? null;
  }

  // === Số phiếu chuẩn BHYYYY-##### ===
  const yyyy = String(new Date(issueDate).getFullYear());
  const prefix = `BH${yyyy}-`;
  const { data: last } = await supabase
    .from("sales_vouchers")
    .select("voucher_no")
    .eq("tenant_id", tenantId)
    .ilike("voucher_no", `${prefix}%`)
    .order("voucher_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = 1;
  if (last?.voucher_no) {
    const m = /(\d+)$/.exec(last.voucher_no);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  const voucherNo = `${prefix}${String(next).padStart(5, "0")}`;

  const vatRateHeader = subtotal > 0 ? Math.round((vat / subtotal) * 100) : 0;

  const { data: voucher, error: vErr } = await supabase
    .from("sales_vouchers")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      voucher_no: voucherNo,
      voucher_date: issueDate,
      customer_id: customerId,
      customer_name: buyerName,
      customer_tax_id: buyerTaxId,
      customer_address: buyerAddress,
      einvoice_series: series,
      einvoice_no: invoiceNo,
      reason: `Hóa đơn ${series ?? ""}${series && invoiceNo ? "-" : ""}${invoiceNo ?? ""} — ${buyerName}`.trim(),
      currency: ein?.currency ?? "VND",
      exchange_rate: 1,
      subtotal,
      vat_amount: vat,
      total,
      paid_amount: 0,
      debit_account: "131",
      credit_account: "5111",
      vat_account: vat > 0 ? "33311" : null,
      payment_method: "credit",
      payment_status: "unpaid",
      pay_now: false,
      issue_einvoice: false,
      create_stock_voucher: false,
      status: "posted",
      posted_at: new Date().toISOString(),
      journal_entry_id: journalEntryId,
      notes: `Tự tạo từ Inbox AI khi duyệt chứng từ (${doc.original_filename ?? ""}).`,
    })
    .select("id")
    .single();
  if (vErr || !voucher) {
    throw new Error("Không tạo được phiếu bán hàng: " + (vErr?.message ?? "unknown"));
  }

  if (rawLines.length > 0) {
    const lineRows = rawLines.map((l: any, i: number) => {
      const qty = Number(l.qty ?? l.quantity ?? 1);
      const unitPrice = Number(l.unit_price ?? 0);
      const amount = Number(l.amount ?? l.total_amount ?? qty * unitPrice);
      const lineVatRate = Number(l.vat_rate ?? vatRateHeader);
      const lineVat = Number(l.vat_amount ?? (amount * lineVatRate) / 100);
      return {
        voucher_id: voucher.id,
        line_order: i,
        product_id: null,
        product_code: l.product_code ?? null,
        product_name: l.item_name ?? l.name ?? l.product_name ?? l.description ?? "—",
        description: l.description ?? l.item_name ?? l.name ?? null,
        unit: l.unit ?? null,
        qty,
        unit_price: unitPrice,
        amount,
        discount_pct: 0,
        discount_amount: 0,
        vat_rate: lineVatRate,
        vat_amount: lineVat,
        total: amount + lineVat,
        credit_account: "5111",
        vat_account: lineVat > 0 ? "33311" : null,
        line_type: "goods",
      };
    });
    const { error: lErr } = await supabase.from("sales_voucher_lines").insert(lineRows);
    if (lErr) console.error("[materializeSalesVoucher] lines insert failed", lErr);
  }

  return voucher.id as string;
}

/**
 * Tạo Phiếu mua hàng từ document (purchase_invoice) khi duyệt ghi sổ.
 * Idempotent theo journal_entry_id.
 */
async function materializePurchaseVoucherFromDocument(
  supabase: any,
  opts: {
    documentId: string;
    tenantId: string;
    userId: string;
    entryDate: string;
    journalEntryId: string;
    purchasePurpose?: "resale" | "material" | "expense";
  },
): Promise<string | null> {
  const { documentId, tenantId, userId, entryDate, journalEntryId, purchasePurpose } = opts;
  const purposeOverride = purchasePurpose ? PURCHASE_PURPOSE_OVERRIDE[purchasePurpose] : null;

  let { data: doc } = await supabase
    .from("documents")
    .select("id, doc_kind, ai_upload_id, ocr_extracted, original_filename")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  // Nếu doc được Inbox AI trỏ tới là raw upload (doc_kind != purchase_invoice)
  // nhưng có sibling cùng ai_upload_id với doc_kind=purchase_invoice — dùng sibling đó.
  if (doc.doc_kind !== "purchase_invoice") {
    if (!doc.ai_upload_id) return null;
    const { data: sibling } = await supabase
      .from("documents")
      .select("id, doc_kind, ai_upload_id, ocr_extracted, original_filename")
      .eq("ai_upload_id", doc.ai_upload_id)
      .eq("doc_kind", "purchase_invoice")
      .maybeSingle();
    if (!sibling) return null;
    doc = sibling;
  }

  const { data: existing } = await supabase
    .from("purchase_vouchers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("journal_entry_id", journalEntryId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  let ein: any = null;
  if (doc.ai_upload_id) {
    const { data: up } = await supabase
      .from("ai_uploads")
      .select("parsed")
      .eq("id", doc.ai_upload_id)
      .maybeSingle();
    ein = up?.parsed?._einvoice ?? null;
  }
  const ext = (doc.ocr_extracted ?? {}) as any;
  const seller = ein?.seller ?? ext?.seller ?? ext?.supplier ?? {};
  const totals = ein?.totals ?? {};
  const rawLines: any[] = Array.isArray(ein?.lines)
    ? ein.lines
    : Array.isArray(ext?.items)
    ? ext.items
    : Array.isArray(ext?.lines)
    ? ext.lines
    : Array.isArray(ext?.line_items)
    ? ext.line_items
    : [];

  const invoiceNo: string | null =
    ein?.invoice_no ?? ext?.invoice_no ?? ext?.invoice_number ?? null;
  const rawDate = ein?.issue_date ?? ext?.invoice_date ?? ext?.issue_date ?? entryDate;
  const issueDate = (() => {
    if (!rawDate || typeof rawDate !== "string") return entryDate;
    const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : rawDate.slice(0, 10);
  })();

  const subtotal = Number(totals.subtotal ?? ext.subtotal ?? 0);
  const vat = Number(totals.vat_amount ?? ext.vat_amount ?? 0);
  const total = Number(
    totals.total ?? ext.total_amount ?? ext.total ?? subtotal + vat,
  );

  let supplierId: string | null = null;
  const sellerName: string =
    (seller.name ?? seller.supplier_name ?? "Nhà cung cấp lẻ").toString().trim();
  const sellerTaxId: string | null = seller.tax_id
    ? String(seller.tax_id).trim()
    : seller.supplier_tax_id
    ? String(seller.supplier_tax_id).trim()
    : null;
  const sellerAddress: string | null = seller.address
    ? String(seller.address).trim()
    : null;

  if (sellerTaxId) {
    const { data: sup } = await supabase
      .from("suppliers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("tax_id", sellerTaxId)
      .maybeSingle();
    if (sup?.id) supplierId = sup.id;
  } else {
    const { data: matches } = await supabase
      .from("suppliers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", sellerName)
      .limit(1);
    if (matches && matches.length > 0) supplierId = matches[0].id;
  }
  if (!supplierId) {
    const { data: lastSup } = await supabase
      .from("suppliers")
      .select("code")
      .eq("tenant_id", tenantId)
      .ilike("code", "NCC%")
      .order("code", { ascending: false })
      .limit(1)
      .maybeSingle();
    let n = 1;
    if (lastSup?.code) {
      const m = /(\d+)$/.exec(lastSup.code);
      if (m) n = parseInt(m[1], 10) + 1;
    }
    const code = `NCC${String(n).padStart(5, "0")}`;
    const { data: created, error: sErr } = await supabase
      .from("suppliers")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        code,
        name: sellerName,
        tax_id: sellerTaxId,
        email: seller.email || null,
        phone: seller.phone || null,
        address: sellerAddress,
      })
      .select("id")
      .single();
    if (sErr) throw new Error("Không tạo được nhà cung cấp: " + sErr.message);
    supplierId = created?.id ?? null;
  }

  const yyyy = String(new Date(issueDate).getFullYear());
  const prefix = `PM${yyyy}-`;
  const { data: last } = await supabase
    .from("purchase_vouchers")
    .select("voucher_no")
    .eq("tenant_id", tenantId)
    .ilike("voucher_no", `${prefix}%`)
    .order("voucher_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = 1;
  if (last?.voucher_no) {
    const m = /(\d+)$/.exec(last.voucher_no);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  const voucherNo = `${prefix}${String(next).padStart(5, "0")}`;

  const vatRateHeader = subtotal > 0 ? Math.round((vat / subtotal) * 100) : 0;

  const { data: voucher, error: vErr } = await supabase
    .from("purchase_vouchers")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      voucher_no: voucherNo,
      voucher_date: issueDate,
      supplier_id: supplierId,
      supplier_name: sellerName,
      supplier_tax_id: sellerTaxId,
      supplier_address: sellerAddress,
      invoice_no: invoiceNo,
      invoice_date: issueDate,
      reason: `Hóa đơn ${invoiceNo ?? ""} — ${sellerName}`.trim(),
      currency: ein?.currency ?? "VND",
      exchange_rate: 1,
      subtotal,
      vat_rate: vatRateHeader,
      vat_amount: vat,
      total,
      paid_amount: 0,
      debit_account: purposeOverride?.account ?? "156",
      credit_account: "331",
      vat_account: vat > 0 ? "1331" : null,
      payment_method: "credit",
      payment_status: "unpaid",
      pay_now: false,
      create_stock_voucher: false,
      status: "posted",
      posted_at: new Date().toISOString(),
      journal_entry_id: journalEntryId,
      notes: `Tự tạo từ Inbox AI khi duyệt chứng từ (${doc.original_filename ?? ""}).`,
    })
    .select("id")
    .single();
  if (vErr || !voucher) {
    throw new Error("Không tạo được phiếu mua hàng: " + (vErr?.message ?? "unknown"));
  }

  if (rawLines.length > 0) {
    const lineRows = rawLines.map((l: any, i: number) => {
      const qty = Number(l.qty ?? l.quantity ?? 1);
      const unitPrice = Number(l.unit_price ?? 0);
      const amount = Number(l.amount ?? l.total_amount ?? qty * unitPrice);
      const lineVatRate = Number(l.vat_rate ?? vatRateHeader);
      const lineVat = Number(l.vat_amount ?? (amount * lineVatRate) / 100);
      const stockAcc = purposeOverride?.account ?? l.stock_account ?? l.account ?? l.debit_account ?? "156";
      const lineType = purposeOverride?.line_type ?? "goods";
      return {
        voucher_id: voucher.id,
        line_order: i,
        product_id: null,
        product_code: l.product_code ?? null,
        product_name: l.item_name ?? l.name ?? l.product_name ?? l.description ?? "—",
        description: l.description ?? l.item_name ?? l.name ?? null,
        unit: l.unit ?? null,
        qty,
        unit_price: unitPrice,
        amount,
        discount_pct: 0,
        discount_amount: 0,
        vat_rate: lineVatRate,
        vat_amount: lineVat,
        total: amount + lineVat,
        debit_account: String(stockAcc),
        vat_account: lineVat > 0 ? "1331" : null,
        line_type: lineType,
      };
    });
    const { error: lErr } = await supabase
      .from("purchase_voucher_lines")
      .insert(lineRows);
    if (lErr) console.error("[materializePurchaseVoucher] lines insert failed", lErr);
  }

  return voucher.id as string;
}

/** Throw nếu hóa đơn điện tử (series + no) đã được ghi sổ (phiếu chưa void). */
async function assertNoDuplicateEInvoice(
  supabase: any,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const { data: doc } = await supabase
    .from("documents")
    .select("doc_kind, ai_upload_id, ocr_extracted")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;
  if (doc.doc_kind !== "sales_invoice" && doc.doc_kind !== "purchase_invoice") return;
  let ein: any = null;
  if (doc.ai_upload_id) {
    const { data: up } = await supabase
      .from("ai_uploads")
      .select("parsed")
      .eq("id", doc.ai_upload_id)
      .maybeSingle();
    ein = up?.parsed?._einvoice ?? null;
  }
  const ext = (doc.ocr_extracted ?? {}) as any;
  const series: string | null = ein?.series ?? ext?.invoice_series ?? null;
  const invoiceNo: string | null = ein?.invoice_no ?? ext?.invoice_no ?? ext?.invoice_number ?? null;
  if (!invoiceNo) return;

  if (doc.doc_kind === "sales_invoice") {
    let q = supabase
      .from("sales_vouchers")
      .select("id, voucher_no, status")
      .eq("tenant_id", tenantId)
      .eq("einvoice_no", invoiceNo)
      .neq("status", "void");
    if (series) q = q.eq("einvoice_series", series);
    const { data: dups } = await q;
    if (dups && dups.length > 0) {
      const label = `${series ? series + "-" : ""}${invoiceNo}`;
      throw new Error(`Hóa đơn ${label} đã được ghi sổ (phiếu ${dups[0].voucher_no}) — không ghi sổ trùng.`);
    }
  } else {
    const { data: dups } = await supabase
      .from("purchase_vouchers")
      .select("id, voucher_no, status")
      .eq("tenant_id", tenantId)
      .eq("invoice_no", invoiceNo)
      .neq("status", "void");
    if (dups && dups.length > 0) {
      throw new Error(`Hóa đơn ${invoiceNo} đã được ghi sổ (phiếu ${dups[0].voucher_no}) — không ghi sổ trùng.`);
    }
  }
}

/** Chặn ghi sổ hóa đơn không liên quan: MST DN phải khớp seller hoặc buyer. */
async function assertInvoiceBelongsToTenant(
  supabase: any,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const { data: doc } = await supabase
    .from("documents")
    .select("doc_kind, ai_upload_id, ocr_extracted")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;
  if (doc.doc_kind !== "sales_invoice" && doc.doc_kind !== "purchase_invoice") return;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("tax_id")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantTax = String(tenant?.tax_id ?? "").replace(/\D/g, "");
  if (!tenantTax) return; // DN chưa có MST → không chặn

  let ein: any = null;
  if (doc.ai_upload_id) {
    const { data: up } = await supabase
      .from("ai_uploads")
      .select("parsed")
      .eq("id", doc.ai_upload_id)
      .maybeSingle();
    ein = up?.parsed?._einvoice ?? null;
  }
  const ext = (doc.ocr_extracted ?? {}) as any;
  const sellerTax = String(
    ein?.seller?.tax_id ?? ext?.seller_tax_id ?? ext?.supplier_tax_id ?? "",
  ).replace(/\D/g, "");
  const buyerTax = String(
    ein?.buyer?.tax_id ?? ext?.buyer_tax_id ?? ext?.customer_tax_id ?? "",
  ).replace(/\D/g, "");

  const norm = (t: string) => t.slice(0, 10); // bỏ phần chi nhánh
  const tn = norm(tenantTax);
  if (!sellerTax && !buyerTax) return; // không đủ dữ liệu để khẳng định
  if (norm(sellerTax) === tn || norm(buyerTax) === tn) return;

  throw new Error(
    `Hóa đơn không liên quan đến doanh nghiệp (MST ${tenantTax}). MST bên bán: ${sellerTax || "—"}, bên mua: ${buyerTax || "—"}. Không thể ghi sổ.`,
  );
}

/**
 * Suy hướng hoá đơn: 'sales' | 'purchase' | null.
 * Ưu tiên doc_kind; fallback theo ocr_extracted.direction; cuối cùng so
 * MST tenant với seller/buyer trong _einvoice.
 */
async function inferDocDirection(
  supabase: any,
  tenantId: string,
  documentId: string,
): Promise<"sales" | "purchase" | null> {
  const { data: doc } = await supabase
    .from("documents")
    .select("doc_kind, ai_upload_id, ocr_extracted")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  if (doc.doc_kind === "sales_invoice") return "sales";
  if (doc.doc_kind === "purchase_invoice") return "purchase";

  const ext = (doc.ocr_extracted ?? {}) as any;
  if (ext?.direction === "sales_invoice") return "sales";
  if (ext?.direction === "purchase_invoice") return "purchase";

  let ein: any = null;
  if (doc.ai_upload_id) {
    const { data: up } = await supabase
      .from("ai_uploads")
      .select("parsed")
      .eq("id", doc.ai_upload_id)
      .maybeSingle();
    ein = up?.parsed?._einvoice ?? null;
  }
  const { data: tenant } = await supabase
    .from("tenants")
    .select("tax_id")
    .eq("id", tenantId)
    .maybeSingle();
  const tn = String(tenant?.tax_id ?? "").replace(/\D/g, "").slice(0, 10);
  if (!tn) return null;
  const sellerTax = String(ein?.seller?.tax_id ?? ext?._einvoice?.seller?.tax_id ?? "").replace(/\D/g, "").slice(0, 10);
  const buyerTax = String(ein?.buyer?.tax_id ?? ext?._einvoice?.buyer?.tax_id ?? "").replace(/\D/g, "").slice(0, 10);
  if (buyerTax && buyerTax === tn) return "purchase";
  if (sellerTax && sellerTax === tn) return "sales";
  return null;
}


/**
 * Khi user bấm "Duyệt & ghi sổ" cho 1 document, tự tạo Khách hàng / Nhà cung cấp /
 * Hàng hoá - Dịch vụ còn thiếu dựa trên dữ liệu eInvoice / OCR. Idempotent.
 */
async function autoResolveMissingMaster(
  supabase: any,
  opts: { tenantId: string; userId: string; documentId: string; purchasePurpose?: "resale" | "material" | "expense" },
): Promise<void> {
  const { tenantId, userId, documentId, purchasePurpose } = opts;
  const purposeOverride = purchasePurpose ? PURCHASE_PURPOSE_OVERRIDE[purchasePurpose] : null;
  const { data: doc } = await supabase
    .from("documents")
    .select("doc_kind, ai_upload_id, ocr_extracted")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!doc) return;
  if (doc.doc_kind !== "sales_invoice" && doc.doc_kind !== "purchase_invoice") return;

  let ein: any = null;
  if (doc.ai_upload_id) {
    const { data: up } = await supabase
      .from("ai_uploads")
      .select("parsed")
      .eq("id", doc.ai_upload_id)
      .maybeSingle();
    ein = up?.parsed?._einvoice ?? null;
  }
  const ext = (doc.ocr_extracted ?? {}) as any;

  const slug = (name: string, prefix: string) => slugCode(name, prefix);

  // --- KH / NCC ---
  if (doc.doc_kind === "sales_invoice") {
    const buyer = ein?.buyer ?? ext?.buyer ?? {};
    const name = (buyer.name ?? ext?.customer_name ?? "").toString().trim();
    const taxId = (buyer.tax_id ?? ext?.customer_tax_id ?? "").toString().trim() || null;
    if (name) {
      let found = false;
      if (taxId) {
        const { data: ex } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", taxId)
          .maybeSingle();
        if (ex?.id) found = true;
      }
      if (!found) {
        const { data: byName } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("name", name)
          .limit(1);
        if (byName && byName.length > 0) found = true;
      }
      if (!found) {
        await supabase.from("customers").insert({
          tenant_id: tenantId,
          user_id: userId,
          name,
          tax_id: taxId,
          code: slug(name, "KH"),
        });
      }
    }
  } else if (doc.doc_kind === "purchase_invoice") {
    const seller = ein?.seller ?? ext?.seller ?? {};
    const name = (seller.name ?? ext?.supplier_name ?? "").toString().trim();
    const taxId = (seller.tax_id ?? ext?.supplier_tax_id ?? "").toString().trim() || null;
    if (name) {
      let found = false;
      if (taxId) {
        const { data: ex } = await supabase
          .from("suppliers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", taxId)
          .maybeSingle();
        if (ex?.id) found = true;
      }
      if (!found) {
        const { data: byName } = await supabase
          .from("suppliers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("name", name)
          .limit(1);
        if (byName && byName.length > 0) found = true;
      }
      if (!found) {
        await supabase.from("suppliers").insert({
          tenant_id: tenantId,
          user_id: userId,
          name,
          tax_id: taxId,
          code: slug(name, "NCC"),
        });
      }
    }
  }

  // --- Hàng hoá / Dịch vụ ---
  const rawLines: any[] = Array.isArray(ein?.lines)
    ? ein.lines
    : Array.isArray(ext?.items)
    ? ext.items
    : Array.isArray(ext?.lines)
    ? ext.lines
    : Array.isArray(ext?.line_items)
    ? ext.line_items
    : [];

  const lineEntries = rawLines
    .map((l: any) => ({
      name: (l.item_name ?? l.name ?? l.product_name ?? l.description ?? "").toString().trim(),
      qty: Number(l.qty ?? l.quantity ?? 0) || null,
      unit_price: Number(l.unit_price ?? l.price ?? 0) || null,
      amount: Number(l.amount ?? l.total ?? 0) || null,
      unit: (l.unit ?? l.uom ?? null) as string | null,
    }))
    .filter((l: any) => l.name && l.name !== "—");
  const names = Array.from(new Set(lineEntries.map((l: any) => l.name))).slice(0, 30);
  if (names.length === 0) return;

  const { data: existing } = await supabase
    .from("products")
    .select("name")
    .eq("tenant_id", tenantId)
    .in("name", names);
  const existSet = new Set<string>((existing ?? []).map((r: any) => String(r.name).toLowerCase()));

  // Build classify context (tenant + supplier nếu mua vào)
  const tenantCfg = await getTenantClassifyContext(supabase, tenantId).catch(() => null);
  let vendor: ClassifyContextV2["vendor"] | undefined;
  if (tenantCfg && doc.doc_kind === "purchase_invoice") {
    const seller = ein?.seller ?? ext?.seller ?? {};
    const sellerTax = (seller.tax_id ?? ext?.supplier_tax_id ?? "").toString().trim();
    if (sellerTax) {
      const sup = await getVendorRolesAndVsic(
        supabase,
        await supabase
          .from("suppliers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", sellerTax)
          .maybeSingle()
          .then((r: any) => r.data?.id ?? null),
      );
      vendor = sup;
    }
  }
  const ctxV2 = tenantCfg ? buildClassifyContextV2(tenantCfg, vendor) : null;

  const seen = new Set<string>();
  for (const li of lineEntries) {
    const nm = li.name;
    if (seen.has(nm.toLowerCase())) continue;
    seen.add(nm.toLowerCase());
    if (existSet.has(nm.toLowerCase())) continue;

    let item_type: "goods" | "service" | "material" = "goods";
    let stock_account = "156";
    let unit = li.unit?.toString().trim() || "cái";
    if (purposeOverride) {
      item_type = purposeOverride.item_type;
      stock_account = purposeOverride.account;
    } else if (ctxV2) {
      try {
        const r = classifyLineV2(li, ctxV2);
        const acct = accountForItemType(kindV2ToItemType(r.kind));
        item_type = acct.item_type;
        stock_account = acct.stock_account;
        if (!li.unit) unit = acct.unit;
      } catch {
        /* fallback giữ nguyên */
      }
    }

    await supabase.from("products").insert({
      tenant_id: tenantId,
      user_id: userId,
      name: nm,
      code: slug(nm, item_type === "service" ? "DV" : "HH"),
      item_type,
      stock_account,
      unit,
    });
  }
}

// Enrich Inbox items with posted_voucher + missing master data
// ============================================================
function normName(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase();
}

async function enrichDocumentItems(
  supabase: any,
  tenantId: string,
  items: InboxItem[],
): Promise<void> {
  const docItems = items.filter((it) => it.source === "document" && it.id.startsWith("document:"));
  if (docItems.length === 0) return;
  const docIds = docItems.map((it) => it.external_id);

  // 1) Lấy quyết định approve gần nhất cho mỗi document
  const { data: decisions } = await supabase
    .from("inbox_decisions")
    .select("item_external_id, journal_entry_id, decided_at")
    .eq("tenant_id", tenantId)
    .eq("item_source", "document")
    .eq("action", "approve")
    .in("item_external_id", docIds)
    .order("decided_at", { ascending: false });
  const docToEntry = new Map<string, string>();
  for (const d of (decisions ?? []) as any[]) {
    if (!docToEntry.has(d.item_external_id) && d.journal_entry_id) {
      docToEntry.set(d.item_external_id, d.journal_entry_id);
    }
  }

  // 2) Lookup phiếu bán hàng / mua hàng theo journal_entry_id
  const entryIds = Array.from(new Set(Array.from(docToEntry.values())));
  const entryToVoucher = new Map<string, { kind: "sales_voucher" | "purchase_voucher"; id: string; voucher_no: string }>();
  if (entryIds.length > 0) {
    const [sv, pv] = await Promise.all([
      supabase
        .from("sales_vouchers")
        .select("id, voucher_no, journal_entry_id, status")
        .eq("tenant_id", tenantId)
        .in("journal_entry_id", entryIds),
      supabase
        .from("purchase_vouchers")
        .select("id, voucher_no, journal_entry_id, status")
        .eq("tenant_id", tenantId)
        .in("journal_entry_id", entryIds),
    ]);
    for (const r of (sv.data ?? []) as any[]) {
      if (r.status !== "void") {
        entryToVoucher.set(r.journal_entry_id, { kind: "sales_voucher", id: r.id, voucher_no: r.voucher_no });
      }
    }
    for (const r of (pv.data ?? []) as any[]) {
      if (r.status !== "void") {
        entryToVoucher.set(r.journal_entry_id, { kind: "purchase_voucher", id: r.id, voucher_no: r.voucher_no });
      }
    }
  }

  // 3) Batch load master data để check missing
  const [custRes, supRes, prodRes, tenantCfg] = await Promise.all([
    supabase.from("customers").select("id, name, tax_id").eq("tenant_id", tenantId).limit(2000),
    supabase
      .from("suppliers")
      .select("id, name, tax_id, industry_code, roles")
      .eq("tenant_id", tenantId)
      .limit(2000),
    supabase.from("products").select("id, code, name, item_type").eq("tenant_id", tenantId).limit(2000),
    getTenantClassifyContext(supabase, tenantId).catch(() => null),
  ]);
  const custByTax = new Map<string, any>();
  const custByName = new Set<string>();
  for (const r of (custRes.data ?? []) as any[]) {
    if (r.tax_id) custByTax.set(String(r.tax_id).trim(), r);
    if (r.name) custByName.add(normName(r.name));
  }
  const supByTax = new Map<string, any>();
  const supByName = new Set<string>();
  for (const r of (supRes.data ?? []) as any[]) {
    if (r.tax_id) supByTax.set(String(r.tax_id).trim(), r);
    if (r.name) supByName.add(normName(r.name));
  }
  const prodByName = new Set<string>();
  for (const r of (prodRes.data ?? []) as any[]) {
    if (r.name) prodByName.add(normName(r.name));
  }

  // 4) Áp dụng cho từng item
  for (const it of docItems) {
    const entryId = docToEntry.get(it.external_id);
    if (entryId) {
      const v = entryToVoucher.get(entryId);
      if (v) {
        it.posted_voucher = v;
        (it as any).processing_status = "posted";
      } else {
        (it as any).processing_status = "posted";
      }
    }

    const meta = it.proposal.meta ?? {};
    const kind = it.proposal.voucher_kind;
    const missing: {
      customer?: string;
      customer_tax_id?: string;
      supplier?: string;
      supplier_tax_id?: string;
      products?: MissingProductSuggestion[];
    } = {};

    let vendorForClassify: ClassifyContextV2["vendor"] | undefined;

    if (kind === "sales_invoice") {
      const taxId = meta.customer_tax_id ? String(meta.customer_tax_id).trim() : "";
      const name = meta.customer_name ? String(meta.customer_name).trim() : "";
      const found = (taxId && custByTax.has(taxId)) || (name && custByName.has(normName(name)));
      if (!found && name) {
        missing.customer = name;
        if (taxId) missing.customer_tax_id = taxId;
      }
    } else if (kind === "purchase_invoice") {
      const taxId = meta.supplier_tax_id ? String(meta.supplier_tax_id).trim() : "";
      const name = meta.supplier_name ? String(meta.supplier_name).trim() : "";
      const found = (taxId && supByTax.has(taxId)) || (name && supByName.has(normName(name)));
      if (!found && name) {
        missing.supplier = name;
        if (taxId) missing.supplier_tax_id = taxId;
      }
      // Lấy vendor signals (vsic + roles) để classify mặt hàng chính xác hơn
      const sup = taxId ? supByTax.get(taxId) : null;
      if (sup) {
        vendorForClassify = {
          mst: sup.tax_id ?? null,
          vsic: sup.industry_code ?? null,
          roles: Array.isArray(sup.roles) ? sup.roles : [],
        };
      } else if (taxId) {
        vendorForClassify = { mst: taxId, vsic: null, roles: [] };
      }
    }

    const itemsArr = it.proposal.items ?? [];
    const missingProducts: MissingProductSuggestion[] = [];
    const ctxV2: ClassifyContextV2 | null = tenantCfg
      ? buildClassifyContextV2(tenantCfg, vendorForClassify)
      : null;

    for (const li of itemsArr) {
      const nm = (li.name ?? "").toString().trim();
      if (!nm || nm === "—") continue;
      if (prodByName.has(normName(nm))) continue;

      // Mặc định fallback nếu chưa có context phân loại
      let suggestion: MissingProductSuggestion = {
        name: nm,
        item_type: "goods",
        account: "156",
        confidence: 30,
        reason: "Mặc định Hàng hoá (chưa đủ tín hiệu)",
      };
      if (ctxV2) {
        try {
          const r = classifyLineV2(
            {
              description: nm,
              qty: typeof li.qty === "number" ? li.qty : null,
              unit_price: typeof li.unit_price === "number" ? li.unit_price : null,
              amount: typeof li.amount === "number" ? li.amount : null,
              unit: null,
            },
            ctxV2,
          );
          const topSignal = [...r.signals].sort((a, b) => b.weight - a.weight)[0];
          suggestion = {
            name: nm,
            item_type: kindV2ToItemType(r.kind),
            account: r.account,
            confidence: r.confidence,
            reason: topSignal?.label ?? KIND_V2_LABEL[r.kind],
          };
        } catch {
          // giữ fallback
        }
      }
      missingProducts.push(suggestion);
      if (missingProducts.length >= 8) break;
    }
    if (missingProducts.length > 0) missing.products = missingProducts;

    if (missing.customer || missing.supplier || (missing.products && missing.products.length > 0)) {
      it.missing = missing;
    }
  }
}





const ListInput = z.object({
  tab: z.enum(["inbox", "posted", "review", "documents"]).default("inbox"),
  search: z.string().max(200).optional().default(""),
  limit: z.number().int().min(1).max(100).optional().default(40),
});

export const listInboxAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { items: [], stats: { pending: 0, posted_today: 0, accuracy: null } };
    const rules = await loadActiveRules(supabase, tenantId);

    // Pull recent sources in parallel
    const [docsRes, txnsRes, insightsRes, banksRes, postedRes, salesRes] = await Promise.all([
      supabase
        .from("documents")
        .select("id, original_filename, doc_kind, ocr_status, ocr_extracted, source, created_at, invoice_id, ai_upload_id")
        .eq("tenant_id", tenantId)
        .in("ocr_status", ["done", "processing"])
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("bank_transactions")
        .select("id, bank_account_id, txn_date, description, amount, counterparty, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "unmatched")
        .order("txn_date", { ascending: false })
        .limit(40),
      supabase
        .from("ai_insights")
        .select("id, title, body, severity, created_at, metadata, category, action_url")
        .eq("tenant_id", tenantId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("bank_accounts").select("id, name, bank_name, account_no").eq("tenant_id", tenantId),
      supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
      supabase
        .from("sales_invoices")
        .select(
          "id, customer_id, customer_name, customer_tax_id, invoice_no, issue_date, subtotal, vat_amount, total, payment_status, notes, created_at, status, journal_entry_id, tenant_id",
        )
        .eq("tenant_id", tenantId)
        .is("journal_entry_id", null)
        .in("status", ["reviewed", "issued", "sent"])
        .order("issue_date", { ascending: false })
        .limit(40),
    ]);

    const bankMap = new Map(
      ((banksRes.data ?? []) as any[]).map((a) => [
        a.id,
        `${a.bank_name ?? a.name}${a.account_no ? " ··" + String(a.account_no).slice(-4) : ""}`,
      ]),
    );

    // Dedup: nếu cùng ai_upload_id có nhiều row, ưu tiên row đã được phân loại
    // (purchase_invoice / sales_invoice) và ẩn các row "other" để KTV không bấm nhầm.
    const classifiedKinds = new Set(["purchase_invoice", "sales_invoice"]);
    const groups = new Map<string, any[]>();
    for (const d of (docsRes.data ?? []) as any[]) {
      const key = d.ai_upload_id ?? `__solo_${d.id}`;
      const arr = groups.get(key);
      if (arr) arr.push(d);
      else groups.set(key, [d]);
    }
    const filteredDocs: any[] = [];
    for (const [, arr] of groups) {
      const classified = arr.filter((d) => classifiedKinds.has(d.doc_kind));
      filteredDocs.push(...(classified.length > 0 ? classified : arr));
    }

    // BATCH: prefetch proposals cho mọi document có invoice_id
    const invoiceIds = Array.from(
      new Set(
        filteredDocs
          .map((d) => d.invoice_id)
          .filter((x): x is string => !!x),
      ),
    );
    const salesIds = ((salesRes.data ?? []) as any[]).map((s) => s.id);
    const [{ proposeJournalBatch }, { proposeSalesJournalBatch }] = await Promise.all([
      import("@/lib/categorize/engine.server"),
      import("@/lib/categorize/sales-engine.server"),
    ]);
    const [proposalMap, salesProposalMap] = await Promise.all([
      proposeJournalBatch(supabase, invoiceIds),
      proposeSalesJournalBatch(supabase, salesIds),
    ]);

    const items: InboxItem[] = [];
    for (const d of filteredDocs) {
      const prebuilt = d.invoice_id ? proposalMap.get(d.invoice_id) : undefined;
      const it = await buildDocumentItem(supabase, tenantId, d, rules, prebuilt);
      if (it) items.push(it);
    }
    for (const s of (salesRes.data ?? []) as any[]) {
      const it = await buildSalesInvoiceItem(supabase, tenantId, s, salesProposalMap.get(s.id));
      if (it) items.push(it);
    }
    for (const t of (txnsRes.data ?? []) as any[]) {
      const it = await buildBankItem(supabase, tenantId, t, bankMap.get(t.bank_account_id) ?? "Ngân hàng", rules);
      if (it) items.push(it);
    }
    for (const i of (insightsRes.data ?? []) as any[]) items.push(buildInsightItem(i));

    // ============ Enrich document items: posted_voucher + missing master data ============
    await enrichDocumentItems(supabase, tenantId, items);

    const q = data.search.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (x) =>
            x.title.toLowerCase().includes(q) ||
            (x.subtitle ?? "").toLowerCase().includes(q) ||
            (x.partner ?? "").toLowerCase().includes(q),
        )
      : items;

    // Sort: low confidence (red) first, then medium, then high; within band newest first
    const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
    filtered.sort((a, b) => {
      const ab = order[a.confidence_band] - order[b.confidence_band];
      if (ab !== 0) return ab;
      return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    });

    const top = filtered.slice(0, data.limit);
    return {
      items: top,
      stats: {
        pending: filtered.length,
        posted_today: postedRes.count ?? 0,
        accuracy: null as number | null,
        high_conf_count: filtered.filter((x) => x.confidence_band === "high").length,
      },
    };
  });

const ApproveInput = z.object({
  source: z.enum(["document", "bank_statement", "ai_insight"]),
  external_id: z.string().min(1),
  description: z.string().min(1).max(500),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z
    .array(
      z.object({
        account_code: z.string().min(2).max(16),
        debit: z.number().min(0),
        credit: z.number().min(0),
        memo: z.string().max(200).optional(),
      }),
    )
    .min(1),
  confidence_at_decision: z.number().int().min(0).max(100).optional(),
  match_ref_invoice_id: z.string().uuid().optional(),
  purchase_purpose: z.enum(["resale", "material", "expense"]).optional(),
});

const PURCHASE_PURPOSE_OVERRIDE: Record<
  "resale" | "material" | "expense",
  { account: string; item_type: "goods" | "service" | "material"; line_type: string }
> = {
  resale:   { account: "156", item_type: "goods",    line_type: "goods" },
  material: { account: "152", item_type: "material", line_type: "material" },
  expense:  { account: "642", item_type: "service",  line_type: "service" },
};

export const approveInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ApproveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Bút toán không cân: Nợ ${totalDebit} ≠ Có ${totalCredit}`);
    }
    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: data.entry_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    // Chặn ghi sổ hóa đơn không liên quan + trùng số
    if (data.source === "document") {
      await assertInvoiceBelongsToTenant(supabase, tenantId, data.external_id);
      await assertNoDuplicateEInvoice(supabase, tenantId, data.external_id);
      // Auto-tạo KH/NCC/hàng hóa còn thiếu theo gợi ý AI (idempotent)
      try {
        await autoResolveMissingMaster(supabase, {
          tenantId,
          userId,
          documentId: data.external_id,
        });
      } catch (e) {
        console.error("[approveInboxItem] auto-resolve missing master failed", e);
      }
    }

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        entry_date: data.entry_date,
        description: data.description,
        invoice_id: data.match_ref_invoice_id ?? null,
      })
      .select("id")
      .single();
    if (error || !entry) throw new Error(error?.message || "Không tạo được bút toán");

    const { error: linesErr } = await supabase.from("journal_lines").insert(
      data.lines.map((l, i) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    if (linesErr) throw new Error(linesErr.message);

    let postedVoucher: { kind: "sales_voucher" | "purchase_voucher"; id: string; voucher_no: string } | null = null;
    if (data.source === "bank_statement") {
      await supabase
        .from("bank_transactions")
        .update({ status: "matched", matched_entry_id: entry.id })
        .eq("id", data.external_id);
    } else if (data.source === "document") {
      await supabase
        .from("documents")
        .update({ ocr_status: "done", reviewed_at: new Date().toISOString(), reviewed_by: userId })
        .eq("id", data.external_id);
      const direction = await inferDocDirection(supabase, tenantId, data.external_id);
      if (direction === "sales") {
        const salesInvoiceId = await materializeSalesInvoiceFromDocument(supabase, {
          documentId: data.external_id,
          tenantId,
          userId,
          entryDate: data.entry_date,
          journalEntryId: entry.id,
        });
        const svId = await materializeSalesVoucherFromDocument(supabase, {
          documentId: data.external_id,
          tenantId,
          userId,
          entryDate: data.entry_date,
          journalEntryId: entry.id,
          salesInvoiceId,
        });
        if (svId) {
          const { data: svRow } = await supabase
            .from("sales_vouchers")
            .select("id, voucher_no")
            .eq("id", svId)
            .maybeSingle();
          if (svRow) postedVoucher = { kind: "sales_voucher", id: svRow.id, voucher_no: svRow.voucher_no };
        }
      } else if (direction === "purchase") {
        const pvId = await materializePurchaseVoucherFromDocument(supabase, {
          documentId: data.external_id,
          tenantId,
          userId,
          entryDate: data.entry_date,
          journalEntryId: entry.id,
        });
        if (pvId) {
          const { data: pvRow } = await supabase
            .from("purchase_vouchers")
            .select("id, voucher_no")
            .eq("id", pvId)
            .maybeSingle();
          if (pvRow) postedVoucher = { kind: "purchase_voucher", id: pvRow.id, voucher_no: pvRow.voucher_no };
        }
      }
    } else if (data.source === "ai_insight") {
      await supabase
        .from("ai_insights")
        .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
        .eq("id", data.external_id);
    }

    await supabase.from("inbox_decisions").insert({
      tenant_id: tenantId,
      user_id: userId,
      item_source: data.source,
      item_external_id: data.external_id,
      action: "approve",
      confidence_at_decision: data.confidence_at_decision ?? null,
      final_entry: { description: data.description, entry_date: data.entry_date, lines: data.lines } as any,
      journal_entry_id: entry.id,
    });

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Hạch toán ${data.source === "bank_statement" ? "giao dịch NH" : data.source === "document" ? "chứng từ" : "đề xuất"} — ${data.description.slice(0, 80)}`,
        result: "success",
        metadata: { entry_id: entry.id, confidence: data.confidence_at_decision ?? null },
      });
    } catch {}

    try {
      const { invalidateCategorizeCache } = await import("@/lib/categorize/cache.server");
      invalidateCategorizeCache(tenantId);
    } catch {}

    return { journal_entry_id: entry.id, posted_voucher: postedVoucher };
  });

const SkipInput = z.object({
  source: z.enum(["document", "bank_statement", "ai_insight"]),
  external_id: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const skipInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SkipInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    if (data.source === "ai_insight") {
      await supabase
        .from("ai_insights")
        .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
        .eq("id", data.external_id);
    }
    await supabase.from("inbox_decisions").insert({
      tenant_id: tenantId,
      user_id: userId,
      item_source: data.source,
      item_external_id: data.external_id,
      action: "skip",
      note: data.reason ?? null,
    });
    return { ok: true };
  });

const RuleInput = z.object({
  source: z.enum(["document", "bank_statement", "ai_insight"]),
  external_id: z.string().min(1),
  pattern_kind: z.enum(["partner", "memo", "source", "amount_range", "partner_amount"]),
  pattern_value: z.string().min(1).max(200),
  apply_account: z.string().min(2).max(16).optional(),
  apply_dimension: z.record(z.string(), z.unknown()).optional(),
  confidence_boost: z.number().int().min(0).max(100).optional(),
  note: z.string().max(300).optional(),
});

export const saveInboxRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RuleInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    const { data: row, error } = await supabase
      .from("inbox_rules")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        pattern_kind: data.pattern_kind,
        pattern_value: data.pattern_value,
        apply_account: data.apply_account ?? null,
        apply_dimension: (data.apply_dimension ?? {}) as any,
        confidence_boost: data.confidence_boost ?? 25,
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

// ============================================================================
// Tạo nhanh master data còn thiếu từ panel cảnh báo trong Inbox AI
// ============================================================================
const CreateMissingInput = z.object({
  entity: z.enum(["customer", "supplier", "product", "service"]),
  name: z.string().min(1).max(255),
  tax_id: z.string().max(32).optional(),
  item_type: z
    .enum(["goods", "service", "material", "tool", "asset_alloc", "asset_tangible", "asset_intangible"])
    .optional(),
});

/** Map item_type guess → { item_type, stock_account } cho bảng products. */
function accountForItemType(
  itemType?: string,
): { item_type: "goods" | "service"; stock_account: string; unit: string } {
  switch (itemType) {
    case "service":
      return { item_type: "service", stock_account: "156", unit: "lần" };
    case "material":
      return { item_type: "goods", stock_account: "152", unit: "cái" };
    case "tool":
      return { item_type: "goods", stock_account: "153", unit: "cái" };
    case "asset_alloc":
      return { item_type: "goods", stock_account: "242", unit: "cái" };
    case "asset_tangible":
      return { item_type: "goods", stock_account: "211", unit: "cái" };
    case "asset_intangible":
      return { item_type: "goods", stock_account: "213", unit: "cái" };
    case "goods":
    default:
      return { item_type: "goods", stock_account: "156", unit: "cái" };
  }
}

function slugCode(name: string, prefix: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10);
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}${base || "X"}${suffix}`;
}

export const createMissingMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateMissingInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    const name = data.name.trim();
    const taxId = data.tax_id?.trim() || null;

    if (data.entity === "customer") {
      // Idempotent: nếu đã có theo MST hoặc tên thì trả về id hiện có
      if (taxId) {
        const { data: ex } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", taxId)
          .maybeSingle();
        if (ex?.id) return { id: ex.id, entity: "customer", existed: true };
      }
      const { data: row, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          name,
          tax_id: taxId,
          code: slugCode(name, "KH"),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row!.id, entity: "customer", existed: false };
    }

    if (data.entity === "supplier") {
      if (taxId) {
        const { data: ex } = await supabase
          .from("suppliers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", taxId)
          .maybeSingle();
        if (ex?.id) return { id: ex.id, entity: "supplier", existed: true };
      }
      const { data: row, error } = await supabase
        .from("suppliers")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          name,
          tax_id: taxId,
          code: slugCode(name, "NCC"),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row!.id, entity: "supplier", existed: false };
    }

    // product / service — idempotent theo tên
    const { data: existProd } = await supabase
      .from("products")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", name)
      .maybeSingle();
    if (existProd?.id) return { id: existProd.id, entity: data.entity, existed: true };

    const acct = accountForItemType(data.item_type ?? (data.entity === "service" ? "service" : "goods"));
    const prefix = acct.item_type === "service" ? "DV" : "HH";
    const { data: row, error } = await supabase
      .from("products")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        name,
        code: slugCode(name, prefix),
        item_type: acct.item_type,
        stock_account: acct.stock_account,
        unit: acct.unit,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id, entity: data.entity, existed: false };
  });

// ============================================================================
// Sửa gợi ý AI + tạo bản ghi đúng + dạy Trí nhớ AI (ai_memory_partners)
// ============================================================================
const UpdateMissingInput = z.object({
  entity: z.enum(["customer", "supplier", "product", "service"]),
  original_name: z.string().min(1).max(255),
  corrected: z.object({
    name: z.string().min(1).max(255),
    tax_id: z.string().max(32).optional(),
    item_type: z
      .enum(["goods", "service", "material", "tool", "asset_alloc", "asset_tangible", "asset_intangible"])
      .optional(),
  }),
  source_document_id: z.string().uuid().optional(),
});

export const updateMissingMasterAndLearn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateMissingInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const name = data.corrected.name.trim();
    const taxId = data.corrected.tax_id?.trim() || null;
    const original = data.original_name.trim();

    // 1) Tạo / lấy bản ghi theo giá trị đã sửa
    let createdId: string | null = null;
    let existed = false;

    if (data.entity === "customer" || data.entity === "supplier") {
      const table = data.entity === "customer" ? "customers" : "suppliers";
      const codePrefix = data.entity === "customer" ? "KH" : "NCC";
      if (taxId) {
        const { data: ex } = await supabase
          .from(table)
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("tax_id", taxId)
          .maybeSingle();
        if (ex?.id) {
          createdId = ex.id;
          existed = true;
        }
      }
      if (!createdId) {
        const { data: row, error } = await supabase
          .from(table)
          .insert({
            tenant_id: tenantId,
            user_id: userId,
            name,
            tax_id: taxId,
            code: slugCode(name, codePrefix),
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        createdId = row!.id;
      } else {
        await supabase.from(table).update({ name }).eq("id", createdId);
      }
    } else {
      const acct = accountForItemType(
        data.corrected.item_type ?? (data.entity === "service" ? "service" : "goods"),
      );
      const prefix = acct.item_type === "service" ? "DV" : "HH";
      const { data: ex } = await supabase
        .from("products")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", name)
        .maybeSingle();
      if (ex?.id) {
        createdId = ex.id;
        existed = true;
        await supabase
          .from("products")
          .update({ item_type: acct.item_type, stock_account: acct.stock_account })
          .eq("id", createdId);
      } else {
        const { data: row, error } = await supabase
          .from("products")
          .insert({
            tenant_id: tenantId,
            user_id: userId,
            name,
            code: slugCode(name, prefix),
            item_type: acct.item_type,
            stock_account: acct.stock_account,
            unit: acct.unit,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        createdId = row!.id;
      }
    }

    // 2) Ghi/upsert Trí nhớ AI để map tên cũ → bản ghi đúng
    const partyKind =
      data.entity === "customer" ? "customer" : data.entity === "supplier" ? "supplier" : "item";
    const defaultAccount =
      data.entity === "customer"
        ? "131"
        : data.entity === "supplier"
        ? "331"
        : accountForItemType(data.corrected.item_type).stock_account;

    const { data: memEx } = await supabase
      .from("ai_memory_partners")
      .select("id, memo_keywords, sample_count")
      .eq("tenant_id", tenantId)
      .eq("party_kind", partyKind)
      .eq("party_id", createdId)
      .maybeSingle();

    const memoSet = new Set<string>((memEx?.memo_keywords ?? []) as string[]);
    if (original && original.toLowerCase() !== name.toLowerCase()) memoSet.add(original);

    if (memEx?.id) {
      await supabase
        .from("ai_memory_partners")
        .update({
          display_name: name,
          memo_keywords: Array.from(memoSet),
          default_account: defaultAccount,
          sample_count: (memEx.sample_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", memEx.id);
    } else {
      await supabase.from("ai_memory_partners").insert({
        tenant_id: tenantId,
        party_kind: partyKind,
        party_id: createdId,
        display_name: name,
        behavior_text: data.source_document_id
          ? `Học từ Inbox AI (chứng từ ${data.source_document_id.slice(0, 8)}…)`
          : "Học từ Inbox AI khi user sửa gợi ý",
        memo_keywords: Array.from(memoSet),
        default_account: defaultAccount,
        confidence: 0.9,
        sample_count: 1,
        last_seen_at: new Date().toISOString(),
        created_by: userId,
      });
    }

    return { id: createdId!, entity: data.entity, existed };
  });

// ============================================================================
// Đối soát hóa đơn ↔ bút toán
// Trả về các check khớp/lệch giữa dữ liệu eInvoice/OCR và bút toán đã ghi.
// ============================================================================
const ReconcileInput = z.object({
  external_id: z.string().min(1).max(100),
  source: z.enum(["document", "sales_invoice"]).default("document"),
});

type ReconcileSeverity = "info" | "warn" | "error";
type ReconcileCheck = {
  key: string;
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
  severity: ReconcileSeverity;
  detail?: string;
};

function fmtVND(n: number): string {
  return (Math.round(n) || 0).toLocaleString("vi-VN") + " đ";
}
function nearlyEqual(a: number, b: number, tol = 1): boolean {
  return Math.abs((a || 0) - (b || 0)) <= tol;
}
function normDate(s: any): string | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s.slice(0, 10);
}

export const reconcileInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReconcileInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    // 1) Tìm journal entry đã ghi cho item này
    const { data: decisions } = await supabase
      .from("inbox_decisions")
      .select("journal_entry_id, decided_at")
      .eq("tenant_id", tenantId)
      .eq("item_source", data.source)
      .eq("item_external_id", data.external_id)
      .eq("action", "approve")
      .order("decided_at", { ascending: false })
      .limit(1);
    const entryId = (decisions ?? [])[0]?.journal_entry_id ?? null;

    if (!entryId) {
      return {
        status: "not_posted" as const,
        checks: [] as ReconcileCheck[],
        totals: null,
        voucher: null,
        entry_id: null,
        generated_at: new Date().toISOString(),
      };
    }

    // 2) Pull bút toán + voucher
    const [entryRes, linesRes, svRes, pvRes] = await Promise.all([
      supabase
        .from("journal_entries")
        .select("id, entry_date, description, tenant_id")
        .eq("id", entryId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("journal_lines")
        .select("account_code, debit, credit, line_order")
        .eq("entry_id", entryId)
        .order("line_order", { ascending: true }),
      supabase
        .from("sales_vouchers")
        .select("id, voucher_no, status, total_amount, vat_amount")
        .eq("tenant_id", tenantId)
        .eq("journal_entry_id", entryId)
        .maybeSingle(),
      supabase
        .from("purchase_vouchers")
        .select("id, voucher_no, status, total_amount, vat_amount")
        .eq("tenant_id", tenantId)
        .eq("journal_entry_id", entryId)
        .maybeSingle(),
    ]);
    const entry = entryRes.data;
    const lines: any[] = linesRes.data ?? [];
    const voucher = svRes.data
      ? { kind: "sales_voucher" as const, ...svRes.data }
      : pvRes.data
        ? { kind: "purchase_voucher" as const, ...pvRes.data }
        : null;

    if (!entry) {
      return {
        status: "not_posted" as const,
        checks: [],
        totals: null,
        voucher: null,
        entry_id: null,
        generated_at: new Date().toISOString(),
      };
    }

    // 3) Pull dữ liệu hóa đơn gốc (document → ai_uploads/ocr_extracted)
    let invoiceData: any = null;
    if (data.source === "document") {
      const { data: doc } = await supabase
        .from("documents")
        .select("id, doc_kind, ai_upload_id, ocr_extracted, original_filename")
        .eq("id", data.external_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (doc) {
        let ein: any = null;
        if (doc.ai_upload_id) {
          const { data: up } = await supabase
            .from("ai_uploads")
            .select("parsed")
            .eq("id", doc.ai_upload_id)
            .maybeSingle();
          ein = up?.parsed?._einvoice ?? null;
        }
        const ext = (doc.ocr_extracted ?? {}) as any;
        const totals = ein?.totals ?? {};
        const subtotal = Number(totals.subtotal ?? ext.subtotal ?? 0);
        const vat = Number(totals.vat_amount ?? ext.vat_amount ?? 0);
        const total = Number(totals.total ?? ext.total_amount ?? ext.total ?? subtotal + vat);
        const issueDate = normDate(ein?.issue_date ?? ext.invoice_date ?? ext.issue_date);
        const invoiceNo = ein?.invoice_no ?? ext.invoice_no ?? ext.invoice_number ?? null;
        const lineCount = Array.isArray(ein?.lines)
          ? ein.lines.length
          : Array.isArray(ext?.items)
            ? ext.items.length
            : Array.isArray(ext?.lines)
              ? ext.lines.length
              : 0;
        invoiceData = {
          doc_kind: doc.doc_kind,
          subtotal,
          vat,
          total,
          issueDate,
          invoiceNo,
          lineCount,
        };
      }
    }

    // 4) Tính toán từ journal lines
    const sumDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const sumCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    const isSales = !!svRes.data || invoiceData?.doc_kind === "sales_invoice";
    const isPurchase = !!pvRes.data || invoiceData?.doc_kind === "purchase_invoice";

    // VAT lines: 3331 bên Có (bán) hoặc 133 bên Nợ (mua)
    const vatOut = lines
      .filter((l) => String(l.account_code).startsWith("3331"))
      .reduce((s, l) => s + Number(l.credit ?? 0), 0);
    const vatIn = lines
      .filter((l) => String(l.account_code).startsWith("133"))
      .reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const revenue = lines
      .filter((l) => String(l.account_code).startsWith("511"))
      .reduce((s, l) => s + Number(l.credit ?? 0), 0);

    const checks: ReconcileCheck[] = [];

    // Check 1: Bút toán cân
    checks.push({
      key: "balance",
      label: "Bút toán cân (Nợ = Có)",
      expected: fmtVND(sumDebit),
      actual: fmtVND(sumCredit),
      ok: nearlyEqual(sumDebit, sumCredit),
      severity: "error",
    });

    // Checks dựa trên dữ liệu hóa đơn
    if (invoiceData) {
      // Check 2: Tổng tiền hóa đơn vs tổng Nợ bút toán
      checks.push({
        key: "total",
        label: "Tổng tiền hóa đơn",
        expected: fmtVND(invoiceData.total),
        actual: fmtVND(sumDebit),
        ok: nearlyEqual(invoiceData.total, sumDebit),
        severity: "error",
      });

      // Check 3: VAT
      if (invoiceData.vat > 0 || vatIn > 0 || vatOut > 0) {
        const actualVat = isSales ? vatOut : isPurchase ? vatIn : Math.max(vatIn, vatOut);
        checks.push({
          key: "vat",
          label: isSales ? "VAT đầu ra (3331)" : "VAT đầu vào (133)",
          expected: fmtVND(invoiceData.vat),
          actual: fmtVND(actualVat),
          ok: nearlyEqual(invoiceData.vat, actualVat),
          severity: "error",
        });
      }

      // Check 4: Doanh thu (chỉ bán)
      if (isSales && invoiceData.subtotal > 0) {
        checks.push({
          key: "revenue",
          label: "Doanh thu (511)",
          expected: fmtVND(invoiceData.subtotal),
          actual: fmtVND(revenue),
          ok: nearlyEqual(invoiceData.subtotal, revenue),
          severity: "warn",
        });
      }

      // Check 5: Ngày
      if (invoiceData.issueDate) {
        const entryDate = (entry.entry_date ?? "").slice(0, 10);
        checks.push({
          key: "date",
          label: "Ngày bút toán = ngày hóa đơn",
          expected: invoiceData.issueDate,
          actual: entryDate || "—",
          ok: !!entryDate && entryDate === invoiceData.issueDate,
          severity: "warn",
        });
      }

      // Check 6: Có voucher liên kết
      checks.push({
        key: "voucher",
        label: "Phiếu đã tạo",
        expected: "Có",
        actual: voucher ? `${voucher.voucher_no}` : "Chưa có",
        ok: !!voucher,
        severity: "warn",
      });
    } else {
      checks.push({
        key: "invoice_data",
        label: "Dữ liệu hóa đơn gốc",
        expected: "Đầy đủ",
        actual: "Thiếu",
        ok: false,
        severity: "warn",
        detail: "Không đọc được dữ liệu OCR/eInvoice để đối soát chi tiết.",
      });
    }

    const hasError = checks.some((c) => !c.ok && c.severity === "error");
    const hasWarn = checks.some((c) => !c.ok);

    return {
      status: (hasError ? "mismatched" : hasWarn ? "partial" : "matched") as
        | "matched"
        | "mismatched"
        | "partial",
      checks,
      totals: {
        invoice_total: invoiceData?.total ?? null,
        sum_debit: sumDebit,
        sum_credit: sumCredit,
        diff: invoiceData ? Number(invoiceData.total) - sumDebit : 0,
      },
      voucher: voucher
        ? { kind: voucher.kind, id: voucher.id, voucher_no: voucher.voucher_no }
        : null,
      entry_id: entry.id,
      generated_at: new Date().toISOString(),
    };
  });

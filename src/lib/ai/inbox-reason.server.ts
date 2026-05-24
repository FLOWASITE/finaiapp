/**
 * Sổ AI — heuristic builder for proposals + confidence scoring.
 *
 * This file is server-only (`.server.ts` is import-protected). It MUST
 * never be imported from client code; call it from `createServerFn`
 * handlers inside `src/lib/inbox-ai.functions.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
export type {
  ProposalLine,
  Proposal,
  ReasoningSignal,
  Reasoning,
  InboxSource,
  ConfidenceBand,
  InboxItem,
} from "./inbox-types";
import type {
  ProposalLine,
  Proposal,
  ReasoningSignal,
  Reasoning,
  InboxSource,
  ConfidenceBand,
  InboxItem,
} from "./inbox-types";
import { proposeJournalForInvoice } from "@/lib/categorize/engine.server";



const VND = (n: number) =>
  (Math.round(n) || 0).toLocaleString("vi-VN") + " ₫";

function bandOf(confidence: number): ConfidenceBand {
  if (confidence >= 88) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

function relativeTimeVi(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  return `${d} ngày trước`;
}

function normPartner(s?: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/cty|công ty|tnhh|cổ phần|cp\b|hh|nhh/g, "")
    .replace(/[^a-z0-9àáâãèéêìíòóôõùúýỳỹđ ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull active rules for this tenant once per request. */
export async function loadActiveRules(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<
  Array<{
    id: string;
    pattern_kind: string;
    pattern_value: string;
    apply_account: string | null;
    apply_dimension: Record<string, unknown>;
    confidence_boost: number;
  }>
> {
  const { data, error } = await supabase
    .from("inbox_rules")
    .select(
      "id, pattern_kind, pattern_value, apply_account, apply_dimension, confidence_boost",
    )
    .eq("tenant_id", tenantId)
    .eq("enabled", true);
  if (error) return [];
  return (data ?? []) as any[];
}

function applyRule(
  rules: Awaited<ReturnType<typeof loadActiveRules>>,
  match: { partner?: string; memo?: string; amount?: number; source: InboxSource },
):
  | null
  | {
      account?: string;
      dimension: Record<string, unknown>;
      boost: number;
      rule_id: string;
      label: string;
    } {
  const partnerN = normPartner(match.partner);
  const memoN = (match.memo ?? "").toLowerCase();
  for (const r of rules) {
    let hit = false;
    if (r.pattern_kind === "partner" && partnerN && partnerN.includes(normPartner(r.pattern_value)))
      hit = true;
    else if (r.pattern_kind === "memo" && memoN && memoN.includes(r.pattern_value.toLowerCase()))
      hit = true;
    else if (r.pattern_kind === "source" && r.pattern_value === match.source) hit = true;
    if (hit) {
      return {
        account: r.apply_account ?? undefined,
        dimension: (r.apply_dimension ?? {}) as Record<string, unknown>,
        boost: r.confidence_boost ?? 25,
        rule_id: r.id,
        label: `Quy tắc: ${r.pattern_kind} = ${r.pattern_value}`,
      };
    }
  }
  return null;
}

// ============================================================
// DOCUMENT-based proposals (purchase invoices uploaded / OCR'd)
// ============================================================
export async function buildDocumentItem(
  supabase: SupabaseClient,
  tenantId: string,
  doc: any,
  rules: Awaited<ReturnType<typeof loadActiveRules>>,
): Promise<InboxItem | null> {
  const ext = (doc.ocr_extracted ?? {}) as any;
  const amount = Number(ext.total ?? ext.amount ?? 0);
  if (!amount) return null;
  const supplierRaw = ext.supplier_name ?? ext.vendor_name ?? ext.seller_name ?? ext.partner;
  const supplier = String(supplierRaw ?? "—");
  const supplierTaxId = ext.supplier_tax_id ?? ext.vendor_tax_id ?? ext.seller_tax_id ?? ext.tax_id ?? null;
  const invoiceNo = String(ext.invoice_no ?? ext.invoice_number ?? ext.number ?? "").trim();
  const vat = Number(ext.vat_amount ?? 0);
  const subtotal = Number(ext.subtotal ?? Math.max(0, amount - vat));
  const invoiceDate = ext.invoice_date ?? ext.issue_date ?? null;
  const date = (invoiceDate ?? doc.created_at ?? new Date().toISOString()).slice(0, 10);

  // If document is linked to an invoice, prefer the categorize engine
  // (single source of truth: vendor templates + rules + AI).
  if (doc.invoice_id) {
    try {
      const dto = await proposeJournalForInvoice(supabase, doc.invoice_id);
      const entry = dto.entries[0];
      if (entry) {
        const lines: ProposalLine[] = entry.lines.map((l) => ({
          account: l.account_code,
          debit: l.debit || undefined,
          credit: l.credit || undefined,
          memo: l.memo ?? undefined,
        }));
        const confidence = Math.min(99, Math.round(dto.confidence * 100));
        const signals: ReasoningSignal[] = dto.signals.map((s) => ({
          kind: "match",
          label: s.label,
          ok: true,
        }));
        for (const w of dto.warnings) {
          signals.push({ kind: "warn", label: w.message, ok: false });
        }
        return {
          id: `document:${doc.id}`,
          external_id: doc.id,
          source: "document",
          source_label:
            doc.source === "einvoice"
              ? `Hoá đơn vào · TCT · ${relativeTimeVi(doc.created_at)}`
              : doc.source === "email"
              ? `Email forward · ${relativeTimeVi(doc.created_at)}`
              : `Tài liệu · ${relativeTimeVi(doc.created_at)}`,
          source_short: doc.source === "einvoice" ? "TCT" : doc.source === "email" ? "EMAIL" : "DOC",
          title: supplier,
          subtitle:
            [ext.description, invoiceNo ? `HĐ ${invoiceNo}` : null].filter(Boolean).join(" · ") ||
            doc.original_filename,
          partner: supplier,
          amount,
          occurred_at: doc.created_at,
          confidence,
          confidence_band: bandOf(confidence),
          proposal: {
            description: entry.description,
            entry_date: entry.entry_date,
            lines,
            voucher_kind: "purchase_invoice",
            meta: {
              supplier_name: supplier,
              supplier_tax_id: ext.supplier_tax_id ?? ext.tax_id ?? null,
              invoice_no: invoiceNo || null,
              invoice_series: ext.invoice_series ?? ext.series ?? null,
              invoice_date: ext.invoice_date ?? null,
              subtotal: subtotal || null,
              vat_rate: ext.vat_rate ?? null,
              vat_amount: vat || null,
              total: amount,
              payment_method: ext.payment_method ?? null,
              due_date: ext.due_date ?? null,
            },
          },
          reasoning: {
            summary: `Engine hạch toán (${dto.source}): ${dto.entries.length} bút toán, độ tin cậy ${(dto.confidence * 100).toFixed(0)}%.`,
            signals,
          },
          followups: [
            `Tổng chi cho ${supplier} năm nay?`,
            "Vì sao chọn các tài khoản này?",
            "Áp dụng template này cho NCC này",
          ],
          href: "/categorize",
        };
      }
    } catch (_e) {
      // Fallback xuống logic cũ
    }
  }


  // Default account guess (expense) — rule may override
  let expenseAccount = String(ext.expense_account ?? "642");
  const rule = applyRule(rules, {
    partner: supplier,
    memo: invoiceNo,
    amount,
    source: "tct_einvoice",
  });
  if (rule?.account) expenseAccount = rule.account;

  // Build balanced entry: Nợ expense + Nợ 133 (VAT) / Có 331
  const lines: ProposalLine[] = [
    { account: expenseAccount, debit: subtotal, memo: `${supplier} — ${invoiceNo}` },
  ];
  if (vat > 0) lines.push({ account: "133", debit: vat, memo: `Thuế GTGT khấu trừ` });
  lines.push({ account: "331", credit: amount, memo: `Phải trả ${supplier}` });

  // Confidence
  let confidence = 35;
  const signals: ReasoningSignal[] = [];
  if (doc.ocr_status === "done") {
    confidence += 15;
    signals.push({ kind: "match", label: "OCR đã đọc đầy đủ", ok: true });
  }
  if (supplier && supplier !== "—") {
    // partner đã có trong sổ?
    const { data: known } = await supabase
      .from("invoices")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("supplier_name", `%${supplier.slice(0, 24)}%`)
      .limit(1);
    if (known && known.length > 0) {
      confidence += 25;
      signals.push({ kind: "partner", label: "Đối tác đã có trong sổ", ok: true });
    } else {
      signals.push({ kind: "partner", label: "Đối tác MỚI — cần tạo", ok: false });
    }
  }
  // Pattern: cùng supplier + account ≥ 5 lần
  if (supplier && supplier !== "—") {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .ilike("supplier_name", `%${supplier.slice(0, 24)}%`);
    if ((count ?? 0) >= 5) {
      confidence += 15;
      signals.push({ kind: "pattern", label: `Pattern tương tự ×${count}`, ok: true });
    }
  }
  if (rule) {
    confidence += rule.boost;
    signals.push({ kind: "rule", label: rule.label, ok: true });
  }
  confidence = Math.min(99, confidence);

  const sourceLabel =
    doc.source === "einvoice"
      ? `Hoá đơn vào · TCT · ${relativeTimeVi(doc.created_at)}`
      : doc.source === "email"
      ? `Email forward · ${relativeTimeVi(doc.created_at)}`
      : `Tài liệu · ${relativeTimeVi(doc.created_at)}`;

  return {
    id: `document:${doc.id}`,
    external_id: doc.id,
    source: "document",
    source_label: sourceLabel,
    source_short: doc.source === "einvoice" ? "TCT" : doc.source === "email" ? "EMAIL" : "DOC",
    title: supplier,
    subtitle:
      [ext.description, invoiceNo ? `HĐ ${invoiceNo}` : null].filter(Boolean).join(" · ") ||
      doc.original_filename,
    partner: supplier,
    amount,
    occurred_at: doc.created_at,
    confidence,
    confidence_band: bandOf(confidence),
    proposal: {
      description: `Mua hàng/dịch vụ ${supplier}${invoiceNo ? ` — HĐ ${invoiceNo}` : ""}`,
      entry_date: date,
      lines,
      voucher_kind: "purchase_invoice",
      meta: {
        supplier_name: supplier,
        supplier_tax_id: ext.supplier_tax_id ?? ext.tax_id ?? null,
        invoice_no: invoiceNo || null,
        invoice_series: ext.invoice_series ?? ext.series ?? null,
        invoice_date: ext.invoice_date ?? null,
        subtotal: subtotal || null,
        vat_rate: ext.vat_rate ?? null,
        vat_amount: vat || null,
        total: amount,
        payment_method: ext.payment_method ?? null,
        due_date: ext.due_date ?? null,
      },
    },
    reasoning: {
      summary: `Hoá đơn ${VND(amount)} từ ${supplier}${invoiceNo ? `, số ${invoiceNo}` : ""}. AI đề xuất Nợ ${expenseAccount}${vat > 0 ? " + Nợ 133" : ""} / Có 331.`,
      signals,
    },
    followups: [
      `Tổng chi cho ${supplier} năm nay?`,
      "Tại sao TK " + expenseAccount + " mà không phải khác?",
      "Áp dụng quy tắc này cho tương lai",
    ],
    href: "/documents",
  };
}

// ============================================================
// BANK TRANSACTION items — with two-way matching
// ============================================================
export async function buildBankItem(
  supabase: SupabaseClient,
  tenantId: string,
  txn: any,
  bankLabel: string,
  rules: Awaited<ReturnType<typeof loadActiveRules>>,
): Promise<InboxItem | null> {
  const amount = Number(txn.amount);
  const isIncoming = amount >= 0;
  const memo = (txn.description ?? "").toString();
  const partner = (txn.counterparty ?? memo.split(" ").slice(0, 4).join(" ") ?? "").toString();

  // Try to extract invoice no from memo: "HD 00125", "HĐ 125"
  const memoLow = memo.toLowerCase();
  const invMatch = memoLow.match(/h[dđ]\s*0*([0-9]{2,8})/);
  const invoiceNoFromMemo = invMatch?.[1] ?? null;

  let match_ref: InboxItem["match_ref"] | undefined;
  const signals: ReasoningSignal[] = [];
  let confidence = 30;

  if (isIncoming) {
    // AR: find sales_invoice with matching amount (+/- partner / invoice no)
    const { data: candidates } = await supabase
      .from("sales_invoices")
      .select("id, invoice_no, customer_name, total, issue_date")
      .eq("tenant_id", tenantId)
      .gte("total", Math.abs(amount) * 0.999)
      .lte("total", Math.abs(amount) * 1.001)
      .neq("status", "void")
      .limit(20);
    let best: any = null;
    for (const c of candidates ?? []) {
      let score = 0;
      if (invoiceNoFromMemo && (c.invoice_no ?? "").includes(invoiceNoFromMemo)) score += 50;
      if (normPartner(c.customer_name).includes(normPartner(partner)) && partner.length > 3)
        score += 25;
      if (score > 0 && (!best || score > best._score)) best = { ...c, _score: score };
    }
    if (best) {
      match_ref = { kind: "sales_invoice", id: best.id, ref: best.invoice_no ?? best.id.slice(0, 6) };
      confidence += 50;
      signals.push({
        kind: "match",
        label: `Khớp HĐ bán ${best.invoice_no ?? ""} (${VND(Math.abs(amount))})`,
        ok: true,
      });
    } else {
      signals.push({ kind: "match", label: "Không tìm thấy HĐ bán khớp", ok: false });
    }
  } else {
    // AP: find purchase invoice
    const { data: candidates } = await supabase
      .from("invoices")
      .select("id, invoice_no, supplier_name, total, issue_date")
      .eq("tenant_id", tenantId)
      .gte("total", Math.abs(amount) * 0.999)
      .lte("total", Math.abs(amount) * 1.001)
      .neq("status", "void")
      .limit(20);
    let best: any = null;
    for (const c of candidates ?? []) {
      let score = 0;
      if (invoiceNoFromMemo && (c.invoice_no ?? "").includes(invoiceNoFromMemo)) score += 50;
      if (normPartner(c.supplier_name).includes(normPartner(partner)) && partner.length > 3)
        score += 25;
      if (score > 0 && (!best || score > best._score)) best = { ...c, _score: score };
    }
    if (best) {
      match_ref = { kind: "invoice", id: best.id, ref: best.invoice_no ?? best.id.slice(0, 6) };
      confidence += 50;
      signals.push({
        kind: "match",
        label: `Khớp HĐ mua ${best.invoice_no ?? ""}`,
        ok: true,
      });
    } else {
      signals.push({ kind: "match", label: "Không tìm thấy HĐ mua khớp", ok: false });
    }
  }

  if (memoLow.includes("tt") || memoLow.includes("thanh toan") || memoLow.includes("thanh toán")) {
    confidence += 8;
    signals.push({ kind: "memo", label: "Memo có cụm 'thanh toán'", ok: true });
  }

  const rule = applyRule(rules, { partner, memo, amount, source: "bank_statement" });
  if (rule) {
    confidence += rule.boost;
    signals.push({ kind: "rule", label: rule.label, ok: true });
  }

  // No match → blocker
  let blocker: InboxItem["blocker"] | undefined;
  if (!match_ref && !isIncoming) {
    blocker = { reason: "Cần chứng từ — chưa khớp được hoá đơn mua", notified: "kế toán trưởng" };
    confidence = Math.min(confidence, 45);
  }

  confidence = Math.min(99, Math.max(20, confidence));

  // Proposed entry
  const lines: ProposalLine[] = isIncoming
    ? [
        { account: "112", debit: Math.abs(amount), memo: `TG ${bankLabel}` },
        {
          account: rule?.account ?? "131",
          credit: Math.abs(amount),
          memo: `Phải thu ${partner}`,
        },
      ]
    : [
        {
          account: rule?.account ?? "331",
          debit: Math.abs(amount),
          memo: `Phải trả ${partner}`,
        },
        { account: "112", credit: Math.abs(amount), memo: `TG ${bankLabel}` },
      ];

  return {
    id: `bank_statement:${txn.id}`,
    external_id: txn.id,
    source: "bank_statement",
    source_label: `Sao kê ${bankLabel} · ${relativeTimeVi(txn.created_at ?? txn.txn_date)}`,
    source_short: "BANK",
    title: partner || (isIncoming ? "Tiền vào" : "Tiền ra"),
    subtitle: memo ? `"${memo.slice(0, 80)}"` : undefined,
    partner,
    amount,
    occurred_at: txn.txn_date,
    confidence,
    confidence_band: bandOf(confidence),
    proposal: {
      description: `${isIncoming ? "Thu" : "Chi"} qua ${bankLabel} — ${partner}`,
      entry_date: txn.txn_date,
      lines,
      voucher_kind: isIncoming ? "bank_receipt" : "bank_payment",
      meta: {
        bank_label: bankLabel,
        bank_account: txn.account_no ?? txn.bank_account ?? null,
        txn_date: txn.txn_date ?? null,
        txn_ref: txn.reference ?? txn.txn_ref ?? txn.ref_no ?? null,
        counterparty: partner || null,
        counterparty_account: txn.counterparty_account ?? null,
        memo: memo || null,
        matched_invoice_no: match_ref?.ref ?? null,
      },
    },
    reasoning: {
      summary: match_ref
        ? `Khoản tiền ${isIncoming ? "vào" : "ra"} ${VND(Math.abs(amount))} từ ${partner} khớp với ${match_ref.kind === "sales_invoice" ? "hoá đơn bán" : "hoá đơn mua"} ${match_ref.ref}.`
        : `Khoản tiền ${isIncoming ? "vào" : "ra"} ${VND(Math.abs(amount))} từ ${partner}. AI chưa khớp được hoá đơn — cần xác nhận đối ứng.`,
      signals,
    },
    match_ref,
    blocker,
    followups: [
      isIncoming
        ? `Tổng đã thu của ${partner}?`
        : `Tổng đã chi cho ${partner}?`,
      "Tại sao TK " + (lines[1].account === "112" ? lines[0].account : lines[1].account) + "?",
      "Áp dụng quy tắc này cho tương lai",
    ],
    href: "/bank/reconcile",
  };
}

// ============================================================
// AI insight passthrough
// ============================================================
export function buildInsightItem(insight: any): InboxItem {
  const md = (insight.metadata ?? {}) as any;
  const amount = Number(md.amount ?? md.total ?? 0);
  const partner = String(md.partner ?? md.party ?? "—");
  const sev = String(insight.severity ?? "info");
  const confidence = sev === "critical" ? 30 : sev === "warn" ? 55 : 70;
  return {
    id: `ai_insight:${insight.id}`,
    external_id: insight.id,
    source: "ai_insight",
    source_label: `AI cảnh báo · ${relativeTimeVi(insight.created_at)}`,
    source_short: "AI",
    title: insight.title ?? "Cảnh báo",
    subtitle: insight.body ?? insight.category,
    partner,
    amount,
    occurred_at: insight.created_at,
    confidence,
    confidence_band: bandOf(confidence),
    proposal: {
      description: insight.title ?? "Cảnh báo AI",
      entry_date: insight.created_at.slice(0, 10),
      lines: [],
      voucher_kind: "ai_insight",
      meta: {
        severity: insight.severity ?? null,
        category: insight.category ?? null,
        period: md.period ?? null,
        metric: md.metric ?? null,
        delta: md.delta ?? null,
      },
    },
    reasoning: {
      summary: insight.body ?? "AI đã phát hiện điểm cần xem.",
      signals: [
        {
          kind: sev === "critical" ? "warn" : "match",
          label: sev === "critical" ? "Mức độ: nghiêm trọng" : `Mức độ: ${sev}`,
          ok: sev !== "critical",
        },
      ],
    },
    blocker:
      sev === "critical"
        ? { reason: "Cần xem xét ngay", notified: "kế toán trưởng" }
        : undefined,
    followups: [
      "Hãy giải thích rõ hơn cho tôi",
      "Cho tôi dữ liệu liên quan",
      "Đánh dấu đã xem xét",
    ],
    href: insight.action_url ?? "/chat",
  };
}

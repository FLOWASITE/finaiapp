/** Shared (client + server) types for Sổ AI. No runtime code. */
export type ProposalLine = {
  account: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

export type VoucherKind =
  | "purchase_invoice"
  | "sales_invoice"
  | "bank_receipt"
  | "bank_payment"
  | "cash_receipt"
  | "cash_payment"
  | "ai_insight";

export type VoucherMeta = Record<string, string | number | null | undefined>;

export type ProposalItem = {
  name: string;
  qty?: number;
  unit_price?: number;
  amount: number;
};

export type Proposal = {
  description: string;
  entry_date: string;
  lines: ProposalLine[];
  voucher_kind?: VoucherKind;
  meta?: VoucherMeta;
  items?: ProposalItem[];
};

export type ReasoningSignal = {
  kind: "match" | "partner" | "pattern" | "memo" | "rule" | "warn";
  label: string;
  ok: boolean;
};

export type Reasoning = {
  summary: string;
  signals: ReasoningSignal[];
};

export type InboxSource =
  | "tct_einvoice"
  | "email_forward"
  | "bank_statement"
  | "cash"
  | "ai_insight"
  | "document";

export type ConfidenceBand = "high" | "medium" | "low";

export type ProcessingStatus =
  | "ocr_pending"
  | "ocr_failed"
  | "blocked"
  | "needs_review"
  | "ready"
  | "auto_ready"
  | "posted"
  | "skipped";

export type PostedVoucherRef = {
  kind: "sales_voucher" | "purchase_voucher";
  id: string;
  voucher_no: string;
};

export type MissingItemTypeGuess =
  | "goods"
  | "service"
  | "material"
  | "tool"
  | "asset_alloc"
  | "asset_tangible"
  | "asset_intangible";

export type MissingProductSuggestion = {
  name: string;
  /** AI-suggested item type (1 trong 7 loại). */
  item_type: MissingItemTypeGuess;
  /** Tài khoản kho/CP gợi ý kèm: 156/152/153/242/211/213/642... */
  account: string;
  /** 0..100 — độ tin cậy gợi ý. */
  confidence: number;
  /** Lý do ngắn để hiển thị tooltip. */
  reason?: string;
};

export type MissingMasterData = {
  customer?: string;
  customer_tax_id?: string;
  supplier?: string;
  supplier_tax_id?: string;
  products?: MissingProductSuggestion[];
};

export type InboxItem = {
  id: string;
  external_id: string;
  source: InboxSource;
  source_label: string;
  source_short: string;
  title: string;
  subtitle?: string;
  partner?: string;
  amount: number;
  occurred_at: string;
  confidence: number;
  confidence_band: ConfidenceBand;
  processing_status?: ProcessingStatus;
  proposal: Proposal;
  reasoning: Reasoning;
  match_ref?: { kind: "invoice" | "sales_invoice"; id: string; ref: string };
  blocker?: { reason: string; notified?: string };
  followups: string[];
  href?: string;
  posted_voucher?: PostedVoucherRef;
  missing?: MissingMasterData;
};

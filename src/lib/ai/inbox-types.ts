/** Shared (client + server) types for Inbox AI. No runtime code. */
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

export type ProposalItemResolution = {
  status: "auto" | "review" | "new" | "none";
  method?: "cache" | "fuzzy" | "none";
  best?: {
    product_id: string;
    code: string;
    name: string;
    unit?: string | null;
    score?: number;
    match_count?: number | null;
    unit_factor?: number | null;
  } | null;
  unit_converted?: {
    factor: number;
    from?: string | null;
    to?: string | null;
  } | null;
  candidates?: Array<{
    product_id: string;
    code: string;
    name: string;
    unit?: string | null;
    score?: number;
  }>;
};

export type ProposalItem = {
  name: string;
  qty?: number;
  unit?: string;
  unit_price?: number;
  amount: number;
  product_id?: string | null;
  resolution?: ProposalItemResolution | null;
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

/**
 * Một lựa chọn "mục đích chi" do KTV chọn từ Thư viện mục đích (Loại B).
 * Là nguồn sự thật điều khiển tài khoản Nợ + loại line khi tạo phiếu mua hàng.
 */
export type PurposeLineKind = "goods" | "material" | "ccdc" | "asset" | "service";

export type PurchasePurposeSelection = {
  /** Mã catalog Loại B: ví dụ "CP-TK-QUAKHACH". */
  code: string;
  /** Tên hiển thị (ngắn). */
  name: string;
  /** Nhóm: "PHUC_LOI_NV" | "TIEP_KHACH" | ... — cho group label. */
  group_code?: string;
  /** Tài khoản Nợ áp dụng (đã chọn TT99/TT133 cho tenant). */
  account: string;
  /** Loại line khi materialize phiếu mua hàng. */
  line_kind: PurposeLineKind;
  /** Cần xuất HĐ VAT đầu ra (quà tặng KH…). */
  needs_vat_output?: boolean;
  /** Cảnh báo TNDN ngắn để hiển thị banner. */
  tax_warning?: string;
};

/** Tập tài khoản debit mà mục đích mua hàng được phép thay thế khi swap. */
export const PURCHASE_PURPOSE_SWAPPABLE_ACCOUNTS = new Set([
  "156", "152", "153",
  "642", "6418", "6421", "6422", "6423", "6427", "6428",
  "627", "6271", "6273", "6278",
  "211", "213", "242", "811",
]);

/** Map line_kind → item_type khi tạo mặt hàng mới. */
export function lineKindToItemType(
  k: PurposeLineKind,
): MissingItemTypeGuess {
  switch (k) {
    case "goods": return "goods";
    case "material": return "material";
    case "ccdc": return "tool";
    case "asset": return "asset_tangible";
    case "service":
    default: return "service";
  }
}

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
  /** Mục đích chi (Loại B) KTV đã chọn — gửi kèm khi duyệt. */
  purchase_purpose?: PurchasePurposeSelection;
};

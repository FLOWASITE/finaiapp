/**
 * Types cho Agent Hạch toán — DTO chuẩn cho engine đề xuất bút toán.
 * Pure types, dùng cả client + server.
 */

export type ProposalSource =
  | "vendor_template"   // Bút toán mẫu của NCC đã học (≥3 lần)
  | "learned_lines"     // Tổng hợp từ ai_line_classifications (memory)
  | "classify_rule"     // Rule-based classifyLine
  | "ai_fallback"       // AI Gemini gen
  | "manual";           // KTT tự nhập

export type ProposalLine = {
  account_code: string;
  debit: number;
  credit: number;
  memo?: string;
  /** Tham chiếu về dòng hoá đơn gốc (nếu dòng này gom từ 1 line) */
  source_line_idx?: number;
};

export type ProposalEntry = {
  description: string;
  entry_date: string;        // yyyy-mm-dd
  lines: ProposalLine[];
  nature?: "goods" | "service" | "fixed_asset" | "ccdc" | "mixed";
};

export type ProposalWarning = {
  code: string;              // cat-001, cat-008, ...
  severity: "info" | "warn" | "error";
  message: string;
};

export type ProposalSignal = {
  label: string;
  weight: number;            // 0..100
  ok: boolean;
};

export type ProposalAlternative = {
  label: string;
  entries: ProposalEntry[];
  confidence: number;        // 0..1
  source: ProposalSource;
};

export type JournalProposalDTO = {
  invoice_id: string;
  source: ProposalSource;
  entries: ProposalEntry[];           // ≥1; tách nếu cat-009
  confidence: number;                  // 0..1, agg of lines
  warnings: ProposalWarning[];
  signals: ProposalSignal[];
  alternatives: ProposalAlternative[];
  /** Mã rule áp dụng (cat-001, vendor-template id, ...) */
  applied_rules: string[];
  /** Nếu agent.mode=auto và confidence≥threshold thì engine khuyến nghị auto-post */
  recommend_auto_post: boolean;
  generated_at: string;
};

export type BulkBucket = "auto" | "review" | "ask";

export type BulkItemKindGroup =
  | "purchase_invoice"
  | "sales_invoice"
  | "bank_statement"
  | "invoice_image"
  | "excel_unknown"
  | "other";

export type BulkItem = {
  /** Stable id for this item within the plan. */
  id: string;
  filename: string;
  mime: string;
  size: number;
  /** Detected document group. */
  group: BulkItemKindGroup;
  /** Kind passed to parseFileCore. */
  kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto";
  /** Bucket the AI assigned. */
  bucket: BulkBucket;
  /** Human-readable reason for the bucket assignment. */
  reason?: string;
  /** Confidence 0..1 from quick classification. */
  confidence: number;
  /** Upload id (already saved to ai_uploads) — used by bulk-run to re-parse. */
  uploadId: string | null;
  /** File hash — used for dedupe. */
  fileHash: string | null;
  /** When this item is dropped as duplicate, points at the original. */
  dupOf?: { filename?: string | null; uploadId?: string | null; reason: string };
};

export type BulkPlan = {
  /** Items kept (not duplicates). */
  items: BulkItem[];
  /** Items removed because they are exact duplicates of a previous upload. */
  duplicates: BulkItem[];
  /** Quick group counts for the intake table. */
  groupCounts: Record<BulkItemKindGroup, number>;
  /** Estimated total seconds to run "auto" bucket. */
  etaSec: number;
};

export type BulkRunUpdate = {
  total: number;
  done: number;
  posted: number;
  failed: number;
  /** Recent file names with status. */
  recent: { filename: string; status: "ok" | "fail" | "review"; message?: string }[];
  etaSec: number | null;
  finished?: boolean;
};

export type BulkSummary = {
  posted: number;
  review: number;
  ask: number;
  totalDebit?: number;
  totalCredit?: number;
  postedItems: { filename: string; refTable?: string; refId?: string }[];
  chainedFile?: { filename: string; uploadId: string | null; group: BulkItemKindGroup; hint: string };
};

export type ParsePhase = {
  name: "ocr" | "extract" | "partner_match" | "rules_check";
  label: string;
  ms: number | null;
};

export type ParseDocumentResult = {
  filename: string;
  kind: string;
  uploadId: string | null;
  parsed: any;
  parser: string | null;
  cached?: boolean;
  phases?: ParsePhase[];
  error?: string;
};

export type JournalLine = {
  side: "debit" | "credit";
  account: string;
  name: string;
  amount: number;
};

export type AppliedRule = {
  label: string;
  hitCount?: number;
  memoryId?: string;
};

export type Signal = {
  kind: "tax_id" | "partner" | "pattern" | "warn" | "confidence";
  label: string;
  ok: boolean;
};

export type ProposalCardData = {
  actionId: string;
  toolName: string;
  lines: JournalLine[];
  rule?: AppliedRule;
  signals: Signal[];
  callout?: string;
  summary?: string;
};

/** Shared (client + server) types for Sổ AI. No runtime code. */
export type ProposalLine = {
  account: string;
  debit?: number;
  credit?: number;
  memo?: string;
};

export type Proposal = {
  description: string;
  entry_date: string;
  lines: ProposalLine[];
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
  proposal: Proposal;
  reasoning: Reasoning;
  match_ref?: { kind: "invoice" | "sales_invoice"; id: string; ref: string };
  blocker?: { reason: string; notified?: string };
  followups: string[];
  href?: string;
};

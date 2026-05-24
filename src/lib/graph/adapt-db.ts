import type { Rule } from "@/types/rule";
import type { VendorEntity, AccountEntity } from "@/data/sampleEntities";
import type { GraphDbData, GraphRuleRow } from "./memory-graph.functions";
import { VAS_ACCOUNTS, accountName } from "./vas-accounts";

const ACCOUNT_CODE_RE = /\b([1-9][0-9]{2,3})\b/g;

function extractAccountCodes(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const re = new RegExp(ACCOUNT_CODE_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const code = m[1];
    // Only treat as account if it's in our VAS map OR follows "TK"/"tk"/"nợ"/"có" within 6 chars
    if (VAS_ACCOUNTS[code]) {
      out.add(code);
      continue;
    }
    const start = Math.max(0, m.index - 6);
    const prefix = text.slice(start, m.index).toLowerCase();
    if (/tk|nợ|no|có|co|account/i.test(prefix)) out.add(code);
  }
  return Array.from(out);
}

function rowToRule(r: GraphRuleRow): Rule {
  const mode: Rule["mode"] =
    r.type === "active" ? "auto" : r.type === "suggestion" ? "suggest" : "disabled";
  const status: Rule["status"] = r.type === "disabled" ? "paused" : "active";
  return {
    id: r.id,
    name: r.title,
    description: [r.when_text, r.then_text].filter(Boolean).join(" → "),
    conditions: Array.isArray(r.conditions) ? r.conditions : [],
    actions: Array.isArray(r.actions) ? r.actions : [],
    confidence_threshold: 0.8,
    mode,
    applies_to: "future",
    enabled: r.type !== "disabled",
    source: r.source === "user-taught" ? "user_taught" : "ai_learned",
    created_by: "system",
    created_at: new Date().toISOString(),
    applied_count: r.applied_count ?? 0,
    correct_count: r.accuracy_correct ?? 0,
    last_used: r.last_used_at ?? undefined,
    status,
    version: r.schema_version ?? 1,
  };
}

/** Trích mã TK từ structured actions v2 (book.account_debit/credit). */
function extractAccountsFromActions(actions: GraphRuleRow["actions"]): string[] {
  if (!Array.isArray(actions)) return [];
  const out = new Set<string>();
  for (const a of actions) {
    if (a?.type === "book") {
      const d = a.params?.account_debit;
      const c = a.params?.account_credit;
      if (typeof d === "string" && d) out.add(d);
      if (typeof c === "string" && c) out.add(c);
    }
  }
  return Array.from(out);
}

/** Trích từ khoá vendor từ structured conditions v2 (vendor.name equals/contains/in). */
function extractVendorTermsFromConditions(conditions: GraphRuleRow["conditions"]): string[] {
  if (!Array.isArray(conditions)) return [];
  const out: string[] = [];
  for (const c of conditions) {
    if (c?.field !== "vendor.name") continue;
    const v = c.value;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") out.push(x);
  }
  return out;
}

export type ExtraEdge = {
  id: string;
  source: string; // vendor:{id}
  target: string; // account:{id}
  kind: "partner-default" | "classification";
  label?: string;
  weight: number;
};

export type AdaptedGraphInput = {
  rules: Rule[];
  vendors: VendorEntity[];
  accounts: AccountEntity[];
  extraEdges: ExtraEdge[];
  ruleAccountHints: Map<string, string[]>; // ruleId -> account codes from text
  ruleVendorHints: Map<string, string[]>; // ruleId -> vendor ids from fuzzy match
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function adaptDbToGraph(input: GraphDbData): AdaptedGraphInput {
  const rules = input.rules.map(rowToRule);

  const vendors: VendorEntity[] = input.suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    tax_id: s.tax_id ?? undefined,
    industry: s.industry_code ?? undefined,
  }));

  // Collect account codes
  const accountSet = new Set<string>();
  for (const s of input.suppliers) {
    if (s.default_expense_account) accountSet.add(s.default_expense_account);
  }
  for (const p of input.partners) {
    if (p.default_account) accountSet.add(p.default_account);
  }
  for (const c of input.classifications) {
    if (c.account) accountSet.add(c.account);
  }

  const ruleAccountHints = new Map<string, string[]>();
  for (const r of input.rules) {
    const codes = [
      ...extractAccountCodes(r.when_text),
      ...extractAccountCodes(r.then_text),
    ];
    for (const c of codes) accountSet.add(c);
    if (codes.length) ruleAccountHints.set(r.id, Array.from(new Set(codes)));
  }

  const accounts: AccountEntity[] = Array.from(accountSet)
    .sort()
    .map((code) => ({ id: `a-${code}`, code, name: accountName(code) }));

  // Fuzzy vendor matching against rule titles + when_text
  const vendorIndex = vendors.map((v) => ({ v, norm: normalize(v.name) }));
  const ruleVendorHints = new Map<string, string[]>();
  for (const r of input.rules) {
    const hay = normalize(`${r.title} ${r.when_text}`);
    const matched: string[] = [];
    for (const { v, norm } of vendorIndex) {
      if (!norm || norm.length < 3) continue;
      if (hay.includes(norm)) matched.push(v.id);
    }
    if (matched.length) ruleVendorHints.set(r.id, matched);
  }

  // Extra edges
  const extraEdges: ExtraEdge[] = [];
  const seen = new Set<string>();
  for (const p of input.partners) {
    if (!p.party_id || !p.default_account) continue;
    const id = `partner:${p.party_id}->${p.default_account}`;
    if (seen.has(id)) continue;
    seen.add(id);
    extraEdges.push({
      id,
      source: `vendor:${p.party_id}`,
      target: `account:a-${p.default_account}`,
      kind: "partner-default",
      label: "mặc định",
      weight: 2,
    });
  }
  for (const c of input.classifications) {
    if (!c.supplier_id || !c.account) continue;
    const id = `class:${c.supplier_id}->${c.account}`;
    if (seen.has(id)) continue;
    seen.add(id);
    extraEdges.push({
      id,
      source: `vendor:${c.supplier_id}`,
      target: `account:a-${c.account}`,
      kind: "classification",
      label: c.line_name?.slice(0, 24),
      weight: Math.min(3, 1 + Math.log10(1 + (c.hit_count ?? 0))),
    });
  }

  return { rules, vendors, accounts, extraEdges, ruleAccountHints, ruleVendorHints };
}

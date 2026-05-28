// Rule engine — match conditions của ai_memory_rules với context của một phiếu
// đang được Inbox AI đề xuất hạch toán, rồi áp các action (mode='auto') hoặc
// gắn nhãn gợi ý (mode='suggest'). Mọi lần match đều ghi vào ai_rule_applications
// để Trí nhớ AI hiển thị lịch sử và tính độ chính xác.

import type { RuleAction, RuleCondition, RuleConditionField, RuleOperator } from "@/types/rule";

export type RuleEvalContext = {
  vendor?: { name?: string | null; tax_id?: string | null; industry_code?: string | null };
  amount?: number | null;
  amount_before_tax?: number | null;
  description?: string | null;
  memo?: string | null;
  transaction_type?: string | null; // purchase / sale / payment …
  date?: string | null; // ISO date
  source_account?: string | null;
  currency?: string | null;
  doc_type?: string | null; // purchase_invoice, sales_invoice…
  line_count?: number | null;
  category_predicted?: string | null; // goods/service/fixed_asset/...
};

type LoadedRule = {
  id: string;
  mode: "auto" | "suggest" | "learn_only" | "disabled";
  confidence_threshold: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  title: string;
  then_text: string;
};

function getFieldValue(ctx: RuleEvalContext, field: RuleConditionField): unknown {
  switch (field) {
    case "vendor.name": return ctx.vendor?.name ?? null;
    case "vendor.tax_id": return ctx.vendor?.tax_id ?? null;
    case "vendor.industry_code": return ctx.vendor?.industry_code ?? null;
    case "amount": return ctx.amount ?? null;
    case "amount.before_tax": return ctx.amount_before_tax ?? null;
    case "description": return ctx.description ?? null;
    case "memo": return ctx.memo ?? null;
    case "transaction_type": return ctx.transaction_type ?? null;
    case "date": return ctx.date ?? null;
    case "source_account": return ctx.source_account ?? null;
    case "currency": return ctx.currency ?? null;
    case "doc_type": return ctx.doc_type ?? null;
    case "line_count": return ctx.line_count ?? null;
    case "category.predicted": return ctx.category_predicted ?? null;
    default: return null;
  }
}

function asString(v: unknown): string {
  return v == null ? "" : String(v).toLowerCase().trim();
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function evalOp(actual: unknown, op: RuleOperator, expected: unknown): boolean {
  switch (op) {
    case "equals": return asString(actual) === asString(expected);
    case "not_equals": return asString(actual) !== asString(expected);
    case "contains": return asString(actual).includes(asString(expected));
    case "not_contains": return !asString(actual).includes(asString(expected));
    case "starts_with": return asString(actual).startsWith(asString(expected));
    case "ends_with": return asString(actual).endsWith(asString(expected));
    case "in": {
      const arr = Array.isArray(expected) ? expected.map(asString) : [asString(expected)];
      return arr.includes(asString(actual));
    }
    case "not_in": {
      const arr = Array.isArray(expected) ? expected.map(asString) : [asString(expected)];
      return !arr.includes(asString(actual));
    }
    case "greater_than": {
      const a = asNumber(actual); const e = asNumber(expected);
      return a != null && e != null && a > e;
    }
    case "less_than": {
      const a = asNumber(actual); const e = asNumber(expected);
      return a != null && e != null && a < e;
    }
    case "between": {
      const a = asNumber(actual);
      if (a == null || !Array.isArray(expected) || expected.length !== 2) return false;
      const [lo, hi] = expected.map(asNumber);
      return lo != null && hi != null && a >= lo && a <= hi;
    }
    case "matches_pattern": {
      try { return new RegExp(String(expected), "i").test(asString(actual)); }
      catch { return false; }
    }
    case "is_empty": return asString(actual) === "";
    case "is_not_empty": return asString(actual) !== "";
    default: return false;
  }
}

export function evaluateRule(rule: LoadedRule, ctx: RuleEvalContext): boolean {
  if (rule.conditions.length === 0) return false;
  let result = true;
  for (let i = 0; i < rule.conditions.length; i++) {
    const c = rule.conditions[i];
    const ok = evalOp(getFieldValue(ctx, c.field), c.operator, c.value);
    if (i === 0) { result = ok; continue; }
    if (c.logic === "OR") result = result || ok;
    else result = result && ok;
  }
  return result;
}

export type RuleMatch = {
  rule: LoadedRule;
  isAuto: boolean;
};

export async function loadActiveRules(
  supabase: any,
  tenantId: string,
): Promise<LoadedRule[]> {
  const { data, error } = await supabase
    .from("ai_memory_rules")
    .select("id,mode,confidence_threshold,conditions,actions,title,then_text")
    .eq("tenant_id", tenantId)
    .eq("type", "active")
    .eq("enabled", true)
    .in("mode", ["auto", "suggest"]);
  if (error) {
    console.error("[loadActiveRules] failed", error.message);
    return [];
  }
  return (data ?? []) as LoadedRule[];
}

export function applyRules(
  rules: LoadedRule[],
  ctx: RuleEvalContext,
): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const r of rules) {
    if (evaluateRule(r, ctx)) {
      out.push({ rule: r, isAuto: r.mode === "auto" });
    }
  }
  return out;
}

/** Trích override hạch toán đầu tiên từ danh sách rules đã match (mode=auto). */
export function pickAutoBookOverride(matches: RuleMatch[]): {
  account_debit?: string;
  account_credit?: string;
  note?: string;
  rule_id?: string;
} | null {
  for (const m of matches) {
    if (!m.isAuto) continue;
    const book = m.rule.actions.find((a) => a.type === "book");
    if (book) {
      return {
        account_debit: book.params.account_debit,
        account_credit: book.params.account_credit,
        note: book.params.note,
        rule_id: m.rule.id,
      };
    }
  }
  return null;
}

/** Ghi nhận việc áp dụng rule vào ai_rule_applications và bump metrics. */
export async function recordRuleApplications(
  supabase: any,
  opts: {
    tenantId: string;
    userId: string;
    matches: RuleMatch[];
    documentTable: string;
    documentId: string;
    documentLabel: string;
    journalEntryId?: string | null;
    journalCode?: string | null;
  },
): Promise<{ application_ids: Record<string, string> }> {
  const { tenantId, userId, matches, documentTable, documentId, documentLabel, journalEntryId, journalCode } = opts;
  const application_ids: Record<string, string> = {};
  if (matches.length === 0) return { application_ids };

  const rows = matches.map((m) => ({
    tenant_id: tenantId,
    rule_id: m.rule.id,
    applied_by: userId,
    document_table: documentTable,
    document_id: documentId,
    document_label: documentLabel,
    journal_entry_id: journalEntryId ?? null,
    journal_code: journalCode ?? null,
    then_snapshot: m.rule.then_text || m.rule.title,
    ai_log: { mode: m.rule.mode, auto: m.isAuto },
    status: "applied",
    source_kind: "rule",
    source_id: m.rule.id,
  }));

  const { data, error } = await supabase
    .from("ai_rule_applications")
    .insert(rows)
    .select("id, rule_id");
  if (error) {
    console.error("[recordRuleApplications] insert failed", error.message);
    return { application_ids };
  }
  for (const row of data ?? []) application_ids[row.rule_id] = row.id;

  // Bump applied_count + last_used_at (không tăng accuracy_total — chỉ tăng khi có outcome)
  await Promise.all(
    matches.map((m) =>
      supabase.rpc("bump_rule_metrics", { _rule_id: m.rule.id, _correct: null }),
    ),
  );
  return { application_ids };
}

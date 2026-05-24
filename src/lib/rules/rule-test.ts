// Mock simulator — chạy rule trên fake transactions 30 ngày qua.
// Phase 1: pseudo-deterministic dựa vào hash(rule.id) để demo ổn định.
import type { Rule } from "@/types/rule";

export type SimSampleTxn = {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  current_account: string;
  proposed_account: string;
  matches: boolean;
};

export type RuleTestResult = {
  matched_count: number;
  would_book_correctly: number;
  would_change: number;
  would_conflict_with_other_rules: number;
  samples: SimSampleTxn[];
  warnings: string[];
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function simulateRule(rule: Rule, otherRules: Rule[] = []): RuleTestResult {
  const seed = hashStr(rule.id + ":" + rule.conditions.length + ":" + rule.confidence_threshold.toFixed(2));
  const baseMatch = Math.max(
    0,
    Math.round((150 - rule.conditions.length * 25) * (1.1 - rule.confidence_threshold)),
  );
  const matched = baseMatch + (seed % 12);

  const wrong = Math.round(matched * (1 - rule.confidence_threshold) * 0.3);
  const correct = Math.max(0, matched - wrong);
  const conflicts = otherRules.filter((r) => r.id !== rule.id && r.enabled).length > 0
    ? Math.min(matched, seed % 4)
    : 0;

  const warnings: string[] = [];
  if (rule.confidence_threshold >= 0.99 && matched === 0) {
    warnings.push("Ngưỡng quá nghiêm — không match giao dịch nào. Cân nhắc hạ xuống 85%.");
  }
  if (conflicts > 0) {
    warnings.push(`${conflicts} giao dịch conflict với quy tắc khác đang chạy.`);
  }

  const samples: SimSampleTxn[] = Array.from({ length: Math.min(5, matched) }).map((_, i) => {
    const debit =
      rule.actions.find((a) => a.type === "book")?.params.account_debit ?? "642";
    return {
      id: `sim-${rule.id}-${i}`,
      date: new Date(Date.now() - (i + 1) * 86400000 * 2).toISOString().slice(0, 10),
      vendor: ["Grab", "Highlands", "VNPT", "Vinaphone", "Cty ABC"][i % 5],
      amount: 150000 + ((seed + i * 99) % 9) * 250000,
      current_account: "642",
      proposed_account: debit,
      matches: i !== 2,
    };
  });

  return {
    matched_count: matched,
    would_book_correctly: correct - conflicts,
    would_change: wrong,
    would_conflict_with_other_rules: conflicts,
    samples,
    warnings,
  };
}

export function estimateAppliedCount(rule: Rule): number {
  // Ước tính nhanh không cần samples
  return simulateRule(rule).matched_count;
}

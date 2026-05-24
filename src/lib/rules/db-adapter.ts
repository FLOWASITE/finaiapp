// Adapter: MemoryRule (DB) ↔ Rule (v2 UI types).
import type { MemoryRule } from "@/lib/ai-memory.functions";
import type {
  Rule,
  RuleAction,
  RuleCondition,
  RuleMode,
  RuleSource,
  RuleStatus,
} from "@/types/rule";

export function memoryRuleToRule(r: MemoryRule): Rule {
  const source: RuleSource =
    r.source === "user-taught" ? "user_taught" : "ai_learned";
  const mode: RuleMode = r.mode ?? (r.type === "active" ? "auto" : r.type === "suggestion" ? "suggest" : "disabled");
  const status: RuleStatus =
    r.status ?? (r.type === "disabled" ? "paused" : r.type === "suggestion" ? "draft" : "active");
  return {
    id: r.id,
    name: r.title,
    description: r.when_text && r.then_text ? `${r.when_text} → ${r.then_text}` : r.when_text || r.then_text || "",
    conditions: (Array.isArray(r.conditions) ? r.conditions : []) as RuleCondition[],
    actions: (Array.isArray(r.actions) ? r.actions : []) as RuleAction[],
    confidence_threshold: r.confidence_threshold ?? 0.8,
    mode,
    applies_to: r.applies_to ?? "future",
    enabled: r.enabled ?? r.type !== "disabled",
    source,
    created_by: "user",
    created_at: r.created_at,
    learned_from: r.origin ?? undefined,
    applied_count: r.applied_count ?? 0,
    correct_count: r.accuracy_correct ?? 0,
    last_used: r.last_used_at ?? undefined,
    status,
    paused_reason: r.disable_reason ?? undefined,
    version: r.schema_version ?? 1,
  };
}

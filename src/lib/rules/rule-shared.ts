// Zod schemas + helpers chia sẻ giữa server fn và UI cho Rule v2.
import { z } from "zod";
import type {
  RuleAction,
  RuleActionType,
  RuleCondition,
  RuleConditionField,
  RuleMode,
  RuleOperator,
  RuleStatus,
} from "@/types/rule";

const CONDITION_FIELDS: RuleConditionField[] = [
  "vendor.name",
  "vendor.tax_id",
  "vendor.industry_code",
  "amount",
  "amount.before_tax",
  "description",
  "memo",
  "transaction_type",
  "date",
  "day_of_week",
  "time_of_day",
  "source_account",
  "currency",
  "doc_type",
  "passenger.dept",
  "trip.purpose",
  "line_count",
  "category.predicted",
];

const OPERATORS: RuleOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "in",
  "not_in",
  "greater_than",
  "less_than",
  "between",
  "matches_pattern",
  "is_empty",
  "is_not_empty",
];

const ACTION_TYPES: RuleActionType[] = ["book", "tag", "notify", "flag", "skip", "set_field"];

export const ruleConditionSchema = z.object({
  id: z.string().min(1),
  logic: z.enum(["AND", "OR"]).optional(),
  field: z.enum(CONDITION_FIELDS as [RuleConditionField, ...RuleConditionField[]]),
  operator: z.enum(OPERATORS as [RuleOperator, ...RuleOperator[]]),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.tuple([z.number(), z.number()]),
  ]),
});

export const ruleActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ACTION_TYPES as [RuleActionType, ...RuleActionType[]]),
  params: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
    )
    .default({}),
});

export const ruleModeSchema = z.enum(["auto", "suggest", "learn_only", "disabled"]);
export const ruleStatusSchema = z.enum(["active", "paused", "disabled", "draft"]);
export const appliesToSchema = z.enum(["future", "retroactive"]);

export const ruleV2PartialSchema = z.object({
  conditions: z.array(ruleConditionSchema).max(20).optional(),
  actions: z.array(ruleActionSchema).max(20).optional(),
  mode: ruleModeSchema.optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  applies_to: appliesToSchema.optional(),
  enabled: z.boolean().optional(),
  status: ruleStatusSchema.optional(),
});

export type RuleV2Patch = z.infer<typeof ruleV2PartialSchema>;

/** Render conditions + actions → đoạn tóm tắt human-readable (làm fallback when_text/then_text). */
export function renderConditions(conds: RuleCondition[]): string {
  if (!conds.length) return "";
  return conds
    .map((c, i) => {
      const prefix = i === 0 ? "" : `${c.logic ?? "AND"} `;
      const v = Array.isArray(c.value) ? `[${c.value.join(",")}]` : JSON.stringify(c.value);
      return `${prefix}${c.field} ${c.operator} ${v}`;
    })
    .join(" ");
}

export function renderActions(actions: RuleAction[]): string {
  if (!actions.length) return "";
  return actions
    .map((a) => {
      if (a.type === "book") {
        const d = a.params.account_debit ?? "?";
        const c = a.params.account_credit ?? "?";
        return `Nợ ${d} / Có ${c}`;
      }
      if (a.type === "tag") {
        const parts: string[] = [];
        if (a.params.department) parts.push(`phòng ban "${a.params.department}"`);
        if (a.params.project) parts.push(`dự án "${a.params.project}"`);
        return `Gắn ${parts.join(", ") || "thẻ"}`;
      }
      if (a.type === "notify") return `Thông báo: ${a.params.message_template ?? ""}`;
      if (a.type === "flag") return `Đánh dấu chờ duyệt`;
      if (a.type === "skip") return `Bỏ qua`;
      if (a.type === "set_field") return `Đặt ${a.params.field} = ${String(a.params.value ?? "")}`;
      return a.type;
    })
    .join("; ");
}

export type MemoryRowV2 = {
  conditions: RuleCondition[];
  actions: RuleAction[];
  mode: RuleMode;
  confidence_threshold: number;
  applies_to: "future" | "retroactive";
  enabled: boolean;
  status: RuleStatus;
  schema_version: number;
};

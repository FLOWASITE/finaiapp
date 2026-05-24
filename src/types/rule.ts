// IF/AND/OR/THEN rule types — Phase 1 prototype, mock data only.

export type RuleConditionField =
  | "vendor.name"
  | "vendor.tax_id"
  | "vendor.industry_code"
  | "amount"
  | "amount.before_tax"
  | "description"
  | "memo"
  | "transaction_type"
  | "date"
  | "day_of_week"
  | "time_of_day"
  | "source_account"
  | "currency"
  | "doc_type"
  | "passenger.dept"
  | "trip.purpose"
  | "line_count"
  | "category.predicted";

export type RuleOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "in"
  | "not_in"
  | "greater_than"
  | "less_than"
  | "between"
  | "matches_pattern"
  | "is_empty"
  | "is_not_empty";

export type RuleConditionValue =
  | string
  | number
  | string[]
  | [number, number];

export type RuleCondition = {
  id: string;
  logic?: "AND" | "OR";
  field: RuleConditionField;
  operator: RuleOperator;
  value: RuleConditionValue;
};

export type RuleActionType =
  | "book"
  | "tag"
  | "notify"
  | "flag"
  | "skip"
  | "set_field";

export type RuleActionParams = {
  // book
  account_debit?: string;
  account_credit?: string;
  note?: string;
  // tag
  department?: string;
  project?: string;
  custom_tags?: string[];
  // notify
  channel?: "zalo" | "email" | "in_app";
  target?: string;
  message_template?: string;
  when_condition?: string;
  // set_field
  field?: string;
  value?: string | number | boolean | null;
};

export type RuleAction = {
  id: string;
  type: RuleActionType;
  params: RuleActionParams;
};

export type RuleMode = "auto" | "suggest" | "learn_only" | "disabled";
export type RuleSource = "ai_learned" | "user_taught" | "template" | "system";
export type RuleStatus = "active" | "paused" | "disabled" | "draft";

export type Rule = {
  id: string;
  name: string;
  description?: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  confidence_threshold: number;
  mode: RuleMode;
  applies_to: "future" | "retroactive";
  enabled: boolean;
  source: RuleSource;
  created_by: string;
  created_at: string;
  learned_from?: string;
  applied_count: number;
  correct_count: number;
  last_used?: string;
  status: RuleStatus;
  paused_reason?: string;
  version: number;
  previous_version_id?: string;
};

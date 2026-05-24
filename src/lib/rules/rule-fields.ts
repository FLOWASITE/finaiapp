import type { RuleConditionField, RuleOperator } from "@/types/rule";

export type FieldType = "text" | "number" | "enum" | "date" | "currency";

export type FieldMeta = {
  key: RuleConditionField;
  label: string;
  group: string;
  type: FieldType;
  enumOptions?: { value: string; label: string }[];
};

export const FIELDS: FieldMeta[] = [
  { key: "vendor.name", label: "Tên NCC / KH", group: "Đối tác", type: "text" },
  { key: "vendor.tax_id", label: "MST đối tác", group: "Đối tác", type: "text" },
  { key: "vendor.industry_code", label: "Ngành nghề (VSIC)", group: "Đối tác", type: "text" },
  { key: "amount", label: "Số tiền (có VAT)", group: "Số tiền", type: "currency" },
  { key: "amount.before_tax", label: "Số tiền (chưa VAT)", group: "Số tiền", type: "currency" },
  { key: "currency", label: "Loại tiền", group: "Số tiền", type: "text" },
  { key: "description", label: "Diễn giải", group: "Nội dung", type: "text" },
  { key: "memo", label: "Memo / nội dung CK", group: "Nội dung", type: "text" },
  { key: "date", label: "Ngày chứng từ", group: "Thời gian", type: "date" },
  {
    key: "day_of_week",
    label: "Thứ trong tuần",
    group: "Thời gian",
    type: "enum",
    enumOptions: [
      { value: "mon", label: "Thứ 2" },
      { value: "tue", label: "Thứ 3" },
      { value: "wed", label: "Thứ 4" },
      { value: "thu", label: "Thứ 5" },
      { value: "fri", label: "Thứ 6" },
      { value: "sat", label: "Thứ 7" },
      { value: "sun", label: "Chủ nhật" },
    ],
  },
  { key: "time_of_day", label: "Khung giờ", group: "Thời gian", type: "text" },
  { key: "source_account", label: "Tài khoản nguồn", group: "Tài khoản", type: "text" },
  {
    key: "doc_type",
    label: "Loại chứng từ",
    group: "Tài khoản",
    type: "enum",
    enumOptions: [
      { value: "invoice", label: "Hóa đơn bán" },
      { value: "bill", label: "Hóa đơn mua" },
      { value: "payment", label: "Phiếu thu/chi" },
      { value: "bank_txn", label: "GD ngân hàng" },
    ],
  },
  {
    key: "transaction_type",
    label: "Loại GD",
    group: "Tài khoản",
    type: "enum",
    enumOptions: [
      { value: "income", label: "Thu" },
      { value: "expense", label: "Chi" },
    ],
  },
  { key: "passenger.dept", label: "Phòng ban người đi", group: "Đặc thù VN", type: "text" },
  { key: "trip.purpose", label: "Mục đích chuyến đi", group: "Đặc thù VN", type: "text" },
  { key: "line_count", label: "Số dòng HĐ", group: "Đặc thù VN", type: "number" },
  { key: "category.predicted", label: "Danh mục AI dự đoán", group: "AI", type: "text" },
];

export const FIELDS_BY_KEY: Record<RuleConditionField, FieldMeta> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
) as Record<RuleConditionField, FieldMeta>;

const TEXT_OPS: RuleOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches_pattern",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
];
const NUM_OPS: RuleOperator[] = [
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "between",
];
const ENUM_OPS: RuleOperator[] = ["equals", "not_equals", "in", "not_in"];
const DATE_OPS: RuleOperator[] = ["equals", "greater_than", "less_than", "between"];

export function operatorsFor(type: FieldType): RuleOperator[] {
  switch (type) {
    case "text":
      return TEXT_OPS;
    case "number":
    case "currency":
      return NUM_OPS;
    case "enum":
      return ENUM_OPS;
    case "date":
      return DATE_OPS;
  }
}

export const OPERATOR_LABEL: Record<RuleOperator, string> = {
  equals: "bằng",
  not_equals: "khác",
  contains: "chứa",
  not_contains: "không chứa",
  starts_with: "bắt đầu",
  ends_with: "kết thúc",
  in: "thuộc",
  not_in: "không thuộc",
  greater_than: ">",
  less_than: "<",
  between: "trong khoảng",
  matches_pattern: "khớp regex",
  is_empty: "trống",
  is_not_empty: "không trống",
};

export const FIELD_GROUPS = Array.from(new Set(FIELDS.map((f) => f.group)));

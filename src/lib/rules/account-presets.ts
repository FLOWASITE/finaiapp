// Danh mục tài khoản kế toán dùng phổ biến cho hành động "Hạch toán" (book)
// trong Quy tắc hạch toán của Trí nhớ AI. Theo project-knowledge của FinAI.

export type AccountPreset = {
  code: string;
  label: string;
  group: "stock" | "asset" | "expense" | "payable" | "vat" | "other";
};

export const DEBIT_ACCOUNT_PRESETS: AccountPreset[] = [
  { code: "152", label: "152 — Nguyên vật liệu", group: "stock" },
  { code: "153", label: "153 — Công cụ dụng cụ", group: "stock" },
  { code: "156", label: "156 — Hàng hóa", group: "stock" },
  { code: "211", label: "211 — Tài sản cố định hữu hình", group: "asset" },
  { code: "213", label: "213 — Tài sản cố định vô hình", group: "asset" },
  { code: "242", label: "242 — Chi phí trả trước (phân bổ)", group: "asset" },
  { code: "627", label: "627 — Chi phí sản xuất chung", group: "expense" },
  { code: "641", label: "641 — Chi phí bán hàng", group: "expense" },
  { code: "642", label: "642 — Chi phí quản lý doanh nghiệp", group: "expense" },
];

export const CREDIT_ACCOUNT_PRESETS: AccountPreset[] = [
  { code: "331", label: "331 — Phải trả người bán", group: "payable" },
  { code: "111", label: "111 — Tiền mặt", group: "other" },
  { code: "112", label: "112 — Tiền gửi ngân hàng", group: "other" },
  { code: "141", label: "141 — Tạm ứng", group: "other" },
];

export function accountLabel(code: string): string {
  const all = [...DEBIT_ACCOUNT_PRESETS, ...CREDIT_ACCOUNT_PRESETS];
  return all.find((a) => a.code === code)?.label ?? code;
}

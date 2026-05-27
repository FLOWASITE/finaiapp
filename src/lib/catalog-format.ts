import { AllocationMethod, Amortization, Frequency } from "@/types/catalog";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  yearly: "Hàng năm",
  "one-time": "Một lần",
  adhoc: "Không định kỳ",
  daily: "Hàng ngày",
};

export const AMORTIZATION_LABEL: Record<Amortization, string> = {
  expense_immediately: "Ghi nhận chi phí ngay",
  prepaid_short: "Trả trước ngắn hạn (≤ 12 tháng)",
  prepaid_long: "Trả trước dài hạn (> 12 tháng)",
};

export const ALLOCATION_LABEL: Record<AllocationMethod, string> = {
  single: "Một bộ phận duy nhất",
  manual_split: "Chia thủ công",
  percent: "Theo tỉ lệ %",
  headcount: "Theo nhân sự",
  area: "Theo diện tích",
};

export function formatVat(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

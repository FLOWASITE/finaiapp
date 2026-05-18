import type { QueryClient } from "@tanstack/react-query";

/**
 * Bộ helper invalidation tập trung — gọi sau khi mutation thành công để
 * mọi `useQuery` liên quan tự refetch, tránh tình trạng dữ liệu nhìn vẫn
 * cũ do staleTime dài ở `QUERY_PRESETS.REPORT` / `REFERENCE`.
 *
 * Nguyên tắc:
 * - Chỉ invalidate (đánh dấu stale) chứ không refetchQueries() — React
 *   Query sẽ chỉ refetch các query đang được mount, không tốn request thừa.
 * - Các key ở đây phải bao quát toàn bộ chỗ đang dùng trong app. Khi thêm
 *   một queryKey mới ảnh hưởng tới sổ sách / danh mục, nhớ cập nhật danh
 *   sách dưới đây.
 */

/** Danh mục tham chiếu kế toán (dimensions) — picker và trang Cài đặt
 *  đang dùng key khác nhau (vd. "branches" vs "dim-branches"). */
export type DimensionKind = "branch" | "department" | "project" | "cost_center";

const DIM_KEYS: Record<DimensionKind, string[]> = {
  branch: ["branches", "dim-branches"],
  department: ["departments", "dim-departments"],
  project: ["projects", "dim-projects"],
  cost_center: ["cost-centers", "dim-cost-centers"],
};

export function invalidateDimensions(qc: QueryClient, kind?: DimensionKind) {
  const kinds = kind ? [kind] : (Object.keys(DIM_KEYS) as DimensionKind[]);
  for (const k of kinds) {
    for (const key of DIM_KEYS[k]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  }
}

/** Khách hàng / nhà cung cấp — đồng bộ list page, combobox, party-group. */
export function invalidateParty(qc: QueryClient, kind: "customer" | "supplier") {
  const root = kind === "customer" ? "customers" : "suppliers";
  qc.invalidateQueries({ queryKey: [root] });
  qc.invalidateQueries({ queryKey: [`${root}-stats`] });
  qc.invalidateQueries({ queryKey: ["party-groups", kind] });
  qc.invalidateQueries({ queryKey: [kind] }); // ["customer", id] / ["supplier", id]
}

/**
 * Sổ sách & báo cáo phụ thuộc journal_lines. Gọi sau mọi mutation tạo /
 * sửa / xoá bút toán (hoá đơn, phiếu thu/chi, ngân hàng, khấu hao, lương,
 * điều chỉnh kho, v.v.).
 *
 * Bao gồm cả các báo cáo TT133/TT200 và dashboard tổng quan.
 */
const LEDGER_KEYS = [
  // Sổ chi tiết / nhật ký
  "journal",
  "gl", "al", "tb",
  // Báo cáo tài chính TT133/TT200
  "bs99", "is99", "cf99", "notes99",
  // Dashboards
  "dashboard-overview",
  "sales-dashboard",
  "purchases-dashboard",
  // Công nợ
  "receivables", "payables-stats",
  "outstanding-invoices", "outstanding-purchase-invoices",
  // Sổ quỹ / ngân hàng
  "cashbook",
  "bank-accounts", "bank-book",
  // Kho
  "stock-card", "inventory-movements",
];

export function invalidateLedgers(qc: QueryClient) {
  for (const key of LEDGER_KEYS) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

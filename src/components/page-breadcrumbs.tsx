import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

// Maps URL segment to a human label. Keep in sync with src/routes/_app/*.
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Bảng điều khiển",
  chat: "Trợ lý AI",
  setup: "Thiết lập",
  einvoices: "Hóa đơn điện tử",
  credentials: "Chứng thư số",
  documents: "Trung tâm tài liệu",
  invoices: "Hóa đơn",
  sales: "Bán hàng",
  orders: "Đơn hàng",
  "sales-dashboard": "Dashboard bán hàng",
  purchases: "Mua hàng",
  receipts: "Phiếu thu",
  customers: "Khách hàng",
  suppliers: "Nhà cung cấp",
  receivables: "Phải thu",
  payables: "Phải trả",
  inventory: "Kho",
  categories: "Nhóm hàng",
  movements: "Xuất nhập kho",
  bank: "Ngân hàng",
  cash: "Tiền mặt",
  assets: "Tài sản cố định",
  allocations: "Phân bổ",
  payroll: "Lương",
  tax: "Thuế",
  gtgt: "Thuế GTGT",
  tncn: "Thuế TNCN",
  tndn: "Thuế TNDN",
  reports: "Báo cáo",
  ledgers: "Sổ cái",
  journal: "Sổ nhật ký",
  coa: "Hệ thống tài khoản",
  settings: "Cài đặt",
  admin: "Quản trị",
  members: "Thành viên",
  periods: "Kỳ kế toán",
  audit: "Nhật ký",
  backup: "Sao lưu",
  superadmin: "Super Admin",
  organizations: "Tổ chức",
  accounts: "Tài khoản",
  tenant: "Đơn vị",
  items: "Hàng hoá & Dịch vụ",
  units: "Đơn vị tính",
  "stock-card": "Thẻ kho",
  "stock-takes": "Kiểm kê",
  warehouses: "Danh mục kho",
};

type Crumb = { label: string; href: string; last: boolean };

function useCrumbs(): Crumb[] {
  const matches = useMatches();
  const crumbs: Crumb[] = [];

  for (const m of matches) {
    if (m.routeId === "__root__" || m.pathname === "/" || m.pathname === "") continue;
    const href = m.pathname.replace(/\/$/, "") || "/";
    const segments = href.split("/").filter(Boolean);
    const lastSeg = segments[segments.length - 1] ?? "";

    const staticCrumb = (m as unknown as { staticData?: { crumb?: string } }).staticData?.crumb;
    const paramValues = Object.values((m.params ?? {}) as Record<string, string>);
    const isDynamic = paramValues.includes(lastSeg);

    let label = staticCrumb ?? SEGMENT_LABELS[lastSeg];
    if (!label) {
      label = isDynamic
        ? `#${decodeURIComponent(lastSeg).slice(0, 8)}`
        : decodeURIComponent(lastSeg)
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const prev = crumbs[crumbs.length - 1];
    if (prev && prev.href === href) {
      prev.label = label;
      continue;
    }
    crumbs.push({ label, href, last: false });
  }

  if (crumbs.length > 0) crumbs[crumbs.length - 1].last = true;
  return crumbs;
}

export function PageBreadcrumbs() {
  const crumbs = useCrumbs();
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 px-4 md:px-6 pt-4 text-[11px] text-muted-foreground/70"
    >
      <Link
        to="/dashboard"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <Home className="h-3 w-3" />
        <span>Trang chủ</span>
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          {c.last ? (
            <span className="font-medium text-foreground/90">{c.label}</span>
          ) : (
            <Link to={c.href} className="hover:text-foreground transition-colors">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

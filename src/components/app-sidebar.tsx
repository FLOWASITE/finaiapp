import * as React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  BookOpenCheck,
  LogOut,
  BarChart3,
  Landmark,
  Boxes,
  Package,
  Wallet,
  Users,
  Receipt,
  ShoppingCart,
  Sparkles,
  Warehouse,
  Coins,
  Command as CommandIcon,
  Settings,
  User as UserIcon,
  ChevronsUpDown,
  Plus,
  FileSpreadsheet,
  Bot,
  UserCog,
  Shield,
  ShieldAlert,
  ChevronRight,
  Contact as ContactIcon,
  PiggyBank,
  LineChart,
  Briefcase,
  Calculator,
  ArrowLeft,
  Inbox,
  Send,
  KeyRound,
  Sun,
  Moon,
  TrendingDown,
  ArrowRightLeft,
  ArrowLeftRight,
  ScanBarcode,
  FileBarChart,
  Lock,
  CreditCard,
  DatabaseBackup,
  ListChecks,
  ScrollText,
  Building2,
  Brain,
  AlertTriangle,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { FinAILogo } from "@/components/FinAILogo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useWorkspace } from "@/hooks/use-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiSidebarCounts } from "@/lib/sidebar-counts.functions";
import { FinMascot } from "@/components/fin-mascot";
import { openAskAi } from "@/lib/open-ask-ai";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type BadgeTone = "new" | "muted" | "danger" | "default";
type NavLeaf = {
  to: string;
  label: string;
  icon?: React.ElementType;
  badge?: string | number;
  badgeTone?: BadgeTone;
};
type NavGroup = { label: string; icon: React.ElementType; items: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;
type NavSection = { label?: string; labelBadge?: string; entries: NavEntry[] };

const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

const SECTIONS: NavSection[] = [
  {
    entries: [{ to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard }],
  },
  {
    label: "Vận hành",
    entries: [
      {
        label: "Tiền & Ngân hàng",
        icon: PiggyBank,
        items: [
          { to: "/cash", label: "Tiền mặt" },
          { to: "/bank", label: "Ngân hàng" },
        ],
      },
      { to: "/sales", label: "Bán hàng", icon: ShoppingCart },
      { to: "/purchases", label: "Mua hàng", icon: ShoppingCart },
      {
        label: "Đối tác",
        icon: ContactIcon,
        items: [
          { to: "/customers", label: "Khách hàng" },
          { to: "/suppliers", label: "Nhà cung cấp" },
        ],
      },
      { to: "/items", label: "Hàng hóa & Dịch vụ", icon: Package },
      { to: "/inventory", label: "Kho", icon: Warehouse },
    ],
  },
  {
    label: "Kế toán",
    entries: [
      { to: "/assets", label: "Tài sản cố định", icon: Briefcase },
      { to: "/assets/allocations", label: "Tài sản phân bổ", icon: Boxes },
      { to: "/journal", label: "Phiếu kế toán", icon: BookOpen },
      { to: "/payroll", label: "Tiền lương", icon: Wallet },
      { to: "/coa", label: "Hệ thống tài khoản", icon: Landmark },
    ],
  },
  {
    label: "Hệ thống",
    entries: [
      { to: "/office", label: "Văn phòng", icon: Briefcase },
      { to: "/admin", label: "Quản trị", icon: Shield },
      { to: "/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

// FRONT (Mode AI): cấu trúc tinh gọn theo mockup.
// 4 section: XỬ LÝ / THƯ VIỆN / THẤU HIỂU / AI.
// Badge sẽ được inject từ getAiSidebarCounts trong AppSidebar.
const FRONT_SECTIONS: NavSection[] = [
  {
    label: "Xử lý",
    entries: [
      { to: "/inbox", label: "Inbox AI", icon: Inbox },
      { to: "/categorize", label: "Hạch toán", icon: Calculator },
      { to: "/inbox?tab=review", label: "Cần xem lại", icon: AlertTriangle },
      { to: "/inbox?tab=posted", label: "Đã ghi sổ", icon: BookOpenCheck },
    ],
  },
  {
    label: "Thư viện",
    entries: [
      { to: "/documents", label: "Trung tâm tài liệu", icon: FileText, badgeTone: "muted" },
      { to: "/items", label: "Hàng hóa & Dịch vụ", icon: Package },
      { to: "/customers", label: "Đối tác", icon: ContactIcon },
    ],
  },
  {
    label: "Thấu hiểu",
    entries: [
      { to: "/reports", label: "Báo cáo", icon: BarChart3 },
      { to: "/cashflow", label: "Dòng tiền", icon: LineChart },
      { to: "/tax/gtgt", label: "Thuế", icon: Receipt },
    ],
  },
  {
    label: "AI",
    labelBadge: "MỚI",
    entries: [
      { to: "/ai/memory", label: "Trí nhớ AI", icon: Brain },
      { to: "/alerts", label: "Cảnh báo", icon: ShieldAlert },
    ],
  },
];

const EINVOICE_SECTIONS: NavSection[] = [
  {
    entries: [{ to: "/dashboard", label: "Quay lại tổng quan", icon: ArrowLeft }],
  },
  {
    label: "Hoá đơn điện tử",
    entries: [
      { to: "/einvoices", label: "Tất cả hoá đơn", icon: FileText },
      { to: "/einvoices?tab=in", label: "Hoá đơn đầu vào", icon: Inbox },
      { to: "/einvoices?tab=out", label: "Hoá đơn đầu ra", icon: Send },
      { to: "/einvoices/credentials", label: "Thông tin đăng nhập TCT", icon: KeyRound },
    ],
  },
  {
    label: "Liên kết",
    entries: [
      { to: "/purchases", label: "Hoá đơn mua", icon: ShoppingCart },
      { to: "/invoices", label: "Hoá đơn bán", icon: Receipt },
      { to: "/tax/gtgt", label: "Thuế GTGT", icon: Calculator },
    ],
  },
];

const TAX_SECTIONS: NavSection[] = [
  {
    entries: [{ to: "/dashboard", label: "Quay lại tổng quan", icon: ArrowLeft }],
  },
  {
    label: "Thuế",
    entries: [
      { to: "/tax/gtgt", label: "Thuế GTGT", icon: Receipt },
      { to: "/tax/tncn", label: "Thuế TNCN", icon: UserCog },
      { to: "/tax/tndn", label: "Thuế TNDN", icon: Calculator },
    ],
  },
  {
    label: "Liên kết",
    entries: [
      { to: "/einvoices", label: "Hoá đơn điện tử", icon: FileText },
      { to: "/reports", label: "Báo cáo tài chính", icon: BarChart3 },
    ],
  },
];

const REPORTS_SECTIONS: NavSection[] = [
  {
    entries: [{ to: "/dashboard", label: "Quay lại tổng quan", icon: ArrowLeft }],
  },
  {
    label: "Kế toán",
    entries: [
      {
        label: "Báo cáo tài chính",
        icon: BarChart3,
        items: [
          { to: "/reports?tab=b01", label: "Cân đối kế toán" },
          { to: "/reports?tab=b02", label: "Kết quả kinh doanh" },
          { to: "/reports?tab=b03", label: "Lưu chuyển tiền tệ" },
          { to: "/reports?tab=b09", label: "Thuyết minh" },
        ],
      },
      { to: "/reports/trial-balance", label: "Bảng cân đối phát sinh", icon: Calculator },
      { to: "/reports/ar-summary", label: "Phải thu", icon: Coins },
      { to: "/reports/ap-summary", label: "Phải trả", icon: Coins },
      { to: "/reports/stock-ios", label: "Hàng tồn kho", icon: Warehouse },
      { to: "/assets/reports", label: "Tài sản cố định", icon: Briefcase },
      { to: "/assets/depreciation", label: "Bảng tính khấu hao", icon: TrendingDown },
      { to: "/assets/books", label: "Sổ khấu hao", icon: BookOpen },
      { to: "/reports/allocation-schedule", label: "Tài sản phân bổ", icon: Boxes },
      { to: "/payroll/reports", label: "Lương", icon: Wallet },
    ],
  },
  {
    label: "Quản trị",
    entries: [
      {
        label: "Bán hàng",
        icon: ShoppingCart,
        items: [
          { to: "/sales-dashboard", label: "Tổng quan" },
          { to: "/sales-dashboard/reports/detail", label: "Sổ chi tiết bán hàng" },
          { to: "/sales-dashboard/reports/profit-by-item", label: "Lãi/lỗ theo mặt hàng" },
          { to: "/sales-dashboard/reports/qty-by-item", label: "Bán hàng theo SL sản phẩm" },
          { to: "/sales-dashboard/reports/by-customer", label: "Bán hàng theo khách hàng" },
          { to: "/sales-dashboard/reports/by-salesperson", label: "Bán hàng theo nhân viên" },
          { to: "/sales-dashboard/reports/by-customer-item", label: "Khách hàng và sản phẩm" },
          { to: "/sales-dashboard/reports/by-salesperson-item", label: "Nhân viên và sản phẩm" },
        ],
      },
      {
        label: "Mua hàng",
        icon: ShoppingCart,
        items: [
          { to: "/purchases", label: "Tổng quan" },
          { to: "/purchases/reports/detail", label: "Sổ chi tiết mua hàng" },
          { to: "/purchases/reports/by-item", label: "Mua hàng theo mặt hàng" },
        ],
      },
    ],
  },
  {
    label: "Liên kết",
    entries: [
      { to: "/journal", label: "Phiếu kế toán", icon: BookOpen },
      { to: "/tax/gtgt", label: "Thuế GTGT", icon: Receipt },
      { to: "/einvoices", label: "Hoá đơn điện tử", icon: FileText },
      { to: "/reports/ledgers", label: "Sổ sách kế toán", icon: FileSpreadsheet },
      { to: "/reports/voucher-list", label: "Bảng kê chứng từ", icon: FileText },
    ],
  },
];

const SUPERADMIN_SECTIONS: NavSection[] = [
  {
    entries: [{ to: "/dashboard", label: "← Về ứng dụng", icon: ArrowLeft }],
  },
  {
    label: "Hệ thống",
    entries: [
      { to: "/superadmin", label: "Tổng quan tenants", icon: LayoutDashboard },
      { to: "/superadmin/organizations", label: "Tổ chức", icon: Building2 },
      { to: "/superadmin/accounts", label: "Tài khoản", icon: Users },
    ],
  },
  {
    label: "Người dùng & bảo mật",
    entries: [{ to: "/superadmin/security", label: "Bảo mật", icon: Lock }],
  },
  {
    label: "Nhật ký & sao lưu",
    entries: [
      { to: "/superadmin/audit", label: "Nhật ký", icon: ScrollText },
      { to: "/superadmin/impersonations", label: "Impersonation", icon: UserCog },
      { to: "/superadmin/backups", label: "Sao lưu", icon: DatabaseBackup },
      { to: "/superadmin/jobs", label: "Tác vụ", icon: ListChecks },
    ],
  },
  {
    label: "Cài đặt & Billing",
    entries: [
      { to: "/superadmin/billing", label: "Billing", icon: CreditCard },
      { to: "/superadmin/settings", label: "Cài đặt", icon: Settings },
      { to: "/superadmin/ai-model", label: "AI Model", icon: Sparkles },
    ],
  },
];

const QUICK_AI = [
  { label: "Tóm tắt doanh thu tháng này", to: "/chat" },
  { label: "Lập BCTC quý gần nhất", to: "/reports" },
  { label: "Top 5 công nợ quá hạn", to: "/receivables" },
];

const OPEN_STATE_KEY = "sidebar:groups:v1";

function useGroupOpenState(initialActive: Record<string, boolean>) {
  // Start with the same value on server and client to avoid hydration mismatch.
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>(initialActive);

  // Hydrate from localStorage after mount.
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_STATE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        setOpenMap((prev) => ({ ...prev, ...saved }));
      }
    } catch {}
  }, []);

  const setOpen = React.useCallback((label: string, open: boolean) => {
    setOpenMap((prev) => {
      const next = { ...prev, [label]: open };
      try {
        localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  return [openMap, setOpen] as const;
}

export function AppSidebar() {
  const [openCmd, setOpenCmd] = React.useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const searchStr = useRouterState({ select: (r) => r.location.searchStr });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { theme, toggleTheme } = useTheme();
  const { workspace } = useWorkspace();
  const inEinvoiceModule = pathname.startsWith("/einvoices");
  const inTaxModule = pathname.startsWith("/tax");
  const inReportsModule =
    pathname.startsWith("/reports") ||
    pathname === "/assets/reports" ||
    pathname === "/payroll/reports" ||
    pathname === "/sales-dashboard" ||
    pathname.startsWith("/sales-dashboard/") ||
    pathname.startsWith("/purchases/reports");
  const inSuperadminModule = pathname.startsWith("/superadmin");
  // Workspace Front: ưu tiên dùng FRONT_SECTIONS, trừ khi đang ở các module
  // chuyên dụng (HĐĐT/Thuế/Báo cáo/Super Admin) thì vẫn dùng sidebar contextual.
  const activeSections = inSuperadminModule
    ? SUPERADMIN_SECTIONS
    : workspace === "front" && !inEinvoiceModule && !inTaxModule && !inReportsModule
      ? FRONT_SECTIONS
      : inTaxModule
        ? TAX_SECTIONS
        : inReportsModule
          ? REPORTS_SECTIONS
          : inEinvoiceModule
            ? EINVOICE_SECTIONS
            : SECTIONS;

  // Dùng cache chung cho user/profile/roles tránh fetch lặp.
  const { data: cu, isLoading: cuLoading } = useCurrentUser();
  const email = cu?.email ?? "";
  const isSuperadmin = cu?.isSuperadmin ?? false;

  // Đếm động cho Sidebar Mode AI (workspace=front).
  const fetchSidebarCounts = useServerFn(getAiSidebarCounts);
  const { data: aiCounts } = useQuery({
    queryKey: ["sidebar", "ai-counts"],
    queryFn: () => fetchSidebarCounts(),
    enabled:
      workspace === "front" &&
      !inSuperadminModule &&
      !inEinvoiceModule &&
      !inTaxModule &&
      !inReportsModule,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Inject badge từ aiCounts vào FRONT_SECTIONS đang dùng.
  const sectionsWithBadges = React.useMemo<NavSection[]>(() => {
    if (activeSections !== FRONT_SECTIONS || !aiCounts) return activeSections;
    const map: Record<string, { badge: string | number; tone?: BadgeTone }> = {
      "/inbox": { badge: aiCounts.inbox },
      "/categorize": { badge: aiCounts.categorize, tone: "danger" },
      "/inbox?tab=review": { badge: aiCounts.review, tone: "danger" },
      "/documents": { badge: aiCounts.documents, tone: "muted" },
      "/alerts": { badge: aiCounts.alerts, tone: "danger" },
      "/tax/gtgt":
        aiCounts.taxDaysLeft != null
          ? { badge: `${aiCounts.taxDaysLeft} ngày`, tone: "danger" }
          : { badge: "" },
    };
    return activeSections.map((s) => ({
      ...s,
      entries: s.entries.map((e) => {
        if (isGroup(e)) return e;
        const inject = map[e.to];
        if (!inject || inject.badge === "" || inject.badge === 0) return e;
        return { ...e, badge: inject.badge, badgeTone: inject.tone ?? e.badgeTone };
      }),
    }));
  }, [activeSections, aiCounts]);

  const allTos = React.useMemo(() => {
    const tos: string[] = [];
    sectionsWithBadges.forEach((s) =>
      s.entries.forEach((e) => {
        if (isGroup(e)) e.items.forEach((i) => tos.push(i.to));
        else tos.push(e.to);
      }),
    );
    return tos;
  }, [sectionsWithBadges]);

  const isActive = React.useCallback(
    (to: string) => {
      const [toPath, toQuery] = to.split("?");
      const match = pathname === toPath || pathname.startsWith(toPath + "/");
      if (!match) return false;
      // If the entry pins a search param (e.g. /reports?tab=b01), require it to match.
      if (toQuery) {
        const expected = new URLSearchParams(toQuery);
        const current = new URLSearchParams((searchStr ?? "").replace(/^\?/, ""));
        for (const [k, v] of expected.entries()) {
          if (current.get(k) !== v) return false;
        }
        return true;
      }
      // Otherwise, don't activate a parent when a more-specific sibling matches.
      // Also: if any sibling pins this same pathname with a search param that matches current URL,
      // prefer that sibling and don't light up the bare pathname entry.
      const current = new URLSearchParams((searchStr ?? "").replace(/^\?/, ""));
      const pinnedSiblingActive = allTos.some((other) => {
        if (other === to) return false;
        const [op, oq] = other.split("?");
        if (op !== toPath || !oq) return false;
        const exp = new URLSearchParams(oq);
        for (const [k, v] of exp.entries()) {
          if (current.get(k) !== v) return false;
        }
        return true;
      });
      if (pinnedSiblingActive) return false;
      return !allTos.some(
        (other) =>
          other !== to &&
          !other.includes("?") &&
          other.startsWith(toPath + "/") &&
          (pathname === other || pathname.startsWith(other + "/")),
      );
    },
    [pathname, searchStr, allTos],
  );

  // Initial open = groups containing active route
  const initialOpen = React.useMemo(() => {
    const map: Record<string, boolean> = {};
    activeSections.forEach((s) =>
      s.entries.forEach((e) => {
        if (isGroup(e)) map[e.label] = e.items.some((i) => isActive(i.to));
      }),
    );
    return map;
  }, [isActive]);

  const [openMap, setOpen] = useGroupOpenState(initialOpen);

  // Auto-open the group of the active route on navigation
  React.useEffect(() => {
    activeSections.forEach((s) =>
      s.entries.forEach((e) => {
        if (isGroup(e) && e.items.some((i) => isActive(i.to)) && !openMap[e.label]) {
          setOpen(e.label, true);
        }
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenCmd((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpenCmd(false);
    navigate({ to });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const allLeaves = React.useMemo<NavLeaf[]>(
    () => SECTIONS.flatMap((s) => s.entries.flatMap((e) => (isGroup(e) ? e.items : [e]))),
    [],
  );

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="border-r-0 relative overflow-hidden"
        style={{ background: "var(--sidebar-bg-gradient)" }}
      >
        {/* Ambient glow overlays */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--sidebar-glow)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 opacity-60"
          style={{
            background:
              "radial-gradient(400px circle at 50% 100%, oklch(0.72 0.16 162 / 0.12), transparent 60%)",
          }}
        />

        <SidebarHeader className="relative border-b border-sidebar-border/40 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/dashboard"
              className="group/brand flex items-center gap-2 min-w-0 transition-transform duration-300 hover:scale-[1.02]"
            >
              <FinAILogo
                height={collapsed ? 28 : 34}
                className="shrink-0 drop-shadow-[0_2px_8px_oklch(0.72_0.16_162/0.35)]"
              />
              {!collapsed && (
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/55 truncate animate-fade-in">
                  AI Accounting · v3
                </span>
              )}
            </Link>
            {!collapsed && (
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
                title={theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border/40 bg-sidebar-accent/25 text-sidebar-foreground/70 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground hover:border-sidebar-border/60 transition-all duration-200"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="relative gap-1">
          {sectionsWithBadges.map((section, idx) => (
            <React.Fragment key={section.label ?? `s-${idx}`}>
              {section.label && idx > 0 && (
                <div
                  aria-hidden
                  className="mx-3 my-1 h-px bg-gradient-to-r from-transparent via-sidebar-border/50 to-transparent"
                />
              )}
              <SidebarGroup className={section.label ? undefined : "py-0"}>
                {section.label && (
                  <SidebarGroupLabel className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50 mb-1">
                    <span className="inline-block h-1 w-1 rounded-full bg-sidebar-primary/50" />
                    <span>{section.label}</span>
                    {section.labelBadge && (
                      <span className="ml-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-emerald-600">
                        {section.labelBadge}
                      </span>
                    )}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.entries.map((entry) =>
                      isGroup(entry) ? (
                        <GroupItem
                          key={entry.label}
                          group={entry}
                          open={!!openMap[entry.label]}
                          onOpenChange={(v) => setOpen(entry.label, v)}
                          isActive={isActive}
                          collapsed={collapsed}
                          onNavigate={(to) => navigate({ to })}
                        />
                      ) : (
                        <LeafItem key={entry.to} item={entry} active={isActive(entry.to)} />
                      ),
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </React.Fragment>
          ))}
        </SidebarContent>

        <SidebarFooter className="relative border-t border-sidebar-border/40 p-2">
          {collapsed && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openAskAi()}
                    aria-label="Hỏi Fin"
                    className="group relative mb-2 mx-auto flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-md transition-opacity duration-300 group-hover:opacity-100"
                      style={{ background: "var(--gradient-ai)" }}
                    />
                    <FinMascot size="xs" glow={false} className="relative" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Hỏi Fin</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-2xl border border-sidebar-border/50 bg-gradient-to-br from-sidebar-accent/40 via-sidebar-accent/15 to-transparent px-2 py-2 text-left backdrop-blur-md transition-all duration-300",
                  "hover:border-sidebar-primary/40 hover:from-sidebar-accent/60 hover:via-sidebar-accent/25 hover:shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--sidebar-primary)_45%,transparent)]",
                  "data-[state=open]:border-sidebar-primary/50 data-[state=open]:from-sidebar-accent/60",
                )}
              >
                {/* subtle hover glow */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(120% 60% at 0% 50%, color-mix(in oklab, var(--sidebar-primary) 18%, transparent), transparent 60%)",
                  }}
                />
                <div className="relative shrink-0">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-[0_4px_14px_-2px_color-mix(in_oklab,var(--sidebar-primary)_55%,transparent)] ring-2 ring-sidebar/80"
                    style={{ background: "var(--gradient-ai)" }}
                  >
                    {(email.charAt(0) || "U").toUpperCase()}
                  </div>
                  {/* online dot: solid emerald with soft pulsing halo */}
                  <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar" />
                  </span>
                </div>
                {!collapsed && (
                  <>
                    <div className="relative min-w-0 flex-1">
                      {cuLoading && !cu ? (
                        <>
                          <Skeleton className="mb-1 h-3 w-24" />
                          <Skeleton className="h-2.5 w-16" />
                        </>
                      ) : (
                        <>
                          <div className="truncate text-[12.5px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
                            {email || "Người dùng"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium tracking-wide text-sidebar-foreground/55">
                            <span className="inline-block h-1 w-1 rounded-full bg-emerald-400" />
                            Online
                            <span className="text-sidebar-foreground/30">·</span>
                            <span className="truncate">Lovable Cloud</span>
                          </div>
                        </>
                      )}
                    </div>
                    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent/40 text-sidebar-foreground/60 transition-all duration-200 group-hover:bg-sidebar-primary/15 group-hover:text-sidebar-primary">
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </span>
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                Hồ sơ
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Cài đặt
              </DropdownMenuItem>
              {isSuperadmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/superadmin" className="cursor-pointer">
                      <ShieldAlert className="mr-2 h-4 w-4 text-destructive" />
                      Super Admin
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  toggleTheme();
                }}
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    Chế độ sáng
                  </>
                ) : (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    Chế độ tối
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Đăng xuất
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <CommandDialog open={openCmd} onOpenChange={setOpenCmd}>
        <CommandInput placeholder="Tìm trang, hỏi AI, hoặc thực hiện lệnh nhanh…" />
        <CommandList>
          <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
          <CommandGroup heading="AI Gợi ý">
            <CommandItem onSelect={() => go("/chat")}>
              <Bot className="mr-2 h-4 w-4 text-sidebar-primary" />
              Mở trợ lý AI
              <CommandShortcut>⏎</CommandShortcut>
            </CommandItem>
            {QUICK_AI.map((q) => (
              <CommandItem key={q.label} onSelect={() => go(q.to)}>
                <Sparkles className="mr-2 h-4 w-4 text-sidebar-primary" />
                {q.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Lệnh nhanh">
            <CommandItem onSelect={() => go("/cash")}>
              <Plus className="mr-2 h-4 w-4" />
              Tạo phiếu thu / chi
            </CommandItem>
            <CommandItem onSelect={() => go("/sales")}>
              <Plus className="mr-2 h-4 w-4" />
              Tạo hoá đơn bán
            </CommandItem>
            <CommandItem onSelect={() => go("/reports")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Xuất BCTC
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Điều hướng">
            {allLeaves.map((item) => {
              const Icon = item.icon ?? FileText;
              return (
                <CommandItem key={item.to} onSelect={() => go(item.to)}>
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

function LeafItem({ item, active }: { item: NavLeaf; active: boolean }) {
  const Icon = item.icon ?? FileText;
  const [path, query] = item.to.split("?");
  const search = query ? Object.fromEntries(new URLSearchParams(query).entries()) : undefined;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={cn(
          "relative group transition-all duration-200 hover:translate-x-px hover:bg-sidebar-accent/40",
          active && "bg-sidebar-accent/60 shadow-[var(--shadow-sidebar-active)]",
        )}
      >
        <Link to={path} search={search as never}>
          {active && (
            <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sidebar-primary to-sidebar-primary/60 shadow-[0_0_10px_oklch(0.72_0.16_162/0.6)]" />
          )}
          <Icon
            className={cn(
              "h-4 w-4 transition-transform duration-200 group-hover:scale-110",
              active && "text-sidebar-primary drop-shadow-[0_0_6px_oklch(0.72_0.16_162/0.55)]",
            )}
          />
          <span
            className={cn(
              "text-[13px] tracking-[-0.005em] truncate",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {item.label}
          </span>
          {item.badge != null && item.badge !== "" && (
            <span
              className={cn(
                "ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums",
                item.badgeTone === "new" && "bg-[#4F46C7] text-white",
                item.badgeTone === "danger" && "bg-rose-500/15 text-rose-600",
                item.badgeTone === "muted" &&
                  "bg-transparent px-0 text-sidebar-foreground/45 font-medium",
                (!item.badgeTone || item.badgeTone === "default") &&
                  "bg-sidebar-accent/60 text-sidebar-foreground/70",
              )}
            >
              {item.badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function GroupItem({
  group,
  open,
  onOpenChange,
  isActive,
  collapsed,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isActive: (to: string) => boolean;
  collapsed: boolean;
  onNavigate: (to: string) => void;
}) {
  const Icon = group.icon;
  const hasActiveChild = group.items.some((i) => isActive(i.to));

  // Collapsed: show as a dropdown so users can still pick sub items
  if (collapsed) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={group.label} isActive={hasActiveChild}>
              <Icon className={cn("h-4 w-4", hasActiveChild && "text-sidebar-primary")} />
              <span>{group.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-48">
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {group.items.map((i) => (
              <DropdownMenuItem key={i.to} onClick={() => onNavigate(i.to)}>
                {i.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={group.label}
            className={cn(
              "group/btn transition-all duration-200 hover:translate-x-px hover:bg-sidebar-accent/40",
              hasActiveChild && "text-sidebar-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 transition-transform duration-200 group-hover/btn:scale-110",
                hasActiveChild && "text-sidebar-primary",
              )}
            />
            <span
              className={cn(
                "flex-1 text-left text-[13px] tracking-[-0.005em]",
                hasActiveChild ? "font-semibold" : "font-medium",
              )}
            >
              {group.label}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-all duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[state=open]/collapsible:text-sidebar-primary" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <SidebarMenuSub>
            {group.items.map((i) => {
              const active = isActive(i.to);
              const [path, query] = i.to.split("?");
              const search = query
                ? Object.fromEntries(new URLSearchParams(query).entries())
                : undefined;
              return (
                <SidebarMenuSubItem key={i.to}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link to={path} search={search as never}>
                      <span
                        className={cn(
                          "text-[12.5px] tracking-[-0.005em] transition-colors",
                          active
                            ? "font-semibold text-sidebar-primary"
                            : "text-sidebar-foreground/75 hover:text-sidebar-foreground",
                        )}
                      >
                        {i.label}
                      </span>
                      {i.badge != null && (
                        <span className="ml-auto rounded-md bg-sidebar-accent/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums text-sidebar-foreground/70">
                          {i.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

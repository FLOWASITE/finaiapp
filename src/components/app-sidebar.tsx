import * as React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, BookOpen, BookOpenCheck, LogOut, BarChart3, Landmark, Boxes,
  Package, Wallet, Users, Receipt, ShoppingCart, Sparkles, Warehouse, Coins,
  Command as CommandIcon, Settings, User as UserIcon, ChevronsUpDown,
  Plus, FileSpreadsheet, Bot, UserCog, Shield, ShieldAlert,
  ChevronRight, Contact as ContactIcon, PiggyBank, LineChart, Briefcase, Calculator,
  ArrowLeft, Inbox, Send, KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarGroup,
  SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";

type NavLeaf = { to: string; label: string; icon?: React.ElementType; badge?: string | number };
type NavGroup = { label: string; icon: React.ElementType; items: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;
type NavSection = { label?: string; entries: NavEntry[] };

const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

const SECTIONS: NavSection[] = [
  {
    entries: [
      { to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
      { to: "/chat", label: "Trợ lý AI", icon: Sparkles },
    ],
  },
  {
    label: "Vận hành",
    entries: [
      {
        label: "Tiền & Ngân hàng",
        icon: PiggyBank,
        items: [
          { to: "/cash", label: "Quỹ tiền mặt" },
          { to: "/bank", label: "Đối soát ngân hàng" },
        ],
      },
      {
        label: "Bán hàng",
        icon: ShoppingCart,
        items: [
          { to: "/sales-dashboard", label: "Tổng quan" },
          { to: "/sales/orders", label: "Đơn đặt hàng" },
          { to: "/sales", label: "Phiếu bán hàng" },
          { to: "/invoices", label: "Hoá đơn bán" },
          { to: "/receipts", label: "Phiếu thu" },
          { to: "/receivables", label: "Công nợ phải thu" },
        ],
      },
      {
        label: "Mua hàng",
        icon: ShoppingCart,
        items: [
          { to: "/purchases", label: "Tổng quan" },
          { to: "/payables", label: "Công nợ phải trả" },
        ],
      },
      { to: "/einvoices", label: "Hoá đơn điện tử", icon: FileText },
      {
        label: "Đối tác",
        icon: ContactIcon,
        items: [
          { to: "/customers", label: "Khách hàng" },
          { to: "/suppliers", label: "Nhà cung cấp" },
        ],
      },
      { to: "/inventory", label: "Hàng hoá & Dịch vụ", icon: Package },
      { to: "/inventory/movements", label: "Kho", icon: Warehouse },
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
    label: "Thuế",
    entries: [
      { to: "/tax/gtgt", label: "Thuế GTGT", icon: Receipt },
      { to: "/tax/tncn", label: "Thuế TNCN", icon: UserCog },
      { to: "/tax/tndn", label: "Thuế TNDN", icon: Calculator },
    ],
  },
  {
    label: "Báo cáo",
    entries: [
      { to: "/reports", label: "Báo cáo tài chính", icon: BarChart3 },
      { to: "/reports/ledgers", label: "Sổ sách kế toán", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Hệ thống",
    entries: [
      { to: "/admin", label: "Quản trị", icon: Shield },
      { to: "/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

const EINVOICE_SECTIONS: NavSection[] = [
  {
    entries: [
      { to: "/dashboard", label: "Quay lại tổng quan", icon: ArrowLeft },
    ],
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
      try { localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [openMap, setOpen] as const;
}

export function AppSidebar() {
  const [openCmd, setOpenCmd] = React.useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const inEinvoiceModule = pathname.startsWith("/einvoices");
  const activeSections = inEinvoiceModule ? EINVOICE_SECTIONS : SECTIONS;

  // Dùng cache chung cho user/profile/roles tránh fetch lặp.
  const { data: cu, isLoading: cuLoading } = useCurrentUser();
  const email = cu?.email ?? "";
  const isSuperadmin = cu?.isSuperadmin ?? false;

  const isActive = React.useCallback(
    (to: string) => pathname === to || pathname.startsWith(to + "/"),
    [pathname],
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
    () =>
      SECTIONS.flatMap((s) =>
        s.entries.flatMap((e) => (isGroup(e) ? e.items : [e])),
      ),
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
          <Link to="/dashboard" className="group/brand flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm text-primary-foreground shadow-[var(--shadow-ai-card)] ring-1 ring-sidebar-primary/30 transition-transform duration-300 group-hover/brand:rotate-3 group-hover/brand:scale-105"
              style={{ background: "var(--gradient-ai)" }}
            >
              A
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-snug animate-fade-in">
                <span className="font-bold text-[15px] tracking-tight text-sidebar-foreground">FinAI</span>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/55">
                  AI Accounting · v3
                </span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        <SidebarContent className="relative gap-1">
          {/* AI LAUNCHER */}
          <div className="px-2 pt-3 pb-2">
            {collapsed ? (
              <button
                onClick={() => setOpenCmd(true)}
                aria-label="Ask FinAI AI"
                className="flex h-9 w-9 mx-auto items-center justify-center rounded-lg text-primary-foreground shadow-[var(--shadow-ai-card)] ring-1 ring-sidebar-primary/30 hover-scale transition-all duration-300 hover:shadow-[0_0_24px_-4px_oklch(0.72_0.16_162/0.6)]"
                style={{ background: "var(--gradient-ai)" }}
              >
                <Sparkles className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => setOpenCmd(true)}
                className="group relative w-full overflow-hidden rounded-xl p-[1px] animate-fade-in transition-all duration-300 hover:shadow-[0_0_28px_-6px_oklch(0.72_0.16_162/0.55)]"
                style={{ background: "var(--gradient-ai)" }}
              >
                <div className="rounded-[11px] bg-sidebar/85 backdrop-blur-md px-3 py-2.5 transition-colors group-hover:bg-sidebar/70">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sidebar-primary animate-[pulse_2.8s_ease-in-out_infinite]" />
                    <span className="text-[12.5px] font-medium tracking-tight text-sidebar-foreground/90 flex-1 text-left">
                      Hỏi FinAI AI…
                    </span>
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-sidebar-border/60 bg-sidebar-accent/40 px-1.5 py-0.5 text-[10px] font-mono text-sidebar-foreground/60">
                      <CommandIcon className="h-2.5 w-2.5" />K
                    </kbd>
                  </div>
                </div>
              </button>
            )}

            {!collapsed && (
              <div className="mt-2 flex flex-wrap gap-1">
                {QUICK_AI.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => go(q.to)}
                    className="rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 px-2.5 py-1 text-[10.5px] font-medium tracking-wide whitespace-nowrap text-sidebar-foreground/70 hover:border-sidebar-primary/60 hover:text-sidebar-foreground hover:-translate-y-px hover:shadow-[0_4px_12px_-4px_oklch(0_0_0/0.4)] transition-all duration-200"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeSections.map((section, idx) => (
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
                    {section.label}
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
                    {section.label === "Hệ thống" && isSuperadmin && (
                      <LeafItem
                        item={{ to: "/superadmin", label: "Super Admin", icon: ShieldAlert }}
                        active={isActive("/superadmin")}
                      />
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </React.Fragment>
          ))}
        </SidebarContent>

        <SidebarFooter className="relative border-t border-sidebar-border/40 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-xl border border-sidebar-border/40 bg-sidebar-accent/25 backdrop-blur-sm px-2 py-1.5 hover:bg-sidebar-accent/50 hover:border-sidebar-border/60 transition-all duration-200">
                <div className="relative">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sidebar-accent-foreground text-xs font-bold ring-2 ring-sidebar-primary/25 shadow-[var(--shadow-ai-card)]"
                    style={{ background: "var(--gradient-ai)" }}
                  >
                    {email.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar animate-pulse shadow-[0_0_8px_oklch(0.78_0.18_152/0.9)]" />
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      {cuLoading && !cu ? (
                        <>
                          <Skeleton className="h-3 w-24 mb-1" />
                          <Skeleton className="h-2.5 w-16" />
                        </>
                      ) : (
                        <>
                          <div className="truncate text-[12.5px] font-semibold tracking-tight text-sidebar-foreground">
                            {email || "Người dùng"}
                          </div>
                          <div className="text-[10.5px] font-medium tracking-wide text-sidebar-foreground/55">Lovable Cloud · Online</div>
                        </>
                      )}
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem><UserIcon className="mr-2 h-4 w-4" />Hồ sơ</DropdownMenuItem>
              <DropdownMenuItem><Settings className="mr-2 h-4 w-4" />Cài đặt</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />Đăng xuất
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
              <Plus className="mr-2 h-4 w-4" />Tạo phiếu thu / chi
            </CommandItem>
            <CommandItem onSelect={() => go("/sales")}>
              <Plus className="mr-2 h-4 w-4" />Tạo hoá đơn bán
            </CommandItem>
            <CommandItem onSelect={() => go("/reports")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Xuất BCTC
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
  const search = query
    ? Object.fromEntries(new URLSearchParams(query).entries())
    : undefined;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label} className="relative group">
        <Link to={path} search={search as never}>
          {active && (
            <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
          )}
          <Icon className={cn("h-4 w-4 transition-transform group-hover:scale-110", active && "text-sidebar-primary")} />
          <span className={cn("text-[13px] tracking-[-0.005em] truncate", active ? "font-semibold" : "font-medium")}>{item.label}</span>
          {item.badge != null && (
            <span className="ml-auto rounded-md bg-sidebar-accent/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums text-sidebar-foreground/70">
              {item.badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function GroupItem({
  group, open, onOpenChange, isActive, collapsed, onNavigate,
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
            className={cn("group/btn", hasActiveChild && "text-sidebar-foreground")}
          >
            <Icon className={cn("h-4 w-4", hasActiveChild && "text-sidebar-primary")} />
            <span className={cn("flex-1 text-left text-[13px] tracking-[-0.005em]", hasActiveChild ? "font-semibold" : "font-medium")}>{group.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <SidebarMenuSub>
            {group.items.map((i) => {
              const active = isActive(i.to);
              return (
                <SidebarMenuSubItem key={i.to}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link to={i.to}>
                      <span className={cn(
                        "text-[12.5px] tracking-[-0.005em] transition-colors",
                        active ? "font-semibold text-sidebar-primary" : "text-sidebar-foreground/75 hover:text-sidebar-foreground"
                      )}>
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

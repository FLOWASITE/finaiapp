import * as React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, BookOpen, BookOpenCheck, LogOut, BarChart3, Landmark, Boxes,
  MessageSquare, Package, Wallet, Users, Receipt, ShoppingCart, Sparkles,
  Search, Command as CommandIcon, Settings, User as UserIcon, ChevronsUpDown,
  Plus, FileSpreadsheet, Bot, CreditCard, UserCog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarGroup,
  SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type NavLeaf = { to: string; label: string; icon: React.ElementType };
type NavSection = { label: string; items: NavLeaf[] };

const PRIMARY: NavLeaf[] = [
  { to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/chat", label: "Trợ lý AI", icon: Sparkles },
];

const SECTIONS: NavSection[] = [
  {
    label: "Bán hàng",
    items: [
      { to: "/sales", label: "Hoá đơn bán ra", icon: ShoppingCart },
      { to: "/receivables", label: "Công nợ phải thu", icon: Users },
    ],
  },
  {
    label: "Mua hàng",
    items: [
      { to: "/invoices", label: "Hoá đơn mua vào", icon: FileText },
      { to: "/suppliers", label: "Nhà cung cấp", icon: Users },
      { to: "/payables", label: "Công nợ phải trả", icon: CreditCard },
    ],
  },
  {
    label: "Kho vận",
    items: [
      { to: "/inventory", label: "Kho hàng", icon: Package },
    ],
  },
  {
    label: "Tiền & Ngân hàng",
    items: [
      { to: "/cash", label: "Quỹ tiền mặt", icon: Wallet },
      { to: "/bank", label: "Đối soát ngân hàng", icon: Landmark },
    ],
  },
  {
    label: "Tài sản",
    items: [
      { to: "/assets", label: "Tài sản cố định", icon: Boxes },
    ],
  },
  {
    label: "Kế toán tổng hợp",
    items: [
      { to: "/journal", label: "Sổ nhật ký", icon: BookOpen },
      { to: "/coa", label: "Hệ thống tài khoản", icon: BookOpenCheck },
      { to: "/reports", label: "Báo cáo tài chính", icon: BarChart3 },
      { to: "/reports/ledgers", label: "Sổ sách kế toán", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Nhân sự — Lương",
    items: [
      { to: "/payroll", label: "Tiền lương", icon: UserCog },
    ],
  },
  {
    label: "Thuế",
    items: [
      { to: "/tax", label: "Báo cáo thuế (GTGT/TNDN/TNCN)", icon: Receipt },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { to: "/admin", label: "Quản trị", icon: Shield },
      { to: "/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

const QUICK_AI = [
  { label: "Tóm tắt doanh thu tháng này", to: "/chat" },
  { label: "Lập BCTC quý gần nhất", to: "/reports" },
  { label: "Top 5 công nợ quá hạn", to: "/receivables" },
];

export function AppSidebar() {
  const [openCmd, setOpenCmd] = React.useState(false);
  const [email, setEmail] = React.useState<string>("");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

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

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="border-b border-sidebar-border/60 px-3 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-sm text-primary-foreground shadow-[var(--shadow-ai-card)]"
              style={{ background: "var(--gradient-ai)" }}
            >
              A
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight animate-fade-in">
                <span className="font-semibold tracking-tight text-sidebar-foreground">AccuVN</span>
                <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                  AI Accounting · v3
                </span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        <SidebarContent className="gap-1">
          {/* AI LAUNCHER */}
          <div className="px-2 pt-3 pb-2">
            {collapsed ? (
              <button
                onClick={() => setOpenCmd(true)}
                aria-label="Ask AccuVN AI"
                className="flex h-9 w-9 mx-auto items-center justify-center rounded-lg text-primary-foreground shadow-[var(--shadow-ai-card)] hover-scale"
                style={{ background: "var(--gradient-ai)" }}
              >
                <Sparkles className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => setOpenCmd(true)}
                className="group relative w-full overflow-hidden rounded-xl p-[1px] hover-scale animate-fade-in"
                style={{ background: "var(--gradient-ai)" }}
              >
                <div className="rounded-[11px] bg-sidebar/90 backdrop-blur-sm px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sidebar-primary" />
                    <span className="text-xs font-medium text-sidebar-foreground/90 flex-1 text-left">
                      Hỏi AccuVN AI…
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
                    className="rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-0.5 text-[10px] text-sidebar-foreground/70 hover:border-sidebar-primary/60 hover:text-sidebar-foreground transition-colors"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PRIMARY */}
          <SidebarGroup className="py-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {PRIMARY.map((item) => (
                  <NavLink key={item.to} item={item} active={isActive(item.to)} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* SECTIONS */}
          {SECTIONS.map((s) => (
            <SidebarGroup key={s.label}>
              <SidebarGroupLabel className="text-[10px] tracking-wider text-sidebar-foreground/45">
                {s.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {s.items.map((item) => (
                    <NavLink key={item.to} item={item} active={isActive(item.to)} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/60 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent/50 transition-colors">
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold">
                    {email.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar animate-pulse" />
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="truncate text-xs font-medium text-sidebar-foreground">
                        {email || "Người dùng"}
                      </div>
                      <div className="text-[10px] text-sidebar-foreground/50">Lovable Cloud · Online</div>
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
            {[...PRIMARY, ...SECTIONS.flatMap((s) => s.items)].map((item) => (
              <CommandItem key={item.to} onSelect={() => go(item.to)}>
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

function NavLink({ item, active }: { item: NavLeaf; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label} className="relative group">
        <Link to={item.to}>
          {active && (
            <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
          )}
          <Icon className={`h-4 w-4 transition-transform group-hover:scale-110 ${active ? "text-sidebar-primary" : ""}`} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

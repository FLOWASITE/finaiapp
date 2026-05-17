import * as React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, BookOpen, BookOpenCheck, LogOut, BarChart3, Landmark, Boxes,
  MessageSquare, Package, Wallet, Users, Receipt, ShoppingCart, Sparkles,
  Search, Command as CommandIcon, Settings, User as UserIcon, ChevronsUpDown,
  Plus, FileSpreadsheet, Bot, CreditCard, UserCog, Shield, ShieldAlert, TrendingUp,
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

type NavLeaf = { to: string; label: string; icon: React.ElementType; badge?: number; children?: { to: string; label: string }[] };
type NavSection = { label: string; items: NavLeaf[] };

const PRIMARY: NavLeaf[] = [
  { to: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/chat", label: "Trợ lý AI", icon: Sparkles },
];

const SECTIONS: NavSection[] = [
  {
    label: "Bán hàng & Kho",
    items: [
      {
        to: "/sales", label: "Bán hàng", icon: ShoppingCart,
        children: [
          { to: "/sales", label: "Hoá đơn" },
          { to: "/receipts", label: "Phiếu thu" },
          { to: "/receivables", label: "Công nợ phải thu" },
        ],
      },
      { to: "/customers", label: "Khách hàng", icon: Users },
      { to: "/inventory", label: "Kho hàng", icon: Package },
    ],
  },
  {
    label: "Mua hàng",
    items: [
      {
        to: "/purchases", label: "Mua hàng", icon: ShoppingCart,
        children: [
          { to: "/invoices", label: "Hoá đơn mua" },
          { to: "/payables", label: "Công nợ phải trả" },
        ],
      },
      { to: "/suppliers", label: "Nhà cung cấp", icon: Users },
    ],
  },
  {
    label: "Tiền & Ngân hàng",
    items: [
      { to: "/cash", label: "Quỹ tiền mặt", icon: Wallet },
      { to: "/bank", label: "Đối soát ngân hàng", icon: Landmark },
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
    label: "Nhân sự & Thuế",
    items: [
      { to: "/payroll", label: "Tiền lương", icon: UserCog },
      { to: "/tax", label: "Báo cáo thuế", icon: Receipt },
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
  const [isSuperadmin, setIsSuperadmin] = React.useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? "");
      if (data.user?.id) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id);
        setIsSuperadmin((roles ?? []).some((r) => r.role === "superadmin"));
      }
    });
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
      <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background font-bold text-sm">
              A
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight animate-fade-in">
                <span className="font-semibold tracking-tight text-foreground text-sm">AccuVN</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Accounting Suite
                </span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        <SidebarContent className="gap-0">
          {/* AI LAUNCHER — minimal input style */}
          <div className="px-2 pt-3 pb-1">
            {collapsed ? (
              <button
                onClick={() => setOpenCmd(true)}
                aria-label="Ask AccuVN AI"
                className="flex h-8 w-8 mx-auto items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => setOpenCmd(true)}
                className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background px-2.5 py-1.5 text-left hover:border-foreground/30 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  Hỏi AccuVN AI…
                </span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-sidebar-border bg-sidebar-accent px-1 py-0 text-[10px] font-mono text-muted-foreground">
                  <CommandIcon className="h-2.5 w-2.5" />K
                </kbd>
              </button>
            )}
          </div>

          {/* PRIMARY */}
          <SidebarGroup className="py-1">
            <SidebarGroupContent>
              <SidebarMenu>
                {PRIMARY.map((item) => (
                  <NavLink key={item.to} item={item} active={isActive(item.to)} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* SECTIONS */}
          {SECTIONS.map((s) => (
            <SidebarGroup key={s.label} className="py-0">
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 pt-3 pb-1 h-auto">
                {s.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {s.items.map((item) => (
                    <NavLink key={item.to} item={item} active={isActive(item.to)} pathname={pathname} />
                  ))}
                  {s.label === "Hệ thống" && isSuperadmin && (
                    <NavLink
                      item={{ to: "/superadmin", label: "Super Admin", icon: ShieldAlert }}
                      active={isActive("/superadmin")}
                      pathname={pathname}
                    />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-foreground text-xs font-semibold">
                  {email.charAt(0).toUpperCase() || "U"}
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="truncate text-xs font-medium text-foreground">
                        {email || "Người dùng"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Online</div>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
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

function NavLink({ item, active, pathname }: { item: NavLeaf; active: boolean; pathname: string }) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;
  const childActive = (to: string) => pathname === to || pathname.startsWith(to + "/");
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={item.label} className="group data-[active=true]:bg-transparent data-[active=true]:text-foreground data-[active=true]:font-medium hover:bg-sidebar-accent">
          <Link to={item.to}>
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={1.75} />
            <span className="truncate">{item.label}</span>
            {item.badge != null && (
              <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                {item.badge}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {hasChildren && active && (
        <div className="ml-[22px] border-l border-sidebar-border pl-1 my-0.5">
          {item.children!.map((c) => {
            const ca = childActive(c.to);
            return (
              <SidebarMenuItem key={c.to}>
                <SidebarMenuButton asChild isActive={ca} size="sm" className="h-7 data-[active=true]:bg-transparent data-[active=true]:text-foreground data-[active=true]:font-medium hover:bg-sidebar-accent">
                  <Link to={c.to}>
                    {ca && <span className="text-foreground mr-0.5">→</span>}
                    <span className={`truncate ${ca ? "" : "text-muted-foreground"}`}>{c.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </div>
      )}
    </>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, ChevronRight, LogOut, Search, Settings, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";

const LABELS: Record<string, string> = {
  dashboard: "Bảng điều khiển",
  invoices: "Hóa đơn",
  suppliers: "Nhà cung cấp",
  sales: "Bán hàng",
  receivables: "Phải thu",
  payables: "Phải trả",
  inventory: "Kho",
  bank: "Ngân hàng",
  cash: "Tiền mặt",
  assets: "Tài sản",
  payroll: "Lương",
  tax: "Thuế",
  reports: "Báo cáo",
  journal: "Sổ nhật ký",
  coa: "Hệ thống TK",
  settings: "Cài đặt",
  admin: "Quản trị",
  superadmin: "Super Admin",
  chat: "Trợ lý AI",
};

function useBreadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter((p) => p && p !== "_app");
  return parts.map((seg, i) => ({
    label: LABELS[seg] ?? decodeURIComponent(seg),
    href: "/" + parts.slice(0, i + 1).join("/"),
    last: i === parts.length - 1,
  }));
}

export function AppHeader() {
  const crumbs = useBreadcrumbs();
  const { data: cu, isLoading } = useCurrentUser();
  const email = cu?.email ?? null;
  const profile = cu?.profile ?? null;

  const displayName =
    profile?.display_name?.trim() || email?.split("@")[0] || "Tài khoản";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex flex-1 items-center gap-3">
      {/* Breadcrumbs */}
      <nav className="hidden md:flex items-center gap-1 text-sm">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          Trang chủ
        </Link>
        {crumbs.map((c) => (
          <span key={c.href} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            {c.last ? (
              <span className="font-medium text-foreground">{c.label}</span>
            ) : (
              <Link to={c.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* Search / Command */}
        <button
          type="button"
          className="group hidden sm:flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:border-border transition-colors min-w-[200px]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Tìm kiếm…</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </Button>

        {/* User menu */}
        {isLoading && !cu ? (
          <div className="flex items-center gap-2 px-1.5 pr-3 h-9">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="hidden sm:block h-3.5 w-20" />
          </div>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 rounded-full px-1.5 pr-3">
              <Avatar className="h-7 w-7">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate">
                {displayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{displayName}</span>
                  {profile?.job_title ? (
                    <span className="text-[11px] text-muted-foreground truncate">{profile.job_title}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground truncate">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings"><User className="mr-2 h-4 w-4" />Hồ sơ cá nhân</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings"><Settings className="mr-2 h-4 w-4" />Cài đặt</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>
    </div>
  );
}

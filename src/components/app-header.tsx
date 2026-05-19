import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpenCheck, FileText, LogOut, Receipt, Search, Settings, User } from "lucide-react";
import { PeriodSwitcher } from "@/components/period-switcher";
import { NotificationsMenu } from "@/components/notifications-menu";
import { openCommandPalette } from "@/components/command-palette";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
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
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAccountingMode } from "@/hooks/use-workspace";
import { Skeleton } from "@/components/ui/skeleton";

export function AppHeader() {
  const { data: cu, isLoading } = useCurrentUser();
  const email = cu?.email ?? null;
  const profile = cu?.profile ?? null;
  const { enabled: accountingMode, setAccountingMode } = useAccountingMode();

  const displayName =
    profile?.display_name?.trim() || email?.split("@")[0] || "Tài khoản";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex flex-1 items-center justify-end gap-3">
        {/* Workspace switcher (Front-Office ↔ Back-Office) */}
        <WorkspaceSwitcher />

        {/* Accounting period switcher */}
        <PeriodSwitcher />




        {/* Quick links grouped pill */}
        <div className="hidden md:flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.03] p-1">
          <Link
            to="/einvoices"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            activeProps={{ className: "text-primary bg-primary/10" }}
          >
            <FileText className="h-3.5 w-3.5" />
            HĐĐT
          </Link>
          <Link
            to="/tax/gtgt"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            activeProps={{ className: "text-primary bg-primary/10" }}
          >
            <Receipt className="h-3.5 w-3.5" />
            Thuế
          </Link>
          <Link
            to="/reports"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            activeProps={{ className: "text-primary bg-primary/10" }}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Báo cáo
          </Link>
        </div>

        {/* Search / Command */}
        <div className="relative group hidden sm:block">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-cyan-500/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          <button
            type="button"
            onClick={openCommandPalette}
            className="relative flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.08] transition-all min-w-[220px]"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Tìm kiếm…</span>
            <div className="flex items-center gap-0.5 opacity-60">
              <kbd className="rounded-sm bg-white/10 px-1 font-mono text-[10px]">⌘</kbd>
              <kbd className="rounded-sm bg-white/10 px-1 font-mono text-[10px]">K</kbd>
            </div>
          </button>
        </div>

        {/* Notifications */}
        <NotificationsMenu />

        {/* User menu */}
        {isLoading && !cu ? (
          <div className="flex items-center gap-2 pl-3 border-l border-white/10 h-9">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="hidden sm:block h-3.5 w-20" />
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 gap-3 rounded-full pl-3 pr-1 border-l border-white/10 hover:bg-transparent"
              >
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-[13px] font-medium text-foreground max-w-[140px] truncate">
                    {displayName}
                  </span>
                  {profile?.job_title ? (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
                      {profile.job_title}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
                      User
                    </span>
                  )}
                </div>
                <Avatar className="h-8 w-8 ring-2 ring-primary/25 hover:ring-primary/50 transition-all">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
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
              <DropdownMenuCheckboxItem
                checked={accountingMode}
                onCheckedChange={(v) => setAccountingMode(!!v)}
                onSelect={(e) => e.preventDefault()}
              >
                <BookOpenCheck className="mr-2 h-4 w-4" />
                Chế độ kế toán
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Hiện mã TK
                </span>
              </DropdownMenuCheckboxItem>
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
  );
}

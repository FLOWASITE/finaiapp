import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listAccountsPaged,
  setUserRole,
  resetUserPassword,
  setAccountBanned,
  deleteAccount,
  exportAccountsCsv,
} from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, KeyRound, Lock, Unlock, Trash2, ShieldPlus, ArrowUpDown, Download, ShieldCheck, ChevronRight } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import { TablePagination } from "@/components/table-pagination";
import { AccountFilters, EMPTY_FILTERS, type AccountFiltersValue } from "@/components/superadmin/account-filters";
import { BulkActionBar } from "@/components/superadmin/bulk-action-bar";
import { InviteAccountDialog } from "@/components/superadmin/invite-account-dialog";

export const Route = createFileRoute("/_app/superadmin/accounts")({
  beforeLoad: requireSuperadminGuard,
  component: AccountsPage,
});

const ROLES = ["owner", "accountant", "viewer", "superadmin"] as const;

type SortKey = "created_at" | "last_sign_in_at" | "email" | "company_name";

function AccountsPage() {
  const listFn = useServerFn(listAccountsPaged);
  const setRole = useServerFn(setUserRole);
  const resetPwd = useServerFn(resetUserPassword);
  const setBanned = useServerFn(setAccountBanned);
  const delAcc = useServerFn(deleteAccount);
  const exportFn = useServerFn(exportAccountsCsv);
  const qc = useQueryClient();

  const [filters, setFilters] = useState<AccountFiltersValue>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const serverFilters = useMemo(() => ({
    q: filters.q || undefined,
    roles: filters.roles.length ? (filters.roles as any) : undefined,
    status: filters.status !== "any" ? (filters.status as any) : undefined,
    created_from: filters.created_from || undefined,
    created_to: filters.created_to ? `${filters.created_to}T23:59:59Z` : undefined,
    last_login_bucket: filters.last_login_bucket !== "any" ? (filters.last_login_bucket as any) : undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
  }), [filters, sortBy, sortDir]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["superadmin-accounts", serverFilters, page, pageSize],
    queryFn: () =>
      listFn({ data: { page, page_size: pageSize, filters: serverFilters as any } }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const accounts = (data as any)?.accounts ?? [];
  const total = (data as any)?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const refresh = () => qc.invalidateQueries({ queryKey: ["superadmin-accounts"] });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("desc"); }
  };

  const allPageIds = accounts.map((a: any) => a.id);
  const allChecked = allPageIds.length > 0 && allPageIds.every((id: string) => selected.has(id));
  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) allPageIds.forEach((id: string) => next.delete(id));
      else allPageIds.forEach((id: string) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleRole = async (user_id: string, role: string, has: boolean) => {
    try {
      await setRole({ data: { user_id, role: role as any, enable: !has } });
      toast.success(has ? `Đã thu hồi quyền ${role}` : `Đã cấp quyền ${role}`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const handleReset = async (email: string) => {
    try { await resetPwd({ data: { email } }); toast.success("Đã gửi link đặt lại mật khẩu"); }
    catch (e: any) { toast.error(e.message); }
  };
  const handleBan = async (user_id: string, banned: boolean) => {
    try {
      await setBanned({ data: { user_id, banned } });
      toast.success(banned ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };
  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await delAcc({ data: { user_id: confirmDelete.id, confirm_email: confirmEmail } });
      toast.success("Đã xóa tài khoản");
      setConfirmDelete(null); setConfirmEmail(""); refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: { filters: serverFilters as any } }),
    onSuccess: (res: any) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${res.rows} dòng`);
    },
    onError: (e: any) => toast.error(e.message ?? "Xuất CSV thất bại"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AccountFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>
            <Download className="mr-2 h-4 w-4" />
            {exportMut.isPending ? "Đang xuất..." : "Xuất CSV"}
          </Button>
          <InviteAccountDialog />
        </div>
      </div>

      <BulkActionBar selected={[...selected]} onClear={() => setSelected(new Set())} />

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-8">
                <Checkbox checked={allChecked} onCheckedChange={toggleAllPage} />
              </th>
              <SortHead label="Email" k="email" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Công ty" k="company_name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <th className="text-left">Vai trò</th>
              <th className="text-left">Trạng thái</th>
              <SortHead label="Đăng nhập gần nhất" k="last_sign_in_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Ngày tạo" k="created_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <th className="text-right pr-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !accounts.length && (
              <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">Không có tài khoản phù hợp.</td></tr>
            )}
            {accounts.map((a: any) => {
              const banned = a.banned_until && new Date(a.banned_until).getTime() > Date.now();
              const isSel = selected.has(a.id);
              return (
                <tr key={a.id} className={`border-t border-border/50 hover:bg-muted/20 ${isSel ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-2">
                    <Checkbox checked={isSel} onCheckedChange={() => toggleOne(a.id)} />
                  </td>
                  <td className="font-medium">
                    <Link to="/superadmin/accounts/$id" params={{ id: a.id }} className="text-primary hover:underline inline-flex items-center gap-1">
                      {a.email ?? "—"}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                    {a.display_name && (
                      <div className="text-xs text-muted-foreground">{a.display_name}</div>
                    )}
                  </td>
                  <td className="text-muted-foreground">{a.company_name ?? "—"}</td>
                  <td className="space-x-1">
                    {a.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    {a.roles.map((r: string) => (
                      <Badge key={r} variant={r === "superadmin" ? "destructive" : "outline"}>{r}</Badge>
                    ))}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {banned ? (
                        <Badge variant="destructive">Đã khóa</Badge>
                      ) : a.email_confirmed_at ? (
                        <Badge variant="secondary">Hoạt động</Badge>
                      ) : (
                        <Badge variant="outline">Chưa xác thực</Badge>
                      )}
                      {a.has_mfa && (
                        <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40">
                          <ShieldCheck className="h-3 w-3" /> 2FA
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {a.last_sign_in_at ? new Date(a.last_sign_in_at).toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString("vi-VN") : "—"}
                  </td>
                  <td className="text-right pr-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Vai trò</DropdownMenuLabel>
                        {ROLES.map((r) => {
                          const has = a.roles.includes(r);
                          return (
                            <DropdownMenuItem key={r} onClick={() => handleToggleRole(a.id, r, has)}>
                              <ShieldPlus className="mr-2 h-4 w-4" />
                              {has ? `Thu hồi ${r}` : `Cấp ${r}`}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        {a.email && (
                          <DropdownMenuItem onClick={() => handleReset(a.email)}>
                            <KeyRound className="mr-2 h-4 w-4" /> Gửi link đặt lại mật khẩu
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleBan(a.id, !banned)}>
                          {banned ? (<><Unlock className="mr-2 h-4 w-4" /> Mở khóa</>)
                                  : (<><Lock className="mr-2 h-4 w-4" /> Khóa tài khoản</>)}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive"
                          onClick={() => { setConfirmDelete(a); setConfirmEmail(""); }}>
                          <Trash2 className="mr-2 h-4 w-4" /> Xóa tài khoản
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <TablePagination
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          total={total}
          setPage={setPage}
          setPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </Card>

      {isFetching && !isLoading && (
        <p className="text-xs text-muted-foreground">Đang cập nhật…</p>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa tài khoản vĩnh viễn</DialogTitle>
            <DialogDescription>
              Thao tác này sẽ xóa tài khoản <b>{confirmDelete?.email}</b> khỏi hệ thống.
              Dữ liệu thuộc tổ chức của user này sẽ KHÔNG bị xóa tự động.
              Nhập email để xác nhận:
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={confirmDelete?.email ?? ""}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={confirmEmail.toLowerCase() !== (confirmDelete?.email ?? "").toLowerCase()}
              onClick={handleDelete}
            >
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHead({ label, k, sortBy, sortDir, onSort }: {
  label: string;
  k: SortKey;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = sortBy === k;
  return (
    <th className="text-left">
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(k)}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "text-primary" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

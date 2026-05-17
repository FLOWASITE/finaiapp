import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listAllAccounts,
  setUserRole,
  resetUserPassword,
  setAccountBanned,
  deleteAccount,
} from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { MoreHorizontal, KeyRound, Lock, Unlock, Trash2, ShieldPlus } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin/accounts")({
  beforeLoad: requireSuperadminGuard,
  component: AccountsPage,
});

const ROLES = ["owner", "accountant", "viewer", "superadmin"] as const;

function AccountsPage() {
  const list = useServerFn(listAllAccounts);
  const setRole = useServerFn(setUserRole);
  const resetPwd = useServerFn(resetUserPassword);
  const setBanned = useServerFn(setAccountBanned);
  const delAcc = useServerFn(deleteAccount);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-accounts"],
    queryFn: () => list(),
  });

  const [q, setQ] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const accounts = useMemo(() => {
    const all = data?.accounts ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (a: any) =>
        (a.email ?? "").toLowerCase().includes(s) ||
        (a.company_name ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["superadmin-accounts"] });

  const handleToggleRole = async (user_id: string, role: string, has: boolean) => {
    try {
      await setRole({ data: { user_id, role: role as any, enable: !has } });
      toast.success(has ? `Đã thu hồi quyền ${role}` : `Đã cấp quyền ${role}`);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReset = async (email: string) => {
    try {
      await resetPwd({ data: { email } });
      toast.success("Đã gửi liên kết đặt lại mật khẩu");
    } catch (e: any) { toast.error(e.message); }
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
      setConfirmDelete(null);
      setConfirmEmail("");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Tìm theo email hoặc công ty…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {accounts.length} tài khoản
        </p>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="text-left">Công ty</th>
              <th className="text-left">Vai trò</th>
              <th className="text-left">Trạng thái</th>
              <th className="text-left">Đăng nhập gần nhất</th>
              <th className="text-left">Ngày tạo</th>
              <th className="text-right pr-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !accounts.length && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Không có tài khoản.</td></tr>
            )}
            {accounts.map((a: any) => {
              const banned = a.banned_until && new Date(a.banned_until).getTime() > Date.now();
              return (
                <tr key={a.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{a.email ?? "—"}</td>
                  <td className="text-muted-foreground">{a.company_name ?? "—"}</td>
                  <td className="space-x-1">
                    {a.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    {a.roles.map((r: string) => (
                      <Badge key={r} variant={r === "superadmin" ? "destructive" : "outline"}>{r}</Badge>
                    ))}
                  </td>
                  <td>
                    {banned ? (
                      <Badge variant="destructive">Đã khóa</Badge>
                    ) : a.email_confirmed_at ? (
                      <Badge variant="secondary">Hoạt động</Badge>
                    ) : (
                      <Badge variant="outline">Chưa xác thực</Badge>
                    )}
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
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Vai trò</DropdownMenuLabel>
                        {ROLES.map((r) => {
                          const has = a.roles.includes(r);
                          return (
                            <DropdownMenuItem
                              key={r}
                              onClick={() => handleToggleRole(a.id, r, has)}
                            >
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
                          {banned ? (
                            <><Unlock className="mr-2 h-4 w-4" /> Mở khóa</>
                          ) : (
                            <><Lock className="mr-2 h-4 w-4" /> Khóa tài khoản</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => { setConfirmDelete(a); setConfirmEmail(""); }}
                        >
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
      </Card>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa tài khoản vĩnh viễn</DialogTitle>
            <DialogDescription>
              Thao tác này sẽ xóa tài khoản <b>{confirmDelete?.email}</b> khỏi hệ thống.
              Dữ liệu thuộc tổ chức của user này sẽ KHÔNG bị xóa tự động — dùng "Xóa tổ chức" nếu muốn xóa toàn bộ.
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

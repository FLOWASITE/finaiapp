import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAccountDetail,
  forceLogoutAccount,
  resetMfaFactor,
  setTenantMembership,
  resetUserPassword,
  setAccountBanned,
  listOrganizations,
} from "@/lib/superadmin.functions";
import { impersonateUser, transferTenantOwnership } from "@/lib/superadmin-tenants.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ShieldCheck, ShieldOff, LogOut, KeyRound, Lock, Unlock, Plus, Trash2, UserCog, ExternalLink, Crown } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/superadmin/accounts/$id")({
  component: AccountDetailPage,
});

const TENANT_ROLES = ["owner", "admin", "accountant", "viewer"] as const;

function AccountDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getAccountDetail);
  const logoutFn = useServerFn(forceLogoutAccount);
  const mfaResetFn = useServerFn(resetMfaFactor);
  const setMembershipFn = useServerFn(setTenantMembership);
  const resetPwdFn = useServerFn(resetUserPassword);
  const banFn = useServerFn(setAccountBanned);
  const impersonateFn = useServerFn(impersonateUser);
  const transferOwnerFn = useServerFn(transferTenantOwnership);
  const orgsFn = useServerFn(listOrganizations);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-account-detail", id],
    queryFn: () => detailFn({ data: { user_id: id } }),
  });

  const { data: orgsData } = useQuery({
    queryKey: ["superadmin-organizations-light"],
    queryFn: () => orgsFn(),
    staleTime: 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["superadmin-account-detail", id] });

  const [impOpen, setImpOpen] = useState(false);
  const [impReason, setImpReason] = useState("");
  const [impLink, setImpLink] = useState<string | null>(null);
  const [impLoading, setImpLoading] = useState(false);
  const doImpersonate = async () => {
    if (impReason.trim().length < 3) {
      toast.error("Vui lòng nhập lý do (tối thiểu 3 ký tự).");
      return;
    }
    setImpLoading(true);
    try {
      const res = await impersonateFn({ data: { user_id: id, reason: impReason } });
      setImpLink((res as any).action_link);
      toast.success("Đã tạo magic link — mở ở tab ẩn danh.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImpLoading(false);
    }
  };

  const action = <T,>(p: Promise<T>, ok: string) =>
    p.then(() => { toast.success(ok); invalidate(); })
     .catch((e: any) => toast.error(e.message ?? "Thất bại"));

  if (isLoading || !data) {
    return <p className="p-6 text-sm text-muted-foreground">Đang tải…</p>;
  }

  const d: any = data;
  const u = d.user;
  if (!u) return <p className="p-6 text-sm text-muted-foreground">Không tìm thấy tài khoản.</p>;
  const banned = u.banned_until && new Date(u.banned_until).getTime() > Date.now();
  const orgs = (orgsData as any)?.organizations ?? [];
  const memberTenantIds = new Set(d.tenant_memberships.map((m: any) => m.tenant_id));
  const availableOrgs = orgs.filter((o: any) => !memberTenantIds.has(o.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to="/superadmin/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Tài khoản
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => u.email && action(resetPwdFn({ data: { email: u.email } }), "Đã gửi link reset mật khẩu")}>
            <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Reset mật khẩu
          </Button>
          <Button variant="outline" size="sm" onClick={() => action(banFn({ data: { user_id: u.id, banned: !banned } }), banned ? "Đã mở khóa" : "Đã khóa")}>
            {banned ? <><Unlock className="mr-1.5 h-3.5 w-3.5" />Mở khóa</> : <><Lock className="mr-1.5 h-3.5 w-3.5" />Khóa tài khoản</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImpOpen(true)}>
            <UserCog className="mr-1.5 h-3.5 w-3.5" /> Đăng nhập as
          </Button>
                    <Button variant="outline" size="sm" onClick={() => action(logoutFn({ data: { user_id: u.id } }), "Đã đăng xuất mọi phiên")}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" /> Force logout
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">{u.email ?? "—"}</h1>
          <p className="text-xs text-muted-foreground">
            {d.profile?.display_name ?? ""} {d.profile?.company_name ? `· ${d.profile.company_name}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {banned ? <Badge variant="destructive">Đã khóa</Badge> :
              u.email_confirmed_at ? <Badge variant="secondary">Hoạt động</Badge> : <Badge variant="outline">Chưa xác thực</Badge>}
            {d.mfa_factors.length > 0 && <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40"><ShieldCheck className="h-3 w-3" /> 2FA</Badge>}
            {d.platform_roles.map((r: any) => (
              <Badge key={r.role} variant={r.role === "superadmin" ? "destructive" : "outline"}>{r.role}</Badge>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
          <TabsTrigger value="tenants">Tổ chức ({d.tenant_memberships.length})</TabsTrigger>
          <TabsTrigger value="security">Phiên & Bảo mật</TabsTrigger>
          <TabsTrigger value="audit">Nhật ký ({d.recent_audits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 text-sm">
              <Field label="ID" value={u.id} mono />
              <Field label="Email" value={u.email} />
              <Field label="Số điện thoại" value={u.phone ?? d.profile?.phone ?? "—"} />
              <Field label="Tên hiển thị" value={d.profile?.display_name ?? "—"} />
              <Field label="Công ty" value={d.profile?.company_name ?? "—"} />
              <Field label="MST" value={d.profile?.tax_id ?? "—"} />
              <Field label="Chức danh" value={d.profile?.job_title ?? "—"} />
              <Field label="Ngày tạo" value={u.created_at ? new Date(u.created_at).toLocaleString("vi-VN") : "—"} />
              <Field label="Xác thực email" value={u.email_confirmed_at ? new Date(u.email_confirmed_at).toLocaleString("vi-VN") : "Chưa"} />
              <Field label="Đăng nhập gần nhất" value={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("vi-VN") : "—"} />
              <Field label="Khóa đến" value={banned ? new Date(u.banned_until).toLocaleString("vi-VN") : "—"} />
              <Field label="Tổ chức đang dùng" value={d.profile?.active_tenant_id ?? "—"} mono />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Vai trò tại các tổ chức</CardTitle>
              <AddMembership availableOrgs={availableOrgs} onAdd={(tenant_id, role) =>
                action(setMembershipFn({ data: { user_id: u.id, tenant_id, role: role as any } }), "Đã thêm vào tổ chức")} />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tổ chức</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.tenant_memberships.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Chưa thuộc tổ chức nào</TableCell></TableRow>
                  )}
                  {d.tenant_memberships.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{m.tenants?.company_name ?? m.tenants?.name ?? m.tenant_id.slice(0, 8)}</div>
                        {m.tenants?.tax_id && <div className="text-xs text-muted-foreground">MST {m.tenants.tax_id}</div>}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={(v) => action(setMembershipFn({ data: { user_id: u.id, tenant_id: m.tenant_id, role: v as any } }), "Đã đổi vai trò")}
                        >
                          <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TENANT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Badge variant="outline">{m.status}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        {m.role !== "owner" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Chuyển quyền sở hữu cho user này"
                            onClick={() => {
                              if (!confirm(`Chuyển quyền sở hữu của tổ chức cho ${u.email}? Chủ cũ sẽ bị hạ xuống admin.`)) return;
                              action(
                                transferOwnerFn({ data: { tenant_id: m.tenant_id, new_owner_user_id: u.id } }),
                                "Đã chuyển quyền sở hữu",
                              );
                            }}
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => action(setMembershipFn({ data: { user_id: u.id, tenant_id: m.tenant_id, remove: true } }), "Đã gỡ khỏi tổ chức")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Xác thực 2 lớp (MFA)</CardTitle></CardHeader>
            <CardContent className="p-0">
              {d.mfa_factors.length === 0 ? (
                <p className="px-6 py-4 text-sm text-muted-foreground">Chưa thiết lập 2FA</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại</TableHead>
                      <TableHead>Tên</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thiết lập</TableHead>
                      <TableHead className="text-right">Xóa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.mfa_factors.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell><Badge variant="outline">{f.factor_type}</Badge></TableCell>
                        <TableCell>{f.friendly_name ?? "—"}</TableCell>
                        <TableCell>{f.status}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {f.created_at ? new Date(f.created_at).toLocaleString("vi-VN") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="text-destructive"
                            onClick={() => action(mfaResetFn({ data: { user_id: u.id, factor_id: f.id } }), "Đã xóa MFA factor")}>
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Phiên đăng nhập</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Đăng nhập gần nhất: <span className="text-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("vi-VN") : "—"}</span></p>
              <p className="text-xs">Nút "Force logout" ở đầu trang sẽ đăng xuất toàn bộ phiên đang hoạt động.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Bảng</TableHead>
                  <TableHead>Bản ghi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.recent_audits.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Chưa có nhật ký</TableCell></TableRow>
                )}
                {d.recent_audits.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    <TableCell className="text-xs">{a.table_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.record_id ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={impOpen} onOpenChange={(o) => { if (!o) { setImpOpen(false); setImpLink(null); setImpReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đăng nhập với tư cách {u.email}</DialogTitle>
            <DialogDescription>
              Sinh magic link 1 lần. Mọi hành động sẽ được log dưới tên Super-admin với cờ <code>impersonate</code>. Mở ở tab ẩn danh để giữ phiên hiện tại.
            </DialogDescription>
          </DialogHeader>
          {!impLink ? (
            <div className="grid gap-2">
              <Label className="text-xs">Lý do (bắt buộc)</Label>
              <Input value={impReason} onChange={(e) => setImpReason(e.target.value)} placeholder="VD: support ticket #1234" />
            </div>
          ) : (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-2 text-xs">
              <div className="font-medium">Magic link sẵn sàng:</div>
              <div className="font-mono break-all">{impLink}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImpOpen(false); setImpLink(null); setImpReason(""); }}>Đóng</Button>
            {!impLink ? (
              <Button onClick={doImpersonate} disabled={impLoading}>
                <UserCog className="mr-1.5 h-4 w-4" />{impLoading ? "Đang tạo…" : "Tạo magic link"}
              </Button>
            ) : (
              <Button asChild>
                <a href={impLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />Mở
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function AddMembership({ availableOrgs, onAdd }: { availableOrgs: any[]; onAdd: (tenant_id: string, role: string) => void }) {
  const [tenant, setTenant] = useState("");
  const [role, setRole] = useState("viewer");
  if (!availableOrgs.length) return null;
  return (
    <div className="flex items-center gap-2">
      <Select value={tenant} onValueChange={setTenant}>
        <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Chọn tổ chức…" /></SelectTrigger>
        <SelectContent>
          {availableOrgs.map((o: any) => (
            <SelectItem key={o.id} value={o.id}>{o.company_name ?? o.email ?? o.id.slice(0, 8)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TENANT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!tenant} onClick={() => { onAdd(tenant, role); setTenant(""); }}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Thêm
      </Button>
    </div>
  );
}

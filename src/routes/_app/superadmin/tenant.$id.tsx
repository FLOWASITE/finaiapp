import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getTenantAdmin,
  updateTenantAdmin,
  addTenantMember,
  removeTenantMember,
  updateMemberRole,
  transferTenantOwnership,
  deleteTenantAdmin,
  getTenantAuditLogs,
  impersonateTenantOwner,
  resendTenantInvite,
  cancelTenantInvite,
  listTenantPlanHistory,
  reopenFiscalPeriod,
  archiveTenant,
} from "@/lib/superadmin-tenants.functions";
import { setTenantSuspended, updateTenantPlan } from "@/lib/superadmin-extra.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Building2, Save, ShieldOff, ShieldCheck, UserPlus, Trash2,
  Crown, AlertTriangle, Lock, Unlock, UserCog, ExternalLink, Mail, X as XIcon, Clock, Archive, History,
} from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/tenant/$id")({
  component: TenantDetailPage,
});

const ROLES = ["owner", "admin", "accountant", "viewer"] as const;
const PLANS = ["free", "pro", "business", "enterprise"];

function TenantDetailPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getTenantAdmin);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-tenant-admin", id],
    queryFn: () => getFn({ data: { tenant_id: id } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["superadmin-tenant-admin", id] });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải hồ sơ tenant…</p>;
  if (!data?.tenant) return <p className="text-sm">Không tìm thấy tenant.</p>;

  const t = data.tenant as any;
  const statusBadge = t.status === "suspended"
    ? <Badge variant="destructive">Tạm khóa</Badge>
    : t.status === "archived"
      ? <Badge variant="outline">Lưu trữ</Badge>
      : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Hoạt động</Badge>;

  return (
    <div className="space-y-4">
      <Link to="/superadmin/organizations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Danh sách tenants
      </Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              {t.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t.company_name && <>{t.company_name} · </>}MST: {t.tax_id ?? "—"} · Chủ: {data.owner_email ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge}
            {t.suspended_reason && (
              <span className="text-xs text-muted-foreground italic">"{t.suspended_reason}"</span>
            )}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="members">Thành viên ({data.members.length})</TabsTrigger>
          <TabsTrigger value="plan">Gói & Usage</TabsTrigger>
          <TabsTrigger value="locks">Khóa kỳ ({data.locks.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="danger" className="text-destructive">Vùng nguy hiểm</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab tenant={t} onSaved={refresh} /></TabsContent>
        <TabsContent value="members">
          <MembersTab tenantId={id} members={data.members} ownerId={t.owner_user_id} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="plan"><PlanTab tenantId={id} plan={data.plan} usage={data.usage} onSaved={refresh} /></TabsContent>
        <TabsContent value="locks"><LocksTab locks={data.locks} onChanged={refresh} /></TabsContent>
        <TabsContent value="audit"><AuditTab tenantId={id} fallback={data.recent_audit} /></TabsContent>
        <TabsContent value="danger">
          <DangerTab tenant={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =========================================================================
// Overview
// =========================================================================

function OverviewTab({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const updFn = useServerFn(updateTenantAdmin);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    setForm({
      name: tenant.name ?? "",
      company_name: tenant.company_name ?? "",
      tax_id: tenant.tax_id ?? "",
      address: tenant.address ?? "",
      phone: tenant.phone ?? "",
      email: tenant.email ?? "",
      website: tenant.website ?? "",
      accounting_standard: tenant.accounting_standard ?? "TT133",
      base_currency: tenant.base_currency ?? "VND",
      fiscal_year_start: tenant.fiscal_year_start ?? 1,
      legal_rep_name: tenant.legal_rep_name ?? "",
      legal_rep_title: tenant.legal_rep_title ?? "",
      chief_accountant_name: tenant.chief_accountant_name ?? "",
      preparer_name: tenant.preparer_name ?? "",
      logo_url: tenant.logo_url ?? "",
      tax_method: tenant.tax_method ?? "",
      vat_period: tenant.vat_period ?? "",
    });
  }, [tenant.id]);

  const save = async () => {
    try {
      const patch: any = {};
      for (const k of Object.keys(form)) {
        const v = form[k];
        if (k === "fiscal_year_start") patch[k] = Number(v) || 1;
        else patch[k] = v === "" ? null : v;
      }
      await updFn({ data: { tenant_id: tenant.id, patch } });
      toast.success("Đã lưu");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  };

  const field = (key: string, label: string, type = "text") => (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Card className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {field("name", "Tên tenant *")}
        {field("company_name", "Tên công ty")}
        {field("tax_id", "MST")}
        {field("phone", "Điện thoại")}
        {field("email", "Email công ty")}
        {field("website", "Website")}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Chuẩn KT</Label>
          <Select value={form.accounting_standard} onValueChange={(v) => setForm({ ...form, accounting_standard: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TT133">TT133</SelectItem>
              <SelectItem value="TT99">TT99</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {field("base_currency", "Tiền tệ")}
        {field("fiscal_year_start", "Tháng bắt đầu NĐ", "number")}
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Địa chỉ</Label>
        <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {field("legal_rep_name", "Người đại diện PL")}
        {field("legal_rep_title", "Chức danh")}
        {field("chief_accountant_name", "Kế toán trưởng")}
        {field("preparer_name", "Người lập")}
        {field("tax_method", "Phương pháp thuế")}
        {field("vat_period", "Kỳ VAT")}
      </div>
      <div>
        <Button onClick={save}><Save className="mr-1.5 h-4 w-4" />Lưu thay đổi</Button>
      </div>
    </Card>
  );
}

// =========================================================================
// Members
// =========================================================================

function MembersTab({
  tenantId, members, ownerId, onChanged,
}: { tenantId: string; members: any[]; ownerId: string | null; onChanged: () => void }) {
  const addFn = useServerFn(addTenantMember);
  const removeFn = useServerFn(removeTenantMember);
  const roleFn = useServerFn(updateMemberRole);
  const transferFn = useServerFn(transferTenantOwnership);
  const resendFn = useServerFn(resendTenantInvite);
  const cancelFn = useServerFn(cancelTenantInvite);

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<(typeof ROLES)[number]>("accountant");
  const [transferTo, setTransferTo] = useState<any | null>(null);

  const add = async () => {
    try {
      await addFn({ data: { tenant_id: tenantId, email: newEmail, role: newRole } });
      toast.success("Đã thêm thành viên");
      setAddOpen(false); setNewEmail(""); setNewRole("accountant");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  const changeRole = async (memberId: string, role: string) => {
    try {
      await roleFn({ data: { member_id: memberId, role } });
      toast.success("Đã cập nhật vai trò");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  const remove = async (m: any) => {
    if (!confirm(`Xóa thành viên ${m.email ?? m.user_id}?`)) return;
    try {
      await removeFn({ data: { member_id: m.id } });
      toast.success("Đã xóa");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  const resendInvite = async (m: any) => {
    try {
      await resendFn({ data: { member_id: m.id } });
      toast.success("Đã gửi lại lời mời");
    } catch (e: any) { toast.error(e.message); }
  };
  const cancelInvite = async (m: any) => {
    if (!confirm(`Hủy lời mời ${m.email ?? m.user_id}?`)) return;
    try {
      await cancelFn({ data: { member_id: m.id } });
      toast.success("Đã hủy lời mời");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  const transfer = async () => {
    if (!transferTo) return;
    if (!confirm(`Chuyển quyền sở hữu cho ${transferTo.email}? Chủ cũ sẽ chuyển vai trò thành admin.`)) return;
    try {
      await transferFn({ data: { tenant_id: tenantId, new_owner_user_id: transferTo.user_id } });
      toast.success("Đã chuyển quyền sở hữu");
      setTransferTo(null);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Thành viên ({members.length})</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" />Thêm thành viên
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="text-left">Vai trò</th>
              <th className="text-left">Trạng thái</th>
              <th className="text-left">Tham gia</th>
              <th className="text-right pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m: any) => (
              <tr key={m.id} className="border-t border-border/50">
                <td className="px-3 py-2">
                  <span className={m.user_id === ownerId ? "font-medium" : ""}>{m.email ?? m.user_id}</span>
                  {m.user_id === ownerId && (
                    <Badge variant="secondary" className="ml-2"><Crown className="mr-1 h-3 w-3" />Chủ sở hữu</Badge>
                  )}
                </td>
                <td>
                  <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td>{m.status === "invited"
                    ? <Badge variant="outline" className="text-xs gap-1"><Clock className="h-3 w-3" />Mời chờ</Badge>
                    : <Badge variant="outline" className="text-xs">{m.status}</Badge>}</td>
                <td className="text-xs text-muted-foreground">
                  {m.created_at ? new Date(m.created_at).toLocaleDateString("vi-VN") : "—"}
                </td>
                <td className="text-right pr-3 space-x-1">
                  {m.status === "invited" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => resendInvite(m)} title="Gửi lại lời mời">
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelInvite(m)} title="Hủy lời mời" className="text-destructive hover:text-destructive">
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {m.status !== "invited" && m.user_id !== ownerId && (
                    <Button size="sm" variant="ghost" onClick={() => setTransferTo(m)} title="Chuyển quyền sở hữu">
                      <Crown className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm thành viên</DialogTitle>
            <DialogDescription>
              Nếu email chưa có tài khoản, hệ thống sẽ gửi lời mời tự động.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Vai trò</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Hủy</Button>
            <Button onClick={add} disabled={!newEmail}>Thêm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferTo} onOpenChange={(o) => !o && setTransferTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chuyển quyền sở hữu</DialogTitle>
            <DialogDescription>
              Chuyển quyền sở hữu tenant <b>cho {transferTo?.email}</b>. Chủ cũ sẽ giữ vai trò <b>admin</b>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTo(null)}>Hủy</Button>
            <Button onClick={transfer}>Xác nhận chuyển</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// =========================================================================
// Plan & Usage
// =========================================================================

function PlanTab({
  tenantId, plan, usage, onSaved,
}: { tenantId: string; plan: any; usage: any; onSaved: () => void }) {
  const planFn = useServerFn(updateTenantPlan);
  const [form, setForm] = useState<any>({
    plan: plan?.plan ?? "free",
    seats_limit: plan?.seats_limit ?? "",
    ai_tokens_quota: plan?.ai_tokens_quota ?? "",
    storage_quota_mb: plan?.storage_quota_mb ?? "",
    notes: plan?.notes ?? "",
  });

  const save = async () => {
    try {
      await planFn({
        data: {
          tenant_id: tenantId,
          plan: form.plan,
          seats_limit: form.seats_limit === "" ? null : Number(form.seats_limit),
          ai_tokens_quota: form.ai_tokens_quota === "" ? null : Number(form.ai_tokens_quota),
          storage_quota_mb: form.storage_quota_mb === "" ? null : Number(form.storage_quota_mb),
          notes: form.notes || null,
        },
      });
      toast.success("Đã lưu gói");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
  };

  const historyFn = useServerFn(listTenantPlanHistory);
  const { data: hist } = useQuery({
    queryKey: ["superadmin-tenant-plan-history", tenantId],
    queryFn: () => historyFn({ data: { tenant_id: tenantId, limit: 30 } }),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Gói dịch vụ</h3>
        <div className="grid gap-1.5">
          <Label>Plan</Label>
          <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Seats</Label>
            <Input type="number" value={form.seats_limit} onChange={(e) => setForm({ ...form, seats_limit: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">AI tokens</Label>
            <Input type="number" value={form.ai_tokens_quota} onChange={(e) => setForm({ ...form, ai_tokens_quota: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Storage (MB)</Label>
            <Input type="number" value={form.storage_quota_mb} onChange={(e) => setForm({ ...form, storage_quota_mb: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Ghi chú</Label>
          <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <Button onClick={save}><Save className="mr-1.5 h-4 w-4" />Lưu gói</Button>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">Sử dụng kỳ hiện tại</h3>
        {!usage && <p className="text-sm text-muted-foreground">Chưa có dữ liệu sử dụng tháng này.</p>}
        {usage && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">AI tokens used</dt>
            <dd className="tabular-nums text-right">{Number(usage.ai_tokens_used ?? 0).toLocaleString("vi-VN")}</dd>
            <dt className="text-muted-foreground">Files parsed</dt>
            <dd className="tabular-nums text-right">{usage.ai_files_parsed ?? 0}</dd>
            <dt className="text-muted-foreground">Storage (MB)</dt>
            <dd className="tabular-nums text-right">{Number(usage.storage_used_mb ?? 0).toLocaleString("vi-VN")}</dd>
            <dt className="text-muted-foreground">Documents</dt>
            <dd className="tabular-nums text-right">{usage.documents_count ?? 0}</dd>
          </dl>
        )}
      </Card>
    </div>

    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4" />Lịch sử thay đổi gói</h3>
      {(!hist || (hist as any).items.length === 0) ? (
        <p className="text-sm text-muted-foreground">Chưa có thay đổi nào.</p>
      ) : (
        <ul className="space-y-1 text-xs max-h-72 overflow-auto">
          {((hist as any).items as any[]).map((h) => (
            <li key={h.id} className="flex items-center justify-between border-b border-border/40 py-1.5">
              <div>
                <Badge variant="secondary" className="mr-2">{h.plan}</Badge>
                <span className="text-muted-foreground">
                  {h.seats_limit ? `${h.seats_limit} seats` : "—"}
                  {h.ai_tokens_quota ? ` · ${Number(h.ai_tokens_quota).toLocaleString("vi-VN")} tokens` : ""}
                  {h.storage_quota_mb ? ` · ${h.storage_quota_mb}MB` : ""}
                </span>
                {h.notes && <div className="text-muted-foreground italic">"{h.notes}"</div>}
              </div>
              <div className="text-right text-muted-foreground">
                <div>{new Date(h.changed_at).toLocaleString("vi-VN")}</div>
                {h.changed_by_email && <div className="text-[10px]">{h.changed_by_email}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
    </div>
  );
}

// =========================================================================
// Locks
// =========================================================================

function LocksTab({ locks, onChanged }: { locks: any[]; onChanged: () => void }) {
  const reopenFn = useServerFn(reopenFiscalPeriod);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reopen = async (period: any) => {
    const reason = prompt(`Nhập lý do mở lại kỳ ${period.period_no}/${period.year} (sẽ ghi audit):`);
    if (!reason || reason.trim().length < 3) return;
    setBusyId(period.id);
    try {
      await reopenFn({ data: { period_id: period.id, reason } });
      toast.success("Đã mở lại kỳ");
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
        <Lock className="h-4 w-4" />Kỳ kế toán đã khóa
      </h3>
      {!locks.length && <p className="text-sm text-muted-foreground">Chưa khóa kỳ nào.</p>}
      <ul className="space-y-1 text-sm">
        {locks.map((l: any) => (
          <li key={l.id} className="flex items-center justify-between border-b border-border/40 py-1.5 gap-2">
            <span>Kỳ {l.period_no}/{l.year} <Badge variant="outline" className="ml-2 text-xs">{l.status}</Badge></span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {l.closed_at ? new Date(l.closed_at).toLocaleDateString("vi-VN") : "—"}
              </span>
              <Button size="sm" variant="outline" onClick={() => reopen(l)} disabled={busyId === l.id}>
                <Unlock className="mr-1.5 h-3.5 w-3.5" />{busyId === l.id ? "Đang mở…" : "Mở lại (khẩn cấp)"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// =========================================================================
// Audit
// =========================================================================

function AuditTab({ tenantId, fallback }: { tenantId: string; fallback: any[] }) {
  const fetchFn = useServerFn(getTenantAuditLogs);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["superadmin-tenant-audit", tenantId],
    queryFn: () => fetchFn({ data: { tenant_id: tenantId, limit: 200 } }),
    placeholderData: { items: fallback, next_before: null } as any,
    staleTime: 30_000,
  });
  const items = (data as any)?.items ?? fallback ?? [];
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nhật ký hoạt động ({items.length})</h3>
        {(isLoading || isFetching) && <span className="text-xs text-muted-foreground">Đang cập nhật nhật ký…</span>}
      </div>
      {!items.length && <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>}
      <ul className="space-y-1 text-xs max-h-[640px] overflow-auto">
        {items.map((a: any) => (
          <li key={a.id} className="border-b border-border/40 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-mono text-foreground">{a.action}</span>
                {a.table_name && <span className="text-muted-foreground"> · {a.table_name}</span>}
              </div>
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(a.created_at).toLocaleString("vi-VN")}
              </span>
            </div>
            {a.actor_email && <div className="text-muted-foreground">bởi {a.actor_email}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// =========================================================================
// Danger zone
// =========================================================================

function DangerTab({ tenant }: { tenant: any }) {
  const susFn = useServerFn(setTenantSuspended);
  const delFn = useServerFn(deleteTenantAdmin);
  const archiveFn = useServerFn(archiveTenant);
  const [archReason, setArchReason] = useState("");
  const qc = useQueryClient();

  const [reason, setReason] = useState(tenant.suspended_reason ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleSuspend = async () => {
    const willSuspend = tenant.status !== "suspended";
    try {
      await susFn({
        data: {
          tenant_id: tenant.id,
          suspended: willSuspend,
          reason: willSuspend ? reason : undefined,
        },
      });
      toast.success(willSuspend ? "Đã tạm khóa" : "Đã khôi phục");
      qc.invalidateQueries({ queryKey: ["superadmin-tenant-admin", tenant.id] });
    } catch (e: any) { toast.error(e.message); }
  };

  const doArchive = async () => {
    const willArchive = tenant.status !== "archived";
    try {
      await archiveFn({
        data: {
          tenant_id: tenant.id,
          archived: willArchive,
          reason: willArchive ? archReason : undefined,
        },
      });
      toast.success(willArchive ? "Đã lưu trữ tenant" : "Đã khôi phục tenant");
      qc.invalidateQueries({ queryKey: ["superadmin-tenant-admin", tenant.id] });
    } catch (e: any) { toast.error(e.message); }
  };

  const doDelete = async () => {
    if (confirmName.trim() !== tenant.name?.trim()) {
      toast.error("Tên xác nhận không khớp.");
      return;
    }
    try {
      await delFn({ data: { tenant_id: tenant.id, confirm_name: confirmName } });
      toast.success("Đã xóa tenant và toàn bộ dữ liệu");
      window.location.href = "/superadmin/organizations";
    } catch (e: any) { toast.error(e.message); }
  };

  // Impersonate hook: state + server fn binding kept inside tab to keep code colocated.
  const impersonateFn = useServerFn(impersonateTenantOwner);
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
      const res = await impersonateFn({ data: { tenant_id: tenant.id, reason: impReason } });
      setImpLink((res as any).action_link);
      toast.success("Đã tạo liên kết đăng nhập tạm — mở ở tab ẩn danh để giữ phiên Super-admin.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImpLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3 border-blue-500/30">
        <div className="flex items-start gap-3">
          <UserCog className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Đăng nhập với tư cách chủ sở hữu</h3>
            <p className="text-xs text-muted-foreground">
              Sinh magic link 1 lần để debug như chủ tenant. Mọi hành động được log với cờ <code>impersonate</code>. Hết hạn sau 60 phút.
            </p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Lý do (bắt buộc, ghi vào audit)</Label>
          <Input
            placeholder="VD: support ticket #1234 — kế toán báo lỗi đối soát"
            value={impReason}
            onChange={(e) => setImpReason(e.target.value)}
          />
        </div>
        {impLink ? (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-2 text-xs">
            <div className="font-medium">Magic link sẵn sàng (mở ở tab ẩn danh):</div>
            <div className="font-mono break-all">{impLink}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={impLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Mở liên kết
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(impLink).then(() => toast.success("Đã copy"))}>Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => { setImpLink(null); setImpReason(""); }}>Đóng</Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" variant="default" onClick={doImpersonate} disabled={impLoading}>
              <UserCog className="mr-1.5 h-4 w-4" />{impLoading ? "Đang tạo…" : "Tạo magic link"}
            </Button>
          </div>
        )}
      </Card>
      <Card className="p-4 space-y-3 border-orange-500/30">
        <div className="flex items-start gap-3">
          {tenant.status === "suspended"
            ? <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5" />
            : <ShieldOff className="h-5 w-5 text-orange-600 mt-0.5" />}
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {tenant.status === "suspended" ? "Khôi phục tenant" : "Tạm khóa tenant"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {tenant.status === "suspended"
                ? "Khôi phục quyền truy cập cho mọi thành viên."
                : "Chặn truy cập tới tenant cho tất cả thành viên cho đến khi được khôi phục."}
            </p>
          </div>
        </div>
        {tenant.status !== "suspended" && (
          <div className="grid gap-1.5">
            <Label>Lý do</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vi phạm điều khoản…" />
          </div>
        )}
        <Button
          variant={tenant.status === "suspended" ? "default" : "destructive"}
          onClick={toggleSuspend}
        >
          {tenant.status === "suspended" ? "Khôi phục" : "Tạm khóa"}
        </Button>
      </Card>

      <Card className="p-4 space-y-3 border-amber-500/30">
        <div className="flex items-start gap-3">
          <Archive className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              {tenant.status === "archived" ? "Khôi phục từ lưu trữ" : "Lưu trữ tenant"}
            </h3>
            <p className="text-xs text-muted-foreground">
              Soft-delete: ẩn khỏi danh sách hoạt động nhưng giữ nguyên dữ liệu. Có thể khôi phục bất cứ lúc nào.
            </p>
          </div>
        </div>
        {tenant.status !== "archived" && (
          <div className="grid gap-1.5">
            <Label className="text-xs">Lý do (tùy chọn)</Label>
            <Input value={archReason} onChange={(e) => setArchReason(e.target.value)} />
          </div>
        )}
        <div>
          <Button size="sm" variant="outline" onClick={doArchive}>
            <Archive className="mr-1.5 h-4 w-4" />
            {tenant.status === "archived" ? "Khôi phục" : "Lưu trữ"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3 border-destructive/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-destructive">Xóa vĩnh viễn</h3>
            <p className="text-xs text-muted-foreground">
              Xóa <b>toàn bộ</b> dữ liệu nghiệp vụ (hóa đơn, bút toán, kho, lương, AI memory…) của tenant.
              <b> Không thể hoàn tác.</b> Tài khoản đăng nhập của các thành viên KHÔNG bị xóa.
            </p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Nhập đúng tên tenant để xác nhận: <code className="px-1 bg-muted">{tenant.name}</code></Label>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={tenant.name} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox" checked={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.checked)}
          />
          Tôi hiểu thao tác này không thể hoàn tác.
        </label>
        <Button
          variant="destructive"
          disabled={confirmName.trim() !== tenant.name?.trim() || !confirmDelete}
          onClick={doDelete}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />Xóa vĩnh viễn
        </Button>
      </Card>
    </div>
  );
}

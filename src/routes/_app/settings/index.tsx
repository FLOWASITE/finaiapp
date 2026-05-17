import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSettings, updateSettings, togglePeriodLock, listFxRates, upsertFxRate,
} from "@/lib/settings.functions";
import {
  getActiveTenant, updateActiveTenant, listTenantMembers, inviteTenantMember,
  updateMemberRole, removeMember,
} from "@/lib/tenants.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Upload, X, UserPlus, Trash2, Building2, Calculator, FileSignature, Image as ImageIcon, RotateCcw, Save } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { TaxIdLookupInput } from "@/components/tax-id-lookup-input";

export const Route = createFileRoute("/_app/settings/")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Hồ sơ doanh nghiệp, kỳ kế toán, tỷ giá, phân quyền</p>
      </div>
      <Tabs defaultValue="organization">
        <div className="-mx-1 overflow-x-auto">
          <TabsList className="inline-flex w-max">
            <TabsTrigger value="organization">Tổ chức</TabsTrigger>
            <TabsTrigger value="members">Thành viên</TabsTrigger>
            <TabsTrigger value="company">Hồ sơ cá nhân</TabsTrigger>
            <TabsTrigger value="periods">Khoá sổ</TabsTrigger>
            <TabsTrigger value="fx">Tỷ giá</TabsTrigger>
            <TabsTrigger value="roles">Phân quyền</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="organization"><OrganizationTab /></TabsContent>
        <TabsContent value="members"><MembersTab /></TabsContent>
        <TabsContent value="company"><CompanyTab /></TabsContent>
        <TabsContent value="periods"><PeriodsTab /></TabsContent>
        <TabsContent value="fx"><FxTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function OrganizationTab() {
  const get = useServerFn(getActiveTenant);
  const upd = useServerFn(updateActiveTenant);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["active-tenant"], queryFn: () => get() });
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (data?.tenant && !form) setForm(data.tenant); }, [data, form]);

  const canEdit = data?.myRole === "owner" || data?.myRole === "admin";
  const mutate = useMutation({
    mutationFn: (v: any) => upd({ data: v }),
    onSuccess: () => {
      toast.success("Đã lưu thay đổi");
      qc.invalidateQueries({ queryKey: ["active-tenant"] });
      qc.invalidateQueries({ queryKey: ["my-tenants"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!data?.tenant) return (
    <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
      Chưa chọn tổ chức nào. Vui lòng chọn ở góc trên màn hình.
    </CardContent></Card>
  );
  if (!form) return <p className="p-4">Đang tải…</p>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const dirty = JSON.stringify(form) !== JSON.stringify(data.tenant);
  const reset = () => setForm(data.tenant);
  const save = () => mutate.mutate({
    name: form.name, company_name: form.company_name, tax_id: form.tax_id,
    address: form.address, phone: form.phone,
    accounting_standard: form.accounting_standard, base_currency: form.base_currency,
    fiscal_year_start: form.fiscal_year_start,
    logo_url: form.logo_url, signature_url: form.signature_url, stamp_url: form.stamp_url,
    preparer_name: form.preparer_name, chief_accountant_name: form.chief_accountant_name,
    legal_rep_name: form.legal_rep_name,
  });

  const ROLE_LABEL: Record<string, string> = {
    owner: "Chủ sở hữu", admin: "Quản trị", accountant: "Kế toán", viewer: "Người xem",
  };
  const initials = (form.name ?? form.company_name ?? "?").trim().split(/\s+/).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();

  return (
    <div className="space-y-6 pb-24">
      {/* Hero */}
      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <Avatar className="h-14 w-14 ring-2 ring-border shadow-sm">
            {form.logo_url ? <AvatarImage src={form.logo_url} alt={form.name} className="object-contain bg-white" /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">{initials || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold truncate">{form.company_name || form.name || "(chưa đặt tên)"}</h2>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{ROLE_LABEL[data.myRole ?? ""] ?? data.myRole}</Badge>
              {!canEdit && <Badge variant="outline" className="text-[10px]">Chỉ đọc</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {form.name && form.name !== form.company_name ? form.name : "Hồ sơ tổ chức đang hoạt động"}
              {form.tax_id ? ` · MST ${form.tax_id}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Row 1: Thông tin (2/3) + Thương hiệu (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />Thông tin doanh nghiệp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Tên hiển thị</Label>
                <Input disabled={!canEdit} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="VD: Công ty ABC" />
                <p className="text-[11px] text-muted-foreground">Tên ngắn dùng trong giao diện.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tên pháp nhân</Label>
                <Input disabled={!canEdit} value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} placeholder="VD: CÔNG TY TNHH ABC" />
                <p className="text-[11px] text-muted-foreground">In trên hoá đơn, BCTC.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mã số thuế</Label>
                <TaxIdLookupInput disabled={!canEdit} value={form.tax_id ?? ""} onChange={(v) => set("tax_id", v)} onResolved={(d) => setForm({ ...form, tax_id: d.taxId, company_name: form.company_name || d.name, address: form.address || d.address || "" })} />
                <p className="text-[11px] text-muted-foreground">Nhấn kính lúp để tự điền tên & địa chỉ.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Điện thoại</Label>
                <Input disabled={!canEdit} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="VD: 0901234567" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Địa chỉ trụ sở</Label>
              <Input disabled={!canEdit} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4 text-primary" />Thương hiệu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CompactImageRow label="Logo" hint="PNG / JPG" url={form.logo_url} onChange={(u) => set("logo_url", u)} prefix="logo" disabled={!canEdit} />
            <Separator />
            <CompactImageRow label="Chữ ký" hint="PNG nền trong" url={form.signature_url} onChange={(u) => set("signature_url", u)} prefix="signature" disabled={!canEdit} />
            <Separator />
            <CompactImageRow label="Con dấu" hint="PNG nền trong" url={form.stamp_url} onChange={(u) => set("stamp_url", u)} prefix="stamp" disabled={!canEdit} />
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Cấu hình kế toán + Người ký BCTC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Calculator className="h-4 w-4 text-primary" />Cấu hình kế toán
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-3">
              <Label className="text-xs">Chuẩn kế toán</Label>
              <Select disabled={!canEdit} value={form.accounting_standard} onValueChange={(v) => set("accounting_standard", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TT133">TT133 — Doanh nghiệp nhỏ và vừa</SelectItem>
                  <SelectItem value="TT200">TT200 — Đầy đủ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đồng tiền hạch toán</Label>
              <Input disabled={!canEdit} value={form.base_currency ?? "VND"} onChange={(e) => set("base_currency", e.target.value.toUpperCase())} maxLength={3} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Tháng bắt đầu năm tài chính</Label>
              <Select disabled={!canEdit} value={String(form.fiscal_year_start ?? 1)} onValueChange={(v) => set("fiscal_year_start", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>Tháng {m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileSignature className="h-4 w-4 text-primary" />Người ký Báo cáo tài chính
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Người lập biểu</Label>
              <Input disabled={!canEdit} value={form.preparer_name ?? ""} onChange={(e) => set("preparer_name", e.target.value)} placeholder="Nhập họ tên" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kế toán trưởng</Label>
              <Input disabled={!canEdit} value={form.chief_accountant_name ?? ""} onChange={(e) => set("chief_accountant_name", e.target.value)} placeholder="Nhập họ tên" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đại diện pháp luật</Label>
              <Input disabled={!canEdit} value={form.legal_rep_name ?? ""} onChange={(e) => set("legal_rep_name", e.target.value)} placeholder="Nhập họ tên" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky save bar */}
      {canEdit && dirty && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-xs text-muted-foreground">Bạn có thay đổi chưa lưu</span>
            <Separator orientation="vertical" className="h-5" />
            <Button size="sm" variant="ghost" onClick={reset} disabled={mutate.isPending}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />Hoàn tác
            </Button>
            <Button size="sm" onClick={save} disabled={mutate.isPending}>
              <Save className="mr-1 h-3.5 w-3.5" />{mutate.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MembersTab() {
  const list = useServerFn(listTenantMembers);
  const invite = useServerFn(inviteTenantMember);
  const updRole = useServerFn(updateMemberRole);
  const rm = useServerFn(removeMember);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["tenant-members"], queryFn: () => list() });
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "accountant" | "viewer">("accountant");

  const canManage = data?.myRole === "owner" || data?.myRole === "admin";
  const inviteMut = useMutation({
    mutationFn: () => invite({ data: { email, role } }),
    onSuccess: (r: any) => {
      toast.success(r?.invited ? "Đã gửi lời mời" : "Đã thêm thành viên");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: (v: { memberId: string; role: any }) => updRole({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-members"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const rmMut = useMutation({
    mutationFn: (memberId: string) => rm({ data: { memberId } }),
    onSuccess: () => { toast.success("Đã gỡ thành viên"); qc.invalidateQueries({ queryKey: ["tenant-members"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const ROLE_LABEL: Record<string, string> = {
    owner: "Chủ sở hữu", admin: "Quản trị", accountant: "Kế toán", viewer: "Người xem",
  };

  return (
    <Card>
      <CardHeader><CardTitle>Thành viên tổ chức</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex gap-2 items-end border-b pb-4">
            <div className="flex-1"><Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@congty.com" />
            </div>
            <div><Label>Vai trò</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Quản trị</SelectItem>
                  <SelectItem value="accountant">Kế toán</SelectItem>
                  <SelectItem value="viewer">Người xem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!email || inviteMut.isPending} onClick={() => inviteMut.mutate()}>
              <UserPlus className="h-4 w-4 mr-1" />Mời
            </Button>
          </div>
        )}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Email</TableHead><TableHead>Vai trò</TableHead>
            <TableHead>Trạng thái</TableHead><TableHead>Tham gia</TableHead>
            {canManage && <TableHead></TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {(data?.members ?? []).map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="text-sm">{m.email ?? "(chưa rõ)"}</TableCell>
                <TableCell>
                  {canManage && m.role !== "owner" ? (
                    <Select value={m.role} onValueChange={(v) => roleMut.mutate({ memberId: m.id, role: v })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Quản trị</SelectItem>
                        <SelectItem value="accountant">Kế toán</SelectItem>
                        <SelectItem value="viewer">Người xem</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : <Badge variant="outline">{ROLE_LABEL[m.role] ?? m.role}</Badge>}
                </TableCell>
                <TableCell><Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString("vi-VN")}</TableCell>
                {canManage && (
                  <TableCell>
                    {m.role !== "owner" && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm("Gỡ thành viên này khỏi tổ chức?")) rmMut.mutate(m.id);
                      }}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CompanyTab() {
  const get = useServerFn(getSettings);
  const upd = useServerFn(updateSettings);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (data?.profile && !form) setForm(data.profile); }, [data, form]);

  const mutate = useMutation({
    mutationFn: (v: any) => upd({ data: v }),
    onSuccess: () => { toast.success("Đã lưu"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!form) return <p className="p-4">Đang tải…</p>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <Card>
      <CardHeader><CardTitle>Hồ sơ doanh nghiệp & người ký BCTC</CardTitle></CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div><Label>Tên DN</Label><Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></div>
        <div><Label>Mã số thuế</Label><TaxIdLookupInput value={form.tax_id ?? ""} onChange={(v) => set("tax_id", v)} onResolved={(d) => setForm({ ...form, tax_id: d.taxId, company_name: form.company_name || d.name, address: form.address || d.address || "" })} /></div>
        <div className="md:col-span-2"><Label>Địa chỉ</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
        <div><Label>Điện thoại</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><Label>Tài khoản NH</Label><Input value={form.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} /></div>

        <div className="md:col-span-2 mt-2 border-t pt-3">
          <div className="text-sm font-semibold mb-2">Người ký Báo cáo tài chính</div>
        </div>
        <div><Label>Người lập biểu</Label><Input value={form.preparer_name ?? ""} onChange={(e) => set("preparer_name", e.target.value)} placeholder="VD: Nguyễn Văn A" /></div>
        <div><Label>Kế toán trưởng</Label><Input value={form.chief_accountant_name ?? ""} onChange={(e) => set("chief_accountant_name", e.target.value)} placeholder="VD: Trần Thị B" /></div>
        <div><Label>Người đại diện theo pháp luật / Giám đốc</Label><Input value={form.legal_rep_name ?? ""} onChange={(e) => set("legal_rep_name", e.target.value)} placeholder="VD: Lê Văn C" /></div>
        <div><Label>Người ký mặc định khác (tuỳ chọn)</Label><Input value={form.signer_name ?? ""} onChange={(e) => set("signer_name", e.target.value)} /></div>

        <ImageUploader label="Ảnh chữ ký (PNG nền trong)" url={form.signature_url} onChange={(u) => set("signature_url", u)} prefix="signature" />
        <ImageUploader label="Ảnh dấu công ty (PNG nền trong)" url={form.stamp_url} onChange={(u) => set("stamp_url", u)} prefix="stamp" />

        <div className="md:col-span-2 mt-2 border-t pt-3">
          <div className="text-sm font-semibold mb-2">Chế độ kế toán</div>
        </div>
        <div><Label>Chuẩn kế toán</Label>
          <Select value={form.accounting_standard} onValueChange={(v) => set("accounting_standard", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TT133">TT133 (SME)</SelectItem>
              <SelectItem value="TT200">TT200 (Đầy đủ)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Tháng bắt đầu năm tài chính</Label>
          <Input type="number" min={1} max={12} value={form.fiscal_year_start ?? 1} onChange={(e) => set("fiscal_year_start", Number(e.target.value))} />
        </div>
        <div><Label>Đồng tiền hạch toán</Label><Input value={form.base_currency ?? "VND"} onChange={(e) => set("base_currency", e.target.value)} /></div>
        <div className="md:col-span-2">
          <Button onClick={() => mutate.mutate({
            company_name: form.company_name, tax_id: form.tax_id, address: form.address,
            phone: form.phone, bank_account: form.bank_account, signer_name: form.signer_name,
            legal_rep_name: form.legal_rep_name, chief_accountant_name: form.chief_accountant_name,
            preparer_name: form.preparer_name, signature_url: form.signature_url, stamp_url: form.stamp_url,
            accounting_standard: form.accounting_standard, fiscal_year_start: form.fiscal_year_start,
            base_currency: form.base_currency,
          })} disabled={mutate.isPending}>Lưu thay đổi</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageUploader({ label, url, onChange, prefix }: { label: string; url?: string | null; onChange: (u: string | null) => void; prefix: string }) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${prefix}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Đã tải ảnh");
    } catch (e: any) {
      toast.error(e.message ?? "Tải ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        {url ? (
          <div className="relative inline-block">
            <img src={url} alt={label} className="h-20 w-auto rounded border bg-white object-contain p-1" />
            <button type="button" onClick={() => onChange(null)} className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">Chưa có ảnh</div>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1 h-3 w-3" />{uploading ? "Đang tải..." : "Chọn ảnh"}
        </Button>
      </div>
    </div>
  );
}

function PeriodsTab() {
  const get = useServerFn(getSettings);
  const toggle = useServerFn(togglePeriodLock);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);

  const mutate = useMutation({
    mutationFn: (v: any) => toggle({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const locks = data?.locks ?? [];

  return (
    <Card>
      <CardHeader><CardTitle>Khoá sổ kỳ kế toán</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div><Label>Năm</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></div>
          <div><Label>Tháng</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24" /></div>
          <Button onClick={() => mutate.mutate({ year, month, action: "lock" })}>
            <Lock className="h-4 w-4 mr-2" />Khoá kỳ
          </Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Khoá lúc</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {locks.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell>{String(l.month).padStart(2, "0")}/{l.year}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(l.locked_at).toLocaleString("vi-VN")}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => mutate.mutate({ year: l.year, month: l.month, action: "unlock" })}>
                    <Unlock className="h-3 w-3 mr-1" />Mở khoá
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FxTab() {
  const list = useServerFn(listFxRates);
  const upsert = useServerFn(upsertFxRate);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["fx"], queryFn: () => list() });
  const [form, setForm] = React.useState({
    rate_date: new Date().toISOString().slice(0, 10), currency: "USD", rate: 25000, source: "Vietcombank",
  });
  const mutate = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu tỷ giá"); qc.invalidateQueries({ queryKey: ["fx"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Tỷ giá ngoại tệ</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div><Label>Ngày</Label><Input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></div>
          <div><Label>Loại tiền</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
          <div><Label>Tỷ giá</Label><Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} /></div>
          <div><Label>Nguồn</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
          <Button onClick={() => mutate.mutate(form)} disabled={mutate.isPending}>Lưu</Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ngày</TableHead><TableHead>Loại</TableHead>
            <TableHead className="text-right">Tỷ giá</TableHead><TableHead>Nguồn</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.rate_date}</TableCell>
                <TableCell><Badge variant="outline">{r.currency}</Badge></TableCell>
                <TableCell className="text-right font-mono">{Number(r.rate).toLocaleString("vi-VN")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.source}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RolesTab() {
  const get = useServerFn(getSettings);
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get() });
  const roles = data?.roles ?? [];
  const labels: Record<string, string> = {
    owner: "Chủ doanh nghiệp", chief_accountant: "Kế toán trưởng",
    accountant: "Kế toán viên", viewer: "Người xem",
  };
  return (
    <Card>
      <CardHeader><CardTitle>Vai trò của bạn</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {roles.map((r) => <Badge key={r} className="text-sm py-1 px-3">{labels[r] ?? r}</Badge>)}
        </div>
        <p className="text-sm text-muted-foreground">
          Hệ thống có 4 vai trò: <b>Chủ DN</b> (toàn quyền, khoá sổ), <b>Kế toán trưởng</b> (duyệt chứng từ),
          <b> Kế toán viên</b> (nhập liệu), <b>Người xem</b> (chỉ xem báo cáo).
          Mời thành viên mới sẽ được hỗ trợ ở phiên bản sau.
        </p>
      </CardContent>
    </Card>
  );
}

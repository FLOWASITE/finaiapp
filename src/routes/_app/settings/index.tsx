import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSettings, updateSettings, togglePeriodLock, listFxRates, upsertFxRate,
} from "@/lib/settings.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings/")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Hồ sơ doanh nghiệp, kỳ kế toán, tỷ giá, phân quyền</p>
      </div>
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Doanh nghiệp</TabsTrigger>
          <TabsTrigger value="periods">Khoá sổ</TabsTrigger>
          <TabsTrigger value="fx">Tỷ giá</TabsTrigger>
          <TabsTrigger value="roles">Phân quyền</TabsTrigger>
        </TabsList>
        <TabsContent value="company"><CompanyTab /></TabsContent>
        <TabsContent value="periods"><PeriodsTab /></TabsContent>
        <TabsContent value="fx"><FxTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
      </Tabs>
    </div>
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
      <CardHeader><CardTitle>Hồ sơ doanh nghiệp</CardTitle></CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div><Label>Tên DN</Label><Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></div>
        <div><Label>Mã số thuế</Label><Input value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Địa chỉ</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
        <div><Label>Điện thoại</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><Label>Tài khoản NH</Label><Input value={form.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} /></div>
        <div><Label>Người ký</Label><Input value={form.signer_name ?? ""} onChange={(e) => set("signer_name", e.target.value)} /></div>
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
            accounting_standard: form.accounting_standard, fiscal_year_start: form.fiscal_year_start,
            base_currency: form.base_currency,
          })} disabled={mutate.isPending}>Lưu thay đổi</Button>
        </div>
      </CardContent>
    </Card>
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

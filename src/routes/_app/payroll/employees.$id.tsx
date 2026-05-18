import * as React from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  getEmployee, upsertEmployee, listDimensions,
  upsertContract, deleteContract,
  upsertDependent, deleteDependent,
} from "@/lib/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/employees/$id")({
  component: EmployeeDetailPage,
});

const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("vi-VN");

function EmployeeDetailPage() {
  const { id } = useParams({ from: "/_app/payroll/employees/$id" });
  const getFn = useServerFn(getEmployee);
  const dimsFn = useServerFn(listDimensions);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => getFn({ data: { id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: dims } = useQuery({
    queryKey: ["dimensions"],
    queryFn: () => dimsFn(),
    ...QUERY_PRESETS.REFERENCE,
  });

  if (isLoading || !data) return <div className="p-6">Đang tải…</div>;
  const e = data.employee;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/payroll" className="text-sm text-muted-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Danh sách lương
        </Link>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{e.full_name}</h1>
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{e.code}</span>
            {e.position && <> · {e.position}</>}
            {e.departments?.name && <> · {e.departments.name}</>}
            <Badge variant={e.status === "active" ? "default" : "secondary"} className="ml-2">
              {e.status}
            </Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Hồ sơ</TabsTrigger>
          <TabsTrigger value="contracts">Hợp đồng ({data.contracts.length})</TabsTrigger>
          <TabsTrigger value="dependents">Người phụ thuộc ({data.dependents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <InfoTab employee={e} dims={dims} onSaved={() => qc.invalidateQueries({ queryKey: ["employee", id] })} />
        </TabsContent>

        <TabsContent value="contracts">
          <ContractsTab employeeId={id} contracts={data.contracts} onSaved={() => qc.invalidateQueries({ queryKey: ["employee", id] })} />
        </TabsContent>

        <TabsContent value="dependents">
          <DependentsTab employeeId={id} dependents={data.dependents} onSaved={() => qc.invalidateQueries({ queryKey: ["employee", id] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoTab({ employee, dims, onSaved }: { employee: any; dims: any; onSaved: () => void }) {
  const upsert = useServerFn(upsertEmployee);
  const [form, setForm] = React.useState<any>(() => ({
    ...employee,
    branch_id: employee.branch_id ?? null,
    department_id: employee.department_id ?? null,
    project_id: employee.project_id ?? null,
  }));
  const mutate = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu hồ sơ"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Thông tin nhân viên</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="text-sm font-medium mb-2">Định danh</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>Mã NV</Label><Input value={form.code ?? ""} onChange={(ev) => set("code", ev.target.value)} /></div>
            <div className="md:col-span-2"><Label>Họ tên</Label><Input value={form.full_name ?? ""} onChange={(ev) => set("full_name", ev.target.value)} /></div>
            <div><Label>Ngày sinh</Label><Input type="date" value={form.dob ?? ""} onChange={(ev) => set("dob", ev.target.value || null)} /></div>
            <div>
              <Label>Giới tính</Label>
              <Select value={form.gender ?? ""} onValueChange={(v) => set("gender", v || null)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Nam</SelectItem>
                  <SelectItem value="female">Nữ</SelectItem>
                  <SelectItem value="other">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Dân tộc</Label><Input value={form.ethnicity ?? ""} onChange={(ev) => set("ethnicity", ev.target.value)} /></div>
            <div><Label>Quốc tịch</Label><Input value={form.nationality ?? ""} onChange={(ev) => set("nationality", ev.target.value)} /></div>
            <div>
              <Label>Đối tượng cư trú</Label>
              <Select value={form.is_resident ? "yes" : "no"} onValueChange={(v) => set("is_resident", v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Cư trú</SelectItem>
                  <SelectItem value="no">Không cư trú (PIT 20%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vùng lương tối thiểu</Label>
              <Select value={String(form.region ?? 1)} onValueChange={(v) => set("region", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Vùng I</SelectItem>
                  <SelectItem value="2">Vùng II</SelectItem>
                  <SelectItem value="3">Vùng III</SelectItem>
                  <SelectItem value="4">Vùng IV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Giấy tờ</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>CCCD/CMND</Label><Input value={form.citizen_id ?? ""} onChange={(ev) => set("citizen_id", ev.target.value)} /></div>
            <div><Label>Ngày cấp</Label><Input type="date" value={form.citizen_id_date ?? ""} onChange={(ev) => set("citizen_id_date", ev.target.value || null)} /></div>
            <div><Label>Nơi cấp</Label><Input value={form.citizen_id_place ?? ""} onChange={(ev) => set("citizen_id_place", ev.target.value)} /></div>
            <div><Label>MST cá nhân</Label><Input value={form.tax_id ?? ""} onChange={(ev) => set("tax_id", ev.target.value)} /></div>
            <div><Label>Ngày cấp MST</Label><Input type="date" value={form.tax_id_date ?? ""} onChange={(ev) => set("tax_id_date", ev.target.value || null)} /></div>
            <div><Label>Số sổ BHXH</Label><Input value={form.social_insurance_no ?? ""} onChange={(ev) => set("social_insurance_no", ev.target.value)} /></div>
            <div><Label>Số thẻ BHYT</Label><Input value={form.health_insurance_no ?? ""} onChange={(ev) => set("health_insurance_no", ev.target.value)} /></div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Liên lạc</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(ev) => set("email", ev.target.value)} /></div>
            <div><Label>Điện thoại</Label><Input value={form.phone ?? ""} onChange={(ev) => set("phone", ev.target.value)} /></div>
            <div className="md:col-span-3"><Label>Địa chỉ</Label><Input value={form.address ?? ""} onChange={(ev) => set("address", ev.target.value)} /></div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Tổ chức & công việc</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>Chức vụ</Label><Input value={form.position ?? ""} onChange={(ev) => set("position", ev.target.value)} /></div>
            <div>
              <Label>Chi nhánh</Label>
              <Select value={form.branch_id ?? "_none"} onValueChange={(v) => set("branch_id", v === "_none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {dims?.branches?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phòng ban</Label>
              <Select value={form.department_id ?? "_none"} onValueChange={(v) => set("department_id", v === "_none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {dims?.departments?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dự án</Label>
              <Select value={form.project_id ?? "_none"} onValueChange={(v) => set("project_id", v === "_none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {dims?.projects?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loại HĐ</Label>
              <Select value={form.contract_type ?? ""} onValueChange={(v) => set("contract_type", v || null)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="probation">Thử việc</SelectItem>
                  <SelectItem value="definite">Xác định thời hạn</SelectItem>
                  <SelectItem value="indefinite">Không xác định</SelectItem>
                  <SelectItem value="seasonal">Mùa vụ</SelectItem>
                  <SelectItem value="service">Dịch vụ/khoán</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Số HĐ chính</Label><Input value={form.contract_no ?? ""} onChange={(ev) => set("contract_no", ev.target.value)} /></div>
            <div><Label>Ngày tuyển</Label><Input type="date" value={form.hire_date ?? ""} onChange={(ev) => set("hire_date", ev.target.value || null)} /></div>
            <div><Label>Hết thử việc</Label><Input type="date" value={form.probation_end ?? ""} onChange={(ev) => set("probation_end", ev.target.value || null)} /></div>
            <div><Label>Nghỉ việc</Label><Input type="date" value={form.termination_date ?? ""} onChange={(ev) => set("termination_date", ev.target.value || null)} /></div>
            <div>
              <Label>Trạng thái</Label>
              <Select value={form.status ?? "active"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Đang làm</SelectItem>
                  <SelectItem value="suspended">Tạm nghỉ</SelectItem>
                  <SelectItem value="terminated">Đã nghỉ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Lương & thanh toán</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>Lương cơ bản</Label><Input type="number" value={form.base_salary ?? 0} onChange={(ev) => set("base_salary", Number(ev.target.value))} /></div>
            <div><Label>Lương đóng BH</Label><Input type="number" value={form.insurance_salary ?? 0} onChange={(ev) => set("insurance_salary", Number(ev.target.value))} /></div>
            <div><Label>Số người phụ thuộc</Label><Input type="number" value={form.dependents ?? 0} onChange={(ev) => set("dependents", Number(ev.target.value))} /></div>
            <div>
              <Label>Hình thức trả</Label>
              <Select value={form.payment_method ?? "bank"} onValueChange={(v) => set("payment_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Chuyển khoản</SelectItem>
                  <SelectItem value="cash">Tiền mặt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Ngân hàng</Label><Input value={form.bank_name ?? ""} onChange={(ev) => set("bank_name", ev.target.value)} /></div>
            <div><Label>Chi nhánh NH</Label><Input value={form.bank_branch ?? ""} onChange={(ev) => set("bank_branch", ev.target.value)} /></div>
            <div className="md:col-span-2"><Label>Số tài khoản</Label><Input value={form.bank_account ?? ""} onChange={(ev) => set("bank_account", ev.target.value)} /></div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={() => mutate.mutate(form)} disabled={mutate.isPending}>Lưu hồ sơ</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ContractsTab({ employeeId, contracts, onSaved }: { employeeId: string; contracts: any[]; onSaved: () => void }) {
  const upsert = useServerFn(upsertContract);
  const del = useServerFn(deleteContract);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(blankContract(employeeId));

  const save = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu hợp đồng"); setOpen(false); setForm(blankContract(employeeId)); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-center">
        <CardTitle className="text-base">Hợp đồng lao động</CardTitle>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(blankContract(employeeId)); }}>
          <DialogTrigger asChild><Button size="sm">+ Thêm HĐ</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Sửa" : "Thêm"} hợp đồng</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Số HĐ</Label><Input value={form.contract_no} onChange={(ev) => setForm({ ...form, contract_no: ev.target.value })} /></div>
              <div>
                <Label>Loại HĐ</Label>
                <Select value={form.contract_type} onValueChange={(v) => setForm({ ...form, contract_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="probation">Thử việc</SelectItem>
                    <SelectItem value="definite">Xác định</SelectItem>
                    <SelectItem value="indefinite">Không xác định</SelectItem>
                    <SelectItem value="seasonal">Mùa vụ</SelectItem>
                    <SelectItem value="service">Dịch vụ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Ngày bắt đầu</Label><Input type="date" value={form.start_date} onChange={(ev) => setForm({ ...form, start_date: ev.target.value })} /></div>
              <div><Label>Ngày kết thúc</Label><Input type="date" value={form.end_date ?? ""} onChange={(ev) => setForm({ ...form, end_date: ev.target.value || null })} /></div>
              <div><Label>Lương cơ bản</Label><Input type="number" value={form.base_salary} onChange={(ev) => setForm({ ...form, base_salary: Number(ev.target.value) })} /></div>
              <div><Label>Lương đóng BH</Label><Input type="number" value={form.insurance_salary} onChange={(ev) => setForm({ ...form, insurance_salary: Number(ev.target.value) })} /></div>
              <div><Label>Phụ cấp cố định</Label><Input type="number" value={form.fixed_allowance} onChange={(ev) => setForm({ ...form, fixed_allowance: Number(ev.target.value) })} /></div>
              <div>
                <Label>Trạng thái</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Hiệu lực</SelectItem>
                    <SelectItem value="expired">Hết hạn</SelectItem>
                    <SelectItem value="terminated">Chấm dứt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Ghi chú</Label><Textarea value={form.notes ?? ""} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate(form)} disabled={save.isPending}>Lưu</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Số HĐ</TableHead><TableHead>Loại</TableHead>
            <TableHead>Từ</TableHead><TableHead>Đến</TableHead>
            <TableHead className="text-right">Lương CB</TableHead>
            <TableHead className="text-right">Lương BH</TableHead>
            <TableHead>Trạng thái</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {contracts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Chưa có hợp đồng</TableCell></TableRow>}
            {contracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.contract_no}</TableCell>
                <TableCell>{c.contract_type}</TableCell>
                <TableCell>{c.start_date}</TableCell>
                <TableCell>{c.end_date ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(c.base_salary)}</TableCell>
                <TableCell className="text-right">{fmt(c.insurance_salary)}</TableCell>
                <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setForm({ ...c }); setOpen(true); }}>Sửa</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Xoá HĐ?")) remove.mutate(c.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
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

function blankContract(employeeId: string) {
  return {
    employee_id: employeeId,
    contract_no: "",
    contract_type: "definite",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    base_salary: 0,
    insurance_salary: 0,
    fixed_allowance: 0,
    status: "active",
    notes: "",
  };
}

function DependentsTab({ employeeId, dependents, onSaved }: { employeeId: string; dependents: any[]; onSaved: () => void }) {
  const upsert = useServerFn(upsertDependent);
  const del = useServerFn(deleteDependent);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(blankDependent(employeeId));

  const save = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu"); setOpen(false); setForm(blankDependent(employeeId)); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-center">
        <CardTitle className="text-base">Người phụ thuộc giảm trừ gia cảnh</CardTitle>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(blankDependent(employeeId)); }}>
          <DialogTrigger asChild><Button size="sm">+ Thêm</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Sửa" : "Thêm"} người phụ thuộc</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Họ tên</Label><Input value={form.full_name} onChange={(ev) => setForm({ ...form, full_name: ev.target.value })} /></div>
              <div>
                <Label>Quan hệ</Label>
                <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="con">Con</SelectItem>
                    <SelectItem value="vo_chong">Vợ/Chồng</SelectItem>
                    <SelectItem value="cha">Cha</SelectItem>
                    <SelectItem value="me">Mẹ</SelectItem>
                    <SelectItem value="khac">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Ngày sinh</Label><Input type="date" value={form.dob ?? ""} onChange={(ev) => setForm({ ...form, dob: ev.target.value || null })} /></div>
              <div><Label>MST</Label><Input value={form.tax_id ?? ""} onChange={(ev) => setForm({ ...form, tax_id: ev.target.value })} /></div>
              <div><Label>CCCD</Label><Input value={form.citizen_id ?? ""} onChange={(ev) => setForm({ ...form, citizen_id: ev.target.value })} /></div>
              <div><Label>Giảm trừ từ</Label><Input type="date" value={form.deduction_start} onChange={(ev) => setForm({ ...form, deduction_start: ev.target.value })} /></div>
              <div><Label>Giảm trừ đến</Label><Input type="date" value={form.deduction_end ?? ""} onChange={(ev) => setForm({ ...form, deduction_end: ev.target.value || null })} /></div>
              <div className="col-span-2">
                <Label>Trạng thái đăng ký</Label>
                <Select value={form.registration_status} onValueChange={(v) => setForm({ ...form, registration_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Đã đăng ký</SelectItem>
                    <SelectItem value="pending">Đang chờ</SelectItem>
                    <SelectItem value="cancelled">Huỷ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate(form)} disabled={save.isPending}>Lưu</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Họ tên</TableHead><TableHead>Quan hệ</TableHead>
            <TableHead>Ngày sinh</TableHead><TableHead>MST</TableHead>
            <TableHead>Giảm trừ từ</TableHead><TableHead>Đến</TableHead>
            <TableHead>Trạng thái</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {dependents.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Chưa có người phụ thuộc</TableCell></TableRow>}
            {dependents.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.full_name}</TableCell>
                <TableCell>{d.relationship}</TableCell>
                <TableCell>{d.dob ?? "—"}</TableCell>
                <TableCell className="font-mono">{d.tax_id ?? "—"}</TableCell>
                <TableCell>{d.deduction_start}</TableCell>
                <TableCell>{d.deduction_end ?? "—"}</TableCell>
                <TableCell><Badge variant={d.registration_status === "registered" ? "default" : "secondary"}>{d.registration_status}</Badge></TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setForm({ ...d }); setOpen(true); }}>Sửa</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Xoá?")) remove.mutate(d.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
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

function blankDependent(employeeId: string) {
  return {
    employee_id: employeeId,
    full_name: "",
    relationship: "con",
    dob: null,
    tax_id: "",
    citizen_id: "",
    deduction_start: new Date().toISOString().slice(0, 10),
    deduction_end: null,
    registration_status: "registered",
    notes: "",
  };
}

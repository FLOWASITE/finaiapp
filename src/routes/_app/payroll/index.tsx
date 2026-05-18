import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  listEmployees, upsertEmployee, listPayrollRuns, createPayrollRun,
} from "@/lib/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/")({ component: PayrollPage });

const fmt = (n: number) => Number(n).toLocaleString("vi-VN");

function PayrollPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tiền lương</h1>
          <p className="text-sm text-muted-foreground">Quản lý nhân viên và bảng lương theo chuẩn Việt Nam</p>
        </div>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <Link to="/payroll/components" className="text-primary underline">Khoản lương</Link>
          <Link to="/payroll/timesheets" className="text-primary underline">Chấm công</Link>
          <Link to="/payroll/advances" className="text-primary underline">Tạm ứng</Link>
          <Link to="/payroll/reports" className="text-primary underline">Báo cáo Thuế/BHXH</Link>
          <Link to="/payroll/policies" className="text-primary underline">Chính sách BHXH/TNCN →</Link>
        </div>
      </div>
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Bảng lương</TabsTrigger>
          <TabsTrigger value="employees">Nhân viên</TabsTrigger>
        </TabsList>
        <TabsContent value="runs"><RunsTab /></TabsContent>
        <TabsContent value="employees"><EmployeesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function RunsTab() {
  const list = useServerFn(listPayrollRuns);
  const create = useServerFn(createPayrollRun);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["payroll-runs"], queryFn: () => list(),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [allowance, setAllowance] = React.useState("0");

  const mutate = useMutation({
    mutationFn: (v: any) => create({ data: v }),
    onSuccess: () => { toast.success("Đã tạo bảng lương"); setOpen(false); qc.invalidateQueries({ queryKey: ["payroll-runs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Kỳ lương</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Tạo kỳ lương</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tạo kỳ lương mới</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Tháng</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
              <div><Label>Phụ cấp mặc định (VND)</Label><Input type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} /></div>
              <Button className="w-full" disabled={mutate.isPending}
                onClick={() => mutate.mutate({ period_month: `${month}-01`, allowance_default: Number(allowance) })}>
                Tính lương
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Kỳ</TableHead><TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Tổng gross</TableHead>
            <TableHead className="text-right">BH NV</TableHead>
            <TableHead className="text-right">TNCN</TableHead>
            <TableHead className="text-right">Thực nhận</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.period_month}</TableCell>
                <TableCell><Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">{fmt(r.total_gross)}</TableCell>
                <TableCell className="text-right">{fmt(r.total_insurance_emp)}</TableCell>
                <TableCell className="text-right">{fmt(r.total_pit)}</TableCell>
                <TableCell className="text-right font-medium">{fmt(r.total_net)}</TableCell>
                <TableCell><Link to="/payroll/$id" params={{ id: r.id }} className="text-primary text-sm">Chi tiết</Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmployeesTab() {
  const list = useServerFn(listEmployees);
  const upsert = useServerFn(upsertEmployee);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["employees"], queryFn: () => list(),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({
    code: "", full_name: "", position: "", base_salary: 0, insurance_salary: 0, dependents: 0,
  });
  const mutate = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu"); setOpen(false); qc.invalidateQueries({ queryKey: ["employees"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Nhân viên</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Thêm</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nhân viên mới</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Mã NV</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                <div><Label>Họ tên</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              </div>
              <div><Label>Chức vụ</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Lương cơ bản</Label><Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })} /></div>
                <div><Label>Lương đóng BH</Label><Input type="number" value={form.insurance_salary} onChange={(e) => setForm({ ...form, insurance_salary: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Số người phụ thuộc</Label><Input type="number" value={form.dependents} onChange={(e) => setForm({ ...form, dependents: Number(e.target.value) })} /></div>
              <Button className="w-full" disabled={mutate.isPending} onClick={() => mutate.mutate(form)}>Lưu</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Mã</TableHead><TableHead>Họ tên</TableHead><TableHead>Chức vụ</TableHead>
            <TableHead className="text-right">Lương cơ bản</TableHead>
            <TableHead className="text-right">Lương BH</TableHead>
            <TableHead className="text-center">PT</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono">
                  <Link to="/payroll/employees/$id" params={{ id: e.id }} className="text-primary hover:underline">{e.code}</Link>
                </TableCell>
                <TableCell>{e.full_name}</TableCell>
                <TableCell>{e.position}</TableCell>
                <TableCell className="text-right">{fmt(e.base_salary)}</TableCell>
                <TableCell className="text-right">{fmt(e.insurance_salary)}</TableCell>
                <TableCell className="text-center">{e.dependents}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

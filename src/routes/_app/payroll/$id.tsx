import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  getPayrollRun, postPayrollRun, approvePayrollRun, deletePayrollRun,
} from "@/lib/payroll.functions";
import {
  applyAdvancesToRun, markRunPaid, exportBankCSV,
} from "@/lib/payroll-phased.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/$id")({ component: RunDetail });

const fmt = (n: number) => Number(n).toLocaleString("vi-VN");

function RunDetail() {
  const { id } = Route.useParams();
  const get = useServerFn(getPayrollRun);
  const post = useServerFn(postPayrollRun);
  const approve = useServerFn(approvePayrollRun);
  const del = useServerFn(deletePayrollRun);
  const applyAdv = useServerFn(applyAdvancesToRun);
  const markPaid = useServerFn(markRunPaid);
  const csvFn = useServerFn(exportBankCSV);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["payroll", id], queryFn: () => get({ data: { id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const mPost = useMutation({
    mutationFn: () => post({ data: { id } }),
    onSuccess: () => { toast.success("Đã ghi sổ kỳ lương"); qc.invalidateQueries({ queryKey: ["payroll", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const mApp = useMutation({
    mutationFn: () => approve({ data: { id } }),
    onSuccess: () => { toast.success("Đã duyệt"); qc.invalidateQueries({ queryKey: ["payroll", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); window.location.href = "/payroll"; },
    onError: (e: any) => toast.error(e.message),
  });
  const mAdv = useMutation({
    mutationFn: () => applyAdv({ data: { run_id: id } }),
    onSuccess: (r: any) => { toast.success(`Đã áp dụng ${r.applied} tạm ứng`); qc.invalidateQueries({ queryKey: ["payroll", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const mPaid = useMutation({
    mutationFn: (ref: string) => markPaid({ data: { id, reference: ref } }),
    onSuccess: () => { toast.success("Đã ghi nhận thanh toán"); qc.invalidateQueries({ queryKey: ["payroll", id] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const mCsv = useMutation({
    mutationFn: () => csvFn({ data: { id } }),
    onSuccess: (r: any) => {
      const blob = new Blob([r.content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${r.count} dòng — Tổng ${Number(r.total).toLocaleString("vi-VN")} VND`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!data?.run) return <div className="p-6">Đang tải…</div>;
  const r = data.run;
  const details = data.details ?? [];

  // Group details by employee for the detail tab
  const detByEmp = new Map<string, any[]>();
  details.forEach((d: any) => {
    const arr = detByEmp.get(d.employee_id) ?? [];
    arr.push(d); detByEmp.set(d.employee_id, arr);
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/payroll" className="text-sm text-muted-foreground">← Quay lại</Link>
          <h1 className="text-2xl font-semibold mt-1">Kỳ lương {String(r.period_month).slice(0, 7)}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge>
          {r.payment_status === "paid" && <Badge className="bg-emerald-600 hover:bg-emerald-600">Đã trả</Badge>}
          {r.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => mAdv.mutate()} disabled={mAdv.isPending}>Áp tạm ứng</Button>
              <Button variant="outline" size="sm" onClick={() => mApp.mutate()} disabled={mApp.isPending}>Duyệt</Button>
              <Button variant="destructive" size="sm" onClick={() => { if (confirm("Xoá kỳ lương?")) mDel.mutate(); }}>Xoá</Button>
            </>
          )}
          <Link to="/payroll/payslips/$id" params={{ id }}>
            <Button variant="outline" size="sm">Phiếu lương / PDF</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => mCsv.mutate()} disabled={mCsv.isPending}>CSV ngân hàng</Button>
          {r.status !== "posted" && (
            <Button size="sm" onClick={() => mPost.mutate()} disabled={mPost.isPending}>Ghi sổ</Button>
          )}
          {r.status === "posted" && r.payment_status !== "paid" && (
            <Button size="sm" onClick={() => { const ref = prompt("Mã chứng từ thanh toán (tuỳ chọn):") ?? ""; mPaid.mutate(ref); }}>Đánh dấu đã trả</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Tổng gross</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(r.total_gross)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">BH NV đóng</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(r.total_insurance_emp)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">TNCN</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(r.total_pit)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Thực nhận</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold text-primary">{fmt(r.total_net)}</CardContent></Card>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Tổng hợp</TabsTrigger>
          <TabsTrigger value="detail">Chi tiết khoản lương</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mã</TableHead><TableHead>Họ tên</TableHead>
                  <TableHead>Bộ phận</TableHead>
                  <TableHead className="text-right">Lương CB</TableHead>
                  <TableHead className="text-right">Phụ cấp</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">BH</TableHead>
                  <TableHead className="text-right">TNCN</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.lines.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono">{l.employees?.code}</TableCell>
                      <TableCell>{l.employees?.full_name}</TableCell>
                      <TableCell className="text-xs">{l.employees?.departments?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmt(l.base_salary)}</TableCell>
                      <TableCell className="text-right">{fmt(l.allowance)}</TableCell>
                      <TableCell className="text-right">{fmt(l.gross)}</TableCell>
                      <TableCell className="text-right">{fmt(Number(l.bhxh_emp) + Number(l.bhyt_emp) + Number(l.bhtn_emp))}</TableCell>
                      <TableCell className="text-right">{fmt(l.pit)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(l.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Khoản</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead className="text-right">Chịu thuế</TableHead>
                  <TableHead className="text-right">Tính BH</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.lines.map((l: any) => {
                    const rows = detByEmp.get(l.employee_id) ?? [];
                    return rows.map((d: any, i: number) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs">{i === 0 ? `${l.employees?.code} — ${l.employees?.full_name}` : ""}</TableCell>
                        <TableCell><span className="font-mono text-xs mr-2">{d.component_code}</span>{d.component_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{d.kind}</Badge></TableCell>
                        <TableCell className="text-right">{fmt(d.amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmt(d.taxable_amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmt(d.insurable_amount)}</TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

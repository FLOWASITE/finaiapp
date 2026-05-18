import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listEmployees } from "@/lib/payroll.functions";
import { listAdvances, upsertAdvance, deleteAdvance } from "@/lib/payroll-phased.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/advances")({ component: AdvancesPage });

const fmt = (n: number) => Number(n).toLocaleString("vi-VN");

function AdvancesPage() {
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const list = useServerFn(listAdvances);
  const upsert = useServerFn(upsertAdvance);
  const del = useServerFn(deleteAdvance);
  const listEmp = useServerFn(listEmployees);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["advances", month],
    queryFn: () => list({ data: { period_month: `${month}-01` } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: emps = [] } = useQuery({ queryKey: ["employees"], queryFn: () => listEmp(), ...QUERY_PRESETS.TRANSACTIONAL });

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({
    employee_id: "", period_month: `${month}-01`, amount: 0, reason: "", status: "pending",
  });
  React.useEffect(() => { setForm((f: any) => ({ ...f, period_month: `${month}-01` })); }, [month]);

  const mUp = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu tạm ứng"); setOpen(false); qc.invalidateQueries({ queryKey: ["advances"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["advances"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/payroll" className="text-sm text-muted-foreground">← Tiền lương</Link>
          <h1 className="text-2xl font-semibold mt-1">Tạm ứng lương</h1>
          <p className="text-sm text-muted-foreground">Quản lý khoản tạm ứng theo kỳ lương</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Kỳ:</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>+ Tạm ứng</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? "Sửa" : "Thêm"} tạm ứng</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nhân viên</Label>
                  <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
                    <SelectContent>
                      {emps.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>{e.code} — {e.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Kỳ</Label><Input type="month" value={String(form.period_month).slice(0, 7)} onChange={(e) => setForm({ ...form, period_month: `${e.target.value}-01` })} /></div>
                  <div><Label>Số tiền</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
                </div>
                <div><Label>Lý do</Label><Input value={form.reason ?? ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
                <div>
                  <Label>Trạng thái</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Chờ áp dụng</SelectItem>
                      <SelectItem value="applied">Đã áp dụng</SelectItem>
                      <SelectItem value="cancelled">Đã huỷ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={mUp.isPending} onClick={() => mUp.mutate(form)}>Lưu</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nhân viên</TableHead>
              <TableHead>Kỳ</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Lý do</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.employees?.code} — {a.employees?.full_name}</TableCell>
                  <TableCell>{String(a.period_month).slice(0, 7)}</TableCell>
                  <TableCell className="text-right">{fmt(a.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.reason}</TableCell>
                  <TableCell><Badge variant={a.status === "applied" ? "default" : a.status === "cancelled" ? "destructive" : "secondary"}>{a.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setForm(a); setOpen(true); }}>Sửa</Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Xoá tạm ứng?")) mDel.mutate(a.id); }}>Xoá</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!data.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Chưa có tạm ứng trong kỳ này</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listPolicies, upsertPolicy } from "@/lib/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/policies")({ component: PoliciesPage });

const fmtPct = (n: number) => (Number(n) * 100).toFixed(2) + "%";
const fmt = (n: number) => Number(n).toLocaleString("vi-VN");

function PoliciesPage() {
  const list = useServerFn(listPolicies);
  const upsert = useServerFn(upsertPolicy);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["payroll-policies"], queryFn: () => list(), ...QUERY_PRESETS.REFERENCE });
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(blank());

  const save = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => { toast.success("Đã lưu chính sách"); setOpen(false); setForm(blank()); qc.invalidateQueries({ queryKey: ["payroll-policies"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <Link to="/payroll" className="text-sm text-muted-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Tiền lương
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chính sách BHXH & TNCN</h1>
          <p className="text-sm text-muted-foreground">Tỉ lệ trích nộp, giảm trừ gia cảnh, trần đóng BH theo năm</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(blank()); }}>
          <DialogTrigger asChild><Button>+ Tạo / sửa chính sách</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Chính sách năm {form.year}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Năm</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></div>
              <div><Label>Giảm trừ bản thân</Label><Input type="number" value={form.personal_deduction} onChange={(e) => setForm({ ...form, personal_deduction: Number(e.target.value) })} /></div>
              <div><Label>Giảm trừ/người phụ thuộc</Label><Input type="number" value={form.dependent_deduction} onChange={(e) => setForm({ ...form, dependent_deduction: Number(e.target.value) })} /></div>
              <div><Label>Trần đóng BHXH/BHYT</Label><Input type="number" value={form.bh_cap_salary} onChange={(e) => setForm({ ...form, bh_cap_salary: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label>Trần BHTN (20× LTT vùng I)</Label><Input type="number" value={form.unemployment_cap_region1} onChange={(e) => setForm({ ...form, unemployment_cap_region1: Number(e.target.value) })} /></div>

              <div className="col-span-3 text-sm font-medium mt-2">Tỉ lệ nhân viên đóng</div>
              <div><Label>BHXH NV</Label><Input type="number" step="0.0001" value={form.bhxh_emp_rate} onChange={(e) => setForm({ ...form, bhxh_emp_rate: Number(e.target.value) })} /></div>
              <div><Label>BHYT NV</Label><Input type="number" step="0.0001" value={form.bhyt_emp_rate} onChange={(e) => setForm({ ...form, bhyt_emp_rate: Number(e.target.value) })} /></div>
              <div><Label>BHTN NV</Label><Input type="number" step="0.0001" value={form.bhtn_emp_rate} onChange={(e) => setForm({ ...form, bhtn_emp_rate: Number(e.target.value) })} /></div>

              <div className="col-span-3 text-sm font-medium mt-2">Tỉ lệ doanh nghiệp đóng</div>
              <div><Label>BHXH DN</Label><Input type="number" step="0.0001" value={form.bhxh_co_rate} onChange={(e) => setForm({ ...form, bhxh_co_rate: Number(e.target.value) })} /></div>
              <div><Label>BHYT DN</Label><Input type="number" step="0.0001" value={form.bhyt_co_rate} onChange={(e) => setForm({ ...form, bhyt_co_rate: Number(e.target.value) })} /></div>
              <div><Label>BHTN DN</Label><Input type="number" step="0.0001" value={form.bhtn_co_rate} onChange={(e) => setForm({ ...form, bhtn_co_rate: Number(e.target.value) })} /></div>
              <div><Label>KPCĐ DN</Label><Input type="number" step="0.0001" value={form.union_co_rate} onChange={(e) => setForm({ ...form, union_co_rate: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate(form)} disabled={save.isPending}>Lưu</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lịch sử chính sách</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Năm</TableHead>
              <TableHead>BHXH NV/DN</TableHead>
              <TableHead>BHYT NV/DN</TableHead>
              <TableHead>BHTN NV/DN</TableHead>
              <TableHead className="text-right">Giảm trừ bản thân</TableHead>
              <TableHead className="text-right">/Người PT</TableHead>
              <TableHead className="text-right">Trần BH</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.year}</TableCell>
                  <TableCell>{fmtPct(p.bhxh_emp_rate)} / {fmtPct(p.bhxh_co_rate)}</TableCell>
                  <TableCell>{fmtPct(p.bhyt_emp_rate)} / {fmtPct(p.bhyt_co_rate)}</TableCell>
                  <TableCell>{fmtPct(p.bhtn_emp_rate)} / {fmtPct(p.bhtn_co_rate)}</TableCell>
                  <TableCell className="text-right">{fmt(p.personal_deduction)}</TableCell>
                  <TableCell className="text-right">{fmt(p.dependent_deduction)}</TableCell>
                  <TableCell className="text-right">{fmt(p.bh_cap_salary)}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => { setForm(p); setOpen(true); }}>Sửa</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function blank() {
  return {
    year: new Date().getFullYear(),
    bhxh_emp_rate: 0.08, bhyt_emp_rate: 0.015, bhtn_emp_rate: 0.01,
    bhxh_co_rate: 0.175, bhyt_co_rate: 0.03, bhtn_co_rate: 0.01,
    union_co_rate: 0.02,
    personal_deduction: 11_000_000, dependent_deduction: 4_400_000,
    bh_cap_salary: 46_800_000, unemployment_cap_region1: 99_200_000,
  };
}

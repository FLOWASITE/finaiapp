import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  listSalaryComponents, upsertSalaryComponent, deleteSalaryComponent,
} from "@/lib/payroll-phaseb.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trash2 } from "lucide-react";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/components")({ component: Page });

const KIND_LABEL: Record<string, string> = {
  earning: "Lương",
  allowance: "Phụ cấp",
  overtime: "Tăng ca",
  bonus: "Thưởng",
  deduction: "Khấu trừ",
};

const fmt = (n: number) => Number(n).toLocaleString("vi-VN");

const EMPTY = {
  code: "", name: "", kind: "allowance", is_taxable: true, taxable_threshold: 0,
  is_insurable: false, ot_multiplier: 1, expense_account: "6421", is_fixed: true,
  sort_order: 100, active: true, notes: "",
};

function Page() {
  const list = useServerFn(listSalaryComponents);
  const upsert = useServerFn(upsertSalaryComponent);
  const del = useServerFn(deleteSalaryComponent);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["salary-components"], queryFn: () => list(), ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(EMPTY);

  const mUpsert = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => {
      toast.success("Đã lưu");
      setOpen(false); setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["salary-components"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const mDel = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["salary-components"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (row?: any) => {
    setForm(row ? { ...row } : EMPTY);
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/payroll" className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Quay lại
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Danh mục khoản lương</h1>
          <p className="text-sm text-muted-foreground">Thiết lập các khoản lương, phụ cấp, tăng ca, khấu trừ theo quy định</p>
        </div>
        <Button onClick={() => openEdit()}>+ Thêm khoản</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Khoản lương</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-center">Chịu TNCN</TableHead>
                <TableHead className="text-right">Mức miễn thuế</TableHead>
                <TableHead className="text-center">Tính BH</TableHead>
                <TableHead className="text-right">Hệ số OT</TableHead>
                <TableHead>TK</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c: any) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => openEdit(c)}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell><Badge variant="outline">{KIND_LABEL[c.kind] ?? c.kind}</Badge></TableCell>
                  <TableCell className="text-center">{c.is_taxable ? "✓" : "—"}</TableCell>
                  <TableCell className="text-right">{Number(c.taxable_threshold) > 0 ? fmt(c.taxable_threshold) : "—"}</TableCell>
                  <TableCell className="text-center">{c.is_insurable ? "✓" : "—"}</TableCell>
                  <TableCell className="text-right">{Number(c.ot_multiplier).toFixed(2)}×</TableCell>
                  <TableCell className="font-mono text-xs">{c.expense_account}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm(`Xoá khoản "${c.name}"?`)) mDel.mutate(c.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? "Sửa khoản lương" : "Khoản lương mới"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mã</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div><Label>Tên</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Loại</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>TK chi phí</Label><Input value={form.expense_account ?? ""} onChange={(e) => setForm({ ...form, expense_account: e.target.value })} /></div>
            <div><Label>Mức miễn thuế (VND)</Label><Input type="number" value={form.taxable_threshold} onChange={(e) => setForm({ ...form, taxable_threshold: Number(e.target.value) })} /></div>
            <div><Label>Hệ số OT</Label><Input type="number" step="0.1" value={form.ot_multiplier} onChange={(e) => setForm({ ...form, ot_multiplier: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_taxable} onCheckedChange={(v) => setForm({ ...form, is_taxable: v })} /><Label>Chịu thuế TNCN</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_insurable} onCheckedChange={(v) => setForm({ ...form, is_insurable: v })} /><Label>Tính BHXH</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_fixed} onCheckedChange={(v) => setForm({ ...form, is_fixed: v })} /><Label>Cố định</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Đang dùng</Label></div>
            <div><Label>Thứ tự</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          </div>
          <Button className="w-full" disabled={mUpsert.isPending} onClick={() => mUpsert.mutate(form)}>Lưu</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

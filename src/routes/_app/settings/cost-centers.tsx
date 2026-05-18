import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listCostCenters, upsertCostCenter, deleteCostCenter } from "@/lib/dimensions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_app/settings/cost-centers")({ component: CostCentersPage });

const NONE = "__none__";

function CostCentersPage() {
  const list = useServerFn(listCostCenters);
  const { data } = useQuery({ queryKey: ["cost-centers"], queryFn: () => list(),
 ...QUERY_PRESETS.REFERENCE,
});
  const rows = (data as any[]) ?? [];
  const parentMap = new Map(rows.map((r) => [r.id, r.name]));
  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm"><Link to="/settings"><ChevronLeft className="h-4 w-4 mr-1" />Cài đặt</Link></Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Layers className="h-6 w-6" />Bộ phận chi phí</h1>
          <p className="text-sm text-muted-foreground">Phân bổ chi phí theo bộ phận (cost center).</p>
        </div>
        <CcDialog rows={rows} />
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Bộ phận cha</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2">{r.parent_id ? parentMap.get(r.parent_id) || "—" : "—"}</td>
                <td className="px-4 py-2 text-center">
                  {r.is_active ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Hoạt động</Badge> : <Badge variant="outline">Ẩn</Badge>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <CcDialog row={r} rows={rows} />
                  <DeleteRow id={r.id} name={r.name} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Chưa có bộ phận nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CcDialog({ row, rows }: { row?: any; rows: any[] }) {
  const up = useServerFn(upsertCostCenter);
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(() => ({
    code: row?.code ?? "", name: row?.name ?? "",
    parent_id: row?.parent_id ?? null, is_active: row?.is_active ?? true,
  }));
  const m = useMutation({
    mutationFn: () => up({ data: { id: row?.id, ...form } as any }),
    onSuccess: () => { toast.success(row ? "Đã cập nhật" : "Đã thêm bộ phận"); qc.invalidateQueries({ queryKey: ["cost-centers"] }); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const parentOptions = rows.filter((r) => r.id !== row?.id);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button> : <Button><Plus className="mr-2 h-4 w-4" />Thêm bộ phận</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Sửa bộ phận chi phí" : "Thêm bộ phận chi phí"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Mã *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Tên *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Bộ phận cha</Label>
              <Select value={form.parent_id ?? NONE} onValueChange={(v) => setForm({ ...form, parent_id: v === NONE ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không —</SelectItem>
                  {parentOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="cc-active" /><Label htmlFor="cc-active" className="text-sm">Hoạt động</Label></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.code.trim() || !form.name.trim() || m.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRow({ id, name }: { id: string; name: string }) {
  const del = useServerFn(deleteCostCenter);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["cost-centers"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Xoá bộ phận "{name}"?</AlertDialogTitle><AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Huỷ</AlertDialogCancel><AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

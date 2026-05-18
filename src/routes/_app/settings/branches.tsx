import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateDimensions } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listBranches, upsertBranch, deleteBranch } from "@/lib/dimensions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_app/settings/branches")({ component: BranchesPage });

function BranchesPage() {
  const list = useServerFn(listBranches);
  const { data } = useQuery({ queryKey: ["branches"], queryFn: () => list(),
 ...QUERY_PRESETS.REFERENCE,
});
  const rows = (data as any[]) ?? [];
  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm"><Link to="/settings"><ChevronLeft className="h-4 w-4 mr-1" />Cài đặt</Link></Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Building2 className="h-6 w-6" />Chi nhánh</h1>
          <p className="text-sm text-muted-foreground">Quản lý chi nhánh / địa điểm kinh doanh.</p>
        </div>
        <BranchDialog />
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">MST</th>
              <th className="px-4 py-2 text-left">Người phụ trách</th>
              <th className="px-4 py-2 text-left">SĐT</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.tax_id || "—"}</td>
                <td className="px-4 py-2">{r.manager || "—"}</td>
                <td className="px-4 py-2">{r.phone || "—"}</td>
                <td className="px-4 py-2 text-center">
                  {r.is_active ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Hoạt động</Badge> : <Badge variant="outline">Ẩn</Badge>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <BranchDialog row={r} />
                  <DeleteRow id={r.id} name={r.name} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Chưa có chi nhánh nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BranchDialog({ row }: { row?: any }) {
  const up = useServerFn(upsertBranch);
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(() => ({
    code: row?.code ?? "", name: row?.name ?? "", tax_id: row?.tax_id ?? "",
    address: row?.address ?? "", phone: row?.phone ?? "", manager: row?.manager ?? "",
    is_active: row?.is_active ?? true,
  }));
  const m = useMutation({
    mutationFn: () => up({ data: { id: row?.id, ...form } as any }),
    onSuccess: () => { toast.success(row ? "Đã cập nhật" : "Đã thêm chi nhánh"); invalidateDimensions(qc, "branch"); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button> : <Button variant="add"><Plus className="mr-2 h-4 w-4" />Thêm chi nhánh</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "Sửa chi nhánh" : "Thêm chi nhánh"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Mã *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Tên *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">MST (nếu khác trụ sở)</Label><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">SĐT</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Địa chỉ</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Người phụ trách</Label><Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="b-active" /><Label htmlFor="b-active" className="text-sm">Hoạt động</Label></div>
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
  const del = useServerFn(deleteBranch);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); invalidateDimensions(qc, "branch"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Xoá chi nhánh "{name}"?</AlertDialogTitle><AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Huỷ</AlertDialogCancel><AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

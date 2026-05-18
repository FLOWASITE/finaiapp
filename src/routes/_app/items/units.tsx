import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUnits, upsertUnit, deleteUnit, seedCommonUnits } from "@/lib/units.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Ruler } from "lucide-react";

export const Route = createFileRoute("/_app/items/units")({ component: UnitsPage });

function UnitsPage() {
  const list = useServerFn(listUnits);
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: () => list() });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return ((units as any[]) ?? []).filter(
      (u) => !s || u.code.toLowerCase().includes(s) || u.name.toLowerCase().includes(s),
    );
  }, [units, search]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Ruler className="h-6 w-6" /> Đơn vị tính</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh mục đơn vị tính dùng cho hàng hoá &amp; dịch vụ.</p>
        </div>
        <div className="flex gap-2">
          <SeedButton />
          <UnitDialog />
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input placeholder="Tìm mã hoặc tên đơn vị..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Ghi chú</th>
              <th className="px-4 py-2 text-right">Đang dùng</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{u.code}</td>
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.note || "—"}</td>
                <td className="px-4 py-2 text-right font-mono">{u.usage}</td>
                <td className="px-4 py-2 text-center">
                  {u.is_active ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Hoạt động</Badge> : <Badge variant="outline">Ẩn</Badge>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <UnitDialog unit={u} />
                  <DeleteButton id={u.id} name={u.name} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Chưa có đơn vị tính nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitDialog({ unit }: { unit?: any }) {
  const up = useServerFn(upsertUnit);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    code: unit?.code ?? "",
    name: unit?.name ?? "",
    note: unit?.note ?? "",
    is_active: unit?.is_active ?? true,
  }));

  const m = useMutation({
    mutationFn: () => up({ data: { id: unit?.id, ...form } as any }),
    onSuccess: () => {
      toast.success(unit ? "Đã cập nhật" : "Đã thêm đơn vị");
      qc.invalidateQueries({ queryKey: ["units"] });
      setOpen(false);
      if (!unit) setForm({ code: "", name: "", note: "", is_active: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {unit ? (
          <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="mr-2 h-4 w-4" />Thêm đơn vị</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{unit ? "Sửa đơn vị tính" : "Thêm đơn vị tính"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mã *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="cái, hộp, kg..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cái, Hộp, Ki-lô-gam..." />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="u-active" />
            <Label htmlFor="u-active" className="text-sm">Hoạt động</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.code.trim() || !form.name.trim() || m.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const del = useServerFn(deleteUnit);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["units"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá đơn vị "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

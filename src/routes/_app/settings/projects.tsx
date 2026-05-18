import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, upsertProject, deleteProject, listProjectRefs } from "@/lib/dimensions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderKanban, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_app/settings/projects")({ component: ProjectsPage });

const NONE = "__none__";
const STATUSES = [
  { v: "planning", label: "Khởi tạo" },
  { v: "active", label: "Đang thực hiện" },
  { v: "on_hold", label: "Tạm ngưng" },
  { v: "completed", label: "Hoàn thành" },
  { v: "cancelled", label: "Đã huỷ" },
];
const statusLabel = (v: string) => STATUSES.find((s) => s.v === v)?.label ?? v;

function ProjectsPage() {
  const list = useServerFn(listProjects);
  const refsFn = useServerFn(listProjectRefs);
  const { data } = useQuery({ queryKey: ["projects"], queryFn: () => list(),
 ...QUERY_PRESETS.REFERENCE,
});
  const { data: refs } = useQuery({ queryKey: ["project-refs"], queryFn: () => refsFn(),
 ...QUERY_PRESETS.REFERENCE,
});
  const rows = (data as any[]) ?? [];
  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm"><Link to="/settings"><ChevronLeft className="h-4 w-4 mr-1" />Cài đặt</Link></Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FolderKanban className="h-6 w-6" />Dự án</h1>
          <p className="text-sm text-muted-foreground">Theo dõi doanh thu / chi phí theo dự án.</p>
        </div>
        <ProjectDialog refs={refs as any} />
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Khách hàng</th>
              <th className="px-4 py-2 text-left">Phụ trách</th>
              <th className="px-4 py-2 text-left">Bắt đầu</th>
              <th className="px-4 py-2 text-left">Kết thúc</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2">{r.customers?.name || "—"}</td>
                <td className="px-4 py-2">{r.employees?.full_name || "—"}</td>
                <td className="px-4 py-2">{r.start_date || "—"}</td>
                <td className="px-4 py-2">{r.end_date || "—"}</td>
                <td className="px-4 py-2 text-center">
                  <Badge variant="outline">{statusLabel(r.status)}</Badge>
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <ProjectDialog row={r} refs={refs as any} />
                  <DeleteRow id={r.id} name={r.name} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Chưa có dự án nào</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectDialog({ row, refs }: { row?: any; refs?: { customers: any[]; employees: any[] } }) {
  const up = useServerFn(upsertProject);
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(() => ({
    code: row?.code ?? "", name: row?.name ?? "", description: row?.description ?? "",
    customer_id: row?.customer_id ?? null, manager_employee_id: row?.manager_employee_id ?? null,
    start_date: row?.start_date ?? "", end_date: row?.end_date ?? "",
    status: row?.status ?? "active", is_active: row?.is_active ?? true,
  }));
  const m = useMutation({
    mutationFn: () => up({ data: { id: row?.id, ...form } as any }),
    onSuccess: () => { toast.success(row ? "Đã cập nhật" : "Đã thêm dự án"); qc.invalidateQueries({ queryKey: ["projects"] }); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button> : <Button><Plus className="mr-2 h-4 w-4" />Thêm dự án</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{row ? "Sửa dự án" : "Thêm dự án"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Mã *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Tên *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Khách hàng</Label>
              <Select value={form.customer_id ?? NONE} onValueChange={(v) => setForm({ ...form, customer_id: v === NONE ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không —</SelectItem>
                  {(refs?.customers ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Người phụ trách</Label>
              <Select value={form.manager_employee_id ?? NONE} onValueChange={(v) => setForm({ ...form, manager_employee_id: v === NONE ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Không —</SelectItem>
                  {(refs?.employees ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Bắt đầu</Label><Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Kết thúc</Label><Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Trạng thái</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Mô tả</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="p-active" /><Label htmlFor="p-active" className="text-sm">Hoạt động</Label></div>
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
  const del = useServerFn(deleteProject);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["projects"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Xoá dự án "{name}"?</AlertDialogTitle><AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Huỷ</AlertDialogCancel><AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

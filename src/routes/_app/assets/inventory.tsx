import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus, ScanBarcode, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listInventoryCounts, upsertInventoryCount } from "@/lib/fa-inventory.functions";

export const Route = createFileRoute("/_app/assets/inventory")({ component: InventoryListPage });

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Nháp", color: "bg-muted" },
  in_progress: { label: "Đang kiểm", color: "bg-blue-500/10 text-blue-600" },
  posted: { label: "Đã chốt", color: "bg-emerald-500/10 text-emerald-600" },
  void: { label: "Đã huỷ", color: "bg-rose-500/10 text-rose-600" },
};

function InventoryListPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInventoryCounts);
  const upsertFn = useServerFn(upsertInventoryCount);
  const rows = useQuery({ queryKey: ["fa_inv_counts"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: `KK-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    count_date: new Date().toISOString().slice(0, 10),
    location: "",
    description: "",
  });

  const create = useMutation({
    mutationFn: () => upsertFn({ data: form as any }),
    onSuccess: (r: any) => {
      toast.success("Đã tạo phiên kiểm kê");
      qc.invalidateQueries({ queryKey: ["fa_inv_counts"] });
      setOpen(false);
      window.location.href = `/assets/inventory/${r.id}`;
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><ScanBarcode className="h-7 w-7 text-cyan-500" />Kiểm kê tài sản</h1>
            <p className="text-sm text-muted-foreground">Tạo phiên kiểm kê, quét barcode/mã tài sản để đối chiếu thực tế.</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Phiên kiểm kê mới</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Vị trí</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell><Calendar className="h-3 w-3 inline mr-1" />{r.count_date}</TableCell>
                  <TableCell>{r.location || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.description || "—"}</TableCell>
                  <TableCell><Badge className={STATUS[r.status]?.color}>{STATUS[r.status]?.label}</Badge></TableCell>
                  <TableCell><Link to="/assets/inventory/$id" params={{ id: r.id }}><Button variant="outline" size="sm">Mở</Button></Link></TableCell>
                </TableRow>
              ))}
              {(rows.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Chưa có phiên kiểm kê</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Phiên kiểm kê mới</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mã phiên</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
              <div><Label>Ngày</Label><Input type="date" value={form.count_date} onChange={e => setForm(f => ({ ...f, count_date: e.target.value }))} /></div>
            </div>
            <div><Label>Vị trí (lọc tài sản)</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="VD: Tầng 3 — phòng IT" /></div>
            <div><Label>Mô tả</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Tạo & mở</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

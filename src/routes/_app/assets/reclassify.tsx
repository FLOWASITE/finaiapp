import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowLeftRight, Plus, Ban, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { listFixedAssets } from "@/lib/assets.functions";
import { listReclassifications, createReclassification, voidReclassification } from "@/lib/fa-reclass.functions";
import { AccountCombobox } from "@/components/ui/account-combobox";

export const Route = createFileRoute("/_app/assets/reclassify")({ component: ReclassPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

function ReclassPage() {
  const qc = useQueryClient();
  const listAssetsFn = useServerFn(listFixedAssets);
  const listFn = useServerFn(listReclassifications);
  const createFn = useServerFn(createReclassification);
  const voidFn = useServerFn(voidReclassification);

  const assets = useQuery({ queryKey: ["fixed_assets_list"], queryFn: () => listAssetsFn() });
  const rows = useQuery({ queryKey: ["fa_reclass"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    asset_id: "",
    reclass_date: new Date().toISOString().slice(0, 10),
    direction: "fa_to_tool" as "fa_to_tool" | "tool_to_fa",
    target_account: "153",
    allocation_months: 0,
    expense_account: "6422",
    new_cost: 0,
    reason: "",
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { ...form, allocation_months: Number(form.allocation_months), new_cost: Number(form.new_cost) || undefined } as any }),
    onSuccess: () => {
      toast.success("Đã chuyển loại tài sản");
      qc.invalidateQueries({ queryKey: ["fa_reclass"] });
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assetList = useMemo(() => (assets.data ?? []), [assets.data]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><ArrowLeftRight className="h-7 w-7 text-violet-500" />Chuyển loại TSCĐ ↔ CCDC</h1>
            <p className="text-sm text-muted-foreground">Chuyển TSCĐ thành CCDC (TK 153) hoặc CP trả trước (TK 242), và ngược lại.</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Lập phiếu chuyển</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Tài sản</TableHead>
                <TableHead>Hướng</TableHead>
                <TableHead>TK đích</TableHead>
                <TableHead className="text-right">Nguyên giá</TableHead>
                <TableHead className="text-right">KH luỹ kế</TableHead>
                <TableHead className="text-right">Còn lại</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.reclass_date}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.asset?.name}</div>
                    <div className="text-xs text-muted-foreground">{r.asset?.code}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{r.direction === "fa_to_tool" ? "TSCĐ → CCDC" : "CCDC → TSCĐ"}</Badge></TableCell>
                  <TableCell><code>{r.target_account}</code></TableCell>
                  <TableCell className="text-right">{fmt(r.cost_snapshot)}</TableCell>
                  <TableCell className="text-right">{fmt(r.accumulated_snapshot)}</TableCell>
                  <TableCell className="text-right">{fmt(r.residual_value)}</TableCell>
                  <TableCell>
                    {r.status === "void" ? <Badge variant="destructive">Đã huỷ</Badge> : <Badge>Đã ghi</Badge>}
                    {r.journal_entry_id && <Badge variant="outline" className="ml-1"><FileText className="h-3 w-3 mr-1" />JE</Badge>}
                  </TableCell>
                  <TableCell>
                    {r.status !== "void" && (
                      <Button variant="ghost" size="icon" onClick={() => {
                        const reason = prompt("Lý do huỷ?");
                        if (reason !== null) voidFn({ data: { id: r.id, reason } }).then(() => { toast.success("Đã huỷ"); qc.invalidateQueries({ queryKey: ["fa_reclass"] }); });
                      }}><Ban className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(rows.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Chưa có phiếu chuyển</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Phiếu chuyển loại tài sản</DialogTitle>
            <DialogDescription>Hệ thống tự sinh bút toán phù hợp theo hướng chuyển.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hướng chuyển</Label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as any, target_account: v === "fa_to_tool" ? "153" : "211" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fa_to_tool">TSCĐ → CCDC / CP trả trước</SelectItem>
                    <SelectItem value="tool_to_fa">CCDC → TSCĐ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Ngày</Label><Input type="date" value={form.reclass_date} onChange={e => setForm(f => ({ ...f, reclass_date: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Tài sản</Label>
              <Select value={form.asset_id} onValueChange={v => setForm(f => ({ ...f, asset_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Chọn tài sản…" /></SelectTrigger>
                <SelectContent>
                  {assetList.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>TK đích</Label>
                {form.direction === "fa_to_tool" ? (
                  <Select value={form.target_account} onValueChange={v => setForm(f => ({ ...f, target_account: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="153">153 — Công cụ dụng cụ</SelectItem>
                      <SelectItem value="242">242 — Chi phí trả trước</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.target_account} onChange={e => setForm(f => ({ ...f, target_account: e.target.value }))} />
                )}
              </div>
              {form.direction === "fa_to_tool" && form.target_account === "242" && (
                <div><Label>Số kỳ phân bổ (tháng)</Label><Input type="number" value={form.allocation_months} onChange={e => setForm(f => ({ ...f, allocation_months: Number(e.target.value) }))} /></div>
              )}
              {form.direction === "tool_to_fa" && (
                <div><Label>Nguyên giá mới</Label><Input type="number" value={form.new_cost} onChange={e => setForm(f => ({ ...f, new_cost: Number(e.target.value) }))} /></div>
              )}
            </div>
            <div>
              <Label>Lý do</Label>
              <Textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={() => create.mutate()} disabled={!form.asset_id || create.isPending}>Ghi nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

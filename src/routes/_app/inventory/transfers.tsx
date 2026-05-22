import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listStockTransfers, createStockTransfer, cancelStockTransfer } from "@/lib/stock-transfers.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { listProducts } from "@/lib/inventory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory/transfers")({ component: TransfersPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

type Line = { product_id: string; qty: number; unit_cost: number; note: string };

function TransfersPage() {
  const list = useServerFn(listStockTransfers);
  const cancelFn = useServerFn(cancelStockTransfer);
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [open, setOpen] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["stock-transfers", from, to],
    queryFn: () => list({ data: { from, to } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã huỷ phiếu chuyển kho");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["inventory-report"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không huỷ được"),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-blue-600" /> Chuyển kho
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chuyển hàng giữa các kho. Không phát sinh bút toán doanh thu/giá vốn.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Tạo phiếu chuyển kho</Button>
          </DialogTrigger>
          <TransferFormDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <Label className="text-xs">Kỳ</Label>
          <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} className="mt-1 justify-start" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Số phiếu</th>
                  <th className="p-3">Kho xuất</th>
                  <th className="p-3">Kho nhập</th>
                  <th className="p-3 text-right">Số dòng</th>
                  <th className="p-3 text-right">Tổng SL</th>
                  <th className="p-3 text-right">Tổng giá trị</th>
                  <th className="p-3">Lý do</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Đang tải…</td></tr>}
                {!isLoading && (rows ?? []).length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Chưa có phiếu chuyển kho</td></tr>
                )}
                {((rows ?? []) as any[]).map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap">{r.voucher_date}</td>
                    <td className="p-3 font-mono text-xs">{r.voucher_no}</td>
                    <td className="p-3 text-xs">{r.from_warehouse?.name ?? "—"}</td>
                    <td className="p-3 text-xs">{r.to_warehouse?.name ?? "—"}</td>
                    <td className="p-3 text-right">{r.line_count}</td>
                    <td className="p-3 text-right">{fmt(r.total_qty)}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.total_value)}</td>
                    <td className="p-3 text-xs">{r.reason || "—"}</td>
                    <td className="p-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Huỷ phiếu {r.voucher_no}?</AlertDialogTitle>
                            <AlertDialogDescription>Các dòng chuyển kho sẽ bị xoá và tồn các kho được tính lại.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Đóng</AlertDialogCancel>
                            <AlertDialogAction onClick={() => cancelMut.mutate(r.id)}>Xác nhận huỷ</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Gợi ý: xem báo cáo kho theo từng kho tại{" "}
        <Link to="/inventory" className="text-primary hover:underline">Hàng tồn kho</Link>.
      </p>
    </div>
  );
}

function TransferFormDialog({ onClose }: { onClose: () => void }) {
  const create = useServerFn(createStockTransfer);
  const whsFn = useServerFn(listWarehouses);
  const productsFn = useServerFn(listProducts);
  const qc = useQueryClient();

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whsFn(), ...QUERY_PRESETS.REFERENCE });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn(), ...QUERY_PRESETS.REFERENCE });

  const [voucherDate, setVoucherDate] = useState(today());
  const [fromWh, setFromWh] = useState<string>("");
  const [toWh, setToWh] = useState<string>("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", qty: 0, unit_cost: 0, note: "" }]);

  const productsList = useMemo(
    () => ((products as any[]) ?? []).filter((p) => (p.item_type ?? "goods") !== "service"),
    [products],
  );

  const onProductChange = (i: number, pid: string) => {
    const p = productsList.find((x) => x.id === pid);
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, product_id: pid, unit_cost: Number(p?.unit_cost ?? 0) } : l)));
  };

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          voucher_date: voucherDate,
          from_warehouse_id: fromWh,
          to_warehouse_id: toWh,
          reason: reason || undefined,
          lines: lines.filter((l) => l.product_id && l.qty > 0).map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            unit_cost: Number(l.unit_cost || 0),
            note: l.note || undefined,
          })),
        } as any,
      }),
    onSuccess: (res) => {
      toast.success(`Đã tạo phiếu chuyển kho ${res.voucher_no}`);
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["inventory-report"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được phiếu"),
  });

  const canSubmit = fromWh && toWh && fromWh !== toWh && lines.some((l) => l.product_id && l.qty > 0);

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Tạo phiếu chuyển kho</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Ngày</Label>
            <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kho xuất</Label>
            <Select value={fromWh} onValueChange={setFromWh}>
              <SelectTrigger><SelectValue placeholder="Chọn kho..." /></SelectTrigger>
              <SelectContent>
                {((warehouses ?? []) as any[]).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kho nhập</Label>
            <Select value={toWh} onValueChange={setToWh}>
              <SelectTrigger><SelectValue placeholder="Chọn kho..." /></SelectTrigger>
              <SelectContent>
                {((warehouses ?? []) as any[]).filter((w) => w.id !== fromWh).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label className="text-xs">Lý do</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <div className="rounded-md border">
          <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs uppercase">
            <span>Các dòng ({lines.length})</span>
            <Button size="sm" variant="ghost" onClick={() => setLines((a) => [...a, { product_id: "", qty: 0, unit_cost: 0, note: "" }])}>
              <Plus className="h-3 w-3 mr-1" />Thêm dòng
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Mặt hàng</th>
                <th className="px-2 py-1 text-right">SL</th>
                <th className="px-2 py-1 text-right">Đơn giá</th>
                <th className="px-2 py-1 text-left">Ghi chú</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1 min-w-[200px]">
                    <Select value={l.product_id} onValueChange={(v) => onProductChange(i, v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Chọn..." /></SelectTrigger>
                      <SelectContent>
                        {productsList.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" value={l.qty || ""} className="h-8 text-right" onChange={(e) =>
                      setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, qty: Number(e.target.value) } : x)))
                    } />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" value={l.unit_cost || ""} className="h-8 text-right" onChange={(e) =>
                      setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, unit_cost: Number(e.target.value) } : x)))
                    } />
                  </td>
                  <td className="px-2 py-1">
                    <Input value={l.note} className="h-8" onChange={(e) =>
                      setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)))
                    } />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Button size="sm" variant="ghost" disabled={lines.length === 1} onClick={() =>
                      setLines((arr) => arr.filter((_, idx) => idx !== i))
                    }>×</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending ? "Đang lưu…" : "Tạo phiếu"}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

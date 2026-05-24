import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listMovements, cancelMovement, listPendingStockDocs } from "@/lib/inventory.functions";
import { stickStockVoucher } from "@/lib/purchase-vouchers.functions";
import { stickSalesStockVoucher } from "@/lib/sales-vouchers.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Repeat, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory/unposted")({ component: UnpostedPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

function UnpostedPage() {
  const list = useServerFn(listMovements);
  const cancelFn = useServerFn(cancelMovement);
  const pendingFn = useServerFn(listPendingStockDocs);
  const whFn = useServerFn(listWarehouses);
  const stickPurchase = useServerFn(stickStockVoucher);
  const stickSales = useServerFn(stickSalesStockVoucher);
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [type, setType] = useState<"all" | "in" | "out" | "transfer">("all");
  const [search, setSearch] = useState("");
  const [pickerDoc, setPickerDoc] = useState<{ id: string; kind: "purchase" | "sales"; voucher_no: string } | null>(null);
  const [pickerWh, setPickerWh] = useState<string>("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["movements-unposted", from, to, type],
    queryFn: () => list({ data: { from, to, type, status: "unposted" } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: pending } = useQuery({
    queryKey: ["pending-stock-docs", from, to],
    queryFn: () => pendingFn({ data: { from, to } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => whFn(),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return (rows ?? []) as any[];
    return ((rows ?? []) as any[]).filter((r) =>
      [r.products?.code, r.products?.name, r.warehouses?.name, r.note].some((v) =>
        v?.toLowerCase().includes(s),
      ),
    );
  }, [rows, search]);

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã huỷ phiếu");
      qc.invalidateQueries({ queryKey: ["movements-unposted"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không huỷ được"),
  });

  const stickMut = useMutation({
    mutationFn: async (args: { id: string; kind: "purchase" | "sales"; warehouseId: string }) => {
      if (args.kind === "purchase") return stickPurchase({ data: { id: args.id, warehouseId: args.warehouseId } });
      return stickSales({ data: { id: args.id, warehouseId: args.warehouseId } });
    },
    onSuccess: () => {
      toast.success("Đã tạo phiếu kho");
      setPickerDoc(null);
      setPickerWh("");
      qc.invalidateQueries({ queryKey: ["pending-stock-docs"] });
      qc.invalidateQueries({ queryKey: ["movements-unposted"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được"),
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-500" /> Phiếu chưa nhập/xuất kho
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Các phát sinh kho chưa được ghi sổ (chưa tạo bút toán). Tạo / sửa phiếu tại{" "}
          <Link to="/inventory/vouchers" className="text-primary hover:underline">Phiếu nhập/xuất kho</Link>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-4 w-4 text-primary" />
            Phiếu mua/bán chưa tạo phiếu kho ({(pending ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Loại</th>
                  <th className="p-3">Số phiếu</th>
                  <th className="p-3">Đối tác</th>
                  <th className="p-3 text-right">Tổng tiền</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {(!pending || pending.length === 0) && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Không có phiếu nào cần tạo phiếu kho</td></tr>
                )}
                {(pending ?? []).map((d: any) => {
                  const isPurchase = d.kind === "purchase";
                  return (
                    <tr key={`${d.kind}-${d.id}`} className="border-t hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">{d.voucher_date}</td>
                      <td className="p-3">
                        <Badge className={isPurchase ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-orange-100 text-orange-700 hover:bg-orange-100"}>
                          {isPurchase ? <><ArrowDownToLine className="h-3 w-3 mr-1" />Mua hàng</> : <><ArrowUpFromLine className="h-3 w-3 mr-1" />Bán hàng</>}
                        </Badge>
                      </td>
                      <td className="p-3 font-medium">{d.voucher_no}</td>
                      <td className="p-3">{d.party_name ?? "—"}</td>
                      <td className="p-3 text-right">{fmt(d.total)}</td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPickerDoc({ id: d.id, kind: d.kind, voucher_no: d.voucher_no });
                            setPickerWh("");
                          }}
                        >
                          <PackagePlus className="h-4 w-4 mr-1" />
                          {isPurchase ? "Tạo phiếu nhập" : "Tạo phiếu xuất"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Kỳ</Label>
            <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} className="w-full justify-start" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="in">Nhập</SelectItem>
                <SelectItem value="out">Xuất</SelectItem>
                <SelectItem value="transfer">Chuyển kho</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Tìm hàng / kho / ghi chú</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Danh sách ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Loại</th>
                  <th className="p-3">Kho</th>
                  <th className="p-3">Hàng hoá</th>
                  <th className="p-3 text-right">SL</th>
                  <th className="p-3 text-right">Đơn giá</th>
                  <th className="p-3 text-right">Giá trị</th>
                  <th className="p-3">Ghi chú</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Đang tải…</td></tr>}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Không có phiếu chưa ghi sổ</td></tr>
                )}
                {filtered.map((r) => {
                  const Icon = r.movement_type === "in" ? ArrowDownToLine : r.movement_type === "out" ? ArrowUpFromLine : Repeat;
                  const color = r.movement_type === "in" ? "bg-emerald-100 text-emerald-700" : r.movement_type === "out" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700";
                  const label = r.movement_type === "in" ? "Nhập" : r.movement_type === "out" ? "Xuất" : "Chuyển";
                  const value = Number(r.qty) * Number(r.unit_cost || 0);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">{r.movement_date}</td>
                      <td className="p-3">
                        <Badge className={`${color} hover:${color}`}><Icon className="h-3 w-3 mr-1" />{label}</Badge>
                      </td>
                      <td className="p-3 text-xs">{r.warehouses?.name ?? "—"}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.products?.name}</div>
                        <div className="text-xs text-muted-foreground">{r.products?.code}</div>
                      </td>
                      <td className="p-3 text-right">{fmt(r.qty)} {r.products?.unit}</td>
                      <td className="p-3 text-right">{fmt(r.unit_cost)}</td>
                      <td className="p-3 text-right font-medium">{fmt(value)}</td>
                      <td className="p-3 text-xs">{r.note ?? "—"}</td>
                      <td className="p-3 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Huỷ phiếu này?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Dòng phát sinh kho sẽ bị xoá và tồn kho được tính lại.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Đóng</AlertDialogCancel>
                              <AlertDialogAction onClick={() => cancelMut.mutate(r.id)}>Xác nhận huỷ</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

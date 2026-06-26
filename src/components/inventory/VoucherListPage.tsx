import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listStockVouchers, getStockVoucher, cancelStockVoucher, updateStockVoucher, listProducts, createStockVoucher } from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowDownToLine, ArrowUpFromLine, Eye, Pencil, Printer, Trash2, Warehouse, Plus } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";
import { printVoucher } from "@/lib/printVoucher";
import { toast } from "sonner";
import { usePagination, TablePagination } from "@/components/table-pagination";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  // Mặc định lấy từ đầu năm để không bỏ sót phiếu kho được tạo từ
  // chứng từ mua/bán có ngày khác tháng hiện tại.
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
};

interface Props {
  type: "in" | "out" | "all";
}

export function VoucherListPage({ type }: Props) {
  const list = useServerFn(listStockVouchers);
  const getStockVoucherFn = useServerFn(getStockVoucher);
  const whs = useServerFn(listWarehouses);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState<"all" | "posted" | "unposted">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"in" | "out" | null>(null);

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whs(),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const { data: rows, isLoading } = useQuery({
    queryKey: ["vouchers-list", type, from, to, warehouseId, status],
    queryFn: () => list({ data: { type, from, to, warehouse_id: warehouseId, status } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows ?? [];
    return (rows ?? []).filter((r: any) =>
      [r.voucher_no, r.reason, r.warehouses?.name].some((v) => v?.toLowerCase().includes(s))
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const arr = filtered as any[];
    return {
      count: arr.length,
      lines: arr.reduce((s, r) => s + Number(r.line_count || 0), 0),
      value: arr.reduce((s, r) => s + Number(r.total_value || 0), 0),
    };
  }, [filtered]);

  const pagination = usePagination(filtered as any[], 20, `${type}|${from}|${to}|${warehouseId}|${status}|${search}`);

  const title = type === "in" ? "Phiếu nhập kho" : type === "out" ? "Phiếu xuất kho" : "Phiếu nhập/xuất kho";
  const Icon = type === "out" ? ArrowUpFromLine : ArrowDownToLine;
  const accent = type === "in" ? "text-emerald-600" : type === "out" ? "text-orange-600" : "text-primary";

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Icon className={`h-6 w-6 ${accent}`} /> {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Mỗi phiếu nhiều dòng. Bạn có thể tạo phiếu trực tiếp tại đây.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(type === "in" || type === "all") && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateType("in")}>
              <Plus className="h-4 w-4 mr-1" /> <ArrowDownToLine className="h-4 w-4 mr-1" /> Phiếu nhập
            </Button>
          )}
          {(type === "out" || type === "all") && (
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCreateType("out")}>
              <Plus className="h-4 w-4 mr-1" /> <ArrowUpFromLine className="h-4 w-4 mr-1" /> Phiếu xuất
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Kỳ</Label>
            <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} className="w-full justify-start" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kho</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả kho</SelectItem>
                <SelectItem value="none">(Chưa gán kho)</SelectItem>
                {(warehouses ?? []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trạng thái</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="posted">Đã ghi sổ</SelectItem>
                <SelectItem value="unposted">Chưa ghi sổ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Tìm số phiếu / lý do</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PN202605/00001..." />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Kpi label="Số phiếu" value={String(totals.count)} icon={Warehouse} tone="primary" />
        <Kpi label="Tổng số dòng" value={fmt(totals.lines)} icon={ArrowDownToLine} tone="emerald" />
        <Kpi label="Tổng giá trị" value={fmt(totals.value)} icon={ArrowUpFromLine} tone="orange" suffix="₫" />
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Số phiếu</th>
                  {type === "all" && <th className="p-3">Loại</th>}
                  <th className="p-3">Kho</th>
                  <th className="p-3">Lý do</th>
                  <th className="p-3 text-right">Số dòng</th>
                  <th className="p-3 text-right">Tổng giá trị</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={type === "all" ? 9 : 8} className="p-6 text-center text-muted-foreground">Đang tải…</td></tr>}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={type === "all" ? 9 : 8} className="p-6 text-center text-muted-foreground">Không có phiếu phù hợp</td></tr>
                )}
                {pagination.pageRows.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap">{r.voucher_date}</td>
                    <td className="p-3 font-mono text-xs">{r.voucher_no}</td>
                    {type === "all" && (
                      <td className="p-3">
                        {r.voucher_type === "in" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <ArrowDownToLine className="h-3 w-3 mr-1" /> Nhập
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                            <ArrowUpFromLine className="h-3 w-3 mr-1" /> Xuất
                          </Badge>
                        )}
                      </td>
                    )}
                    <td className="p-3">
                      {r.warehouses ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Warehouse className="h-3 w-3" /> {r.warehouses.name}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-xs">{r.reason || "—"}</td>
                    <td className="p-3 text-right">{r.line_count}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.total_value)}</td>
                    <td className="p-3">
                      {r.journal_entry_id
                        ? <Badge variant="secondary">Đã ghi sổ</Badge>
                        : <Badge variant="outline">Chưa ghi sổ</Badge>}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        const full = await getStockVoucherFn({ data: { id: r.id } });
                        printVoucher({
                          voucher: full.voucher as any,
                          lines: full.lines as any,
                          journal_lines: full.journal_lines as any,
                          type: (r.voucher_type === "out" ? "out" : "in"),
                        });
                      }}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination {...pagination} />
        </CardContent>
      </Card>

      <VoucherDetailDialog id={openId} onClose={() => setOpenId(null)} type={type === "all" ? "in" : type} />
      <VoucherCreateDialog type={createType} onClose={() => setCreateType(null)} />
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone = "primary", suffix }: { label: string; value: string; icon?: any; tone?: "primary" | "emerald" | "orange"; suffix?: string }) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
    : tone === "orange" ? "text-orange-600 bg-orange-50 dark:bg-orange-950/30"
    : "text-primary bg-primary/10";
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3 md:p-4">
        {Icon && (
          <div className={`hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${toneCls}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
          <div className="mt-0.5 text-base md:text-lg font-semibold tabular-nums truncate">
            {value}{suffix ? <span className="ml-1 text-xs text-muted-foreground font-normal">{suffix}</span> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VoucherDetailDialog({ id, onClose, type }: { id: string | null; onClose: () => void; type: "in" | "out" }) {
  const get = useServerFn(getStockVoucher);
  const cancelFn = useServerFn(cancelStockVoucher);
  const updateFn = useServerFn(updateStockVoucher);
  const whsFn = useServerFn(listWarehouses);
  const productsFn = useServerFn(listProducts);
  const qc = useQueryClient();

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whsFn(),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn(),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const { data, isLoading } = useQuery({
    queryKey: ["voucher", id],
    queryFn: () => get({ data: { id: id! } }),
    enabled: !!id,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const v = data?.voucher as any;
  const lines = (data?.lines ?? []) as any[];
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    voucher_date: "",
    warehouse_id: "none",
    counter_account: "",
    reason: "",
    lines: [] as { product_id: string; qty: number; unit_cost: number; note: string }[],
  });

  useEffect(() => {
    if (v) {
      const defaultWhId =
        ((warehouses ?? []) as any[]).find((w: any) => w.is_default)?.id ??
        ((warehouses ?? []) as any[])[0]?.id ??
        null;
      setForm({
        voucher_date: v.voucher_date,
        warehouse_id: v.warehouse_id ?? defaultWhId ?? "none",
        counter_account: v.counter_account,
        reason: v.reason ?? "",
        lines: lines.map((l) => ({
          product_id: l.product_id,
          qty: Number(l.qty),
          unit_cost: Number(l.unit_cost),
          note: String(l.note ?? "").split(" — ").slice(1).join(" — "),
        })),
      });
      setEditing(false);
    }
  }, [v?.id, lines.length, warehouses]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["vouchers-list"] });
    qc.invalidateQueries({ queryKey: ["voucher", id] });
    qc.invalidateQueries({ queryKey: ["stock-report"] });
    qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { id: v.id } }),
    onSuccess: () => { toast.success("Đã huỷ phiếu và đảo bút toán"); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Không huỷ được phiếu"),
  });

  const updateMut = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: v.id,
        voucher_date: form.voucher_date,
        warehouse_id: form.warehouse_id === "none" ? null : form.warehouse_id,
        counter_account: form.counter_account,
        reason: form.reason || undefined,
        lines: form.lines.filter((l) => l.product_id && l.qty > 0).map((l) => ({
          product_id: l.product_id,
          qty: Number(l.qty),
          unit_cost: Number(l.unit_cost || 0),
          note: l.note || undefined,
        })),
      } as any,
    }),
    onSuccess: () => { toast.success("Đã cập nhật phiếu và bút toán"); invalidate(); setEditing(false); },
    onError: (e: any) => toast.error(e?.message ?? "Không cập nhật được phiếu"),
  });

  const productsList = ((products as any[]) ?? []).filter((p) => (p.item_type ?? "goods") !== "service");
  const updateLine = (i: number, patch: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { product_id: "", qty: 0, unit_cost: 0, note: "" }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết {type === "in" ? "phiếu nhập" : "phiếu xuất"} kho</DialogTitle>
        </DialogHeader>
        {isLoading || !v ? (
          <div className="py-8 text-center text-muted-foreground">Đang tải…</div>
        ) : editing ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Số phiếu" value={v.voucher_no} mono />
              <div className="space-y-1">
                <Label className="text-xs">Ngày</Label>
                <Input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kho</Label>
                <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(Không gán kho)</SelectItem>
                    {(warehouses ?? []).map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TK đối ứng</Label>
                <Input value={form.counter_account} onChange={(e) => setForm({ ...form, counter_account: e.target.value })} className="font-mono" />
              </div>
            </div>

            <div className="rounded-md border">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs uppercase">
                <span>Các dòng ({form.lines.length})</span>
                <Button size="sm" variant="ghost" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Thêm dòng</Button>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="px-2 py-1 text-left">Mặt hàng</th><th className="px-2 py-1 text-right">SL</th><th className="px-2 py-1 text-right">Đơn giá</th><th></th></tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">
                        <Select value={l.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Chọn..." /></SelectTrigger>
                          <SelectContent>
                            {productsList.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1"><Input type="number" value={l.qty || ""} className="h-8 text-right"
                        onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} /></td>
                      <td className="px-2 py-1"><Input type="number" value={l.unit_cost || ""} className="h-8 text-right"
                        disabled={type === "out"}
                        onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })} /></td>
                      <td className="px-2 py-1 text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeLine(i)} disabled={form.lines.length === 1}>×</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lý do</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(false)}>Huỷ</Button>
              <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Số phiếu" value={v.voucher_no} mono />
              <Field label="Ngày" value={v.voucher_date} />
              <Field label="Kho" value={v.warehouses ? `${v.warehouses.code} — ${v.warehouses.name}` : "—"} />
              <Field label="TK đối ứng" value={v.counter_account} mono />
            </div>
            {v.reason && <Field label="Lý do" value={v.reason} />}

            <div className="rounded-md border">
              <div className="bg-muted/40 px-3 py-2 text-xs uppercase font-medium">Chi tiết các dòng ({lines.length})</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Mặt hàng</th>
                    <th className="px-3 py-2 text-right">SL</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.products?.name}</div>
                        <div className="text-xs text-muted-foreground">{l.products?.code}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(l.qty)} {l.products?.unit}</td>
                      <td className="px-3 py-2 text-right">{fmt(l.unit_cost)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(Number(l.qty) * Number(l.unit_cost))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-3 py-2 text-right" colSpan={3}>Tổng</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_cost), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {data?.journal_entry && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Bút toán</div>
                <div className="rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left">
                      <tr><th className="p-2">TK</th><th className="p-2 text-right">Nợ</th><th className="p-2 text-right">Có</th></tr>
                    </thead>
                    <tbody>
                      {data.journal_lines.map((l: any) => (
                        <tr key={l.id} className="border-t">
                          <td className="p-2 font-mono">{l.account_code}</td>
                          <td className="p-2 text-right">{Number(l.debit) ? fmt(l.debit) : ""}</td>
                          <td className="p-2 text-right">{Number(l.credit) ? fmt(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" /> Huỷ phiếu</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Huỷ phiếu {v.voucher_no}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Phiếu (gồm {lines.length} dòng) sẽ bị xoá, bút toán sẽ bị đảo và tồn kho sẽ được tính lại.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Đóng</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cancelMut.mutate()}>Xác nhận huỷ</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-1" /> Sửa phiếu
              </Button>
              <Button size="sm" onClick={() => printVoucher({
                voucher: v,
                lines,
                journal_lines: data?.journal_lines as any,
                type,
              })}>
                <Printer className="h-4 w-4 mr-1" /> In / PDF
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono" : ""}>{value}</div>
    </div>
  );
}

function VoucherCreateDialog({ type, onClose }: { type: "in" | "out" | null; onClose: () => void }) {
  const createFn = useServerFn(createStockVoucher);
  const whsFn = useServerFn(listWarehouses);
  const productsFn = useServerFn(listProducts);
  const qc = useQueryClient();

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whsFn(), ...QUERY_PRESETS.TRANSACTIONAL });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn(), ...QUERY_PRESETS.TRANSACTIONAL });

  const defaultCounter = type === "in" ? "331" : "632";
  const [form, setForm] = useState({
    voucher_date: today(),
    warehouse_id: "none",
    counter_account: defaultCounter,
    reason: "",
    lines: [{ product_id: "", qty: 0, unit_cost: 0, note: "" }] as { product_id: string; qty: number; unit_cost: number; note: string }[],
  });

  useEffect(() => {
    if (!type) return;
    const defaultWhId =
      ((warehouses ?? []) as any[]).find((w: any) => w.is_default)?.id ??
      ((warehouses ?? []) as any[])[0]?.id ?? "none";
    setForm({
      voucher_date: today(),
      warehouse_id: defaultWhId,
      counter_account: type === "in" ? "331" : "632",
      reason: "",
      lines: [{ product_id: "", qty: 0, unit_cost: 0, note: "" }],
    });
  }, [type, warehouses]);

  const productsList = ((products as any[]) ?? []).filter((p) => (p.item_type ?? "goods") !== "service");
  const updateLine = (i: number, patch: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { product_id: "", qty: 0, unit_cost: 0, note: "" }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        voucher_type: type!,
        voucher_date: form.voucher_date,
        warehouse_id: form.warehouse_id === "none" ? null : form.warehouse_id,
        counter_account: form.counter_account,
        reason: form.reason || undefined,
        lines: form.lines.filter((l) => l.product_id && l.qty > 0).map((l) => ({
          product_id: l.product_id,
          qty: Number(l.qty),
          unit_cost: Number(l.unit_cost || 0),
          note: l.note || undefined,
        })),
      } as any,
    }),
    onSuccess: (r: any) => {
      toast.success(`Đã tạo ${type === "in" ? "phiếu nhập" : "phiếu xuất"} ${r.voucher_no}`);
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được phiếu"),
  });

  const total = form.lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0);
  const valid = form.lines.some((l) => l.product_id && l.qty > 0) && form.counter_account.length >= 2;

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "in"
              ? <><ArrowDownToLine className="h-5 w-5 text-emerald-600" /> Tạo phiếu nhập kho</>
              : <><ArrowUpFromLine className="h-5 w-5 text-orange-600" /> Tạo phiếu xuất kho</>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ngày</Label>
              <Input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kho</Label>
              <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(Không gán kho)</SelectItem>
                  {(warehouses ?? []).map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">TK đối ứng</Label>
              <Input value={form.counter_account} onChange={(e) => setForm({ ...form, counter_account: e.target.value })} className="font-mono" placeholder={type === "in" ? "331" : "632"} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Lý do / diễn giải</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={type === "in" ? "Nhập kho hàng từ NCC..." : "Xuất kho cho..."} />
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs uppercase">
              <span>Các dòng ({form.lines.length})</span>
              <Button size="sm" variant="ghost" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Thêm dòng</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left min-w-[200px]">Mặt hàng</th>
                    <th className="px-2 py-1 text-right w-24">SL</th>
                    <th className="px-2 py-1 text-right w-32">Đơn giá</th>
                    <th className="px-2 py-1 text-right w-32">Thành tiền</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">
                        <Select value={l.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Chọn mặt hàng..." /></SelectTrigger>
                          <SelectContent>
                            {productsList.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={l.qty || ""} className="h-8 text-right" onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={l.unit_cost || ""} className="h-8 text-right" disabled={type === "out"} onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-1 text-right font-medium">{fmt(Number(l.qty || 0) * Number(l.unit_cost || 0))}</td>
                      <td className="px-2 py-1">
                        <Button size="sm" variant="ghost" onClick={() => removeLine(i)} disabled={form.lines.length === 1}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3} className="px-2 py-2 text-right text-xs uppercase text-muted-foreground">Tổng giá trị</td>
                    <td className="px-2 py-2 text-right font-semibold">{fmt(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {type === "out" && (
              <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                Giá vốn xuất sẽ được tính theo phương pháp bình quân của hàng hoá.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? "Đang lưu…" : "Lưu phiếu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

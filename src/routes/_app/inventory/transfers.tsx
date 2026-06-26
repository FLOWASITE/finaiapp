import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DateRangeFilter } from "@/components/date-range-filter";
import { usePagination, TablePagination } from "@/components/table-pagination";
import { ArrowRightLeft, ArrowRight, Plus, Trash2, RefreshCw, FileText, Layers, Coins, MoreHorizontal, X, Eye, Printer } from "lucide-react";
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
  const whs = useServerFn(listWarehouses);
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fromWh, setFromWh] = useState("all");
  const [toWh, setToWh] = useState("all");
  const [status, setStatus] = useState<"all" | "posted" | "unposted">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whs(), ...QUERY_PRESETS.REFERENCE });
  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["stock-transfers", from, to],
    queryFn: () => list({ data: { from, to } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const filtered = useMemo(() => {
    const arr = (rows ?? []) as any[];
    const s = search.trim().toLowerCase();
    return arr.filter((r) => {
      if (fromWh !== "all" && r.from_warehouse?.id !== fromWh && r.from_warehouse_id !== fromWh) return false;
      if (toWh !== "all" && r.to_warehouse?.id !== toWh && r.to_warehouse_id !== toWh) return false;
      if (status === "posted" && !r.journal_entry_id) return false;
      if (status === "unposted" && r.journal_entry_id) return false;
      if (s && ![r.voucher_no, r.reason, r.from_warehouse?.name, r.to_warehouse?.name].some((v: any) => v?.toLowerCase?.().includes(s))) return false;
      return true;
    });
  }, [rows, fromWh, toWh, status, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    lines: filtered.reduce((s, r: any) => s + Number(r.line_count || 0), 0),
    value: filtered.reduce((s, r: any) => s + Number(r.total_value || 0), 0),
  }), [filtered]);

  const pagination = usePagination(filtered as any[], 20, `${from}|${to}|${fromWh}|${toWh}|${status}|${search}`);

  useEffect(() => { setSelected(new Set()); }, [from, to, fromWh, toWh, status, search]);

  const pageIds = pagination.pageRows.map((r: any) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = () => {
    const next = new Set(selected);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

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

  const bulkCancel = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => cancelFn({ data: { id } })));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      return { ok, fail: results.length - ok };
    },
    onSuccess: ({ ok, fail }) => {
      toast.success(`Đã huỷ ${ok} phiếu${fail ? ` · ${fail} lỗi` : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["inventory-report"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const exportCsv = () => {
    const head = ["Ngày", "Số phiếu", "Kho xuất", "Kho nhập", "Số dòng", "Tổng SL", "Tổng giá trị", "Lý do", "Trạng thái"];
    const lines = (filtered as any[]).map((r) => [
      r.voucher_date, r.voucher_no,
      r.from_warehouse?.name ?? "", r.to_warehouse?.name ?? "",
      r.line_count, r.total_qty, r.total_value,
      (r.reason ?? "").replace(/\n/g, " "),
      r.journal_entry_id ? "Đã ghi sổ" : "Chưa ghi sổ",
    ]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chuyen-kho_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const pageTotal = pagination.pageRows.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 md:h-6 md:w-6 shrink-0 text-blue-600" />
            <span className="truncate">Phiếu chuyển kho</span>
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Chuyển hàng giữa các kho — không phát sinh doanh thu/giá vốn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} className="h-8">
            <FileText className="h-3.5 w-3.5 mr-1" /> Xuất CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Tạo phiếu chuyển kho</Button>
            </DialogTrigger>
            <TransferFormDialog onClose={() => setOpen(false)} />
          </Dialog>
        </div>
      </div>

      {/* Filter toolbar */}
      <Card className="border-border/60">
        <CardContent className="grid gap-2 p-3 md:grid-cols-12 md:gap-3">
          <div className="md:col-span-4">
            <Label className="text-[11px] uppercase text-muted-foreground">Kỳ</Label>
            <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} className="w-full justify-start h-9 mt-0.5" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase text-muted-foreground">Kho xuất</Label>
            <Select value={fromWh} onValueChange={setFromWh}>
              <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {((warehouses ?? []) as any[]).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase text-muted-foreground">Kho nhập</Label>
            <Select value={toWh} onValueChange={setToWh}>
              <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {((warehouses ?? []) as any[]).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase text-muted-foreground">Trạng thái</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="posted">Đã ghi sổ</SelectItem>
                <SelectItem value="unposted">Chưa ghi sổ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] uppercase text-muted-foreground">Tìm kiếm</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Số phiếu, kho, lý do..." className="h-9 mt-0.5" />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Kpi label="Số phiếu" value={String(totals.count)} icon={FileText} tone="primary" />
        <Kpi label="Tổng số dòng" value={fmt(totals.lines)} icon={Layers} tone="emerald" />
        <Kpi label="Tổng giá trị" value={fmt(totals.value)} icon={Coins} tone="orange" suffix="₫" />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selected.size} phiếu</Badge>
            <span className="text-muted-foreground">đang được chọn</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelected(new Set())}>
              <X className="h-3.5 w-3.5 mr-1" /> Bỏ chọn
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="h-7">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Huỷ phiếu
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Huỷ {selected.size} phiếu đã chọn?</AlertDialogTitle>
                  <AlertDialogDescription>Các dòng chuyển kho sẽ bị xoá và tồn các kho tính lại. Hành động không thể hoàn tác.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Đóng</AlertDialogCancel>
                  <AlertDialogAction onClick={() => bulkCancel.mutate()}>Xác nhận huỷ</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {/* Table / List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Danh sách phiếu</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <Checkbox checked={allPageSelected} onCheckedChange={togglePage} aria-label="Chọn tất cả" />
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">Ngày</th>
                  <th className="px-3 py-2 whitespace-nowrap">Số phiếu</th>
                  <th className="px-3 py-2">Luồng chuyển</th>
                  <th className="px-3 py-2">Lý do</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">SL dòng</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Tổng SL</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Tổng giá trị</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={10} className="p-0">
                    <EmptyState
                      size="sm"
                      bordered={false}
                      title="Chưa có phiếu chuyển kho"
                      description="Thử mở rộng kỳ, đổi kho hoặc tạo phiếu mới."
                      cta={
                        <Button size="sm" onClick={() => setOpen(true)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Tạo phiếu chuyển kho
                        </Button>
                      }
                    />
                  </td></tr>
                )}
                {!isLoading && pagination.pageRows.map((r: any) => {
                  const isSel = selected.has(r.id);
                  return (
                    <tr key={r.id} className={`border-t hover:bg-muted/40 ${isSel ? "bg-primary/5" : ""}`}>
                      <td className="px-2 py-2">
                        <Checkbox checked={isSel} onCheckedChange={() => toggleOne(r.id)} aria-label="Chọn phiếu" />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.voucher_date}</td>
                      <td className="px-3 py-2 font-mono text-xs font-medium text-primary">{r.voucher_no}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="truncate max-w-[140px]">{r.from_warehouse?.name ?? "—"}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[140px]">{r.to_warehouse?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[280px]">{r.reason || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.line_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(r.total_qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(r.total_value)}</td>
                      <td className="px-3 py-2">
                        {r.journal_entry_id
                          ? <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10 border-emerald-600/20 text-[10px]">Đã ghi sổ</Badge>
                          : <Badge variant="outline" className="text-muted-foreground text-[10px]">Chưa ghi sổ</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled><Eye className="h-3.5 w-3.5 mr-2" /> Xem chi tiết</DropdownMenuItem>
                            <DropdownMenuItem disabled><Printer className="h-3.5 w-3.5 mr-2" /> In phiếu</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Huỷ phiếu
                                </DropdownMenuItem>
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {!isLoading && filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40 text-xs">
                    <td colSpan={7} className="px-3 py-2 text-right uppercase tracking-wide text-muted-foreground">
                      Tổng trang ({pagination.pageRows.length} phiếu)
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(pageTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-3 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <EmptyState size="sm" bordered={false} title="Chưa có phiếu chuyển kho" description="Thử mở rộng kỳ hoặc tạo phiếu mới." />
            )}
            {!isLoading && pagination.pageRows.map((r: any) => (
              <div key={r.id} className={`p-3 ${selected.has(r.id) ? "bg-primary/5" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                    <span className="font-mono text-xs font-medium text-primary truncate">{r.voucher_no}</span>
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">
                      <ArrowRightLeft className="h-2.5 w-2.5 mr-0.5" />Chuyển
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{r.voucher_date}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <span className="truncate">{r.from_warehouse?.name ?? "—"}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{r.to_warehouse?.name ?? "—"}</span>
                </div>
                {r.reason && <div className="mt-0.5 text-xs text-muted-foreground truncate">{r.reason}</div>}
                <div className="mt-1.5 flex items-center justify-between">
                  {r.journal_entry_id
                    ? <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10 border-emerald-600/20 text-[10px]">Đã ghi sổ</Badge>
                    : <Badge variant="outline" className="text-muted-foreground text-[10px]">Chưa ghi sổ</Badge>}
                  <div className="text-sm font-semibold tabular-nums">{fmt(r.total_value)}</div>
                </div>
              </div>
            ))}
          </div>

          <TablePagination {...pagination} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Gợi ý: xem báo cáo kho theo từng kho tại{" "}
        <Link to="/inventory" className="text-primary hover:underline">Hàng tồn kho</Link>.
      </p>
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

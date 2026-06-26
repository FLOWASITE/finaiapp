import { Fragment, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listStockVouchers, getStockVoucher, cancelStockVoucher, updateStockVoucher, listProducts, createStockVoucher } from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { listCustomers } from "@/lib/customers.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ArrowDownToLine, ArrowUpFromLine, Eye, Pencil, Printer, Trash2, Warehouse, Plus, MoreHorizontal, Paperclip, FileText, RefreshCw, X, ChevronDown, ChevronRight } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";
import { printVoucher } from "@/lib/printVoucher";
import { toast } from "sonner";
import { usePagination, TablePagination } from "@/components/table-pagination";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
};

/** Suy ra cặp TK Nợ / TK Có cho phiếu nhập/xuất. */
function derivedAccounts(r: any): { debit: string; credit: string } {
  const stockAcc =
    r?.stock_movements?.[0]?.products?.stock_account ||
    r?.stock_account ||
    "152";
  const counter = r?.counter_account || "—";
  if (r?.voucher_type === "in") return { debit: stockAcc, credit: counter };
  if (r?.voucher_type === "out") return { debit: counter, credit: stockAcc };
  return { debit: stockAcc, credit: stockAcc };
}

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  return String(s).slice(0, 10);
};

interface Props {
  type: "in" | "out" | "all";
}

export function VoucherListPage({ type }: Props) {
  const list = useServerFn(listStockVouchers);
  const getStockVoucherFn = useServerFn(getStockVoucher);
  const cancelFn = useServerFn(cancelStockVoucher);
  const whs = useServerFn(listWarehouses);
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState<"all" | "posted" | "unposted">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"in" | "out" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const effectiveType = type === "all" ? typeFilter : type;

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whs(), ...QUERY_PRESETS.TRANSACTIONAL });
  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["vouchers-list", effectiveType, from, to, warehouseId, status],
    queryFn: () => list({ data: { type: effectiveType, from, to, warehouse_id: warehouseId, status } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows ?? [];
    return (rows ?? []).filter((r: any) =>
      [r.voucher_no, r.reason, r.warehouses?.name, r.party_name, r.source_doc_no, r.counter_account].some((v) => v?.toLowerCase().includes(s))
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const arr = filtered as any[];
    return {
      count: arr.length,
      lines: arr.reduce((s, r) => s + Number(r.line_count || 0), 0),
      value: arr.reduce((s, r) => s + Number(r.total_value || 0), 0),
      countIn: arr.filter((r) => r.voucher_type === "in").length,
      countOut: arr.filter((r) => r.voucher_type === "out").length,
    };
  }, [filtered]);

  const pagination = usePagination(filtered as any[], 20, `${type}|${effectiveType}|${from}|${to}|${warehouseId}|${status}|${search}`);

  useEffect(() => { setSelected(new Set()); }, [effectiveType, from, to, warehouseId, status, search]);

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

  const exportCsv = () => {
    const head = ["Ngày CT", "Ngày ghi sổ", "Số phiếu", "Loại", "Kho", "Đối tượng", "Diễn giải", "TK Nợ", "TK Có", "Chứng từ gốc", "Số dòng", "Tổng SL", "Tổng giá trị", "Trạng thái"];
    const lines = (filtered as any[]).map((r) => {
      const acc = derivedAccounts(r);
      return [
        r.voucher_date,
        r.posting_date ?? r.posted_at ?? "",
        r.voucher_no,
        r.voucher_type === "in" ? "Nhập" : r.voucher_type === "out" ? "Xuất" : "Chuyển",
        r.warehouses?.name ?? "",
        r.party_name ?? "",
        (r.reason ?? "").replace(/\n/g, " "),
        acc.debit, acc.credit,
        r.source_doc_no ?? "",
        r.line_count, r.total_qty ?? "", r.total_value,
        r.journal_entry_id ? "Đã ghi sổ" : "Chưa ghi sổ",
      ];
    });
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `phieu-kho_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const bulkCancel = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => cancelFn({ data: { id } })));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      toast.success(`Đã huỷ ${ok} phiếu${fail ? ` · ${fail} lỗi` : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const title = type === "in" ? "Phiếu nhập kho" : type === "out" ? "Phiếu xuất kho" : "Phiếu nhập / xuất kho";
  const Icon = type === "out" ? ArrowUpFromLine : ArrowDownToLine;
  const accent = type === "in" ? "text-emerald-600" : type === "out" ? "text-orange-600" : "text-primary";

  const pageTotal = pagination.pageRows.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
  const colCount = (type === "all" ? 14 : 13);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Icon className={`h-5 w-5 md:h-6 md:w-6 shrink-0 ${accent}`} />
            <span className="truncate">{title}</span>
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Quản lý chứng từ nhập / xuất kho, ghi sổ kế toán và đối chiếu tồn kho.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} className="h-8">
            <FileText className="h-3.5 w-3.5 mr-1" /> Xuất CSV
          </Button>
          {(type === "in" || type === "all") && (
            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateType("in")}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Phiếu nhập
            </Button>
          )}
          {(type === "out" || type === "all") && (
            <Button size="sm" className="h-8 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setCreateType("out")}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Phiếu xuất
            </Button>
          )}
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
            <Label className="text-[11px] uppercase text-muted-foreground">Kho</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả kho</SelectItem>
                <SelectItem value="none">(Chưa gán kho)</SelectItem>
                {(warehouses ?? []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === "all" && (
            <div className="md:col-span-2">
              <Label className="text-[11px] uppercase text-muted-foreground">Loại</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="in">Nhập</SelectItem>
                  <SelectItem value="out">Xuất</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={type === "all" ? "md:col-span-2" : "md:col-span-2"}>
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
          <div className={type === "all" ? "md:col-span-2" : "md:col-span-4"}>
            <Label className="text-[11px] uppercase text-muted-foreground">Tìm kiếm</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Số phiếu, đối tượng, lý do..." className="h-9 mt-0.5" />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Kpi label="Số phiếu" value={String(totals.count)} icon={FileText} tone="primary"
          sub={type === "all" ? `Nhập ${totals.countIn} · Xuất ${totals.countOut}` : undefined} />
        <Kpi label="Tổng số dòng" value={fmt(totals.lines)} icon={ArrowDownToLine} tone="emerald" />
        <Kpi label="Tổng giá trị" value={fmt(totals.value)} icon={ArrowUpFromLine} tone="orange" suffix="₫" />
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
                  <AlertDialogDescription>
                    Toàn bộ phiếu sẽ bị xoá, bút toán đảo và tồn kho tính lại. Hành động không thể hoàn tác.
                  </AlertDialogDescription>
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
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <Checkbox checked={allPageSelected} onCheckedChange={togglePage} aria-label="Chọn tất cả" />
                  </th>
                  <th className="px-1 py-2 w-7"></th>
                  <th className="px-3 py-2 whitespace-nowrap">Ngày CT</th>
                  <th className="px-3 py-2 whitespace-nowrap">Ngày GS</th>
                  <th className="px-3 py-2 whitespace-nowrap">Số phiếu</th>
                  {type === "all" && <th className="px-3 py-2">Loại</th>}
                  <th className="px-3 py-2">Kho</th>
                  <th className="px-3 py-2">Đối tượng</th>
                  <th className="px-3 py-2">Diễn giải</th>
                  <th className="px-3 py-2 whitespace-nowrap">TK Nợ / Có</th>
                  <th className="px-3 py-2 whitespace-nowrap">CT gốc</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">SL dòng</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Tổng giá trị</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: colCount + 1 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={colCount + 1} className="p-0">
                    <EmptyState
                      size="sm"
                      bordered={false}
                      title="Không có phiếu phù hợp"
                      description="Thử mở rộng kỳ, đổi kho hoặc bỏ bộ lọc."
                      cta={(type === "in" || type === "all") ? (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCreateType("in")}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Phiếu nhập
                        </Button>
                      ) : undefined}
                      secondary={(type === "out" || type === "all") ? (
                        <Button size="sm" variant="outline" onClick={() => setCreateType("out")}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Phiếu xuất
                        </Button>
                      ) : undefined}
                    />
                  </td></tr>
                )}
                {!isLoading && pagination.pageRows.map((r: any) => {
                  const isSel = selected.has(r.id);
                  const isExp = expanded.has(r.id);
                  const acc = derivedAccounts(r);
                  const movs = (r.stock_movements ?? []) as any[];
                  return (
                    <Fragment key={r.id}>
                    <tr className={`border-t hover:bg-muted/40 ${isSel ? "bg-primary/5" : ""}`}>
                      <td className="px-2 py-2">
                        <Checkbox checked={isSel} onCheckedChange={() => toggleOne(r.id)} aria-label="Chọn phiếu" />
                      </td>
                      <td className="px-1 py-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleExpand(r.id)} aria-label="Mở rộng">
                          {isExp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </Button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDate(r.voucher_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {fmtDate(r.posting_date ?? r.posted_at)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          className="font-mono text-xs font-medium text-primary hover:underline"
                          onClick={() => setOpenId(r.id)}
                        >
                          {r.voucher_no}
                        </button>
                      </td>
                      {type === "all" && (
                        <td className="px-3 py-2">
                          {r.voucher_type === "in" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                              <ArrowDownToLine className="h-3 w-3 mr-1" /> Nhập
                            </Badge>
                          ) : r.voucher_type === "out" ? (
                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0">
                              <ArrowUpFromLine className="h-3 w-3 mr-1" /> Xuất
                            </Badge>
                          ) : (
                            <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 border-0">Chuyển</Badge>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        {r.warehouses ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Warehouse className="h-3 w-3 text-muted-foreground" /> {r.warehouses.name}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[180px] truncate" title={r.party_name || ""}>
                        {r.party_name || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[260px] truncate" title={r.reason || ""}>
                        {r.reason || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
                        <span className="text-emerald-700">N {acc.debit}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-orange-700">C {acc.credit}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {r.source_doc_no || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.line_count}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(r.total_value)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {r.journal_entry_id
                            ? <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10 border-emerald-600/20">Đã ghi sổ</Badge>
                            : <Badge variant="outline" className="text-muted-foreground">Chưa ghi sổ</Badge>}
                          {Number(r.attachments_count) > 0 && (
                            <span title={`${r.attachments_count} đính kèm`} className="text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setOpenId(r.id)}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> Xem chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setOpenId(r.id)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Sửa phiếu
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={async () => {
                              const full = await getStockVoucherFn({ data: { id: r.id } });
                              printVoucher({
                                voucher: full.voucher as any,
                                lines: full.lines as any,
                                journal_lines: full.journal_lines as any,
                                type: (r.voucher_type === "out" ? "out" : "in"),
                              });
                            }}>
                              <Printer className="h-3.5 w-3.5 mr-2" /> In phiếu
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setSelected(new Set([r.id])); }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Chọn để huỷ
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={colCount + 1} className="px-4 py-3">
                          {movs.length === 0 ? (
                            <div className="text-xs text-muted-foreground">Phiếu chưa có dòng chi tiết.</div>
                          ) : (
                            <div className="rounded-md border bg-card overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left w-8">#</th>
                                    <th className="px-2 py-1.5 text-left">Mã</th>
                                    <th className="px-2 py-1.5 text-left">Tên mặt hàng</th>
                                    <th className="px-2 py-1.5 text-left">ĐVT</th>
                                    <th className="px-2 py-1.5 text-right">Số lượng</th>
                                    <th className="px-2 py-1.5 text-right">Đơn giá</th>
                                    <th className="px-2 py-1.5 text-right">Thành tiền</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {movs.map((m, i) => {
                                    const amount = Number(m.qty || 0) * Number(m.unit_cost || 0);
                                    return (
                                      <tr key={i} className="border-t">
                                        <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                                        <td className="px-2 py-1.5 font-mono">{m.products?.code || "—"}</td>
                                        <td className="px-2 py-1.5">{m.products?.name || "—"}</td>
                                        <td className="px-2 py-1.5 text-muted-foreground">{m.products?.unit || "—"}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(Number(m.qty || 0))}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt(Number(m.unit_cost || 0))}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmt(amount)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t bg-muted/30">
                                    <td colSpan={4} className="px-2 py-1.5 text-right uppercase text-[10px] text-muted-foreground">Cộng</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(Number(r.total_qty || 0))}</td>
                                    <td></td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(Number(r.total_value || 0))}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              {!isLoading && filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40 text-xs">
                    <td colSpan={type === "all" ? 12 : 11} className="px-3 py-2 text-right uppercase tracking-wide text-muted-foreground">
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
              <EmptyState
                size="sm"
                bordered={false}
                title="Không có phiếu phù hợp"
                description="Thử mở rộng kỳ hoặc bỏ bộ lọc."
              />
            )}
            {!isLoading && pagination.pageRows.map((r: any) => {
              const isSel = selected.has(r.id);
              const isExp = expanded.has(r.id);
              const acc = derivedAccounts(r);
              const movs = (r.stock_movements ?? []) as any[];
              const postedDate = fmtDate(r.posting_date ?? r.posted_at);
              const sameDates = postedDate === fmtDate(r.voucher_date) || postedDate === "—";
              return (
                <div key={r.id} className={`p-3 ${isSel ? "bg-primary/5" : ""}`}>
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleOne(r.id)}
                      />
                      <button
                        className="font-mono text-xs font-semibold text-primary truncate hover:underline"
                        onClick={() => setOpenId(r.id)}
                      >
                        {r.voucher_no}
                      </button>
                      {r.voucher_type === "in"
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px] shrink-0"><ArrowDownToLine className="h-2.5 w-2.5 mr-0.5" />Nhập</Badge>
                        : <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0 text-[10px] shrink-0"><ArrowUpFromLine className="h-2.5 w-2.5 mr-0.5" />Xuất</Badge>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-muted-foreground tabular-nums">CT: {fmtDate(r.voucher_date)}</div>
                      {!sameDates && <div className="text-[10px] text-muted-foreground tabular-nums">GS: {postedDate}</div>}
                    </div>
                  </div>

                  {/* Detail grid */}
                  <dl className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px]">
                    <dt className="text-muted-foreground">Kho</dt>
                    <dd className="truncate">
                      {r.warehouses ? `${r.warehouses.code ?? ""} · ${r.warehouses.name}`.replace(/^· /, "") : <span className="text-muted-foreground">Chưa gán</span>}
                    </dd>

                    <dt className="text-muted-foreground">Đối tượng</dt>
                    <dd className="truncate">{r.party_name || <span className="text-muted-foreground">—</span>}</dd>

                    <dt className="text-muted-foreground">Định khoản</dt>
                    <dd className="font-mono text-[11px]">
                      <span className="text-emerald-700">Nợ {acc.debit}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-orange-700">Có {acc.credit}</span>
                    </dd>

                    {r.source_doc_no && (<>
                      <dt className="text-muted-foreground">CT gốc</dt>
                      <dd className="truncate">{r.source_doc_no}</dd>
                    </>)}

                    {r.reason && (<>
                      <dt className="text-muted-foreground">Diễn giải</dt>
                      <dd className="line-clamp-2">{r.reason}</dd>
                    </>)}
                  </dl>

                  {/* Summary row */}
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed pt-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {r.journal_entry_id
                        ? <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10 border-emerald-600/20 text-[10px]">Đã ghi sổ</Badge>
                        : <Badge variant="outline" className="text-muted-foreground text-[10px]">Chưa ghi sổ</Badge>}
                      <span className="text-[11px] text-muted-foreground">
                        {r.line_count} dòng · SL {fmt(Number(r.total_qty || 0))}
                      </span>
                      {Number(r.attachments_count) > 0 && (
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                          <Paperclip className="h-3 w-3" /> {r.attachments_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">{fmt(r.total_value)} ₫</div>
                  </div>

                  {/* Expand button + sub-table */}
                  <button
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    onClick={() => toggleExpand(r.id)}
                  >
                    {isExp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {isExp ? "Ẩn chi tiết mặt hàng" : `Xem ${movs.length} mặt hàng`}
                  </button>
                  {isExp && (
                    <div className="mt-2 rounded-md border bg-muted/20 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Mã · Tên</th>
                            <th className="px-2 py-1.5 text-right">SL</th>
                            <th className="px-2 py-1.5 text-right">Đơn giá</th>
                            <th className="px-2 py-1.5 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movs.length === 0 && (
                            <tr><td colSpan={4} className="px-2 py-2 text-center text-muted-foreground">Không có dòng.</td></tr>
                          )}
                          {movs.map((m, i) => {
                            const amount = Number(m.qty || 0) * Number(m.unit_cost || 0);
                            return (
                              <tr key={i} className="border-t">
                                <td className="px-2 py-1.5">
                                  <div className="font-mono text-[10px] text-muted-foreground">{m.products?.code || "—"}</div>
                                  <div className="truncate">{m.products?.name || "—"}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                                  {fmt(Number(m.qty || 0))} <span className="text-[10px] text-muted-foreground">{m.products?.unit || ""}</span>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(Number(m.unit_cost || 0))}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-medium">{fmt(amount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <TablePagination {...pagination} />
        </CardContent>
      </Card>

      <VoucherDetailDialog id={openId} onClose={() => setOpenId(null)} type={type === "all" ? "in" : type} />
      <VoucherCreateDialog type={createType} onClose={() => setCreateType(null)} />
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone = "primary", suffix, sub }: { label: string; value: string; icon?: any; tone?: "primary" | "emerald" | "orange"; suffix?: string; sub?: string }) {
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
          {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
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
  const suppliersFn = useServerFn(listSuppliers);
  const customersFn = useServerFn(listCustomers);
  const qc = useQueryClient();

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whsFn(), ...QUERY_PRESETS.TRANSACTIONAL });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn(), ...QUERY_PRESETS.TRANSACTIONAL });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => suppliersFn({}), ...QUERY_PRESETS.REFERENCE, enabled: type === "in" });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => customersFn({}), ...QUERY_PRESETS.REFERENCE, enabled: type === "out" });

  const defaultCounter = type === "in" ? "331" : "632";
  const [form, setForm] = useState({
    voucher_date: today(),
    warehouse_id: "none",
    counter_account: defaultCounter,
    party_id: "none",
    party_name: "",
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
      party_id: "none",
      party_name: "",
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
        party_id: form.party_id === "none" ? null : form.party_id,
        party_name: form.party_name || null,
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{type === "in" ? "Nhà cung cấp" : "Khách hàng"}</Label>
              <Select
                value={form.party_id}
                onValueChange={(v) => {
                  const list = (type === "in" ? suppliers : customers) ?? [];
                  const p = (list as any[]).find((x) => x.id === v);
                  setForm({ ...form, party_id: v, party_name: p?.name ?? "" });
                }}
              >
                <SelectTrigger><SelectValue placeholder={type === "in" ? "Chọn nhà cung cấp..." : "Chọn khách hàng..."} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(Không chọn)</SelectItem>
                  {(((type === "in" ? suppliers : customers) ?? []) as any[])
                    .filter((p) => p.is_active !== false)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code ? `${p.code} · ` : ""}{p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lý do / diễn giải</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={type === "in" ? "Nhập kho hàng từ NCC..." : "Xuất kho cho..."} />
            </div>
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

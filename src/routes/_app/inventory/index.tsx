import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  getInventoryReport,
  recomputeInventoryValuation,
  exportStockIOSummaryXlsx,
} from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ChevronRight, Download, FileSpreadsheet, RefreshCw, Search, Plus, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory/")({ component: StockReportPage });

const fmt = (n: number) => Math.round(Number(n || 0)).toLocaleString("vi-VN");
const fmtQty = (n: number) => Number(n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

function avg(value: number, qty: number) {
  if (!qty || Math.abs(qty) < 1e-9) return 0;
  return value / qty;
}

function StockReportPage() {
  const report = useServerFn(getInventoryReport);
  const whsFn = useServerFn(listWarehouses);
  const recompute = useServerFn(recomputeInventoryValuation);
  const exportXlsx = useServerFn(exportStockIOSummaryXlsx);
  const qc = useQueryClient();

  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [warehouseId, setWarehouseId] = useState("all");
  const [unit, setUnit] = useState("all");
  const [onlyWithActivity, setOnlyWithActivity] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["__all__"]));

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => whsFn(),
    ...QUERY_PRESETS.REFERENCE,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["inventory-report", from, to, warehouseId, unit, onlyWithActivity],
    queryFn: () =>
      report({
        data: {
          from,
          to,
          warehouse_ids: warehouseId === "all" ? undefined : [warehouseId],
          unit: unit === "all" ? undefined : unit,
          only_with_activity: onlyWithActivity,
        },
      }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const units = useMemo(() => {
    const s = new Set<string>();
    ((data?.products ?? []) as any[]).forEach((p) => p.unit && s.add(p.unit));
    return Array.from(s).sort();
  }, [data]);

  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    let rows = (data?.products ?? []) as any[];
    if (s) rows = rows.filter((r) => [r.code, r.name].some((v) => v?.toLowerCase().includes(s)));
    return rows;
  }, [data, search]);

  const productsByWh = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of filteredProducts) {
      const k = r.warehouse_id ?? "__none__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [filteredProducts]);

  const whRows = data?.warehouses ?? [];
  const grandTotal = useMemo(() => {
    return whRows.reduce(
      (s: any, w: any) => ({
        opening_qty: s.opening_qty + w.opening_qty,
        opening_value: s.opening_value + w.opening_value,
        in_qty: s.in_qty + w.in_qty,
        in_value: s.in_value + w.in_value,
        out_qty: s.out_qty + w.out_qty,
        out_value: s.out_value + w.out_value,
        closing_qty: s.closing_qty + w.closing_qty,
        closing_value: s.closing_value + w.closing_value,
        cum_in_qty: s.cum_in_qty + w.cum_in_qty,
        cum_in_value: s.cum_in_value + w.cum_in_value,
        cum_out_qty: s.cum_out_qty + w.cum_out_qty,
        cum_out_value: s.cum_out_value + w.cum_out_value,
      }),
      {
        opening_qty: 0, opening_value: 0, in_qty: 0, in_value: 0, out_qty: 0, out_value: 0,
        closing_qty: 0, closing_value: 0, cum_in_qty: 0, cum_in_value: 0, cum_out_qty: 0, cum_out_value: 0,
      },
    );
  }, [whRows]);

  const recomputeMut = useMutation({
    mutationFn: () => recompute(),
    onSuccess: (r: any) => {
      toast.success(`Đã tính lại giá vốn cho ${r.count} hàng hoá`);
      qc.invalidateQueries({ queryKey: ["inventory-report"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tính được"),
  });

  const exportMut = useMutation({
    mutationFn: () =>
      exportXlsx({
        data: {
          from,
          to,
          warehouse_id: warehouseId === "all" ? null : warehouseId,
          by_warehouse: true,
        },
      }),
    onSuccess: (res: any) => {
      const blob = new Blob(
        [Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0))],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xuất được báo cáo"),
  });

  const toggle = (k: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const groupCols = 16; // SL+GT+TB cho 4 nhóm + LK nhập (2) + LK xuất (2) → see header (+ cột mã hàng)

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Phạm vi</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả kho</SelectItem>
                  {((warehouses ?? []) as any[]).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đơn vị tính</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kỳ</Label>
              <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} className="justify-start" />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch id="activity" checked={onlyWithActivity} onCheckedChange={setOnlyWithActivity} />
              <Label htmlFor="activity" className="text-xs">Có phát sinh / có tồn</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tìm hàng hoá</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Mã / tên"
                  className="h-9 w-[200px] rounded-md border border-input bg-background pl-8 pr-2 text-sm"
                />
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Tìm kiếm
              </Button>
              <Link to="/inventory/vouchers">
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Tạo phiếu xuất kho</Button>
              </Link>
              <Button size="sm" variant="outline" onClick={() => recomputeMut.mutate()} disabled={recomputeMut.isPending}>
                <RefreshCw className="h-4 w-4 mr-1" /> {recomputeMut.isPending ? "Đang tính…" : "Tính giá kho"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
                <Download className="h-4 w-4 mr-1" /> {exportMut.isPending ? "Đang xuất…" : "Xuất báo cáo"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th rowSpan={2} className="p-2 text-left min-w-[200px] border-r">Kho / Tên hàng hoá</th>
                  <th rowSpan={2} className="p-2 text-left border-r">Mã hàng</th>
                  <th rowSpan={2} className="p-2 text-left border-r">ĐVT</th>
                  <th colSpan={3} className="p-2 text-center border-r bg-slate-50">Đầu kỳ</th>
                  <th colSpan={3} className="p-2 text-center border-r bg-emerald-50">Nhập kho</th>
                  <th colSpan={3} className="p-2 text-center border-r bg-orange-50">Xuất kho</th>
                  <th colSpan={3} className="p-2 text-center border-r bg-slate-50">Cuối kỳ</th>
                  <th colSpan={2} className="p-2 text-center border-r bg-emerald-50/60">LK Nhập kho</th>
                  <th colSpan={2} className="p-2 text-center bg-orange-50/60">LK Xuất kho</th>
                </tr>
                <tr>
                  {(["Đầu kỳ", "Nhập kho", "Xuất kho", "Cuối kỳ"] as const).map((g) => (
                    <Fragment key={g}>
                      <th className="p-2 text-right">SL</th>
                      <th className="p-2 text-right">Giá trị</th>
                      <th className="p-2 text-right border-r">Giá TB</th>
                    </Fragment>
                  ))}
                  <th className="p-2 text-right">SL</th>
                  <th className="p-2 text-right border-r">Giá trị</th>
                  <th className="p-2 text-right">SL</th>
                  <th className="p-2 text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={2 + groupCols + 1} className="p-6 text-center text-muted-foreground">Đang tải…</td></tr>
                )}
                {!isLoading && whRows.length === 0 && (
                  <tr><td colSpan={2 + groupCols + 1} className="p-12 text-center text-muted-foreground italic">Không có dữ liệu</td></tr>
                )}

                {/* Tất cả - rollup */}
                {!isLoading && whRows.length > 0 && (
                  <SummaryRow
                    label="Tất cả"
                    expanded={expanded.has("__all__")}
                    onToggle={() => toggle("__all__")}
                    row={grandTotal}
                    bold
                  />
                )}

                {!isLoading && whRows.map((w: any) => {
                  const k = w.warehouse_id ?? "__none__";
                  const isOpen = expanded.has(k) || expanded.has("__all__");
                  const products = productsByWh.get(k) ?? [];
                  return (
                    <Fragment key={k}>
                      <SummaryRow
                        label={w.warehouse_name}
                        expanded={isOpen}
                        onToggle={() => toggle(k)}
                        row={w}
                        indent
                      />
                      {isOpen && products.map((p) => (
                        <tr key={`${k}-${p.product_id}`} className="border-t hover:bg-muted/30">
                          <td className="p-2 pl-12 border-r">
                            <Link to="/inventory/$id" params={{ id: p.product_id }} className="hover:text-primary">
                              <div className="font-medium">{p.name}</div>
                            </Link>
                          </td>
                          <td className="p-2 border-r font-medium">{p.code}</td>
                          <td className="p-2 border-r">{p.unit}</td>
                          {/* Đầu kỳ */}
                          <td className="p-2 text-right">{fmtQty(p.opening_qty)}</td>
                          <td className="p-2 text-right">{fmt(p.opening_value)}</td>
                          <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(p.opening_value, p.opening_qty))}</td>
                          {/* Nhập */}
                          <td className="p-2 text-right">{fmtQty(p.in_qty)}</td>
                          <td className="p-2 text-right">{fmt(p.in_value)}</td>
                          <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(p.in_value, p.in_qty))}</td>
                          {/* Xuất */}
                          <td className="p-2 text-right">{fmtQty(p.out_qty)}</td>
                          <td className="p-2 text-right">{fmt(p.out_value)}</td>
                          <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(p.out_value, p.out_qty))}</td>
                          {/* Cuối kỳ */}
                          <td className="p-2 text-right">{fmtQty(p.closing_qty)}</td>
                          <td className="p-2 text-right">{fmt(p.closing_value)}</td>
                          <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(p.closing_value, p.closing_qty))}</td>
                          {/* LK */}
                          <td className="p-2 text-right">{fmtQty(p.cum_in_qty)}</td>
                          <td className="p-2 text-right border-r">{fmt(p.cum_in_value)}</td>
                          <td className="p-2 text-right">{fmtQty(p.cum_out_qty)}</td>
                          <td className="p-2 text-right">{fmt(p.cum_out_value)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Link to="/inventory/stock-card" className="inline-flex items-center gap-1 hover:text-primary">
          <ScrollText className="h-3 w-3" /> Mở Thẻ kho
        </Link>
        <span>· Báo cáo gồm: Đầu kỳ + Nhập + Xuất + Cuối kỳ + Luỹ kế từ {from.slice(0, 4)}-01-01</span>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  expanded,
  onToggle,
  row,
  bold,
  indent,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  row: any;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <tr className={`border-t ${bold ? "bg-primary/5 font-semibold" : "bg-muted/20 font-medium"}`}>
      <td className={`p-2 border-r ${indent ? "pl-6" : "pl-2"}`}>
        <button onClick={onToggle} className="inline-flex items-center gap-1 hover:text-primary">
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          {label}
        </button>
      </td>
      <td className="p-2 border-r"></td>
      <td className="p-2 border-r"></td>
      <td className="p-2 text-right">{fmtQty(row.opening_qty)}</td>
      <td className="p-2 text-right">{fmt(row.opening_value)}</td>
      <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(row.opening_value, row.opening_qty))}</td>
      <td className="p-2 text-right">{fmtQty(row.in_qty)}</td>
      <td className="p-2 text-right">{fmt(row.in_value)}</td>
      <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(row.in_value, row.in_qty))}</td>
      <td className="p-2 text-right">{fmtQty(row.out_qty)}</td>
      <td className="p-2 text-right">{fmt(row.out_value)}</td>
      <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(row.out_value, row.out_qty))}</td>
      <td className="p-2 text-right">{fmtQty(row.closing_qty)}</td>
      <td className="p-2 text-right">{fmt(row.closing_value)}</td>
      <td className="p-2 text-right border-r text-muted-foreground">{fmt(avg(row.closing_value, row.closing_qty))}</td>
      <td className="p-2 text-right">{fmtQty(row.cum_in_qty)}</td>
      <td className="p-2 text-right border-r">{fmt(row.cum_in_value)}</td>
      <td className="p-2 text-right">{fmtQty(row.cum_out_qty)}</td>
      <td className="p-2 text-right">{fmt(row.cum_out_value)}</td>
    </tr>
  );
}

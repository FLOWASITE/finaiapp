import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";

import {
  getStockIOSummary,
  exportStockIOSummaryXlsx,
} from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { getCompanyProfile } from "@/lib/reports.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/date-range-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fmt,
  Loading,
  PrintHeader,
  ReportCard,
  SignatureFooter,
} from "./index";

export const Route = createFileRoute("/_app/reports/stock-ios")({
  component: StockIOSPage,
});

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const num = (n: number) =>
  n === 0 ? "—" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function StockIOSPage() {
  const today = new Date().toISOString().slice(0, 10);
  const ym = today.slice(0, 7);
  const [from, setFrom] = useState(`${ym}-01`);
  const [to, setTo] = useState(today);
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [byWarehouse, setByWarehouse] = useState(false);
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [showSignature, setShowSignature] = useState(true);

  const profileFn = useServerFn(getCompanyProfile);
  const profileQ = useQuery({
    queryKey: ["profile-fiscal"],
    queryFn: () => profileFn(),
  });
  const profile: any = profileQ.data ?? {};

  const whFn = useServerFn(listWarehouses);
  const whQ = useQuery({ queryKey: ["warehouses"], queryFn: () => whFn() });
  const warehouses: any[] = whQ.data ?? [];

  const iosFn = useServerFn(getStockIOSummary);
  const exportFn = useServerFn(exportStockIOSummaryXlsx);

  const ios = useQuery({
    queryKey: ["stock-ios", from, to, warehouseId, byWarehouse],
    queryFn: () =>
      iosFn({
        data: {
          from,
          to,
          warehouse_id: warehouseId === "all" ? null : warehouseId,
          by_warehouse: byWarehouse,
        },
      }),
    ...QUERY_PRESETS.REPORT,
  });

  const rows = useMemo(() => {
    const all = ios.data ?? [];
    const q = norm(search);
    return all.filter((r) => {
      if (
        hideZero &&
        r.opening_qty === 0 &&
        r.in_qty === 0 &&
        r.out_qty === 0 &&
        r.closing_qty === 0
      )
        return false;
      if (!q) return true;
      return (
        norm(r.code).includes(q) ||
        norm(r.name).includes(q) ||
        norm(r.category_name ?? "").includes(q)
      );
    });
  }, [ios.data, search, hideZero]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          opening_value: s.opening_value + r.opening_value,
          in_value: s.in_value + r.in_value,
          out_value: s.out_value + r.out_value,
          closing_value: s.closing_value + r.closing_value,
        }),
        { opening_value: 0, in_value: 0, out_value: 0, closing_value: 0 },
      ),
    [rows],
  );

  async function handleExport() {
    try {
      toast.loading("Đang xuất Excel...", { id: "xlsx-nxt" });
      const res = await exportFn({
        data: {
          from,
          to,
          warehouse_id: warehouseId === "all" ? null : warehouseId,
          by_warehouse: byWarehouse,
        },
      });
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
      link.download = res.filename;
      link.click();
      toast.success("Đã xuất file", { id: "xlsx-nxt" });
    } catch (e: any) {
      toast.error(e.message ?? "Xuất file thất bại", { id: "xlsx-nxt" });
    }
  }

  return (
    <div className="p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Báo cáo Nhập – Xuất – Tồn
          </h1>
          <p className="text-sm text-muted-foreground">
            Tổng hợp tồn đầu, nhập – xuất trong kỳ và tồn cuối theo từng mặt hàng
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> In
          </Button>
          <Button size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" /> Xuất Excel
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <DateRangeFilter
          from={from}
          to={to}
          onChange={(r) => {
            setFrom(r.from);
            setTo(r.to);
          }}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Kho</span>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả kho</SelectItem>
              <SelectItem value="none">Không phân kho</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã / tên hàng"
            className="h-9 w-64 pl-7 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={byWarehouse}
            onChange={(e) => setByWarehouse(e.target.checked)}
          />
          Tách theo kho
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
          />
          Ẩn mặt hàng không phát sinh
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showSignature}
            onChange={(e) => setShowSignature(e.target.checked)}
          />
          Hiện chữ ký
        </label>
      </div>

      <div className="mt-4 print:mt-0">
        <PrintHeader
          profile={profile}
          title="BÁO CÁO NHẬP – XUẤT – TỒN"
          subtitle={`Kỳ từ ${from} đến ${to}`}
        />
        <ReportCard
          title="Nhập – Xuất – Tồn theo mặt hàng"
          subtitle={`${rows.length} mặt hàng`}
        >
          {ios.isLoading ? (
            <Loading />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Mã</th>
                    <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Tên hàng</th>
                    <th rowSpan={2} className="px-3 py-2 text-left align-bottom">ĐVT</th>
                    {byWarehouse && (
                      <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Kho</th>
                    )}
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">Tồn đầu kỳ</th>
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">Nhập trong kỳ</th>
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">Xuất trong kỳ</th>
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">Tồn cuối kỳ</th>
                  </tr>
                  <tr>
                    <th className="px-3 py-1.5 text-right">SL</th>
                    <th className="px-3 py-1.5 text-right">Giá trị</th>
                    <th className="px-3 py-1.5 text-right">SL</th>
                    <th className="px-3 py-1.5 text-right">Giá trị</th>
                    <th className="px-3 py-1.5 text-right">SL</th>
                    <th className="px-3 py-1.5 text-right">Giá trị</th>
                    <th className="px-3 py-1.5 text-right">SL</th>
                    <th className="px-3 py-1.5 text-right">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={`${r.product_id}-${r.warehouse_id ?? ""}-${i}`}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.unit}</td>
                      {byWarehouse && (
                        <td className="px-3 py-2 text-xs">{r.warehouse_name ?? "—"}</td>
                      )}
                      <td className="px-3 py-2 text-right font-mono">{num(r.opening_qty)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.opening_value)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{num(r.in_qty)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(r.in_value)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-600">{num(r.out_qty)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-600">{fmt(r.out_value)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{num(r.closing_qty)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(r.closing_value)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={byWarehouse ? 12 : 11}
                        className="px-3 py-12 text-center text-muted-foreground"
                      >
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr className="border-t-2 border-border">
                      <td colSpan={byWarehouse ? 4 : 3} className="px-3 py-2">TỔNG CỘNG</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.opening_value)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(totals.in_value)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-mono text-rose-600">{fmt(totals.out_value)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.closing_value)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </ReportCard>

        {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
      </div>
    </div>
  );
}

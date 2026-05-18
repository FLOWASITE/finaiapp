import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";

import {
  getArSummary,
  exportArSummaryXlsx,
  getArDrilldown,
  type ArSummaryRow,
} from "@/lib/receivables.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { getCompanyProfile } from "@/lib/reports.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { VoucherDetailDialog } from "@/components/voucher-detail-dialog";

import {
  DimensionFilterBar,
  type DimensionValue,
} from "@/components/dimension-filter-bar";
import {
  fmt,
  Loading,
  PrintHeader,
  ReportCard,
  SignatureFooter,
} from "./index";

export const Route = createFileRoute("/_app/reports/ar-summary")({
  component: ArSummaryPage,
});

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function ArSummaryPage() {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(today);
  const [dims, setDims] = useState<DimensionValue>({});
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [showSignature, setShowSignature] = useState(true);

  const profileFn = useServerFn(getCompanyProfile);
  const profileQ = useQuery({
    queryKey: ["profile-fiscal"],
    queryFn: () => profileFn(),
  });
  const profile: any = profileQ.data ?? {};

  const arFn = useServerFn(getArSummary);
  const exportFn = useServerFn(exportArSummaryXlsx);
  const drillFn = useServerFn(getArDrilldown);

  const [drillRow, setDrillRow] = useState<ArSummaryRow | null>(null);
  const drillQ = useQuery({
    enabled: !!drillRow,
    queryKey: [
      "ar-drilldown",
      from,
      to,
      dims,
      drillRow?.customer_id ?? null,
      drillRow?.customer_name ?? "",
    ],
    queryFn: () =>
      drillFn({
        data: {
          from,
          to,
          dims,
          customer_id: drillRow?.customer_id ?? null,
          customer_name: drillRow?.customer_name ?? null,
        },
      }),
  });

  // Drill-down local filters
  const [drillFrom, setDrillFrom] = useState("");
  const [drillTo, setDrillTo] = useState("");
  const [drillDocTypes, setDrillDocTypes] = useState<string[]>([]);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillPage, setDrillPage] = useState(1);
  const [drillPageSize, setDrillPageSize] = useState(50);
  const [drillGroupByDoc, setDrillGroupByDoc] = useState(false);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  type DrillSortKey = "entry_date" | "doc_no" | "debit" | "credit";
  const [drillSort, setDrillSort] = useState<{ key: DrillSortKey; dir: "asc" | "desc" }>({
    key: "entry_date",
    dir: "asc",
  });
  const toggleDrillSort = (key: DrillSortKey) =>
    setDrillSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  const [drillVirtual, setDrillVirtual] = useState(true);
  const drillScrollRef = useRef<HTMLDivElement | null>(null);



  // Reset local filters when opening a new drill-down
  useEffect(() => {
    if (drillRow) {
      setDrillFrom("");
      setDrillTo("");
      setDrillDocTypes([]);
      setDrillSearch("");
      setDrillPage(1);
    }
  }, [drillRow]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setDrillPage(1);
  }, [drillFrom, drillTo, drillDocTypes, drillSearch, drillPageSize, drillGroupByDoc]);



  const toggleDrillDocType = (v: string) =>
    setDrillDocTypes((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );

  // Precompute normalized search fields once per drill dataset
  // (avoids re-normalizing every line on every keystroke / filter tick).
  const drillNormIndex = useMemo(() => {
    const all = drillQ.data?.lines ?? [];
    return all.map((l) => ({
      line: l,
      nDocNo: norm(l.doc_no ?? ""),
      nDesc: norm(l.description ?? ""),
    }));
  }, [drillQ.data]);

  const drillFiltered = useMemo(() => {
    const s = norm(drillSearch);
    const hasDocTypes = drillDocTypes.length > 0;
    const docTypeSet = hasDocTypes ? new Set(drillDocTypes) : null;
    const lines = [] as NonNullable<typeof drillQ.data>["lines"];
    let debit = 0;
    let credit = 0;
    const byDate = new Map<string, { date: string; debit: number; credit: number; running: number }>();
    for (const item of drillNormIndex) {
      const l = item.line;
      if (drillFrom && l.entry_date < drillFrom) continue;
      if (drillTo && l.entry_date > drillTo) continue;
      if (docTypeSet && !docTypeSet.has(l.doc_type)) continue;
      if (s && !item.nDocNo.includes(s) && !item.nDesc.includes(s)) continue;
      lines.push(l);
      debit += l.debit;
      credit += l.credit;
      const d = byDate.get(l.entry_date) ?? { date: l.entry_date, debit: 0, credit: 0, running: 0 };
      d.debit += l.debit;
      d.credit += l.credit;
      byDate.set(l.entry_date, d);
    }
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    let run = drillQ.data?.opening ?? 0;
    for (const d of daily) {
      run += d.debit - d.credit;
      d.running = run;
    }
    return { lines, daily, debit, credit };
  }, [drillNormIndex, drillQ.data, drillFrom, drillTo, drillDocTypes, drillSearch]);

  type DrillDisplayRow = {
    key: string;
    entry_id: string;
    entry_date: string;
    doc_type: "HD" | "PT" | "KHAC";
    doc_no: string | null;
    doc_id: string | null;
    description: string;
    debit: number;
    credit: number;
    line_count: number;
  };
  const drillDisplayRows = useMemo<DrillDisplayRow[]>(() => {
    if (!drillGroupByDoc) {
      return drillFiltered.lines.map((l, i) => ({
        key: l.entry_id + ":" + i,
        entry_id: l.entry_id,
        entry_date: l.entry_date,
        doc_type: l.doc_type,
        doc_no: l.doc_no,
        doc_id: l.doc_id,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        line_count: 1,
      }));
    }
    const map = new Map<string, DrillDisplayRow>();
    for (const l of drillFiltered.lines) {
      const key = l.entry_id;
      const g = map.get(key);
      if (!g) {
        map.set(key, {
          key,
          entry_id: l.entry_id,
          entry_date: l.entry_date,
          doc_type: l.doc_type,
          doc_no: l.doc_no,
          doc_id: l.doc_id,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          line_count: 1,
        });
      } else {
        g.debit += l.debit;
        g.credit += l.credit;
        g.line_count += 1;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.entry_date.localeCompare(b.entry_date) || (a.doc_no ?? "").localeCompare(b.doc_no ?? ""),
    );
  }, [drillFiltered.lines, drillGroupByDoc]);

  // Apply user-selected sort on top of the display rows.
  const drillSortedRows = useMemo<DrillDisplayRow[]>(() => {
    const arr = drillDisplayRows.slice();
    const { key, dir } = drillSort;
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (key === "entry_date") {
        const c = a.entry_date.localeCompare(b.entry_date);
        return (c !== 0 ? c : (a.doc_no ?? "").localeCompare(b.doc_no ?? "")) * mult;
      }
      if (key === "doc_no") {
        const c = (a.doc_no ?? "").localeCompare(b.doc_no ?? "", undefined, { numeric: true });
        return (c !== 0 ? c : a.entry_date.localeCompare(b.entry_date)) * mult;
      }
      const av = key === "debit" ? a.debit : a.credit;
      const bv = key === "debit" ? b.debit : b.credit;
      return (av - bv) * mult;
    });
    return arr;
  }, [drillDisplayRows, drillSort]);

  // Memoize pagination slice so unrelated re-renders don't reslice the dataset.
  const drillPaged = useMemo(() => {
    const total = drillSortedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / drillPageSize));
    const page = Math.min(drillPage, totalPages);
    const start = (page - 1) * drillPageSize;
    const end = start + drillPageSize;
    return {
      total,
      totalPages,
      page,
      start,
      end,
      slice: drillSortedRows.slice(start, end),
    };
  }, [drillSortedRows, drillPage, drillPageSize]);

  // Virtualizer over the full sorted list (used when "Cuộn ảo" is on).
  const drillRowVirtualizer = useVirtualizer({
    count: drillSortedRows.length,
    getScrollElement: () => drillScrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  const ar = useQuery({
    queryKey: ["ar-summary", from, to, dims],
    queryFn: () => arFn({ data: { from, to, dims } }),
    ...QUERY_PRESETS.REPORT,
  });

  const rows = useMemo(() => {
    const all = ar.data ?? [];
    const q = norm(search);
    return all.filter((r) => {
      if (
        hideZero &&
        r.opening_debit === 0 &&
        r.opening_credit === 0 &&
        r.debit === 0 &&
        r.credit === 0 &&
        r.closing_debit === 0 &&
        r.closing_credit === 0
      )
        return false;
      if (!q) return true;
      return (
        norm(r.customer_name).includes(q) ||
        norm(r.customer_code ?? "").includes(q)
      );
    });
  }, [ar.data, search, hideZero]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          opening_debit: s.opening_debit + r.opening_debit,
          opening_credit: s.opening_credit + r.opening_credit,
          debit: s.debit + r.debit,
          credit: s.credit + r.credit,
          closing_debit: s.closing_debit + r.closing_debit,
          closing_credit: s.closing_credit + r.closing_credit,
        }),
        {
          opening_debit: 0,
          opening_credit: 0,
          debit: 0,
          credit: 0,
          closing_debit: 0,
          closing_credit: 0,
        },
      ),
    [rows],
  );

  async function handleExport() {
    try {
      toast.loading("Đang xuất Excel...", { id: "xlsx-ar" });
      const res = await exportFn({ data: { from, to, dims } });
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
      link.download = res.filename;
      link.click();
      toast.success("Đã xuất file", { id: "xlsx-ar" });
    } catch (e: any) {
      toast.error(e.message ?? "Xuất file thất bại", { id: "xlsx-ar" });
    }
  }

  const docTypeLabel = (t: "HD" | "PT" | "KHAC") =>
    t === "HD" ? "Hóa đơn bán" : t === "PT" ? "Phiếu thu" : "Khác";

  async function handleExportDrill(kind: "daily" | "docs") {
    if (!drillRow || !drillQ.data) return;
    const toastId = `xlsx-ar-drill-${kind}`;
    try {
      toast.loading("Đang xuất Excel...", { id: toastId });
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const safeName = (drillRow.customer_name || "KH").replace(/[\\/?*[\]:]/g, "_").slice(0, 80);
      const periodTxt = `${from} → ${to}`;
      let filename = "";

      if (kind === "daily") {
        const ws = wb.addWorksheet("Tổng hợp theo ngày");
        ws.addRow(["Khách hàng:", drillRow.customer_name]);
        ws.addRow(["Mã KH:", drillRow.customer_code ?? ""]);
        ws.addRow(["Kỳ:", periodTxt]);
        ws.addRow([
          "Số dư đầu kỳ:",
          drillQ.data.opening >= 0
            ? `${drillQ.data.opening} (Nợ)`
            : `${-drillQ.data.opening} (Có)`,
        ]);
        ws.addRow([]);
        const header = ws.addRow(["Ngày", "Nợ", "Có", "Lũy kế"]);
        header.font = { bold: true };
        for (const d of drillFiltered.daily) {
          ws.addRow([d.date, d.debit, d.credit, d.running]);
        }
        ws.addRow([
          "Tổng",
          drillFiltered.debit,
          drillFiltered.credit,
          "",
        ]).font = { bold: true };
        ws.columns = [
          { width: 14 },
          { width: 18 },
          { width: 18 },
          { width: 20 },
        ];
        for (let i = 2; i <= 4; i++) ws.getColumn(i).numFmt = "#,##0;(#,##0);-";
        filename = `tong-hop-theo-ngay_${safeName}_${from}_${to}.xlsx`;
      } else {
        const ws = wb.addWorksheet("Chứng từ");
        ws.addRow(["Khách hàng:", drillRow.customer_name]);
        ws.addRow(["Mã KH:", drillRow.customer_code ?? ""]);
        ws.addRow(["Kỳ:", periodTxt]);
        ws.addRow(["Chế độ:", drillGroupByDoc ? "Gộp theo chứng từ" : "Chi tiết bút toán"]);
        ws.addRow([]);
        const cols = drillGroupByDoc
          ? ["Ngày", "Loại", "Số CT", "Diễn giải (đại diện)", "Số dòng", "Nợ", "Có"]
          : ["Ngày", "Loại", "Số CT", "Diễn giải", "Nợ", "Có"];
        ws.addRow(cols).font = { bold: true };
        for (const l of drillSortedRows) {
          if (drillGroupByDoc) {
            ws.addRow([
              l.entry_date,
              docTypeLabel(l.doc_type),
              l.doc_no ?? "",
              l.description,
              l.line_count,
              l.debit,
              l.credit,
            ]);
          } else {
            ws.addRow([
              l.entry_date,
              docTypeLabel(l.doc_type),
              l.doc_no ?? "",
              l.description,
              l.debit,
              l.credit,
            ]);
          }
        }
        const totalRow = drillGroupByDoc
          ? ["Tổng", "", "", "", "", drillFiltered.debit, drillFiltered.credit]
          : ["Tổng", "", "", "", drillFiltered.debit, drillFiltered.credit];
        ws.addRow(totalRow).font = { bold: true };
        ws.columns = drillGroupByDoc
          ? [
              { width: 12 },
              { width: 14 },
              { width: 16 },
              { width: 50 },
              { width: 10 },
              { width: 18 },
              { width: 18 },
            ]
          : [
              { width: 12 },
              { width: 14 },
              { width: 16 },
              { width: 50 },
              { width: 18 },
              { width: 18 },
            ];
        const amtCols = drillGroupByDoc ? [6, 7] : [5, 6];
        for (const c of amtCols) ws.getColumn(c).numFmt = "#,##0;(#,##0);-";
        filename = `chung-tu_${safeName}_${from}_${to}.xlsx`;
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất file", { id: toastId });
    } catch (e: any) {
      toast.error(e?.message ?? "Xuất file thất bại", { id: toastId });
    }
  }

  return (
    <div className="p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bảng tổng hợp công nợ phải thu
          </h1>
          <p className="text-sm text-muted-foreground">
            Tổng hợp số dư đầu kỳ, phát sinh và số dư cuối kỳ theo khách hàng (TK 131)
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
        <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
        <DimensionFilterBar value={dims} onChange={setDims} />
        <div className="flex items-end gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã/tên khách"
              className="h-9 w-64 pl-7 text-sm"
            />
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
          />
          Ẩn dòng bằng 0
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
          title="BẢNG TỔNG HỢP CÔNG NỢ PHẢI THU"
          subtitle={`Tài khoản 131 · Kỳ từ ${from} đến ${to}`}
        />
        <ReportCard
          title="Công nợ phải thu theo khách hàng"
          subtitle={`${rows.length} khách hàng`}
        >
          {ar.isLoading ? (
            <Loading />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Mã KH</th>
                    <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Tên khách hàng</th>
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">
                      Số dư đầu kỳ
                    </th>
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">
                      Phát sinh trong kỳ
                    </th>
                    <th colSpan={2} className="px-3 py-1.5 text-center border-b border-border">
                      Số dư cuối kỳ
                    </th>
                  </tr>
                  <tr>
                    <th className="px-3 py-1.5 text-right">Nợ</th>
                    <th className="px-3 py-1.5 text-right">Có</th>
                    <th className="px-3 py-1.5 text-right">Nợ</th>
                    <th className="px-3 py-1.5 text-right">Có</th>
                    <th className="px-3 py-1.5 text-right">Nợ</th>
                    <th className="px-3 py-1.5 text-right">Có</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={(r.customer_id ?? r.customer_name) + i}
                      className="border-t border-border cursor-pointer hover:bg-muted/40 print:cursor-auto print:hover:bg-transparent"
                      onClick={() => setDrillRow(r)}
                      title="Xem chi tiết hóa đơn / phiếu thu"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.customer_code ?? ""}</td>
                      <td className="px-3 py-2 underline-offset-2 group-hover:underline">{r.customer_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.opening_debit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.opening_credit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.debit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.credit)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(r.closing_debit)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-rose-600">{fmt(r.closing_credit)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr className="border-t-2 border-border">
                      <td className="px-3 py-2" colSpan={2}>TỔNG CỘNG</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.opening_debit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.opening_credit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.debit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.credit)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.closing_debit)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-600">{fmt(totals.closing_credit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </ReportCard>

        {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
      </div>

      <Sheet open={!!drillRow} onOpenChange={(o) => !o && setDrillRow(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {drillRow?.customer_name ?? ""}
              {drillRow?.customer_code ? (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  ({drillRow.customer_code})
                </span>
              ) : null}
            </SheetTitle>
            <SheetDescription>
              Chi tiết phát sinh TK 131 · Kỳ {from} → {to}
            </SheetDescription>
          </SheetHeader>

          {drillQ.isLoading ? (
            <div className="mt-6"><Loading /></div>
          ) : drillQ.data ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Từ ngày</span>
                    <Input
                      type="date"
                      value={drillFrom}
                      min={from}
                      max={to}
                      onChange={(e) => setDrillFrom(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Đến ngày</span>
                    <Input
                      type="date"
                      value={drillTo}
                      min={from}
                      max={to}
                      onChange={(e) => setDrillTo(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                    <span className="text-xs text-muted-foreground">Tìm số CT / diễn giải</span>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={drillSearch}
                        onChange={(e) => setDrillSearch(e.target.value)}
                        placeholder="vd: HD0001, lương…"
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  {(drillFrom || drillTo || drillDocTypes.length || drillSearch) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDrillFrom(""); setDrillTo("");
                        setDrillDocTypes([]); setDrillSearch("");
                      }}
                      className="text-xs text-muted-foreground underline"
                    >
                      Xoá lọc
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">Loại CT:</span>
                  {[
                    { v: "HD", label: "HĐ bán" },
                    { v: "PT", label: "Phiếu thu" },
                    { v: "KHAC", label: "Khác" },
                  ].map((opt) => {
                    const active = drillDocTypes.includes(opt.v);
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => toggleDrillDocType(opt.v)}
                        className={
                          "rounded-full border px-2.5 py-0.5 text-xs transition " +
                          (active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground")
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={drillGroupByDoc}
                      onChange={(e) => setDrillGroupByDoc(e.target.checked)}
                    />
                    Gộp theo chứng từ
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={drillVirtual}
                      onChange={(e) => setDrillVirtual(e.target.checked)}
                    />
                    Cuộn ảo
                  </label>
                </div>
              </div>


              <div className="grid grid-cols-3 gap-3 text-sm">

                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Số dư đầu kỳ</div>
                  <div className="mt-1 font-mono font-semibold">
                    {drillQ.data.opening >= 0
                      ? `${fmt(drillQ.data.opening)} (Nợ)`
                      : `${fmt(-drillQ.data.opening)} (Có)`}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Phát sinh Nợ {drillFiltered.lines.length !== drillQ.data.lines.length ? "(đã lọc)" : ""}</div>
                  <div className="mt-1 font-mono font-semibold">
                    {fmt(drillFiltered.debit)}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Phát sinh Có {drillFiltered.lines.length !== drillQ.data.lines.length ? "(đã lọc)" : ""}</div>
                  <div className="mt-1 font-mono font-semibold">
                    {fmt(drillFiltered.credit)}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Tổng hợp theo ngày</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleExportDrill("daily")}
                    disabled={drillFiltered.daily.length === 0}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Xuất Excel
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Ngày</th>
                        <th className="px-3 py-2 text-right">Nợ</th>
                        <th className="px-3 py-2 text-right">Có</th>
                        <th className="px-3 py-2 text-right">Lũy kế</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillFiltered.daily.map((d) => (
                        <tr key={d.date} className="border-t border-border">
                          <td className="px-3 py-1.5">{d.date}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(d.debit)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmt(d.credit)}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold">
                            {d.running >= 0
                              ? fmt(d.running)
                              : `(${fmt(-d.running)})`}
                          </td>
                        </tr>
                      ))}
                      {drillFiltered.daily.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                            Không có phát sinh trong kỳ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">
                    Chứng từ ({drillGroupByDoc
                      ? `${drillDisplayRows.length} chứng từ / ${drillFiltered.lines.length} dòng`
                      : `${drillFiltered.lines.length}${drillFiltered.lines.length !== drillQ.data.lines.length ? ` / ${drillQ.data.lines.length}` : ""}`})
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleExportDrill("docs")}
                    disabled={drillDisplayRows.length === 0}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Xuất Excel
                  </Button>
                </div>
                {(() => {
                  const gridCols = "110px 100px 150px minmax(0,1fr) 130px 130px";
                  const headers: Array<{ key: DrillSortKey | null; label: string; align: "left" | "right" }> = [
                    { key: "entry_date", label: "Ngày", align: "left" },
                    { key: null, label: "Loại", align: "left" },
                    { key: "doc_no", label: "Số CT", align: "left" },
                    { key: null, label: drillGroupByDoc ? "Diễn giải (đại diện)" : "Diễn giải", align: "left" },
                    { key: "debit", label: "Nợ", align: "right" },
                    { key: "credit", label: "Có", align: "right" },
                  ];
                  const renderRow = (l: DrillDisplayRow) => (
                    <>
                      <div className="px-3 py-1.5 whitespace-nowrap">{l.entry_date}</div>
                      <div className="px-3 py-1.5">
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {l.doc_type === "HD" ? "HĐ bán" : l.doc_type === "PT" ? "Phiếu thu" : "Khác"}
                        </span>
                      </div>
                      <div className="px-3 py-1.5 font-mono text-xs">
                        {l.doc_type === "HD" && l.doc_id ? (
                          <Link
                            to="/sales/$id"
                            params={{ id: l.doc_id }}
                            className="text-primary hover:underline"
                            onClick={(e) => { e.stopPropagation(); setDrillRow(null); }}
                          >
                            {l.doc_no ?? "—"}
                          </Link>
                        ) : (
                          l.doc_no ?? "—"
                        )}
                        {drillGroupByDoc && l.line_count > 1 && (
                          <div className="text-[10px] text-muted-foreground">({l.line_count} dòng)</div>
                        )}
                      </div>
                      <div className="px-3 py-1.5 text-muted-foreground truncate" title={l.description}>
                        {l.description}
                      </div>
                      <div className="px-3 py-1.5 text-right font-mono">{fmt(l.debit)}</div>
                      <div className="px-3 py-1.5 text-right font-mono">{fmt(l.credit)}</div>
                    </>
                  );
                  const header = (
                    <div
                      className="grid bg-muted/40 text-xs uppercase border-b border-border sticky top-0 z-10"
                      style={{ gridTemplateColumns: gridCols }}
                    >
                      {headers.map((col, i) => {
                        const isActive = col.key && drillSort.key === col.key;
                        const arrow = isActive ? (drillSort.dir === "asc" ? "▲" : "▼") : "";
                        const alignCls = col.align === "right" ? "text-right justify-end" : "text-left";
                        if (!col.key) {
                          return <div key={i} className={`px-3 py-2 ${alignCls}`}>{col.label}</div>;
                        }
                        return (
                          <div
                            key={i}
                            className={`px-3 py-2 ${alignCls} cursor-pointer select-none hover:text-foreground`}
                            onClick={() => { toggleDrillSort(col.key!); setDrillPage(1); }}
                            title="Bấm để sắp xếp"
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              <span className={`text-[10px] ${isActive ? "opacity-100" : "opacity-30"}`}>
                                {arrow || "↕"}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );

                  if (drillVirtual) {
                    const items = drillRowVirtualizer.getVirtualItems();
                    const totalSize = drillRowVirtualizer.getTotalSize();
                    return (
                      <>
                        <div className="rounded-md border border-border overflow-hidden">
                          {header}
                          <div
                            ref={drillScrollRef}
                            className="overflow-auto"
                            style={{ height: 520, contain: "strict" }}
                          >
                            {drillSortedRows.length === 0 ? (
                              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                Không có chứng từ trong kỳ
                              </div>
                            ) : (
                              <div style={{ height: totalSize, position: "relative", width: "100%" }}>
                                {items.map((v) => {
                                  const l = drillSortedRows[v.index];
                                  return (
                                    <div
                                      key={l.key}
                                      ref={drillRowVirtualizer.measureElement}
                                      data-index={v.index}
                                      className="grid border-b border-border text-sm cursor-pointer hover:bg-muted/50 transition-colors absolute left-0 right-0"
                                      style={{
                                        gridTemplateColumns: gridCols,
                                        transform: `translateY(${v.start}px)`,
                                      }}
                                      onClick={() => setDetailEntryId(l.entry_id)}
                                      title="Bấm để xem chi tiết chứng từ"
                                    >
                                      {renderRow(l)}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                            {drillSortedRows.length.toLocaleString("vi-VN")} dòng · cuộn để xem thêm
                          </div>
                        </div>
                      </>
                    );
                  }

                  return (
                    <>
                      <div className="overflow-x-auto rounded-md border border-border">
                        {header}
                        {drillPaged.slice.map((l) => (
                          <div
                            key={l.key}
                            className="grid border-t border-border text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                            style={{ gridTemplateColumns: gridCols }}
                            onClick={() => setDetailEntryId(l.entry_id)}
                            title="Bấm để xem chi tiết chứng từ"
                          >
                            {renderRow(l)}
                          </div>
                        ))}
                        {drillDisplayRows.length === 0 && (
                          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                            Không có chứng từ trong kỳ
                          </div>
                        )}
                      </div>
                      {drillPaged.total > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-2 text-xs">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>Hiển thị {drillPaged.start + 1}–{Math.min(drillPaged.end, drillPaged.total)} / {drillPaged.total}</span>
                            <span>·</span>
                            <span>Số dòng/trang:</span>
                            <select
                              value={drillPageSize}
                              onChange={(e) => setDrillPageSize(Number(e.target.value))}
                              className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                            >
                              {[25, 50, 100, 200].map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" disabled={drillPaged.page <= 1} onClick={() => setDrillPage(1)}>«</Button>
                            <Button variant="outline" size="sm" disabled={drillPaged.page <= 1} onClick={() => setDrillPage((p) => Math.max(1, p - 1))}>‹</Button>
                            <span className="px-2 tabular-nums">Trang {drillPaged.page} / {drillPaged.totalPages}</span>
                            <Button variant="outline" size="sm" disabled={drillPaged.page >= drillPaged.totalPages} onClick={() => setDrillPage((p) => Math.min(drillPaged.totalPages, p + 1))}>›</Button>
                            <Button variant="outline" size="sm" disabled={drillPaged.page >= drillPaged.totalPages} onClick={() => setDrillPage(drillPaged.totalPages)}>»</Button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <VoucherDetailDialog entryId={detailEntryId} onClose={() => setDetailEntryId(null)} />

    </div>
  );
}

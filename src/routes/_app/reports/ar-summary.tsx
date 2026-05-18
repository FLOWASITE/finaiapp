import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

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

  const drillFiltered = useMemo(() => {
    const all = drillQ.data?.lines ?? [];
    const s = norm(drillSearch);
    const lines = all.filter((l) => {
      if (drillFrom && l.entry_date < drillFrom) return false;
      if (drillTo && l.entry_date > drillTo) return false;
      if (drillDocTypes.length && !drillDocTypes.includes(l.doc_type)) return false;
      if (s && !norm(l.doc_no ?? "").includes(s) && !norm(l.description ?? "").includes(s))
        return false;
      return true;
    });
    // Recompute daily aggregates + running balance starting from opening
    const opening = drillQ.data?.opening ?? 0;
    const byDate = new Map<string, { date: string; debit: number; credit: number; running: number }>();
    for (const l of lines) {
      const d = byDate.get(l.entry_date) ?? { date: l.entry_date, debit: 0, credit: 0, running: 0 };
      d.debit += l.debit;
      d.credit += l.credit;
      byDate.set(l.entry_date, d);
    }
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    let run = opening;
    for (const d of daily) {
      run += d.debit - d.credit;
      d.running = run;
    }
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    return { lines, daily, debit, credit };
  }, [drillQ.data, drillFrom, drillTo, drillDocTypes, drillSearch]);

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
                <div className="mb-2 text-sm font-semibold">Tổng hợp theo ngày</div>
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
                <div className="mb-2 text-sm font-semibold">
                  Chứng từ ({drillFiltered.lines.length}{drillFiltered.lines.length !== drillQ.data.lines.length ? ` / ${drillQ.data.lines.length}` : ""})
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Ngày</th>
                        <th className="px-3 py-2 text-left">Loại</th>
                        <th className="px-3 py-2 text-left">Số CT</th>
                        <th className="px-3 py-2 text-left">Diễn giải</th>
                        <th className="px-3 py-2 text-right">Nợ</th>
                        <th className="px-3 py-2 text-right">Có</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const total = drillFiltered.lines.length;
                        const totalPages = Math.max(1, Math.ceil(total / drillPageSize));
                        const page = Math.min(drillPage, totalPages);
                        const start = (page - 1) * drillPageSize;
                        const slice = drillFiltered.lines.slice(start, start + drillPageSize);
                        return slice.map((l, i) => (
                          <tr key={l.entry_id + (start + i)} className="border-t border-border align-top">
                            <td className="px-3 py-1.5 whitespace-nowrap">{l.entry_date}</td>
                            <td className="px-3 py-1.5">
                              <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs">
                                {l.doc_type === "HD"
                                  ? "HĐ bán"
                                  : l.doc_type === "PT"
                                    ? "Phiếu thu"
                                    : "Khác"}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono text-xs">
                              {l.doc_type === "HD" && l.doc_id ? (
                                <Link
                                  to="/sales/$id"
                                  params={{ id: l.doc_id }}
                                  className="text-primary hover:underline"
                                  onClick={() => setDrillRow(null)}
                                >
                                  {l.doc_no ?? "—"}
                                </Link>
                              ) : (
                                l.doc_no ?? "—"
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {l.description}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{fmt(l.debit)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{fmt(l.credit)}</td>
                          </tr>
                        ));
                      })()}
                      {drillFiltered.lines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            Không có chứng từ trong kỳ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {drillFiltered.lines.length > 0 && (() => {
                  const total = drillFiltered.lines.length;
                  const totalPages = Math.max(1, Math.ceil(total / drillPageSize));
                  const page = Math.min(drillPage, totalPages);
                  const start = (page - 1) * drillPageSize;
                  const end = Math.min(start + drillPageSize, total);
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-2 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Hiển thị {start + 1}–{end} / {total}</span>
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
                        <Button
                          variant="outline" size="sm"
                          disabled={page <= 1}
                          onClick={() => setDrillPage(1)}
                        >«</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={page <= 1}
                          onClick={() => setDrillPage((p) => Math.max(1, p - 1))}
                        >‹</Button>
                        <span className="px-2 tabular-nums">
                          Trang {page} / {totalPages}
                        </span>
                        <Button
                          variant="outline" size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setDrillPage((p) => Math.min(totalPages, p + 1))}
                        >›</Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setDrillPage(totalPages)}
                        >»</Button>
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
            <div className="mt-4 space-y-6">
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
                  <div className="text-xs text-muted-foreground">Phát sinh Nợ</div>
                  <div className="mt-1 font-mono font-semibold">
                    {fmt(drillRow?.debit ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-xs text-muted-foreground">Phát sinh Có</div>
                  <div className="mt-1 font-mono font-semibold">
                    {fmt(drillRow?.credit ?? 0)}
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
                      {drillQ.data.daily.map((d) => (
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
                      {drillQ.data.daily.length === 0 && (
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
                  Chứng từ ({drillQ.data.lines.length})
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
                      {drillQ.data.lines.map((l, i) => (
                        <tr key={l.entry_id + i} className="border-t border-border align-top">
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
                      ))}
                      {drillQ.data.lines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                            Không có chứng từ trong kỳ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";

import { getArSummary, exportArSummaryXlsx } from "@/lib/receivables.functions";
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
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
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
                    <tr key={(r.customer_id ?? r.customer_name) + i} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{r.customer_code ?? ""}</td>
                      <td className="px-3 py-2">{r.customer_name}</td>
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
    </div>
  );
}

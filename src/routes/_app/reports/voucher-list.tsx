import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";

import { getVoucherList, exportVoucherListXlsx } from "@/lib/vouchers.functions";
import { getCompanyProfile } from "@/lib/reports.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { DimensionFilterBar, type DimensionValue } from "@/components/dimension-filter-bar";
import {
  fmt, Loading, PrintHeader, ReportCard, SignatureFooter,
} from "./index";

export const Route = createFileRoute("/_app/reports/voucher-list")({
  component: VoucherListPage,
});

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "cash_vouchers", label: "Phiếu thu/chi tiền mặt" },
  { value: "bank_vouchers", label: "Phiếu ngân hàng (BC/BN)" },
  { value: "customer_receipts", label: "Phiếu thu khách hàng" },
  { value: "supplier_payments", label: "Phiếu chi NCC" },
  { value: "sales_invoices", label: "Hóa đơn bán" },
  { value: "invoices", label: "Hóa đơn mua" },
  { value: "stock_vouchers", label: "Phiếu nhập/xuất kho" },
  { value: "payroll_runs", label: "Bảng lương" },
  { value: "depreciation_entries", label: "Khấu hao TSCĐ" },
  { value: "journal_entries", label: "Phiếu kế toán khác" },
];

const VOUCHER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "PT", label: "PT — Phiếu thu" },
  { value: "PC", label: "PC — Phiếu chi" },
  { value: "BC", label: "BC — Báo có" },
  { value: "BN", label: "BN — Báo nợ" },
  { value: "Phiếu thu KH", label: "Phiếu thu KH" },
  { value: "Phiếu chi NCC", label: "Phiếu chi NCC" },
  { value: "Hóa đơn bán", label: "Hóa đơn bán" },
  { value: "Hóa đơn mua", label: "Hóa đơn mua" },
  { value: "Phiếu nhập kho", label: "Phiếu nhập kho" },
  { value: "Phiếu xuất kho", label: "Phiếu xuất kho" },
  { value: "Bảng lương", label: "Bảng lương" },
  { value: "Khấu hao", label: "Khấu hao" },
  { value: "Phiếu kế toán", label: "Phiếu kế toán" },
];


function VoucherListPage() {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(today);
  const [dims, setDims] = useState<DimensionValue>({});
  const [accountPrefix, setAccountPrefix] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showSignature, setShowSignature] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Reset to page 1 whenever filters change
  const filterKey = JSON.stringify({ from, to, dims, accountPrefix, sources, voucherTypes });
  useEffect(() => { setPage(1); }, [filterKey]);


  const profileQ = useQuery({
    queryKey: ["profile-fiscal"],
    queryFn: useServerFn(getCompanyProfile),
  });
  const profile: any = profileQ.data ?? {};

  const fn = useServerFn(getVoucherList);
  const exportFn = useServerFn(exportVoucherListXlsx);

  const q = useQuery({
    queryKey: ["voucher-list", from, to, dims, sources, voucherTypes, accountPrefix, page, pageSize],
    queryFn: () =>
      fn({
        data: {
          from, to, dims,
          sourceTables: sources.length ? sources : undefined,
          voucherTypes: voucherTypes.length ? voucherTypes : undefined,
          accountPrefix: accountPrefix.trim() || undefined,
          page,
          pageSize,
        },
      }),
    ...QUERY_PRESETS.REPORT,
    placeholderData: (prev) => prev,
  });

  const pageRows = q.data?.rows ?? [];
  const totalRows = q.data?.totalRows ?? 0;
  const totalPages = q.data?.totalPages ?? 1;

  // Client-side search filters within the current page only
  const rows = useMemo(() => {
    const s = norm(search);
    if (!s) return pageRows;
    return pageRows.filter((r) =>
      norm(r.voucher_no).includes(s) ||
      norm(r.voucher_type).includes(s) ||
      norm(r.description ?? "").includes(s) ||
      norm(r.party_name ?? "").includes(s) ||
      norm(r.account_code).includes(s) ||
      norm(r.reference ?? "").includes(s)
    );
  }, [pageRows, search]);

  // Group rows by voucher (entry_id) — derive debit/credit accounts + amount
  type GroupedRow = {
    key: string;
    entry_id: string;
    entry_date: string;
    voucher_no: string;
    voucher_type: string;
    description: string | null;
    debitAccounts: string[];
    creditAccounts: string[];
    amount: number;
    party_name: string | null;
    reference: string | null;
    branch_name: string | null;
    department_name: string | null;
    project_name: string | null;
    cost_center_name: string | null;
    line_count: number;
  };
  const groupedRows = useMemo<GroupedRow[]>(() => {
    const map = new Map<string, GroupedRow & { _debit: number; _credit: number }>();
    for (const r of rows) {
      const key = r.entry_id;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          entry_id: r.entry_id,
          entry_date: r.entry_date,
          voucher_no: r.voucher_no,
          voucher_type: r.voucher_type,
          description: r.description,
          debitAccounts: [],
          creditAccounts: [],
          amount: 0,
          party_name: r.party_name,
          reference: r.reference,
          branch_name: r.branch_name,
          department_name: r.department_name,
          project_name: r.project_name,
          cost_center_name: r.cost_center_name,
          line_count: 0,
          _debit: 0,
          _credit: 0,
        };
        map.set(key, g);
      }
      if (r.debit > 0 && !g.debitAccounts.includes(r.account_code)) g.debitAccounts.push(r.account_code);
      if (r.credit > 0 && !g.creditAccounts.includes(r.account_code)) g.creditAccounts.push(r.account_code);
      g._debit += r.debit;
      g._credit += r.credit;
      g.line_count += 1;
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, amount: Math.max(g._debit, g._credit) }))
      .sort(
        (a, b) => a.entry_date.localeCompare(b.entry_date) || a.voucher_no.localeCompare(b.voucher_no),
      );
  }, [rows]);

  const totalAmount = useMemo(
    () => groupedRows.reduce((s, g) => s + g.amount, 0),
    [groupedRows],
  );



  async function handleExport() {
    try {
      toast.loading("Đang xuất Excel...", { id: "xlsx-vl" });
      const res = await exportFn({
        data: {
          from, to, dims,
          sourceTables: sources.length ? sources : undefined,
          voucherTypes: voucherTypes.length ? voucherTypes : undefined,
          accountPrefix: accountPrefix.trim() || undefined,
        },
      });
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
      link.download = res.filename;
      link.click();
      toast.success("Đã xuất file", { id: "xlsx-vl" });
    } catch (e: any) {
      toast.error(e.message ?? "Xuất file thất bại", { id: "xlsx-vl" });
    }
  }

  function toggleSource(v: string) {
    setSources((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  function toggleVoucherType(v: string) {
    setVoucherTypes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }


  return (
    <div className="p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bảng kê chứng từ</h1>
          <p className="text-sm text-muted-foreground">
            Liệt kê toàn bộ chứng từ phát sinh trong kỳ, đầy đủ các trường: ngày, số CT, loại CT, diễn giải, tài khoản, phát sinh Nợ/Có, đối tác, chi nhánh, phòng ban, dự án, trung tâm chi phí.
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

      <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
          <DimensionFilterBar value={dims} onChange={setDims} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">TK (tiền tố)</span>
            <Input
              value={accountPrefix}
              onChange={(e) => setAccountPrefix(e.target.value)}
              placeholder="vd: 111, 131"
              className="h-9 w-32 text-sm font-mono"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tìm kiếm</span>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Lọc trong trang (số CT, diễn giải, TK…)"
                className="h-9 w-72 pl-7 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={groupByVoucher}
              onChange={(e) => setGroupByVoucher(e.target.checked)}
            />
            Gộp theo số CT
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showSignature}
              onChange={(e) => setShowSignature(e.target.checked)}
            />
            Hiện chữ ký
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="ml-auto text-xs text-primary underline"
          >
            {showAdvanced ? "Ẩn bộ lọc nâng cao" : "Bộ lọc nâng cao"}
            {voucherTypes.length > 0 && !showAdvanced && ` (${voucherTypes.length} loại CT)`}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Nguồn CT:</span>
          {SOURCE_OPTIONS.map((opt) => {
            const active = sources.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleSource(opt.value)}
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
          {sources.length > 0 && (
            <button
              type="button"
              onClick={() => setSources([])}
              className="text-xs text-muted-foreground underline ml-1"
            >
              Bỏ chọn
            </button>
          )}
        </div>
        {showAdvanced && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground mr-1">Loại CT (voucher_type):</span>
            {VOUCHER_TYPE_OPTIONS.map((opt) => {
              const active = voucherTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleVoucherType(opt.value)}
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
            <button
              type="button"
              onClick={() => setVoucherTypes(VOUCHER_TYPE_OPTIONS.map((o) => o.value))}
              className="text-xs text-muted-foreground underline ml-1"
            >
              Chọn tất cả
            </button>
            {voucherTypes.length > 0 && (
              <button
                type="button"
                onClick={() => setVoucherTypes([])}
                className="text-xs text-muted-foreground underline"
              >
                Bỏ chọn
              </button>
            )}
          </div>
        )}
      </div>


      <div className="mt-4 print:mt-0">
        <PrintHeader
          profile={profile}
          title="BẢNG KÊ CHỨNG TỪ"
          subtitle={`Kỳ từ ${from} đến ${to}`}
        />
        <ReportCard
          title="Danh sách chứng từ"
          subtitle={`${totalRows.toLocaleString("vi-VN")} dòng tổng cộng — trang ${page}/${totalPages} (${groupByVoucher ? `${groupedRows.length} chứng từ / ${rows.length} dòng` : `${rows.length} dòng`}) · Tổng Nợ ${fmt(totals.debit)} · Tổng Có ${fmt(totals.credit)}`}
        >
          {q.isLoading && !q.data ? (
            <Loading />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 uppercase">
                    <tr>
                      <th className="px-2 py-2 text-left">Ngày</th>
                      <th className="px-2 py-2 text-left">Số CT</th>
                      <th className="px-2 py-2 text-left">Loại CT</th>
                      <th className="px-2 py-2 text-left">Diễn giải</th>
                      <th className="px-2 py-2 text-center">TK</th>
                      <th className="px-2 py-2 text-right">Phát sinh Nợ</th>
                      <th className="px-2 py-2 text-right">Phát sinh Có</th>
                      <th className="px-2 py-2 text-left">Đối tác</th>
                      <th className="px-2 py-2 text-left">Tham chiếu</th>
                      <th className="px-2 py-2 text-left">Chi nhánh</th>
                      <th className="px-2 py-2 text-left">Phòng ban</th>
                      <th className="px-2 py-2 text-left">Dự án</th>
                      <th className="px-2 py-2 text-left">TT chi phí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupByVoucher ? (
                      <>
                        {groupedRows.map((g) => (
                          <tr key={g.key} className="border-t border-border/60 align-top">
                            <td className="px-2 py-1.5 whitespace-nowrap">{g.entry_date}</td>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap">{g.voucher_no}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{g.voucher_type}</td>
                            <td className="px-2 py-1.5">{g.description ?? "—"}</td>
                            <td className="px-2 py-1.5 text-center font-mono text-muted-foreground" title={g.accounts.join(", ")}>
                              {g.accounts.length <= 2 ? g.accounts.join(", ") : `${g.accounts.slice(0, 2).join(", ")} +${g.accounts.length - 2}`}
                              <div className="text-[10px] opacity-70">({g.line_count} dòng)</div>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{fmt(g.debit)}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{fmt(g.credit)}</td>
                            <td className="px-2 py-1.5">{g.party_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{g.reference ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{g.branch_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{g.department_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{g.project_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{g.cost_center_name ?? ""}</td>
                          </tr>
                        ))}
                        {groupedRows.length === 0 && (
                          <tr>
                            <td colSpan={13} className="px-3 py-12 text-center text-muted-foreground">
                              Không có chứng từ phù hợp bộ lọc
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <>
                        {rows.map((r) => (
                          <tr key={r.line_id} className="border-t border-border/60 align-top">
                            <td className="px-2 py-1.5 whitespace-nowrap">{r.entry_date}</td>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap">{r.voucher_no}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{r.voucher_type}</td>
                            <td className="px-2 py-1.5">{r.description ?? "—"}</td>
                            <td className="px-2 py-1.5 text-center font-mono">{r.account_code}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{fmt(r.debit)}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{fmt(r.credit)}</td>
                            <td className="px-2 py-1.5">{r.party_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.reference ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.branch_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.department_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.project_name ?? ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.cost_center_name ?? ""}</td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={13} className="px-3 py-12 text-center text-muted-foreground">
                              Không có chứng từ phù hợp bộ lọc
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>

                  {rows.length > 0 && (
                    <tfoot className="bg-muted/40 font-semibold">
                      <tr className="border-t-2 border-border">
                        <td className="px-2 py-2" colSpan={5}>Tổng trang này</td>
                        <td className="px-2 py-2 text-right font-mono">{fmt(totals.debit)}</td>
                        <td className="px-2 py-2 text-right font-mono">{fmt(totals.credit)}</td>
                        <td colSpan={6} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs print:hidden">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Số dòng/trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    {[50, 100, 200, 500].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  {q.isFetching && <span className="italic">Đang tải…</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1 || q.isFetching}
                    onClick={() => setPage(1)}
                  >«</Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1 || q.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >‹ Trước</Button>
                  <span className="px-2 tabular-nums">
                    Trang {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= totalPages || q.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >Sau ›</Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= totalPages || q.isFetching}
                    onClick={() => setPage(totalPages)}
                  >»</Button>
                </div>
              </div>
            </>
          )}
        </ReportCard>

        {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

import { getVoucherList, exportVoucherListXlsx } from "@/lib/vouchers.functions";
import { getCompanyProfile } from "@/lib/reports.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { DimensionFilterBar, type DimensionValue } from "@/components/dimension-filter-bar";
import { VoucherDetailDialog } from "@/components/voucher-detail-dialog";
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
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  type SortConfig = { key: "entry_date" | "voucher_no" | "voucher_type" | null; direction: "asc" | "desc" };
  const [sort, setSort] = useState<SortConfig>({ key: "entry_date", direction: "asc" });

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
      norm(r.invoice_no ?? "").includes(s) ||
      norm(r.description ?? "").includes(s) ||
      norm(r.party_name ?? "").includes(s) ||
      norm(r.account_code).includes(s) ||
      norm(r.reference ?? "").includes(s)
    );
  }, [pageRows, search]);

  // Tách thành các "bút toán" (cặp Nợ/Có). Một chứng từ có thể có nhiều bút toán.
  // VD: Hóa đơn bán có xuất kho → 3 bút toán: 632/156, 131/511, 131/3331.
  type GroupedRow = {
    key: string;
    entry_id: string;
    entry_date: string;
    voucher_no: string;
    voucher_type: string;
    invoice_no: string | null;
    description: string | null;
    debitAccount: string | null;
    creditAccount: string | null;
    amount: number;
    debitParty: string | null;
    creditParty: string | null;
    reference: string | null;
    branch_name: string | null;
    department_name: string | null;
    project_name: string | null;
    cost_center_name: string | null;
    pair_index: number;
  };
  const groupedRows = useMemo<GroupedRow[]>(() => {
    const byEntry = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byEntry.get(r.entry_id) ?? [];
      arr.push(r);
      byEntry.set(r.entry_id, arr);
    }
    const out: GroupedRow[] = [];
    const EPS = 0.005;
    const PARTY_PREFIXES = ["131", "136", "138", "141", "144", "244", "331", "334", "336", "338"];
    const isPartyAcc = (a: string | null) => !!a && PARTY_PREFIXES.some((p) => a.startsWith(p));

    for (const [entryId, lines] of byEntry) {
      const sorted = [...lines].sort((a, b) => a.line_index - b.line_index);
      const meta = sorted[0];
      const partyFor = (dAcc: string | null, cAcc: string | null) => {
        const pn = meta.party_name ?? null;
        if (!pn) return { dp: null, cp: null };
        const dIs = isPartyAcc(dAcc), cIs = isPartyAcc(cAcc);
        if (dIs && !cIs) return { dp: pn, cp: null };
        if (cIs && !dIs) return { dp: null, cp: pn };
        if (dIs && cIs) return { dp: pn, cp: pn };
        return { dp: pn, cp: null };
      };
      const base = (extra: Partial<GroupedRow>): GroupedRow => ({
        key: "", entry_id: entryId, entry_date: meta.entry_date, voucher_no: meta.voucher_no,
        voucher_type: meta.voucher_type, invoice_no: meta.invoice_no ?? null, description: meta.description,
        debitAccount: null, creditAccount: null, amount: 0,
        debitParty: null, creditParty: null, reference: meta.reference,
        branch_name: meta.branch_name, department_name: meta.department_name,
        project_name: meta.project_name, cost_center_name: meta.cost_center_name,
        pair_index: 0, ...extra,
      });
      let pairIdx = 0;

      // Phân khối các "bút toán" trong cùng 1 phiếu theo thứ tự nhập:
      // mỗi khi tổng Nợ chạy = tổng Có chạy (>0) → đóng 1 khối.
      // VD phiếu bán có xuất kho: [632, 156] -> đóng; [131, 511, 3331] -> đóng.
      type Side = { acc: string; rem: number; idx: number };
      const blocks: { debits: Side[]; credits: Side[] }[] = [];
      let curD: Side[] = [], curC: Side[] = [], dSum = 0, cSum = 0;
      for (const l of sorted) {
        if (l.debit > 0) { curD.push({ acc: l.account_code, rem: l.debit, idx: l.line_index }); dSum += l.debit; }
        if (l.credit > 0) { curC.push({ acc: l.account_code, rem: l.credit, idx: l.line_index }); cSum += l.credit; }
        if (dSum > EPS && cSum > EPS && Math.abs(dSum - cSum) < EPS) {
          blocks.push({ debits: curD, credits: curC });
          curD = []; curC = []; dSum = 0; cSum = 0;
        }
      }
      if (curD.length || curC.length) blocks.push({ debits: curD, credits: curC });

      // Trong mỗi khối: ghép Nợ/Có ưu tiên khớp đúng số tiền.
      for (const blk of blocks) {
        const debits = blk.debits, credits = blk.credits;
        for (const d of debits) {
          while (d.rem > EPS) {
            let cIdx = credits.findIndex((c) => c.rem > EPS && Math.abs(c.rem - d.rem) < EPS);
            if (cIdx < 0) cIdx = credits.findIndex((c) => c.rem > EPS);
            if (cIdx < 0) break;
            const c = credits[cIdx];
            const amt = Math.min(d.rem, c.rem);
            const { dp, cp } = partyFor(d.acc, c.acc);
            out.push(base({ key: `${entryId}#${pairIdx}`, debitAccount: d.acc, creditAccount: c.acc, amount: amt, debitParty: dp, creditParty: cp, pair_index: pairIdx }));
            d.rem -= amt; c.rem -= amt; pairIdx++;
          }
        }
        for (const d of debits.filter((x) => x.rem > EPS)) {
          const { dp } = partyFor(d.acc, null);
          out.push(base({ key: `${entryId}#d${d.idx}`, debitAccount: d.acc, amount: d.rem, debitParty: dp, pair_index: pairIdx++ }));
        }
        for (const c of credits.filter((x) => x.rem > EPS)) {
          const { cp } = partyFor(null, c.acc);
          out.push(base({ key: `${entryId}#c${c.idx}`, creditAccount: c.acc, amount: c.rem, creditParty: cp, pair_index: pairIdx++ }));
        }
      }
    }
    return out.sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) ||
        a.voucher_no.localeCompare(b.voucher_no) ||
        a.pair_index - b.pair_index,
    );
  }, [rows]);


  const totalAmount = useMemo(
    () => groupedRows.reduce((s, g) => s + g.amount, 0),
    [groupedRows],
  );

  function toggleSort(key: "entry_date" | "voucher_no" | "voucher_type") {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: "entry_date", direction: "asc" };
    });
  }

  const sortedRows = useMemo(() => {
    const rows = [...groupedRows];
    if (!sort.key) return rows;
    rows.sort((a, b) => {
      const cmp = (a[sort.key!] ?? "").localeCompare(b[sort.key!] ?? "");
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [groupedRows, sort]);

  const SortIcon = ({ col }: { col: "entry_date" | "voucher_no" | "voucher_type" }) => {
    if (sort.key !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground opacity-50" />;
    if (sort.direction === "asc") return <ArrowUp className="ml-1 inline h-3 w-3 text-primary" />;
    return <ArrowDown className="ml-1 inline h-3 w-3 text-primary" />;
  };

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
          subtitle={`${totalRows.toLocaleString("vi-VN")} dòng tổng cộng — trang ${page}/${totalPages} (${sortedRows.length} bút toán) · Tổng số tiền ${fmt(totalAmount)}`}
        >
          {q.isLoading && !q.data ? (
            <Loading />
          ) : (
            <>
              <div className="overflow-auto max-h-[calc(100vh-340px)] print:max-h-none print:overflow-visible">
                <table className="w-full text-xs">
                  <thead className="bg-muted uppercase sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))] print:static print:shadow-none">
                    <tr>
                      <th className="px-2 py-2 text-left cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("entry_date")}>Ngày<SortIcon col="entry_date" /></th>
                      <th className="px-2 py-2 text-left cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("voucher_no")}>Số CT<SortIcon col="voucher_no" /></th>
                      <th className="px-2 py-2 text-left cursor-pointer select-none hover:text-primary transition-colors" onClick={() => toggleSort("voucher_type")}>Loại CT<SortIcon col="voucher_type" /></th>
                      <th className="px-2 py-2 text-left">Số HĐ</th>
                      <th className="px-2 py-2 text-left">Diễn giải</th>
                      <th className="px-2 py-2 text-center">TK Nợ</th>
                      <th className="px-2 py-2 text-center">TK Có</th>
                      <th className="px-2 py-2 text-right">Số tiền</th>
                      <th className="px-2 py-2 text-left">Đối tượng Nợ</th>
                      <th className="px-2 py-2 text-left">Đối tượng Có</th>
                      <th className="px-2 py-2 text-left">Tham chiếu</th>
                      <th className="px-2 py-2 text-left">Chi nhánh</th>
                      <th className="px-2 py-2 text-left">Phòng ban</th>
                      <th className="px-2 py-2 text-left">Dự án</th>
                      <th className="px-2 py-2 text-left">TT chi phí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((g) => {
                      return (
                        <tr
                          key={g.key}
                          onClick={() => setDetailEntryId(g.entry_id)}
                          className="border-t border-border/60 align-top cursor-pointer hover:bg-muted/50 print:cursor-default"
                          title="Click để xem phiếu kế toán"
                        >
                          <td className="px-2 py-1.5 whitespace-nowrap">{g.entry_date}</td>
                          <td className="px-2 py-1.5 font-mono whitespace-nowrap">{g.voucher_no}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{g.voucher_type}</td>
                          <td className="px-2 py-1.5 font-mono whitespace-nowrap">{g.invoice_no ?? ""}</td>
                          <td className="px-2 py-1.5">{g.description ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{g.debitAccount ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{g.creditAccount ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmt(g.amount)}</td>
                          <td className="px-2 py-1.5">{g.debitParty ?? ""}</td>
                          <td className="px-2 py-1.5">{g.creditParty ?? ""}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{g.reference ?? ""}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{g.branch_name ?? ""}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{g.department_name ?? ""}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{g.project_name ?? ""}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{g.cost_center_name ?? ""}</td>
                        </tr>
                      );
                    })}
                    {sortedRows.length === 0 && (
                      <tr>
                        <td colSpan={15} className="px-3 py-12 text-center text-muted-foreground">
                          Không có chứng từ phù hợp bộ lọc
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {sortedRows.length > 1 && (
                    <tfoot className="bg-muted/40 font-semibold">
                      <tr className="border-t-2 border-border">
                        <td className="px-2 py-2" colSpan={7}>Tổng trang này</td>
                        <td className="px-2 py-2 text-right font-mono">{fmt(totalAmount)}</td>
                        <td colSpan={7} />
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
      <VoucherDetailDialog entryId={detailEntryId} onClose={() => setDetailEntryId(null)} />
    </div>
  );
}

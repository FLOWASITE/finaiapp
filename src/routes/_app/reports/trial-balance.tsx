import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Printer } from "lucide-react";

import {
  getTrialBalance,
  exportTrialBalanceXlsx,
  getUnbalancedEntries,
} from "@/lib/ledgers.functions";
import { getCompanyProfile } from "@/lib/reports.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/date-range-filter";
import { DimensionFilterBar, type DimensionValue } from "@/components/dimension-filter-bar";
import {
  fmt,
  Loading,
  PrintHeader,
  ReportCard,
  SignatureFooter,
  TrialBalanceTable,
  UnbalancedEntriesPanel,
  AccountDrilldownDialog,
} from "./index";

export const Route = createFileRoute("/_app/reports/trial-balance")({
  component: TrialBalancePage,
});

function TrialBalancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(today);
  const [hideZero, setHideZero] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [dims, setDims] = useState<DimensionValue>({});
  const [tbLevel, setTbLevel] = useState<"all" | "1" | "2" | "3">("all");
  const [tbTree, setTbTree] = useState(true);
  const [tbSearch, setTbSearch] = useState("");
  const [tbSearchDraft, setTbSearchDraft] = useState("");
  const [drillAcc, setDrillAcc] = useState<{ code: string; name: string } | null>(null);

  const profileFn = useServerFn(getCompanyProfile);
  const profileQ = useQuery({ queryKey: ["profile-fiscal"], queryFn: () => profileFn() });
  const profile: any = profileQ.data ?? {};

  const tbFn = useServerFn(getTrialBalance);
  const exportTbFn = useServerFn(exportTrialBalanceXlsx);
  const unbalancedFn = useServerFn(getUnbalancedEntries);

  const tb = useQuery({
    queryKey: ["tb-page", from, to, dims],
    queryFn: () => tbFn({ data: { from, to, dims } }),
    ...QUERY_PRESETS.REPORT,
  });
  const unbalanced = useQuery({
    queryKey: ["unbalanced-page", from, to],
    queryFn: () => unbalancedFn({ data: { from, to, limit: 50 } }),
    enabled: !!tb.data && !tb.data.balanced,
    ...QUERY_PRESETS.REPORT,
  });

  async function handleExportTrialBalance() {
    try {
      toast.loading("Đang xuất Excel...", { id: "xlsx" });
      const res = await exportTbFn({ data: { from, to, dims, hideZero } });
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
      link.download = res.filename;
      link.click();
      toast.success("Đã xuất file", { id: "xlsx" });
    } catch (e: any) {
      toast.error(e.message ?? "Xuất file thất bại", { id: "xlsx" });
    }
  }

  return (
    <div className="p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bảng cân đối số phát sinh</h1>
          <p className="text-sm text-muted-foreground">Kiểm tra cân đối Nợ/Có và phát sinh trong kỳ</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Ẩn chỉ tiêu = 0
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} />
          Hiển thị chữ ký
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />In / Xuất PDF
          </Button>
          <Button size="sm" onClick={() => { tb.refetch(); unbalanced.refetch(); }}>Cập nhật</Button>
        </div>
      </div>

      <div className="mt-6">
        <ReportCard
          title="Bảng cân đối số phát sinh"
          subtitle={`Kỳ từ ${from} đến ${to}`}
          onExport={handleExportTrialBalance}
        >
          <PrintHeader profile={profile} title="BẢNG CÂN ĐỐI SỐ PHÁT SINH" subtitle={`Kỳ từ ${from} đến ${to}`} />
          <div className="mb-3 print:hidden">
            <DimensionFilterBar value={dims} onChange={setDims} />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm print:hidden">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Cấp tài khoản:</span>
              <select
                className="h-8 rounded border border-border bg-background px-2 text-sm"
                value={tbLevel}
                onChange={(e) => setTbLevel(e.target.value as "all" | "1" | "2" | "3")}
              >
                <option value="all">Tất cả</option>
                <option value="1">Cấp 1 (3 ký tự)</option>
                <option value="2">Cấp 2 (4 ký tự)</option>
                <option value="3">Cấp 3 (5 ký tự)</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tbTree} onChange={(e) => setTbTree(e.target.checked)} />
              Xem dạng cây
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Tìm:</span>
              <input
                type="search"
                value={tbSearchDraft}
                onChange={(e) => setTbSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); setTbSearch(tbSearchDraft); }
                  else if (e.key === "Escape") { setTbSearchDraft(""); setTbSearch(""); }
                }}
                placeholder='Mã/tên · "=131" chính xác · "131*" tiền tố'
                title='Bỏ dấu, không phân biệt hoa thường. Dùng "=131" để khớp mã chính xác, "131*" hoặc nhập chỉ chữ số để khớp tiền tố. Bấm Áp dụng (hoặc Enter) để lọc.'
                className="h-8 w-64 rounded border border-border bg-background px-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => setTbSearch(tbSearchDraft)}
                disabled={tbSearchDraft === tbSearch}
                className="h-8"
              >
                Áp dụng
              </Button>
              {(tbSearch || tbSearchDraft) && (
                <button
                  type="button"
                  onClick={() => { setTbSearchDraft(""); setTbSearch(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Xoá
                </button>
              )}
              {tbSearchDraft !== tbSearch && (
                <span className="text-[11px] italic text-muted-foreground">chưa áp dụng</span>
              )}
            </label>
          </div>
          {!tb.data ? <Loading /> : (
            <>
              {!tb.data.balanced && (
                <div className="mb-3 space-y-2 print:hidden">
                  <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Tổng PS Nợ ≠ Tổng PS Có — chênh lệch {fmt(tb.data.totals.debit - tb.data.totals.credit)}
                  </div>
                  <UnbalancedEntriesPanel
                    loading={unbalanced.isLoading}
                    data={unbalanced.data}
                  />
                </div>
              )}
              <TrialBalanceTable
                data={tb.data}
                hideZero={hideZero}
                level={tbLevel}
                tree={tbTree}
                search={tbSearch}
                onDrill={(code, name) => setDrillAcc({ code, name })}
              />
            </>
          )}
          {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
        </ReportCard>
      </div>

      <AccountDrilldownDialog
        account={drillAcc}
        from={from}
        to={to}
        dims={dims}
        onClose={() => setDrillAcc(null)}
      />
    </div>
  );
}

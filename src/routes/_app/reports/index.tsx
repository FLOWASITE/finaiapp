import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getBalanceSheetTT99, getIncomeStatementTT99, getCashFlowDirect,
  getNotesData, upsertReportNote, exportReportXlsx, getCompanyProfile,
  drilldownReportItem,
} from "@/lib/reports.functions";
import { getTrialBalance, exportTrialBalanceXlsx, getUnbalancedEntries, getAccountLedger, exportAccountLedgerXlsx } from "@/lib/ledgers.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Printer, AlertTriangle, FileText, Search, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/date-range-filter";
import { DimensionFilterBar, type DimensionValue } from "@/components/dimension-filter-bar";

type DrillSearch = { drillR?: "B01" | "B02" | "B03"; drillM?: string; drillN?: string };

export const Route = createFileRoute("/_app/reports/")({
  validateSearch: (s: Record<string, unknown>): DrillSearch => ({
    drillR: (s.drillR === "B01" || s.drillR === "B02" || s.drillR === "B03") ? s.drillR : undefined,
    drillM: typeof s.drillM === "string" ? s.drillM : undefined,
    drillN: typeof s.drillN === "string" ? s.drillN : undefined,
  }),
  component: ReportsPage,
});

const fmt = (n: number) => {
  if (!n) return "-";
  const abs = Math.abs(Math.round(n)).toLocaleString("vi-VN");
  return n < 0 ? `(${abs})` : abs;
};

const pad = (n: number) => String(n).padStart(2, "0");

function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(today);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [hideZero, setHideZero] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [dims, setDims] = useState<DimensionValue>({});
  const [tbLevel, setTbLevel] = useState<"all" | "1" | "2" | "3">("all");
  const [tbTree, setTbTree] = useState(true);
  const [tbSearch, setTbSearch] = useState("");
  const [drillAcc, setDrillAcc] = useState<{ code: string; name: string } | null>(null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const drill = search.drillR && search.drillM
    ? { report: search.drillR, ma_so: search.drillM, name: search.drillN ?? "" }
    : null;
  const setDrill = (d: null | { report: "B01" | "B02" | "B03"; ma_so: string; name: string }) => {
    navigate({
      search: (prev: any) => ({
        ...prev,
        drillR: d?.report,
        drillM: d?.ma_so,
        drillN: d?.name,
      }),
      replace: true,
    });
  };

  const profileFn = useServerFn(getCompanyProfile);
  const profileQ = useQuery({ queryKey: ["profile-fiscal"], queryFn: () => profileFn() });
  const profile: any = profileQ.data ?? {};
  const fiscalStart = Number(profile?.fiscal_year_start ?? 1);

  // Tính 'Số đầu năm' = ngày trước khi bắt đầu năm tài chính chứa `to`
  const { prevFrom, prevTo, prevAsOf } = useMemo(() => {
    const d = new Date(to);
    const m = d.getMonth() + 1, y = d.getFullYear();
    const fyStartYear = m >= fiscalStart ? y : y - 1;
    const fyStart = new Date(`${fyStartYear}-${pad(fiscalStart)}-01`);
    const fyEnd = new Date(fyStart); fyEnd.setFullYear(fyEnd.getFullYear() + 1); fyEnd.setDate(fyEnd.getDate() - 1);
    const prevFyEnd = new Date(fyStart); prevFyEnd.setDate(prevFyEnd.getDate() - 1);
    const prevFyStart = new Date(prevFyEnd); prevFyStart.setFullYear(prevFyStart.getFullYear() - 1); prevFyStart.setDate(prevFyStart.getDate() + 1);
    return {
      prevFrom: prevFyStart.toISOString().slice(0, 10),
      prevTo: prevFyEnd.toISOString().slice(0, 10),
      prevAsOf: prevFyEnd.toISOString().slice(0, 10),
    };
  }, [to, fiscalStart]);

  const bsFn = useServerFn(getBalanceSheetTT99);
  const isFn = useServerFn(getIncomeStatementTT99);
  const cfFn = useServerFn(getCashFlowDirect);
  const notesFn = useServerFn(getNotesData);
  const exportFn = useServerFn(exportReportXlsx);
  const tbFn = useServerFn(getTrialBalance);

  const bs = useQuery({ queryKey: ["bs99", to, compareEnabled, prevAsOf], queryFn: () => bsFn({ data: { asOf: to, compareAsOf: compareEnabled ? prevAsOf : undefined } }), ...QUERY_PRESETS.REPORT });
  const is = useQuery({ queryKey: ["is99", from, to, compareEnabled, prevFrom, prevTo, dims], queryFn: () => isFn({ data: { from, to, compareFrom: compareEnabled ? prevFrom : undefined, compareTo: compareEnabled ? prevTo : undefined, dims } }), ...QUERY_PRESETS.REPORT });
  const cf = useQuery({ queryKey: ["cf99", from, to], queryFn: () => cfFn({ data: { from, to } }), ...QUERY_PRESETS.REPORT });
  const notes = useQuery({ queryKey: ["notes99", from, to], queryFn: () => notesFn({ data: { from, to } }), ...QUERY_PRESETS.REPORT });
  const tb = useQuery({ queryKey: ["tb-reports", from, to, dims], queryFn: () => tbFn({ data: { from, to, dims } }), ...QUERY_PRESETS.REPORT });
  const exportTbFn = useServerFn(exportTrialBalanceXlsx);
  const unbalancedFn = useServerFn(getUnbalancedEntries);
  const unbalanced = useQuery({
    queryKey: ["unbalanced", from, to],
    queryFn: () => unbalancedFn({ data: { from, to, limit: 50 } }),
    enabled: !!tb.data && !tb.data.balanced,
    ...QUERY_PRESETS.REPORT,
  });

  async function handleExport(report: "B01" | "B02" | "B03") {
    try {
      toast.loading("Đang xuất Excel...", { id: "xlsx" });
      const res = await exportFn({ data: { report, from, to, asOf: to } });
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
      link.download = res.filename;
      link.click();
      toast.success("Đã xuất file", { id: "xlsx" });
    } catch (e: any) {
      toast.error(e.message ?? "Xuất file thất bại", { id: "xlsx" });
    }
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Báo cáo tài chính</h1>
          <p className="text-sm text-muted-foreground">Theo Thông tư 99/2025/TT-BTC — hiệu lực 01/01/2026</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={compareEnabled} onChange={(e) => setCompareEnabled(e.target.checked)} />
          So sánh kỳ trước
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Ẩn chỉ tiêu = 0
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} />
          Hiển thị chữ ký
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />In / Xuất PDF</Button>
          <Button size="sm" onClick={() => { bs.refetch(); is.refetch(); cf.refetch(); notes.refetch(); tb.refetch(); }}>Cập nhật</Button>
        </div>
      </div>

      <Tabs defaultValue="b01" className="mt-6">
        <TabsList className="print:hidden">
          <TabsTrigger value="b01">B01 — Tình hình tài chính</TabsTrigger>
          <TabsTrigger value="b02">B02 — KQKD</TabsTrigger>
          <TabsTrigger value="b03">B03 — LCTT</TabsTrigger>
          <TabsTrigger value="b09">B09 — Thuyết minh</TabsTrigger>
          <TabsTrigger value="tb">BCĐPS — Cân đối phát sinh</TabsTrigger>
        </TabsList>

        <TabsContent value="b01">
          <ReportCard title="Báo cáo tình hình tài chính (Mẫu B01-DN)" subtitle={`Tại ngày ${to}${compareEnabled ? ` — So sánh với ${prevAsOf}` : ""}`} onExport={() => handleExport("B01")}>
            <PrintHeader profile={profile} title="BÁO CÁO TÌNH HÌNH TÀI CHÍNH" subtitle={`Mẫu số B01-DN — Tại ngày ${to}`} />
            {!bs.data ? <Loading /> : (
              <>
                {!bs.data.balanced && (
                  <div className="mb-3 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive print:hidden">
                    <AlertTriangle className="h-4 w-4" /> Tài sản ≠ Nguồn vốn — kiểm tra số liệu hạch toán
                  </div>
                )}
                <ReportTable
                  cols={["Chỉ tiêu", "Mã số", "Số cuối kỳ", compareEnabled ? "Số đầu năm" : null]}
                  rows={bs.data.items.filter(it => !hideZero || it.bold || it.current !== 0 || it.previous !== 0).map(it => ({
                    name: it.name, code: it.ma_so, indent: it.level === 2 ? 2 : it.level === 1 ? 1 : 0, bold: it.bold,
                    drillable: it.level === 2,
                    vals: [it.current, compareEnabled ? it.previous : null],
                  }))}
                  onDrill={(code, name) => setDrill({ report: "B01", ma_so: code, name })}
                />
              </>
            )}
            {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
          </ReportCard>
        </TabsContent>

        <TabsContent value="b02">
          <ReportCard title="Báo cáo kết quả hoạt động kinh doanh (Mẫu B02-DN)" subtitle={`Kỳ từ ${from} đến ${to}`} onExport={() => handleExport("B02")}>
            <div className="mb-3 print:hidden">
              <DimensionFilterBar value={dims} onChange={setDims} />
            </div>
            <PrintHeader profile={profile} title="BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH" subtitle={`Mẫu số B02-DN — Kỳ từ ${from} đến ${to}`} />
            {!is.data ? <Loading /> : (
              <ReportTable
                cols={["Chỉ tiêu", "Mã số", "Kỳ này", compareEnabled ? "Kỳ trước" : null]}
                rows={is.data.items.filter(it => !hideZero || it.bold || it.current !== 0 || it.previous !== 0).map(it => ({
                  name: it.name, code: it.ma_so, indent: 0, bold: it.bold, drillable: !it.bold,
                  vals: [it.current, compareEnabled ? it.previous : null],
                }))}
                onDrill={(code, name) => setDrill({ report: "B02", ma_so: code, name })}
              />
            )}
            {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
          </ReportCard>
        </TabsContent>

        <TabsContent value="b03">
          <ReportCard title="Báo cáo lưu chuyển tiền tệ (Mẫu B03-DN) — phương pháp trực tiếp" subtitle={`Kỳ từ ${from} đến ${to}`} onExport={() => handleExport("B03")}>
            <PrintHeader profile={profile} title="BÁO CÁO LƯU CHUYỂN TIỀN TỆ" subtitle={`Mẫu số B03-DN (trực tiếp) — Kỳ từ ${from} đến ${to}`} />
            {!cf.data ? <Loading /> : (
              <CashFlowTable items={cf.data.items} hideZero={hideZero} onDrill={(code, name) => setDrill({ report: "B03", ma_so: code, name })} />
            )}
            {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
          </ReportCard>
        </TabsContent>

        <TabsContent value="b09">
          <ReportCard title="Thuyết minh báo cáo tài chính (Mẫu B09-DN)" subtitle={`Kỳ từ ${from} đến ${to}`}>
            <PrintHeader profile={profile} title="THUYẾT MINH BÁO CÁO TÀI CHÍNH" subtitle={`Mẫu số B09-DN — Kỳ từ ${from} đến ${to}`} />
            {!notes.data ? <Loading /> : <NotesPanel data={notes.data} onRefetch={() => notes.refetch()} upsert={upsertReportNote} />}
            {showSignature && <SignatureFooter profile={profile} reportDate={to} />}
          </ReportCard>
        </TabsContent>

        <TabsContent value="tb">
          <ReportCard title="Bảng cân đối số phát sinh" subtitle={`Kỳ từ ${from} đến ${to}`} onExport={handleExportTrialBalance}>
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
                  value={tbSearch}
                  onChange={(e) => setTbSearch(e.target.value)}
                  placeholder="Mã hoặc tên tài khoản…"
                  className="h-8 w-56 rounded border border-border bg-background px-2 text-sm"
                />
                {tbSearch && (
                  <button
                    type="button"
                    onClick={() => setTbSearch("")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Xoá
                  </button>
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
        </TabsContent>
      </Tabs>

      <DrilldownDialog drill={drill} from={from} to={to} asOf={to} onClose={() => setDrill(null)} />
      <AccountDrilldownDialog account={drillAcc} from={from} to={to} dims={dims} onClose={() => setDrillAcc(null)} />
    </div>
  );
}

function PrintHeader({ profile, title, subtitle }: { profile: any; title: string; subtitle: string }) {
  return (
    <div className="hidden print:mb-4 print:block">
      <div className="text-center">
        <div className="text-base font-bold uppercase">{profile?.company_name ?? "DOANH NGHIỆP"}</div>
        <div className="text-xs">{profile?.address ?? ""}</div>
        <div className="text-xs">MST: {profile?.tax_id ?? "—"}{profile?.phone ? ` — ĐT: ${profile.phone}` : ""}</div>
        <div className="mt-3 text-base font-bold uppercase">{title}</div>
        <div className="text-xs italic">{subtitle}</div>
        <div className="text-xs">Đơn vị tính: {profile?.base_currency ?? "VND"}</div>
      </div>
    </div>
  );
}

function SignatureFooter({ profile, reportDate }: { profile: any; reportDate: string }) {
  const dateStr = `Ngày ${reportDate.slice(8, 10)} tháng ${reportDate.slice(5, 7)} năm ${reportDate.slice(0, 4)}`;
  const signers = [
    { role: "Người lập biểu", name: profile?.preparer_name, sig: null as string | null, stamp: null as string | null },
    { role: "Kế toán trưởng", name: profile?.chief_accountant_name, sig: profile?.signature_url ?? null, stamp: null },
    { role: "Giám đốc / Đại diện pháp luật", name: profile?.legal_rep_name, sig: profile?.signature_url ?? null, stamp: profile?.stamp_url ?? null },
  ];
  return (
    <div className="mt-8 print:mt-12">
      <div className="text-right text-sm italic">{dateStr}</div>
      <div className="mt-2 grid grid-cols-3 gap-4 text-center text-sm">
        {signers.map((s, i) => (
          <div key={i}>
            <div className="font-semibold">{s.role}</div>
            <div className="text-xs italic text-muted-foreground">(Ký, họ tên{i === 2 ? ", đóng dấu" : ""})</div>
            <div className="relative mx-auto mt-2 h-24 w-full">
              {s.stamp && <img src={s.stamp} alt="Dấu" className="absolute left-1/2 top-0 h-24 w-24 -translate-x-1/2 object-contain opacity-80" />}
              {s.sig && <img src={s.sig} alt="Chữ ký" className="absolute left-1/2 top-2 h-20 w-auto -translate-x-1/2 object-contain" />}
            </div>
            <div className="mt-1 font-semibold">{s.name || "....................................."}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrilldownDialog({ drill, from, to, asOf, onClose }: { drill: null | { report: "B01" | "B02" | "B03"; ma_so: string; name: string }; from: string; to: string; asOf: string; onClose: () => void }) {
  const drillFn = useServerFn(drilldownReportItem);
  const [newTabDefault, setNewTabDefault] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNewTabDefault(window.localStorage.getItem("drill-open-newtab") === "1");
  }, []);
  const toggleNewTab = (v: boolean) => {
    setNewTabDefault(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("drill-open-newtab", v ? "1" : "0");
    }
  };
  const q = useQuery({
    queryKey: ["drill", drill?.report, drill?.ma_so, from, to, asOf],
    queryFn: () => drillFn({ data: { report: drill!.report, ma_so: drill!.ma_so, from, to, asOf } }),
    enabled: !!drill,
    // Identical (report,ma_so,from,to,asOf) → reuse for 5min; keep in cache 30min.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Show previous payload while a new ma_so is loading to avoid spinner flicker.
    placeholderData: (prev) => prev,
  });
  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Chi tiết chỉ tiêu {drill?.ma_so} — {drill?.name}
          </DialogTitle>
        </DialogHeader>
        {!q.data ? <Loading /> : q.data.lines.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Không có bút toán nào cấu thành chỉ tiêu này trong kỳ.
            {q.data.prefixes?.length ? <div className="mt-1 text-xs">TK theo dõi: {q.data.prefixes.join(", ")}</div> : null}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <div>
                {q.data.lines.length} dòng — Tổng cộng đóng góp: <b className="font-mono">{fmt(q.data.total)}</b>
                {q.data.prefixes?.length ? ` — TK: ${q.data.prefixes.join(", ")}` : ""}
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={newTabDefault}
                  onChange={(e) => toggleNewTab(e.target.checked)}
                />
                Mặc định mở "Sổ cái" ở tab mới
              </label>
            </div>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-2 text-left w-24">Ngày</th>
                  <th className="text-left">Diễn giải</th>
                  <th className="w-20 text-center">TK</th>
                  {drill?.report === "B03" && <th className="w-20 text-center">Đối ứng</th>}
                  <th className="w-28 text-right">Nợ</th>
                  <th className="w-28 text-right">Có</th>
                  <th className="w-28 text-right">Đóng góp</th>
                  <th className="w-20 text-center">Sổ cái</th>
                </tr>
              </thead>
              <tbody>
                {q.data.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-1 text-xs">{l.entry_date}</td>
                    <td className="text-xs">{l.description ?? "—"}</td>
                    <td className="text-center font-mono text-xs">{l.account_code}</td>
                    {drill?.report === "B03" && (
                      <td className="text-center font-mono text-xs text-muted-foreground">{l.counter_account || "—"}</td>
                    )}
                    <td className="text-right font-mono text-xs">{fmt(l.debit)}</td>
                    <td className="text-right font-mono text-xs">{fmt(l.credit)}</td>
                    <td className={`text-right font-mono text-xs ${l.contribution < 0 ? "text-destructive" : ""}`}>{fmt(l.contribution)}</td>
                    <td className="text-center">
                      <span className="inline-flex items-center gap-0.5">
                        {newTabDefault ? (
                          <a
                            href={`/journal#entry-${l.entry_id}`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="Mở sổ cái (tab mới)"
                          >
                            <FileText className="h-3 w-3" />Mở
                          </a>
                        ) : (
                          <Link
                            to="/journal"
                            hash={`entry-${l.entry_id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="Mở sổ cái trong cùng tab (drill-down vẫn giữ)"
                          >
                            <FileText className="h-3 w-3" />Mở
                          </Link>
                        )}
                        <a
                          href={`/journal#entry-${l.entry_id}`}
                          target="_blank"
                          rel="noopener"
                          className="ml-0.5 text-muted-foreground hover:text-primary"
                          title={newTabDefault ? "Mở trong cùng tab" : "Mở trong tab mới"}
                          onClick={(e) => {
                            if (newTabDefault) {
                              // Force same-tab override
                              e.preventDefault();
                              window.location.href = `/journal#entry-${l.entry_id}`;
                            }
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type TrialBalanceRow = {
  code: string;
  name: string;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  closingDebit: number;
  closingCredit: number;
};
type TrialBalanceData = {
  rows: TrialBalanceRow[];
  totals: Omit<TrialBalanceRow, "code" | "name">;
  balanced: boolean;
};

// Cấp tài khoản theo độ dài mã (VAS/TT200): 3=cấp1, 4=cấp2, ≥5=cấp3
const accountLevel = (code: string): 1 | 2 | 3 => (code.length <= 3 ? 1 : code.length === 4 ? 2 : 3);
const parentCode = (code: string): string | null => {
  if (code.length <= 3) return null;
  return code.slice(0, code.length - 1);
};

function aggregateTrialBalance(
  rows: TrialBalanceRow[],
  level: "all" | "1" | "2" | "3",
): TrialBalanceRow[] {
  if (level === "all") return rows;
  const maxLen = level === "1" ? 3 : level === "2" ? 4 : 5;
  const nameByCode = new Map(rows.map((r) => [r.code, r.name]));
  const agg = new Map<string, TrialBalanceRow>();
  for (const r of rows) {
    const key = r.code.length > maxLen ? r.code.slice(0, maxLen) : r.code;
    const cur = agg.get(key) ?? {
      code: key,
      name: nameByCode.get(key) ?? r.name,
      openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0,
    };
    cur.openingDebit += r.openingDebit;
    cur.openingCredit += r.openingCredit;
    cur.debit += r.debit;
    cur.credit += r.credit;
    cur.closingDebit += r.closingDebit;
    cur.closingCredit += r.closingCredit;
    agg.set(key, cur);
  }
  return Array.from(agg.values()).sort((a, b) => a.code.localeCompare(b.code));
}

// Đảm bảo tổ tiên xuất hiện trong cây (kể cả khi chưa có dòng riêng trong rows)
function ensureAncestors(rows: TrialBalanceRow[]): TrialBalanceRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const empty = (code: string, name: string): TrialBalanceRow => ({
    code, name, openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0,
  });
  for (const r of rows) {
    let p = parentCode(r.code);
    while (p) {
      if (!byCode.has(p)) byCode.set(p, empty(p, ""));
      p = parentCode(p);
    }
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function TrialBalanceTable({
  data, hideZero, level, tree, search, onDrill,
}: {
  data: TrialBalanceData;
  hideZero: boolean;
  level: "all" | "1" | "2" | "3";
  tree: boolean;
  search?: string;
  onDrill?: (code: string, name: string) => void;
}) {
  const aggregated = aggregateTrialBalance(data.rows, level);
  const withAncestors = tree ? ensureAncestors(aggregated) : aggregated;
  const afterHideZero = hideZero
    ? withAncestors.filter(
        (r) =>
          r.openingDebit !== 0 || r.openingCredit !== 0 ||
          r.debit !== 0 || r.credit !== 0 ||
          r.closingDebit !== 0 || r.closingCredit !== 0,
      )
    : withAncestors;

  // Lọc theo từ khoá: khớp mã hoặc tên (không phân biệt hoa thường, bỏ dấu cách thừa).
  // Khi xem dạng cây: giữ lại tổ tiên của các dòng khớp để cây không bị đứt.
  const q = (search ?? "").trim().toLowerCase();
  let filtered = afterHideZero;
  if (q) {
    const matches = afterHideZero.filter(
      (r) => r.code.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q),
    );
    if (tree) {
      const keep = new Set(matches.map((r) => r.code));
      for (const r of matches) {
        let p = parentCode(r.code);
        while (p) { keep.add(p); p = parentCode(p); }
      }
      filtered = afterHideZero.filter((r) => keep.has(r.code));
    } else {
      filtered = matches;
    }
  }


  // Tổng cộng tính trên các nút "lá" của tập đã chọn để tránh đếm trùng khi xem cây
  const codeSet = new Set(filtered.map((r) => r.code));
  const isLeaf = (code: string) => {
    if (!tree) return true;
    // lá nếu không có hậu duệ nào trong tập hiển thị
    for (const c of codeSet) {
      if (c !== code && c.startsWith(code) && c.length > code.length) return false;
    }
    return true;
  };
  const totals = filtered.reduce(
    (s, r) => isLeaf(r.code) ? {
      openingDebit: s.openingDebit + r.openingDebit,
      openingCredit: s.openingCredit + r.openingCredit,
      debit: s.debit + r.debit,
      credit: s.credit + r.credit,
      closingDebit: s.closingDebit + r.closingDebit,
      closingCredit: s.closingCredit + r.closingCredit,
    } : s,
    { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 },
  );

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-border">
          <th rowSpan={2} className="py-2 text-left">Mã TK</th>
          <th rowSpan={2} className="text-left">Tên tài khoản</th>
          <th colSpan={2} className="text-center border-l border-border">Số dư đầu kỳ</th>
          <th colSpan={2} className="text-center border-l border-border">Phát sinh trong kỳ</th>
          <th colSpan={2} className="text-center border-l border-border">Số dư cuối kỳ</th>
          {onDrill && <th rowSpan={2} className="print:hidden"></th>}
        </tr>
        <tr className="border-b border-border text-muted-foreground">
          <th className="text-right border-l border-border">Nợ</th><th className="text-right">Có</th>
          <th className="text-right border-l border-border">Nợ</th><th className="text-right">Có</th>
          <th className="text-right border-l border-border">Nợ</th><th className="text-right">Có</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((r) => {
          const lvl = accountLevel(r.code);
          const indent = tree ? (lvl - 1) * 16 : 0;
          const bold = tree && lvl < 3;
          return (
            <tr key={r.code} className="border-b border-border/40 group">
              <td className={`py-1 font-mono ${bold ? "font-semibold" : ""}`} style={{ paddingLeft: indent }}>{r.code}</td>
              <td className={bold ? "font-semibold" : ""}>{r.name}</td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmt(r.openingDebit)}</td>
              <td className="text-right font-mono tabular-nums">{fmt(r.openingCredit)}</td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmt(r.debit)}</td>
              <td className="text-right font-mono tabular-nums">{fmt(r.credit)}</td>
              <td className="text-right font-mono tabular-nums border-l border-border">{fmt(r.closingDebit)}</td>
              <td className="text-right font-mono tabular-nums">{fmt(r.closingCredit)}</td>
              {onDrill && (
                <td className="pl-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => onDrill(r.code, r.name)}
                    className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                    title="Xem chi tiết phát sinh"
                  >
                    Chi tiết
                  </button>
                </td>
              )}
            </tr>
          );
        })}
        <tr className="bg-muted/50 font-semibold border-t-2 border-border">
          <td colSpan={2} className="py-2">Tổng cộng</td>
          <td className="text-right font-mono border-l border-border">{fmt(totals.openingDebit)}</td>
          <td className="text-right font-mono">{fmt(totals.openingCredit)}</td>
          <td className="text-right font-mono border-l border-border">{fmt(totals.debit)}</td>
          <td className="text-right font-mono">{fmt(totals.credit)}</td>
          <td className="text-right font-mono border-l border-border">{fmt(totals.closingDebit)}</td>
          <td className="text-right font-mono">{fmt(totals.closingCredit)}</td>
          {onDrill && <td className="print:hidden"></td>}
        </tr>
      </tbody>
    </table>
  );
}

type UnbalancedData = {
  entries: Array<{
    entry_id: string;
    entry_date: string;
    description: string | null;
    totalDebit: number;
    totalCredit: number;
    delta: number;
    lineCount: number;
    reason: string;
  }>;
  totalCount: number;
  totalDelta: number;
};

function UnbalancedEntriesPanel({ loading, data }: { loading: boolean; data?: UnbalancedData }) {
  if (loading) {
    return <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Đang phân tích bút toán lệch cân…</div>;
  }
  if (!data || data.entries.length === 0) {
    return (
      <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        Không phát hiện bút toán nào có Nợ ≠ Có trong kỳ. Chênh lệch có thể đến từ
        <span className="font-medium"> số dư đầu kỳ chưa cân</span> hoặc
        <span className="font-medium"> dữ liệu ngoài khoảng thời gian đang lọc</span>.
        Hãy mở rộng kỳ hoặc kiểm tra số dư khởi tạo trong <Link to="/coa" className="underline">Hệ thống tài khoản</Link>.
      </div>
    );
  }
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-destructive">
          {data.totalCount} bút toán có Nợ ≠ Có (tổng lệch: {fmt(data.totalDelta)})
        </span>
        <span className="text-muted-foreground">Hiển thị tối đa {data.entries.length} dòng — sắp xếp theo mức lệch giảm dần</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1 text-left">Ngày</th>
            <th className="text-left">Diễn giải</th>
            <th className="text-center">Số dòng</th>
            <th className="text-right">Tổng Nợ</th>
            <th className="text-right">Tổng Có</th>
            <th className="text-right">Lệch</th>
            <th className="text-left pl-2">Gợi ý nguyên nhân</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => (
            <tr key={e.entry_id} className="border-b border-border/40">
              <td className="py-1 font-mono">{e.entry_date}</td>
              <td className="max-w-[280px] truncate" title={e.description ?? ""}>{e.description ?? "—"}</td>
              <td className="text-center">{e.lineCount}</td>
              <td className="text-right font-mono tabular-nums">{fmt(e.totalDebit)}</td>
              <td className="text-right font-mono tabular-nums">{fmt(e.totalCredit)}</td>
              <td className="text-right font-mono tabular-nums font-semibold text-destructive">{fmt(e.delta)}</td>
              <td className="pl-2 text-muted-foreground">{e.reason}</td>
              <td className="text-right">
                <Link to="/journal" hash={`entry-${e.entry_id}`} className="text-primary underline">Mở</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function AccountDrilldownDialog({
  account, from, to, dims, onClose,
}: {
  account: { code: string; name: string } | null;
  from: string;
  to: string;
  dims: DimensionValue;
  onClose: () => void;
}) {
  const alFn = useServerFn(getAccountLedger);
  const exportAlFn = useServerFn(exportAccountLedgerXlsx);
  const q = useQuery({
    queryKey: ["acc-ledger-drill", account?.code, from, to, dims],
    queryFn: () => alFn({ data: { account: account!.code, from, to, dims } }),
    enabled: !!account,
    ...QUERY_PRESETS.REPORT,
  });
  const open = !!account;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [docType, setDocType] = useState<"all" | "invoice" | "manual">("all");

  // Reset khi mở/đóng hoặc đổi tài khoản — mặc định lấy đúng kỳ báo cáo
  useEffect(() => {
    setSearch("");
    setPage(1);
    setFilterFrom(from);
    setFilterTo(to);
    setDocType("all");
  }, [account?.code, from, to]);

  const allLines: any[] = q.data?.lines ?? [];
  const term = search.trim().toLowerCase();
  const filteredLines = allLines.filter((l) => {
    if (filterFrom && l.entry_date < filterFrom) return false;
    if (filterTo && l.entry_date > filterTo) return false;
    if (docType !== "all") {
      const t = l.doc_type ?? (l.invoice_id ? "invoice" : "manual");
      if (t !== docType) return false;
    }
    if (term) {
      const hay = `${l.description ?? ""} ${l.entry_date ?? ""} ${l.debit} ${l.credit}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
  const filteredDebit = filteredLines.reduce((s, l) => s + (l.debit || 0), 0);
  const filteredCredit = filteredLines.reduce((s, l) => s + (l.credit || 0), 0);
  const totalPages = Math.max(1, Math.ceil(filteredLines.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageLines = filteredLines.slice(start, start + pageSize);

  useEffect(() => { setPage(1); }, [search, pageSize, filterFrom, filterTo, docType]);

  function resetFilters() {
    setSearch("");
    setFilterFrom(from);
    setFilterTo(to);
    setDocType("all");
  }
  const filtersActive =
    !!search || filterFrom !== from || filterTo !== to || docType !== "all";

  async function handleExport() {
    if (!account) return;
    try {
      toast.loading("Đang xuất Excel...", { id: "xlsx" });
      const res = await exportAlFn({ data: { account: account.code, from, to, dims } });
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>
              Phát sinh chi tiết — TK {account?.code} {account?.name ? `· ${account.name}` : ""}
            </span>
            {account && q.data && q.data.lines.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-1 h-4 w-4" />Xuất Excel
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        {!account ? null : q.isLoading || !q.data ? (
          <Loading />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Kỳ: <b className="text-foreground">{from} → {to}</b></span>
              <span>Số dư đầu: <b className="text-foreground font-mono">{fmt(q.data.opening)}</b></span>
              <span>Tổng PS Nợ: <b className="text-foreground font-mono">{fmt(q.data.totalDebit)}</b></span>
              <span>Tổng PS Có: <b className="text-foreground font-mono">{fmt(q.data.totalCredit)}</b></span>
              <span>Số dư cuối: <b className="text-foreground font-mono">{fmt(q.data.closing)}</b></span>
              <span>Số dòng: <b className="text-foreground">{q.data.lines.length}</b></span>
            </div>
            {allLines.length === 0 ? (
              <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Không có chứng từ nào phát sinh trên TK {account.code} trong kỳ.
              </div>
            ) : (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm theo diễn giải, ngày hoặc số tiền…"
                      className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-xs"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-muted-foreground">
                    Số dòng/trang:
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="h-8 rounded border border-border bg-background px-1 text-xs"
                    >
                      {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <span className="text-muted-foreground">
                    {filteredLines.length === 0
                      ? "Không có kết quả"
                      : `${start + 1}–${Math.min(start + pageSize, filteredLines.length)} / ${filteredLines.length}`}
                    {term && allLines.length !== filteredLines.length && ` (lọc từ ${allLines.length})`}
                  </span>
                </div>
                {filteredLines.length === 0 ? (
                  <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    Không tìm thấy dòng nào khớp "{search}".
                  </div>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-1 text-left">Ngày</th>
                          <th className="text-left">Chứng từ / Diễn giải</th>
                          <th className="text-right">PS Nợ</th>
                          <th className="text-right">PS Có</th>
                          <th className="text-right">Lũy kế</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageLines.map((l: any, i: number) => (
                          <tr key={`${l.entry_id}-${start + i}`} className="border-b border-border/40">
                            <td className="py-1 font-mono whitespace-nowrap">{l.entry_date}</td>
                            <td className="max-w-[420px] truncate" title={l.description ?? ""}>{l.description ?? "—"}</td>
                            <td className="text-right font-mono tabular-nums">{fmt(l.debit)}</td>
                            <td className="text-right font-mono tabular-nums">{fmt(l.credit)}</td>
                            <td className="text-right font-mono tabular-nums">{fmt(l.running)}</td>
                            <td className="pl-2 text-right">
                              <Link to="/journal" hash={`entry-${l.entry_id}`} className="text-primary underline" onClick={onClose}>Mở</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {totalPages > 1 && (
                      <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                        <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(1)}>« Đầu</Button>
                        <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹ Trước</Button>
                        <span className="px-1 text-muted-foreground">Trang {safePage} / {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Sau ›</Button>
                        <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>Cuối »</Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function ReportCard({ title, subtitle, children, onExport }: { title: string; subtitle?: string; children: React.ReactNode; onExport?: () => void }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} className="print:hidden">
            <Download className="mr-1 h-4 w-4" />Xuất Excel
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

type Row = { name: string; code: string; indent: number; bold?: boolean; drillable?: boolean; vals: (number | null)[] };
function ReportTable({ cols, rows, onDrill }: { cols: (string | null)[]; rows: Row[]; onDrill?: (code: string, name: string) => void }) {
  const visibleCols = cols.filter(c => c !== null) as string[];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase text-muted-foreground">
          {visibleCols.map((c, i) => <th key={c} className={`py-2 ${i === 0 ? "text-left" : i === 1 ? "w-16 text-center" : "w-32 text-right"}`}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const canDrill = !!onDrill && r.drillable !== false && !r.bold;
          return (
            <tr
              key={idx}
              className={`border-b border-border/40 ${r.bold ? "bg-muted/30" : ""} ${canDrill ? "cursor-pointer hover:bg-muted/40" : ""}`}
              onClick={canDrill ? () => onDrill!(r.code, r.name) : undefined}
            >
              <td className={`py-1.5 ${r.bold ? "font-semibold" : ""}`} style={{ paddingLeft: 8 + r.indent * 16 }}>{r.name}</td>
              <td className="text-center font-mono text-xs text-muted-foreground">{r.code}</td>
              {r.vals.filter(v => v !== null).map((v, i) => (
                <td key={i} className={`text-right font-mono tabular-nums ${r.bold ? "font-semibold" : ""}`}>{fmt(v as number)}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CashFlowTable({ items, hideZero, onDrill }: { items: any[]; hideZero: boolean; onDrill?: (code: string, name: string) => void }) {
  const groups = [
    { key: "operating", label: "I. Lưu chuyển tiền từ hoạt động kinh doanh" },
    { key: "investing", label: "II. Lưu chuyển tiền từ hoạt động đầu tư" },
    { key: "financing", label: "III. Lưu chuyển tiền từ hoạt động tài chính" },
    { key: "summary", label: "" },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase text-muted-foreground">
          <th className="py-2 text-left">Chỉ tiêu</th>
          <th className="w-16 text-center">Mã số</th>
          <th className="w-32 text-right">Số tiền</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(g => (
          <>
            {g.label && <tr key={g.key + "-h"}><td colSpan={3} className="bg-muted/20 px-2 py-1.5 text-sm font-semibold">{g.label}</td></tr>}
            {items.filter(it => it.section === g.key).filter(it => !hideZero || it.bold || it.amount !== 0).map(it => {
              const canDrill = !!onDrill && !it.bold && it.section !== "summary";
              return (
                <tr
                  key={it.ma_so}
                  className={`border-b border-border/40 ${it.bold ? "bg-muted/30" : ""} ${canDrill ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  onClick={canDrill ? () => onDrill!(it.ma_so, it.name) : undefined}
                >
                  <td className={`py-1.5 pl-4 ${it.bold ? "font-semibold" : ""}`}>{it.name}</td>
                  <td className="text-center font-mono text-xs text-muted-foreground">{it.ma_so}</td>
                  <td className={`text-right font-mono tabular-nums ${it.bold ? "font-semibold" : ""}`}>{fmt(it.amount)}</td>
                </tr>
              );
            })}
          </>
        ))}
      </tbody>
    </table>
  );
}

const NOTE_SECTIONS_POLICY = [
  { key: "policy.dac_diem", label: "1. Đặc điểm hoạt động của doanh nghiệp", placeholder: "Hình thức sở hữu, lĩnh vực kinh doanh, ngành nghề..." },
  { key: "policy.ky_ke_toan", label: "2. Kỳ kế toán, đơn vị tiền tệ sử dụng", placeholder: "Kỳ kế toán năm bắt đầu từ ... đến ..., đơn vị tiền tệ VND" },
  { key: "policy.chuan_muc", label: "3. Chuẩn mực và chế độ kế toán áp dụng", placeholder: "Áp dụng Thông tư 99/2025/TT-BTC..." },
  { key: "policy.tien_te", label: "4. Nguyên tắc chuyển đổi ngoại tệ", placeholder: "Tỷ giá giao dịch thực tế tại ngày phát sinh..." },
  { key: "policy.tien", label: "5. Tiền và các khoản tương đương tiền", placeholder: "Tiền mặt, tiền gửi ngân hàng, khoản đầu tư có thời hạn ≤ 3 tháng" },
  { key: "policy.phai_thu", label: "6. Các khoản phải thu — nguyên tắc dự phòng", placeholder: "Phân loại nợ phải thu, lập dự phòng theo TT48" },
  { key: "policy.htk", label: "7. Hàng tồn kho — phương pháp tính giá", placeholder: "Bình quân gia quyền / FIFO / Thực tế đích danh; hạch toán kê khai thường xuyên" },
  { key: "policy.tscd", label: "8. Tài sản cố định — nguyên tắc và phương pháp khấu hao", placeholder: "Khấu hao đường thẳng, thời gian SD theo TT45" },
  { key: "policy.doanh_thu", label: "9. Nguyên tắc ghi nhận doanh thu", placeholder: "Ghi nhận khi chuyển giao quyền sở hữu, dịch vụ hoàn thành..." },
  { key: "policy.chi_phi", label: "10. Nguyên tắc ghi nhận chi phí", placeholder: "Chi phí ghi nhận theo nguyên tắc phù hợp với doanh thu" },
  { key: "policy.thue", label: "11. Thuế thu nhập doanh nghiệp", placeholder: "Thuế suất hiện hành 20%, các ưu đãi (nếu có)" },
  { key: "policy.vcsh", label: "12. Nguyên tắc ghi nhận vốn chủ sở hữu", placeholder: "Vốn góp ghi nhận theo số thực góp..." },
];

const TAX_NAMES: Record<string, string> = {
  "3331": "Thuế GTGT đầu ra", "3332": "Thuế tiêu thụ đặc biệt", "3333": "Thuế XNK", "3334": "Thuế TNDN",
  "3335": "Thuế TNCN", "3336": "Thuế tài nguyên", "3337": "Thuế nhà đất", "3338": "Thuế khác", "3339": "Phí, lệ phí",
};

const EQUITY_NAMES: Record<string, string> = {
  "4111": "Vốn góp của chủ sở hữu", "4112": "Thặng dư vốn cổ phần", "4118": "Vốn khác",
  "412": "Chênh lệch đánh giá lại TS", "413": "Chênh lệch tỷ giá", "414": "Quỹ đầu tư phát triển",
  "418": "Quỹ khác", "419": "Cổ phiếu quỹ", "421": "LN sau thuế chưa phân phối", "441": "Nguồn vốn ĐTXDCB",
};

function NotesPanel({ data, onRefetch, upsert }: { data: any; onRefetch: () => void; upsert: any }) {
  return (
    <div className="space-y-8">
      {/* I. Đặc điểm doanh nghiệp */}
      <section>
        <h3 className="mb-2 font-semibold">I. Đặc điểm hoạt động của doanh nghiệp</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Tên doanh nghiệp</dt><dd>{data.profile?.company_name ?? "—"}</dd>
          <dt className="text-muted-foreground">Mã số thuế</dt><dd className="font-mono">{data.profile?.tax_id ?? "—"}</dd>
          <dt className="text-muted-foreground">Địa chỉ</dt><dd>{data.profile?.address ?? "—"}</dd>
          <dt className="text-muted-foreground">Đơn vị tiền tệ</dt><dd>{data.profile?.base_currency ?? "VND"}</dd>
          <dt className="text-muted-foreground">Chế độ kế toán</dt><dd>{data.profile?.accounting_standard ?? "TT99"}</dd>
          <dt className="text-muted-foreground">Năm tài chính bắt đầu tháng</dt><dd>{data.profile?.fiscal_year_start ?? 1}</dd>
        </dl>
      </section>

      {/* II. Chính sách kế toán */}
      <section>
        <h3 className="mb-3 font-semibold">II. Chính sách kế toán áp dụng</h3>
        <div className="space-y-3">
          {NOTE_SECTIONS_POLICY.map(s => (
            <NoteEditor key={s.key} sectionKey={s.key} label={s.label} placeholder={s.placeholder} initial={data.userNotes[s.key] ?? ""} upsert={upsert} onSaved={onRefetch} />
          ))}
        </div>
      </section>

      {/* III. Tài sản cố định */}
      <section>
        <h3 className="mb-2 font-semibold">III. Tài sản cố định</h3>
        <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Số TSCĐ đầu kỳ</div><div className="font-semibold">{data.tscdSummary?.openingCount ?? 0}</div></div>
          <div><div className="text-xs text-muted-foreground">Tăng trong kỳ</div><div className="font-semibold text-green-600">+{data.tscdSummary?.additionsCount ?? 0}</div></div>
          <div><div className="text-xs text-muted-foreground">Thanh lý / giảm</div><div className="font-semibold text-red-600">−{data.tscdSummary?.disposalsCount ?? 0}</div></div>
          <div><div className="text-xs text-muted-foreground">Giá trị còn lại</div><div className="font-mono font-semibold">{fmt(data.tscdSummary?.netBookValue ?? 0)}</div></div>
          <div><div className="text-xs text-muted-foreground">Tổng nguyên giá</div><div className="font-mono">{fmt(data.tscdSummary?.totalCost ?? 0)}</div></div>
          <div><div className="text-xs text-muted-foreground">Hao mòn lũy kế</div><div className="font-mono">{fmt(data.tscdSummary?.totalDepreciation ?? 0)}</div></div>
        </div>
        {data.fixedAssets.length === 0 ? <p className="text-sm text-muted-foreground">Không có TSCĐ.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-left">Mã</th><th className="text-left">Tên TSCĐ</th><th className="text-right">Nguyên giá</th><th className="text-center">T.gian SD</th><th className="text-center">Bắt đầu</th><th className="text-center">Trạng thái</th></tr></thead>
            <tbody>{data.fixedAssets.map((a: any) => (
              <tr key={a.code} className="border-b border-border/40"><td className="py-1 font-mono text-xs">{a.code}</td><td>{a.name}{a.addedInPeriod && <span className="ml-1 rounded bg-green-100 px-1 text-[10px] text-green-700">Mới</span>}</td><td className="text-right font-mono">{fmt(a.cost)}</td><td className="text-center">{a.life}</td><td className="text-center text-xs">{a.start}</td><td className="text-center text-xs">{a.status}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* IV. Hàng tồn kho */}
      <section>
        <h3 className="mb-2 font-semibold">IV. Hàng tồn kho — Tổng giá trị: <span className="font-mono">{fmt(data.inventoryTotal ?? 0)}</span></h3>
        {data.inventory.length === 0 ? <p className="text-sm text-muted-foreground">Không có tồn kho.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-left">Mã</th><th className="text-left">Tên</th><th className="text-right">SL tồn</th><th className="text-right">Giá trị</th></tr></thead>
            <tbody>{data.inventory.map((p: any) => (
              <tr key={p.code} className="border-b border-border/40"><td className="py-1 font-mono text-xs">{p.code}</td><td>{p.name}</td><td className="text-right font-mono">{fmt(p.qty)}</td><td className="text-right font-mono">{fmt(p.value)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* V. Công nợ + Aging */}
      <section>
        <h3 className="mb-2 font-semibold">V. Phân tích tuổi nợ</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AgingTable title="Phải thu khách hàng" total={data.summary.totalReceivables} buckets={data.arAging} />
          <AgingTable title="Phải trả nhà cung cấp" total={data.summary.totalPayables} buckets={data.apAging} />
        </div>
      </section>

      {/* VI. Vốn chủ sở hữu */}
      <section>
        <h3 className="mb-2 font-semibold">VI. Vốn chủ sở hữu — số dư cuối kỳ</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-left">Mã TK</th><th className="text-left">Tên tài khoản</th><th className="text-right">Số dư</th></tr></thead>
          <tbody>{Object.entries(data.equityBalances ?? {}).filter(([_, v]) => Math.abs(Number(v)) > 0.5).map(([code, val]) => (
            <tr key={code} className="border-b border-border/40"><td className="py-1 font-mono text-xs">{code}</td><td>{EQUITY_NAMES[code] ?? code}</td><td className="text-right font-mono">{fmt(Number(val))}</td></tr>
          ))}</tbody>
        </table>
      </section>

      {/* VII. Thuế phải nộp */}
      <section>
        <h3 className="mb-2 font-semibold">VII. Tình hình thực hiện nghĩa vụ với NSNN</h3>
        {Object.keys(data.taxBreakdown ?? {}).length === 0 ? <p className="text-sm text-muted-foreground">Không có thuế phải nộp.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-left">Mã TK</th><th className="text-left">Loại thuế</th><th className="text-right">Số phải nộp</th></tr></thead>
            <tbody>{Object.entries(data.taxBreakdown).map(([code, val]) => (
              <tr key={code} className="border-b border-border/40"><td className="py-1 font-mono text-xs">{code}</td><td>{TAX_NAMES[code] ?? code}</td><td className="text-right font-mono">{fmt(Number(val))}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* VIII. Doanh thu chi phí */}
      <section>
        <h3 className="mb-2 font-semibold">VIII. Thông tin bổ sung KQKD</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">Doanh thu theo tháng (TK 511)</div>
            {data.revenueMonthly.length === 0 ? <p className="text-xs text-muted-foreground">Không có dữ liệu.</p> : (
              <table className="w-full text-xs">
                <tbody>{data.revenueMonthly.map((r: any) => (
                  <tr key={r.month} className="border-b border-border/40"><td className="py-1">{r.month}</td><td className="text-right font-mono">{fmt(r.amount)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Chi phí theo loại</div>
            {data.expenseByType.length === 0 ? <p className="text-xs text-muted-foreground">Không có dữ liệu.</p> : (
              <table className="w-full text-xs">
                <tbody>{data.expenseByType.map((e: any) => (
                  <tr key={e.code} className="border-b border-border/40"><td className="py-1 font-mono">{e.code}</td><td>{e.name}</td><td className="text-right font-mono">{fmt(e.amount)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* IX. Thông tin khác */}
      <section>
        <h3 className="mb-3 font-semibold">IX. Những thông tin khác</h3>
        <NoteEditor sectionKey="other.info" label="Thông tin bổ sung khác (sự kiện sau ngày kết thúc kỳ, cam kết, nghĩa vụ tiềm tàng...)" placeholder="Nhập các thông tin bổ sung..." initial={data.userNotes["other.info"] ?? ""} upsert={upsert} onSaved={onRefetch} />
      </section>
    </div>
  );
}

function AgingTable({ title, total, buckets }: { title: string; total: number; buckets: Record<string, number> }) {
  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <div className="font-mono text-sm">{fmt(total)}</div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {["0-30", "31-60", "61-90", "90+"].map(k => (
            <tr key={k} className="border-b border-border/40">
              <td className="py-1">{k} ngày</td>
              <td className="text-right font-mono">{fmt(Math.round(buckets?.[k] ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteEditor({ sectionKey, label, placeholder, initial, upsert, onSaved }: { sectionKey: string; label: string; placeholder?: string; initial: string; upsert: any; onSaved: () => void }) {
  const upsertFn = useServerFn(upsert);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value !== initial;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {dirty && (
          <Button size="sm" variant="outline" disabled={saving} onClick={async () => {
            setSaving(true);
            try { await upsertFn({ data: { section: sectionKey, content: value } }); toast.success("Đã lưu"); onSaved(); }
            catch (e: any) { toast.error(e.message ?? "Lỗi"); }
            finally { setSaving(false); }
          }}>Lưu</Button>
        )}
      </div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={2} placeholder={placeholder ?? "Nhập nội dung..."} />
    </div>
  );
}

function Loading() { return <div className="py-8 text-center text-sm text-muted-foreground">Đang tính...</div>; }

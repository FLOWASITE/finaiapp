import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getBalanceSheetTT99, getIncomeStatementTT99, getCashFlowDirect,
  getNotesData, upsertReportNote, exportReportXlsx, getCompanyProfile,
} from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Download, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports/")({
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

  const profileFn = useServerFn(getCompanyProfile);
  const profileQ = useQuery({ queryKey: ["profile-fiscal"], queryFn: () => profileFn() });
  const fiscalStart = Number(profileQ.data?.fiscal_year_start ?? 1);

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

  const bs = useQuery({ queryKey: ["bs99", to, compareEnabled, prevAsOf], queryFn: () => bsFn({ data: { asOf: to, compareAsOf: compareEnabled ? prevAsOf : undefined } }) });
  const is = useQuery({ queryKey: ["is99", from, to, compareEnabled, prevFrom, prevTo], queryFn: () => isFn({ data: { from, to, compareFrom: compareEnabled ? prevFrom : undefined, compareTo: compareEnabled ? prevTo : undefined } }) });
  const cf = useQuery({ queryKey: ["cf99", from, to], queryFn: () => cfFn({ data: { from, to } }) });
  const notes = useQuery({ queryKey: ["notes99", from, to], queryFn: () => notesFn({ data: { from, to } }) });

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

  return (
    <div className="p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Báo cáo tài chính</h1>
          <p className="text-sm text-muted-foreground">Theo Thông tư 99/2025/TT-BTC — hiệu lực 01/01/2026</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <div>
          <Label className="text-xs">Từ ngày</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div>
          <Label className="text-xs">Đến ngày</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={compareEnabled} onChange={(e) => setCompareEnabled(e.target.checked)} />
          So sánh kỳ trước
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Ẩn chỉ tiêu = 0
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />In</Button>
          <Button size="sm" onClick={() => { bs.refetch(); is.refetch(); cf.refetch(); notes.refetch(); }}>Cập nhật</Button>
        </div>
      </div>

      <Tabs defaultValue="b01" className="mt-6">
        <TabsList className="print:hidden">
          <TabsTrigger value="b01">B01 — Tình hình tài chính</TabsTrigger>
          <TabsTrigger value="b02">B02 — KQKD</TabsTrigger>
          <TabsTrigger value="b03">B03 — LCTT</TabsTrigger>
          <TabsTrigger value="b09">B09 — Thuyết minh</TabsTrigger>
        </TabsList>

        <TabsContent value="b01">
          <ReportCard title="Báo cáo tình hình tài chính (Mẫu B01-DN)" subtitle={`Tại ngày ${to}`} onExport={() => handleExport("B01")}>
            {!bs.data ? <Loading /> : (
              <>
                {!bs.data.balanced && (
                  <div className="mb-3 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Tài sản ≠ Nguồn vốn — kiểm tra số liệu hạch toán
                  </div>
                )}
                <ReportTable
                  cols={["Chỉ tiêu", "Mã số", "Số cuối kỳ", compareEnabled ? "Số đầu năm" : null]}
                  rows={bs.data.items.filter(it => !hideZero || it.bold || it.current !== 0 || it.previous !== 0).map(it => ({
                    name: it.name, code: it.ma_so, indent: it.level === 2 ? 2 : it.level === 1 ? 1 : 0, bold: it.bold,
                    vals: [it.current, compareEnabled ? it.previous : null],
                  }))}
                />
              </>
            )}
          </ReportCard>
        </TabsContent>

        <TabsContent value="b02">
          <ReportCard title="Báo cáo kết quả hoạt động kinh doanh (Mẫu B02-DN)" subtitle={`Kỳ từ ${from} đến ${to}`} onExport={() => handleExport("B02")}>
            {!is.data ? <Loading /> : (
              <ReportTable
                cols={["Chỉ tiêu", "Mã số", "Kỳ này", compareEnabled ? "Kỳ trước" : null]}
                rows={is.data.items.filter(it => !hideZero || it.bold || it.current !== 0 || it.previous !== 0).map(it => ({
                  name: it.name, code: it.ma_so, indent: 0, bold: it.bold,
                  vals: [it.current, compareEnabled ? it.previous : null],
                }))}
              />
            )}
          </ReportCard>
        </TabsContent>

        <TabsContent value="b03">
          <ReportCard title="Báo cáo lưu chuyển tiền tệ (Mẫu B03-DN) — phương pháp trực tiếp" subtitle={`Kỳ từ ${from} đến ${to}`} onExport={() => handleExport("B03")}>
            {!cf.data ? <Loading /> : (
              <CashFlowTable items={cf.data.items} hideZero={hideZero} />
            )}
          </ReportCard>
        </TabsContent>

        <TabsContent value="b09">
          <ReportCard title="Thuyết minh báo cáo tài chính (Mẫu B09-DN)" subtitle={`Kỳ từ ${from} đến ${to}`}>
            {!notes.data ? <Loading /> : <NotesPanel data={notes.data} onRefetch={() => notes.refetch()} upsert={upsertReportNote} />}
          </ReportCard>
        </TabsContent>
      </Tabs>
    </div>
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

type Row = { name: string; code: string; indent: number; bold?: boolean; vals: (number | null)[] };
function ReportTable({ cols, rows }: { cols: (string | null)[]; rows: Row[] }) {
  const visibleCols = cols.filter(c => c !== null) as string[];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs uppercase text-muted-foreground">
          {visibleCols.map((c, i) => <th key={c} className={`py-2 ${i === 0 ? "text-left" : i === 1 ? "w-16 text-center" : "w-32 text-right"}`}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} className={`border-b border-border/40 ${r.bold ? "bg-muted/30" : ""}`}>
            <td className={`py-1.5 ${r.bold ? "font-semibold" : ""}`} style={{ paddingLeft: 8 + r.indent * 16 }}>{r.name}</td>
            <td className="text-center font-mono text-xs text-muted-foreground">{r.code}</td>
            {r.vals.filter(v => v !== null).map((v, i) => (
              <td key={i} className={`text-right font-mono tabular-nums ${r.bold ? "font-semibold" : ""}`}>{fmt(v as number)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CashFlowTable({ items, hideZero }: { items: any[]; hideZero: boolean }) {
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
            {items.filter(it => it.section === g.key).filter(it => !hideZero || it.bold || it.amount !== 0).map(it => (
              <tr key={it.ma_so} className={`border-b border-border/40 ${it.bold ? "bg-muted/30" : ""}`}>
                <td className={`py-1.5 pl-4 ${it.bold ? "font-semibold" : ""}`}>{it.name}</td>
                <td className="text-center font-mono text-xs text-muted-foreground">{it.ma_so}</td>
                <td className={`text-right font-mono tabular-nums ${it.bold ? "font-semibold" : ""}`}>{fmt(it.amount)}</td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  );
}

const NOTE_SECTIONS = [
  { key: "policy.general", label: "1. Đặc điểm hoạt động của doanh nghiệp" },
  { key: "policy.currency", label: "2. Đơn vị tiền tệ sử dụng" },
  { key: "policy.depreciation", label: "3. Chính sách khấu hao TSCĐ" },
  { key: "policy.inventory", label: "4. Phương pháp tính giá hàng tồn kho" },
  { key: "policy.revenue", label: "5. Nguyên tắc ghi nhận doanh thu" },
];

function NotesPanel({ data, onRefetch, upsert }: { data: any; onRefetch: () => void; upsert: any }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-semibold">I. Đặc điểm hoạt động</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Tên doanh nghiệp</dt><dd>{data.profile?.company_name ?? "—"}</dd>
          <dt className="text-muted-foreground">Mã số thuế</dt><dd>{data.profile?.tax_id ?? "—"}</dd>
          <dt className="text-muted-foreground">Địa chỉ</dt><dd>{data.profile?.address ?? "—"}</dd>
          <dt className="text-muted-foreground">Đơn vị tiền tệ</dt><dd>{data.profile?.base_currency ?? "VND"}</dd>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">II. Chính sách kế toán áp dụng</h3>
        <div className="space-y-3">
          {NOTE_SECTIONS.map(s => (
            <NoteEditor key={s.key} sectionKey={s.key} label={s.label} initial={data.userNotes[s.key] ?? ""} upsert={upsert} onSaved={onRefetch} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">III. Tài sản cố định ({data.fixedAssets.length})</h3>
        {data.fixedAssets.length === 0 ? <p className="text-sm text-muted-foreground">Không có TSCĐ.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-left">Mã</th><th className="text-left">Tên TSCĐ</th><th className="text-right">Nguyên giá</th><th className="text-center">Thời gian SD (tháng)</th><th className="text-center">Bắt đầu</th></tr></thead>
            <tbody>{data.fixedAssets.map((a: any) => (
              <tr key={a.code} className="border-b border-border/40"><td className="py-1 font-mono text-xs">{a.code}</td><td>{a.name}</td><td className="text-right font-mono">{fmt(a.cost)}</td><td className="text-center">{a.life}</td><td className="text-center text-xs">{a.start}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">IV. Hàng tồn kho ({data.inventory.length})</h3>
        {data.inventory.length === 0 ? <p className="text-sm text-muted-foreground">Không có tồn kho.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-left">Mã</th><th className="text-left">Tên</th><th className="text-right">SL tồn</th><th className="text-right">Giá trị</th></tr></thead>
            <tbody>{data.inventory.map((p: any) => (
              <tr key={p.code} className="border-b border-border/40"><td className="py-1 font-mono text-xs">{p.code}</td><td>{p.name}</td><td className="text-right font-mono">{fmt(p.qty)}</td><td className="text-right font-mono">{fmt(p.value)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">V. Công nợ</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Tổng phải thu khách hàng</dt><dd className="font-mono">{fmt(data.summary.totalReceivables)}</dd>
          <dt className="text-muted-foreground">Tổng phải trả nhà cung cấp</dt><dd className="font-mono">{fmt(data.summary.totalPayables)}</dd>
        </dl>
      </section>
    </div>
  );
}

function NoteEditor({ sectionKey, label, initial, upsert, onSaved }: { sectionKey: string; label: string; initial: string; upsert: any; onSaved: () => void }) {
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
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} placeholder="Nhập nội dung..." />
    </div>
  );
}

function Loading() { return <div className="py-8 text-center text-sm text-muted-foreground">Đang tính...</div>; }

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileCode2, Lock, Unlock, AlertTriangle, AlertCircle, CheckCircle2,
  Download, Plus, Trash2, Receipt, History,
} from "lucide-react";
import {
  getVatPeriod, commitVatFiling, reopenVatFiling, markVatSubmitted,
  listVatFilings, buildVatXmlPreview, addVatAdjustment, removeVatAdjustment,
  type VatWarning,
} from "@/lib/tax-vat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/tax/gtgt")({ component: TaxGtgtPage });

const fmt = (n: number | null | undefined) => Math.round(Number(n) || 0).toLocaleString("vi-VN");

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

function monthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
function quarterOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  const curQ = Math.floor(now.getMonth() / 3);
  for (let i = 0; i < 8; i++) {
    const totalQ = curQ - i;
    const y = now.getFullYear() + Math.floor(totalQ / 4);
    const q = ((totalQ % 4) + 4) % 4;
    out.push(`${y}-Q${q + 1}`);
  }
  return out;
}

function TaxGtgtPage() {
  const [freq, setFreq] = useState<"monthly" | "quarterly">("monthly");
  const [period, setPeriod] = useState<string>(currentMonth());

  const handleFreqChange = (f: "monthly" | "quarterly") => {
    setFreq(f);
    setPeriod(f === "monthly" ? currentMonth() : currentQuarter());
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thuế GTGT</h1>
          <p className="text-sm text-muted-foreground">
            Tờ khai 01/GTGT — kỳ tháng/quý, đối chiếu sổ cái, xuất XML HTKK.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Chu kỳ</Label>
            <Select value={freq} onValueChange={(v) => handleFreqChange(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Tháng</SelectItem>
                <SelectItem value="quarterly">Quý</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Kỳ kê khai</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(freq === "monthly" ? monthOptions() : quarterOptions()).map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <PeriodWorkspace period={period} />
    </div>
  );
}

function PeriodWorkspace({ period }: { period: string }) {
  const fn = useServerFn(getVatPeriod);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vat-period", period],
    queryFn: () => fn({ data: { period } }),
  });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Đang tải dữ liệu kỳ {period}…</div>;

  const isLocked = data.filing?.status === "committed" || data.filing?.status === "submitted";

  return (
    <div className="space-y-6">
      <StatusBar period={period} filing={data.filing} config={data.config} onChanged={refetch} />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="sales">Bảng kê bán ({data.sales.length})</TabsTrigger>
          <TabsTrigger value="purchases">Bảng kê mua ({data.purchases.length})</TabsTrigger>
          <TabsTrigger value="adjustments">Điều chỉnh ({data.adjustments.length})</TabsTrigger>
          <TabsTrigger value="history">Lịch sử</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4 space-y-4">
          <SummaryCards summary={data.summary} />
          <RateBreakdown summary={data.summary} />
          <Warnings warnings={data.warnings} reconcile={data.reconcile} />
          {!isLocked && <CommitPanel period={period} onChanged={refetch} />}
        </TabsContent>

        <TabsContent value="sales" className="pt-4">
          <SalesTable rows={data.sales as any[]} />
        </TabsContent>
        <TabsContent value="purchases" className="pt-4">
          <PurchasesTable rows={data.purchases as any[]} disallowedIds={data.deductible.noTaxIdIds} cashIds={data.deductible.cashOver20mIds} />
        </TabsContent>
        <TabsContent value="adjustments" className="pt-4">
          <AdjustmentsPanel period={period} rows={data.adjustments as any[]} onChanged={refetch} locked={isLocked} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <FilingsHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== Status bar ==============
function StatusBar({ period, filing, config, onChanged }: { period: string; filing: any; config: any; onChanged: () => void }) {
  const previewFn = useServerFn(buildVatXmlPreview);
  const reopenFn = useServerFn(reopenVatFiling);
  const markFn = useServerFn(markVatSubmitted);

  const methodLabel =
    config.method === "deduction" ? "Khấu trừ" :
    config.method === "direct_revenue" ? "Trực tiếp/DT" : "Trực tiếp/GTGT";

  const downloadXml = async () => {
    try {
      const r = await previewFn({ data: { period } });
      const blob = new Blob([r.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${r.filename}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const reopen = async () => {
    if (!confirm(`Mở khoá tờ khai kỳ ${period}? Hành động được ghi nhận audit log.`)) return;
    try { await reopenFn({ data: { filingId: filing.id } }); toast.success("Đã mở khoá"); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };

  const markSubmitted = async () => {
    const ack = prompt("Nhập mã giao dịch eTax (tuỳ chọn):") ?? undefined;
    try { await markFn({ data: { filingId: filing.id, ackCode: ack || undefined } }); toast.success("Đã ghi nhận đã nộp"); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline">PP: {methodLabel}</Badge>
        <span className="text-muted-foreground">DN:</span>
        <span className="font-medium">{config.name ?? "(chưa cấu hình)"} {config.taxId && `· MST ${config.taxId}`}</span>
        {filing ? (
          <Badge variant={filing.status === "submitted" ? "default" : filing.status === "committed" ? "secondary" : "outline"} className="gap-1">
            {filing.status === "submitted" ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {filing.status === "submitted" ? "Đã nộp" : filing.status === "committed" ? "Đã chốt" : "Mở lại"}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1"><Unlock className="h-3 w-3" /> Chưa chốt</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={downloadXml}>
          <FileCode2 className="mr-1.5 h-4 w-4" />Xuất XML HTKK
        </Button>
        {filing?.status === "committed" && (
          <>
            <Button size="sm" variant="outline" onClick={markSubmitted}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />Đánh dấu đã nộp
            </Button>
            <Button size="sm" variant="ghost" onClick={reopen}>
              <Unlock className="mr-1.5 h-4 w-4" />Mở khoá
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ============== Summary ==============
function SummaryCards({ summary }: { summary: any }) {
  const cards = [
    { label: "Doanh thu chưa VAT", val: summary.outputBase },
    { label: "VAT đầu ra", val: summary.outputVat, tone: "emerald" },
    { label: "Mua vào chưa VAT", val: summary.inputBase },
    { label: "VAT đầu vào", val: summary.inputVat, tone: "blue" },
    { label: "VAT bị loại khấu trừ", val: summary.disallowedInputVat, tone: "amber" },
    { label: "VAT phải nộp", val: summary.payable, tone: "rose", big: true },
    { label: "VAT chuyển kỳ sau", val: summary.carryForward, big: true },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
          <div className={`mt-1 font-mono font-semibold ${c.big ? "text-lg" : "text-base"} ${
            c.tone === "emerald" ? "text-emerald-600" :
            c.tone === "blue" ? "text-blue-600" :
            c.tone === "amber" ? "text-amber-600" :
            c.tone === "rose" ? "text-rose-600" : ""
          }`}>{fmt(c.val)}</div>
        </div>
      ))}
    </div>
  );
}

function RateBreakdown({ summary }: { summary: any }) {
  const rows: { key: string; label: string; code: string }[] = [
    { key: "0", label: "0% (xuất khẩu)", code: "[27]" },
    { key: "5", label: "5%", code: "[29]/[30]" },
    { key: "8", label: "8% (giảm thuế)", code: "[31]/[32]" },
    { key: "10", label: "10% (thông thường)", code: "[33]/[34]" },
    { key: "exempt", label: "Không chịu thuế (KCT)", code: "[26]" },
    { key: "no_declare", label: "Không kê khai (KKKNT)", code: "—" },
  ];
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border text-sm font-semibold">Phân bổ doanh thu theo thuế suất</div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Thuế suất</th>
            <th className="px-3 text-right">Doanh thu (chưa VAT)</th>
            <th className="px-3 text-right">VAT</th>
            <th className="px-3 text-center">Mã CT HTKK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = summary.byRate[r.key] ?? { base: 0, vat: 0 };
            return (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 text-right font-mono">{fmt(v.base)}</td>
                <td className="px-3 text-right font-mono">{fmt(v.vat)}</td>
                <td className="px-3 text-center font-mono text-xs text-muted-foreground">{r.code}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============== Warnings ==============
function Warnings({ warnings, reconcile }: { warnings: VatWarning[]; reconcile: any }) {
  if (!warnings.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />Không có cảnh báo. Số liệu khớp giữa hoá đơn và sổ cái.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Cảnh báo trước khi chốt tờ khai ({warnings.length})
      </div>
      <ul className="divide-y divide-border">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
            {w.severity === "error"
              ? <AlertCircle className="h-4 w-4 mt-0.5 text-rose-500 shrink-0" />
              : <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />}
            <div className="flex-1">
              <div>{w.message}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Quy tắc: {w.rule}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>3331 sổ cái: <span className="font-mono">{fmt(reconcile.outputVatLedger)}</span></div>
        <div>VAT bán ra: <span className="font-mono">{fmt(reconcile.outputVatInvoices)}</span></div>
        <div>133 sổ cái: <span className="font-mono">{fmt(reconcile.inputVatLedger)}</span></div>
        <div>VAT mua vào: <span className="font-mono">{fmt(reconcile.inputVatInvoices)}</span></div>
      </div>
    </div>
  );
}

// ============== Commit ==============
function CommitPanel({ period, onChanged }: { period: string; onChanged: () => void }) {
  const fn = useServerFn(commitVatFiling);
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: () => fn({ data: { period, notes: notes || undefined } }),
    onSuccess: () => { toast.success(`Đã chốt tờ khai kỳ ${period}`); setOpen(false); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button><Lock className="mr-1.5 h-4 w-4" />Chốt tờ khai 01/GTGT kỳ {period}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chốt tờ khai GTGT — kỳ {period}</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ chụp lại toàn bộ số liệu kỳ này (snapshot), sinh XML HTKK và khoá kỳ.
              Bạn vẫn có thể mở khoá sau nếu chưa nộp eTax.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="notes">Ghi chú (tuỳ chọn)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="VD: kỳ đầu năm, đã đối soát bank…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Đang chốt…" : "Xác nhận chốt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== Tables ==============
function SalesTable({ rows }: { rows: any[] }) {
  const exportCsv = () => {
    const head = ["Mã HĐ", "Số HĐ", "Ngày", "Khách hàng", "MST", "Tiền hàng", "VAT", "Tổng"];
    const body = rows.map((r) => [r.einvoice_code, r.invoice_no, r.issue_date, r.customer_name, r.customer_tax_id, r.subtotal, r.vat_amount, r.total]);
    downloadCsv("bang-ke-ban-ra.csv", head, body);
  };
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-sm font-semibold">Bảng kê bán ra</div>
        <Button size="sm" variant="ghost" onClick={exportCsv}><Download className="mr-1 h-3 w-3" />CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Mã/Số HĐ</th>
              <th className="px-3 text-left">Ngày</th>
              <th className="px-3 text-left">Người mua</th>
              <th className="px-3 text-left">MST</th>
              <th className="px-3 text-right">Tiền hàng</th>
              <th className="px-3 text-right">VAT</th>
              <th className="px-3 text-right">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground text-sm">Chưa có hoá đơn bán ra trong kỳ.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono text-xs">{r.einvoice_code || r.invoice_no || "—"}</td>
                <td className="px-3">{r.issue_date}</td>
                <td className="px-3">{r.customer_name}</td>
                <td className="px-3 font-mono text-xs">{r.customer_tax_id ?? "—"}</td>
                <td className="px-3 text-right font-mono">{fmt(r.subtotal)}</td>
                <td className="px-3 text-right font-mono">{fmt(r.vat_amount)}</td>
                <td className="px-3 text-right font-mono">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchasesTable({ rows, disallowedIds, cashIds }: { rows: any[]; disallowedIds: string[]; cashIds: string[] }) {
  const dSet = useMemo(() => new Set(disallowedIds), [disallowedIds]);
  const cSet = useMemo(() => new Set(cashIds), [cashIds]);
  const exportCsv = () => {
    const head = ["Số HĐ", "Ngày", "Nhà cung cấp", "MST", "Tiền hàng", "VAT", "Tổng", "Đủ điều kiện khấu trừ"];
    const body = rows.map((r) => [r.invoice_no, r.issue_date, r.supplier_name, r.supplier_tax_id, r.subtotal, r.vat_amount, r.total, dSet.has(r.id) ? "Không (thiếu MST)" : "Có"]);
    downloadCsv("bang-ke-mua-vao.csv", head, body);
  };
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-sm font-semibold">Bảng kê mua vào</div>
        <Button size="sm" variant="ghost" onClick={exportCsv}><Download className="mr-1 h-3 w-3" />CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Số HĐ</th>
              <th className="px-3 text-left">Ngày</th>
              <th className="px-3 text-left">Nhà cung cấp</th>
              <th className="px-3 text-left">MST</th>
              <th className="px-3 text-right">Tiền hàng</th>
              <th className="px-3 text-right">VAT</th>
              <th className="px-3 text-right">Tổng</th>
              <th className="px-3 text-center">Khấu trừ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground text-sm">Chưa có hoá đơn mua vào.</td></tr>
            )}
            {rows.map((r) => {
              const disallowed = dSet.has(r.id);
              const cash = cSet.has(r.id);
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs">{r.invoice_no || "—"}</td>
                  <td className="px-3">{r.issue_date}</td>
                  <td className="px-3">{r.supplier_name}</td>
                  <td className="px-3 font-mono text-xs">{r.supplier_tax_id ?? <span className="text-rose-500">thiếu</span>}</td>
                  <td className="px-3 text-right font-mono">{fmt(r.subtotal)}</td>
                  <td className="px-3 text-right font-mono">{fmt(r.vat_amount)}</td>
                  <td className="px-3 text-right font-mono">{fmt(r.total)}</td>
                  <td className="px-3 text-center">
                    {disallowed
                      ? <Badge variant="destructive" className="text-[10px]">Loại</Badge>
                      : cash
                      ? <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">≥20tr</Badge>
                      : <Badge variant="outline" className="text-[10px]">Đủ</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== Adjustments ==============
function AdjustmentsPanel({ period, rows, onChanged, locked }: { period: string; rows: any[]; onChanged: () => void; locked: boolean }) {
  const addFn = useServerFn(addVatAdjustment);
  const delFn = useServerFn(removeVatAdjustment);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    original_period: period,
    original_invoice_no: "",
    kind: "sales" as "sales" | "purchase",
    direction: "increase" as "increase" | "decrease",
    base_amount: 0,
    vat_amount: 0,
    reason: "",
  });
  const submit = async () => {
    try {
      await addFn({ data: { filing_period: period, ...form, original_invoice_no: form.original_invoice_no || undefined, reason: form.reason || undefined } });
      toast.success("Đã thêm điều chỉnh"); setOpen(false); onChanged();
    } catch (e: any) { toast.error(e.message); }
  };
  const del = async (id: string) => {
    if (!confirm("Xoá điều chỉnh này?")) return;
    try { await delFn({ data: { id } }); toast.success("Đã xoá"); onChanged(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-sm font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" />Phụ lục điều chỉnh (01-1/GTGT)</div>
        {!locked && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="mr-1 h-3 w-3" />Thêm điều chỉnh</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Thêm phụ lục điều chỉnh</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Loại</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Bán ra</SelectItem>
                      <SelectItem value="purchase">Mua vào</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Chiều</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="increase">Tăng (+)</SelectItem>
                      <SelectItem value="decrease">Giảm (−)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Kỳ gốc</Label>
                  <Input value={form.original_period} onChange={(e) => setForm({ ...form, original_period: e.target.value })} placeholder="YYYY-MM hoặc YYYY-Qn" />
                </div>
                <div><Label>Số HĐ gốc</Label>
                  <Input value={form.original_invoice_no} onChange={(e) => setForm({ ...form, original_invoice_no: e.target.value })} />
                </div>
                <div><Label>Tiền hàng điều chỉnh</Label>
                  <Input type="number" value={form.base_amount} onChange={(e) => setForm({ ...form, base_amount: Number(e.target.value) })} />
                </div>
                <div><Label>VAT điều chỉnh</Label>
                  <Input type="number" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: Number(e.target.value) })} />
                </div>
                <div className="col-span-2"><Label>Lý do</Label>
                  <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
                <Button onClick={submit}>Lưu</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Loại</th>
            <th className="px-3 text-left">Kỳ gốc</th>
            <th className="px-3 text-left">Số HĐ gốc</th>
            <th className="px-3 text-center">Chiều</th>
            <th className="px-3 text-right">Tiền hàng</th>
            <th className="px-3 text-right">VAT</th>
            <th className="px-3 text-left">Lý do</th>
            <th className="px-3 text-center w-12"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground text-sm">Chưa có điều chỉnh nào trong kỳ.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-1.5">{r.kind === "sales" ? "Bán" : "Mua"}</td>
              <td className="px-3 font-mono text-xs">{r.original_period}</td>
              <td className="px-3 font-mono text-xs">{r.original_invoice_no ?? "—"}</td>
              <td className="px-3 text-center">
                <Badge variant={r.direction === "increase" ? "default" : "secondary"} className="text-[10px]">
                  {r.direction === "increase" ? "+" : "−"}
                </Badge>
              </td>
              <td className={`px-3 text-right font-mono ${r.direction === "decrease" ? "text-rose-600" : "text-emerald-600"}`}>{fmt(r.base_amount)}</td>
              <td className={`px-3 text-right font-mono ${r.direction === "decrease" ? "text-rose-600" : "text-emerald-600"}`}>{fmt(r.vat_amount)}</td>
              <td className="px-3 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
              <td className="px-3 text-center">
                {!locked && (
                  <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============== History ==============
function FilingsHistory() {
  const [year, setYear] = useState(new Date().getFullYear());
  const fn = useServerFn(listVatFilings);
  const reopenFn = useServerFn(reopenVatFiling);
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ["vat-filings", year], queryFn: () => fn({ data: { year } }) });

  const reopen = async (id: string) => {
    if (!confirm("Mở khoá tờ khai này?")) return;
    try { await reopenFn({ data: { filingId: id } }); toast.success("Đã mở khoá"); refetch(); qc.invalidateQueries({ queryKey: ["vat-period"] }); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div><Label className="text-xs">Năm</Label>
          <Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        {data && (
          <div className="text-sm text-muted-foreground ml-auto">
            Tổng VAT phải nộp năm {year}: <span className="font-mono font-semibold text-foreground">{fmt(data.totalPayable)}</span>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Kỳ</th>
              <th className="px-3 text-left">Loại</th>
              <th className="px-3 text-left">PP</th>
              <th className="px-3 text-left">Trạng thái</th>
              <th className="px-3 text-left">Chốt lúc</th>
              <th className="px-3 text-right">VAT phải nộp</th>
              <th className="px-3 text-right">Chuyển kỳ</th>
              <th className="px-3 text-left">Mã GD</th>
              <th className="px-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-sm">
                <History className="h-5 w-5 inline mr-1 opacity-60" />Chưa có tờ khai đã chốt năm {year}.
              </td></tr>
            )}
            {(data?.items ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono">{r.period}</td>
                <td className="px-3">{r.freq === "monthly" ? "Tháng" : "Quý"}</td>
                <td className="px-3 text-xs">{r.method === "deduction" ? "Khấu trừ" : "Trực tiếp"}</td>
                <td className="px-3">
                  <Badge variant={r.status === "submitted" ? "default" : r.status === "committed" ? "secondary" : "outline"} className="text-[10px]">
                    {r.status === "submitted" ? "Đã nộp" : r.status === "committed" ? "Đã chốt" : "Mở lại"}
                  </Badge>
                </td>
                <td className="px-3 text-xs">{r.committed_at ? new Date(r.committed_at).toLocaleString("vi-VN") : "—"}</td>
                <td className="px-3 text-right font-mono">{fmt(r.payable)}</td>
                <td className="px-3 text-right font-mono">{fmt(r.carryForward)}</td>
                <td className="px-3 font-mono text-xs">{r.ack_code ?? "—"}</td>
                <td className="px-3 text-right">
                  {(r.status === "committed" || r.status === "submitted") && (
                    <Button size="sm" variant="ghost" onClick={() => reopen(r.id)}>
                      <Unlock className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== utils ==============
function downloadCsv(filename: string, head: string[], body: (string | number | null | undefined)[][]) {
  const escapeCell = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head.map(escapeCell).join(","), ...body.map((row) => row.map(escapeCell).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FileCode2 } from "lucide-react";
import {
  getVatReturn, buildVatXml, getCITReturn, buildCITXml, getPITAnnual, buildPITXml,
} from "@/lib/tax.functions";
import { upsertReportNote } from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tax/")({ component: TaxPage });

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");

function TaxPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo thuế</h1>
        <p className="text-sm text-muted-foreground">Tờ khai GTGT (01/GTGT), Quyết toán TNDN (03/TNDN), Quyết toán TNCN (05/QTT-TNCN) — xuất XML HTKK</p>
      </div>

      <Tabs defaultValue="vat">
        <TabsList>
          <TabsTrigger value="vat">Tờ khai GTGT</TabsTrigger>
          <TabsTrigger value="cit">Quyết toán TNDN</TabsTrigger>
          <TabsTrigger value="pit">Quyết toán TNCN</TabsTrigger>
        </TabsList>

        <TabsContent value="vat"><VatPanel /></TabsContent>
        <TabsContent value="cit"><CitPanel /></TabsContent>
        <TabsContent value="pit"><PitPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function VatPanel() {
  const fn = useServerFn(getVatReturn);
  const xmlFn = useServerFn(buildVatXml);
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10));
  const { data, isFetching } = useQuery({ queryKey: ["vat", from, to], queryFn: () => fn({ data: { from, to } }) });
  const dl = useMutation({
    mutationFn: () => xmlFn({ data: { from, to } }),
    onSuccess: (r) => {
      const blob = new Blob([r.xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
      toast.success("Đã xuất XML");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const s = data?.summary;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-end gap-3">
        <div><Label>Từ ngày</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Đến ngày</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={() => dl.mutate()} disabled={dl.isPending || isFetching}>
          <FileCode2 className="mr-2 h-4 w-4" />Xuất XML HTKK
        </Button>
      </div>

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="Doanh thu chưa VAT" value={s.outputBase} />
            <Stat label="VAT đầu ra" value={s.outputVat} accent="emerald" />
            <Stat label="Mua vào chưa VAT" value={s.inputBase} />
            <Stat label="VAT đầu vào khấu trừ" value={s.inputVat} accent="blue" />
            <Stat label="VAT phải nộp" value={s.payable} accent="rose" big />
            <Stat label="VAT chuyển kỳ sau" value={s.carryForward} big />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Phân bổ doanh thu theo thuế suất</h3>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr><th className="px-3 py-2 text-left">Thuế suất</th><th className="text-right px-3">Doanh thu (chưa VAT)</th><th className="text-right px-3">VAT</th><th className="text-center px-3">Mã CT HTKK</th></tr>
              </thead>
              <tbody>
                {(["0", "5", "8", "10", "exempt"] as const).map((k) => {
                  const r = s.byRate[k];
                  const label = k === "exempt" ? "Không chịu thuế" : `${k}%`;
                  const code = k === "0" ? "[27]" : k === "5" ? "[29]/[30]" : k === "8" ? "[31]/[32]" : k === "10" ? "[33]/[34]" : "[26]";
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="px-3 py-1.5">{label}</td>
                      <td className="px-3 text-right font-mono">{fmt(r.base)}</td>
                      <td className="px-3 text-right font-mono">{fmt(r.vat)}</td>
                      <td className="px-3 text-center font-mono text-xs text-muted-foreground">{code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Tabs defaultValue="out">
        <TabsList>
          <TabsTrigger value="out">Bảng kê bán ra ({data?.sales.length ?? 0})</TabsTrigger>
          <TabsTrigger value="in">Bảng kê mua vào ({data?.purchases.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="out" className="rounded-lg border border-border bg-card">
          <SimpleTable rows={data?.sales ?? []} cols={["einvoice_code", "issue_date", "customer_name", "customer_tax_id", "subtotal", "vat_amount", "total"]}
            headers={["Mã HĐ", "Ngày", "Người mua", "MST", "Tiền hàng", "VAT", "Tổng"]} />
        </TabsContent>
        <TabsContent value="in" className="rounded-lg border border-border bg-card">
          <SimpleTable rows={data?.purchases ?? []} cols={["invoice_no", "issue_date", "supplier_name", "supplier_tax_id", "subtotal", "vat_amount", "total"]}
            headers={["Số HĐ", "Ngày", "Người bán", "MST", "Tiền hàng", "VAT", "Tổng"]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CitPanel() {
  const fn = useServerFn(getCITReturn);
  const xmlFn = useServerFn(buildCITXml);
  const upsertFn = useServerFn(upsertReportNote);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, refetch } = useQuery({ queryKey: ["cit", year], queryFn: () => fn({ data: { year } }) });

  const [adjAdd, setAdjAdd] = useState("");
  const [adjSub, setAdjSub] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [lossCarry, setLossCarry] = useState("");

  // Sync from server
  useState(() => {
    if (data?.notes) {
      setAdjAdd(data.notes.adjAdd ?? ""); setAdjSub(data.notes.adjSub ?? "");
      setTaxRate(data.notes.taxRate ?? ""); setLossCarry(data.notes.lossCarry ?? "");
    }
    return null;
  });

  const save = async (key: string, val: string) => {
    await upsertFn({ data: { section: `tax.cit.${year}.${key}`, content: val } });
    refetch();
  };
  const dl = useMutation({
    mutationFn: () => xmlFn({ data: { year } }),
    onSuccess: (r) => {
      const blob = new Blob([r.xml], { type: "application/xml" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = r.filename; a.click();
      toast.success("Đã xuất XML 03/TNDN");
    },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-end gap-3">
        <div><Label>Năm tài chính</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32" /></div>
        <Button variant="outline" onClick={() => dl.mutate()}><FileCode2 className="mr-2 h-4 w-4" />Xuất XML 03/TNDN</Button>
      </div>

      {data && (
        <div className="rounded-lg border border-border bg-card p-4">
          <table className="w-full text-sm">
            <tbody>
              <Row label="Doanh thu bán hàng & CCDV (511, 512)" value={data.revenue} bold />
              <Row label="Doanh thu hoạt động tài chính (515)" value={data.financeIncome} />
              <Row label="Thu nhập khác (711)" value={data.otherIncome} />
              <Row label="Giá vốn + CP bán hàng + CP QLDN (632, 641, 642)" value={data.expense} />
              <Row label="Chi phí tài chính (635)" value={data.financeExpense} />
              <Row label="Chi phí khác (811)" value={data.otherExpense} />
              <Row label="(B1) Tổng lợi nhuận kế toán trước thuế" value={data.accountingProfit} bold />
              <EditRow label="(B2) Các khoản điều chỉnh tăng" valueText={adjAdd} onChange={setAdjAdd} onBlur={() => save("adjAdd", adjAdd)} />
              <EditRow label="(B3) Các khoản điều chỉnh giảm" valueText={adjSub} onChange={setAdjSub} onBlur={() => save("adjSub", adjSub)} />
              <EditRow label="(B7) Lỗ kỳ trước chuyển sang" valueText={lossCarry} onChange={setLossCarry} onBlur={() => save("lossCarry", lossCarry)} />
              <Row label="(C1) Thu nhập tính thuế TNDN" value={data.taxableIncome} bold />
              <EditRow label="(C9) Thuế suất TNDN (%)" valueText={taxRate || String(data.taxRate)} onChange={setTaxRate} onBlur={() => save("taxRate", taxRate)} suffix="%" />
              <Row label="(D) Thuế TNDN phải nộp" value={data.taxPayable} bold accent="rose" />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PitPanel() {
  const fn = useServerFn(getPITAnnual);
  const xmlFn = useServerFn(buildPITXml);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useQuery({ queryKey: ["pit", year], queryFn: () => fn({ data: { year } }) });
  const dl = useMutation({
    mutationFn: () => xmlFn({ data: { year } }),
    onSuccess: (r) => {
      const blob = new Blob([r.xml], { type: "application/xml" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = r.filename; a.click();
      toast.success("Đã xuất XML 05/QTT-TNCN");
    },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-end gap-3">
        <div><Label>Năm</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-32" /></div>
        <Button variant="outline" onClick={() => dl.mutate()}><FileCode2 className="mr-2 h-4 w-4" />Xuất XML 05/QTT-TNCN</Button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Tổng thu nhập" value={data.totals.gross} />
            <Stat label="Thu nhập tính thuế" value={data.totals.taxable} />
            <Stat label="Bảo hiểm NLĐ" value={data.totals.insurance} />
            <Stat label="Thuế TNCN đã khấu trừ" value={data.totals.pit} accent="rose" />
          </div>
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Mã NV</th>
                  <th className="text-left px-3">Họ tên</th>
                  <th className="text-left px-3">MST cá nhân</th>
                  <th className="text-left px-3">CCCD</th>
                  <th className="text-right px-3">Tổng TN</th>
                  <th className="text-right px-3">TN chịu thuế</th>
                  <th className="text-right px-3">BHXH/YT/TN</th>
                  <th className="text-right px-3">Thuế TNCN</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{e.code}</td>
                    <td className="px-3">{e.full_name}</td>
                    <td className="px-3 font-mono text-xs">{e.tax_id || "—"}</td>
                    <td className="px-3 font-mono text-xs">{e.citizen_id || "—"}</td>
                    <td className="px-3 text-right font-mono">{fmt(e.gross)}</td>
                    <td className="px-3 text-right font-mono">{fmt(e.taxable)}</td>
                    <td className="px-3 text-right font-mono">{fmt(e.insurance)}</td>
                    <td className="px-3 text-right font-mono">{fmt(e.pit)}</td>
                  </tr>
                ))}
                {data.employees.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">Chưa có bảng lương trong năm</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent, big }: { label: string; value: number; accent?: "rose" | "emerald" | "blue"; big?: boolean }) {
  const color = accent === "rose" ? "text-rose-600" : accent === "emerald" ? "text-emerald-600" : accent === "blue" ? "text-blue-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono ${big ? "text-2xl" : "text-lg"} font-semibold ${color}`}>{fmt(value)} đ</div>
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: number; bold?: boolean; accent?: "rose" }) {
  return (
    <tr className={`border-b border-border/40 ${bold ? "bg-muted/30 font-semibold" : ""}`}>
      <td className="py-1.5 px-3">{label}</td>
      <td className={`py-1.5 px-3 text-right font-mono tabular-nums ${accent === "rose" ? "text-rose-600" : ""}`}>{fmt(value)}</td>
    </tr>
  );
}

function EditRow({ label, valueText, onChange, onBlur, suffix }: { label: string; valueText: string; onChange: (v: string) => void; onBlur: () => void; suffix?: string }) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-1.5 px-3">{label}</td>
      <td className="py-1.5 px-3">
        <div className="flex items-center justify-end gap-1">
          <Input type="number" value={valueText} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className="h-7 w-40 text-right font-mono" placeholder="0" />
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </div>
      </td>
    </tr>
  );
}

function SimpleTable({ rows, cols, headers }: { rows: any[]; cols: string[]; headers: string[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/40 text-xs uppercase">
        <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {cols.map((c) => {
              const v = r[c];
              const isNum = ["subtotal", "vat_amount", "total"].includes(c);
              return <td key={c} className={`px-3 py-2 ${isNum ? "text-right font-mono" : ""}`}>{isNum ? fmt(Number(v || 0)) : v ?? "—"}</td>;
            })}
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-12 text-center text-muted-foreground">Không có hóa đơn trong kỳ</td></tr>}
      </tbody>
    </table>
  );
}

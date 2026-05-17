import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, FileCode2 } from "lucide-react";
import { getVatReturn, buildVatXml } from "@/lib/tax.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tax/")({ component: TaxPage });

function TaxPage() {
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
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      toast.success("Đã xuất XML");
    },
    onError: (e) => toast.error(e.message),
  });

  const s = data?.summary;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tờ khai thuế GTGT (01/GTGT)</h1>
        <p className="text-sm text-muted-foreground">Tổng hợp & xuất XML chuẩn HTKK</p>
      </div>

      <div className="flex items-end gap-3">
        <div><Label>Từ ngày</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>Đến ngày</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={() => dl.mutate()} disabled={dl.isPending || isFetching}>
          <FileCode2 className="mr-2 h-4 w-4" />Xuất XML HTKK
        </Button>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Doanh thu chưa VAT" value={s.outputBase} />
          <Stat label="VAT đầu ra" value={s.outputVat} accent="emerald" />
          <Stat label="Mua vào chưa VAT" value={s.inputBase} />
          <Stat label="VAT đầu vào được khấu trừ" value={s.inputVat} accent="blue" />
          <Stat label="VAT phải nộp" value={s.payable} accent="rose" big />
          <Stat label="VAT còn được khấu trừ chuyển kỳ sau" value={s.carryForward} big />
        </div>
      )}

      <Tabs defaultValue="out">
        <TabsList>
          <TabsTrigger value="out">Bảng kê bán ra</TabsTrigger>
          <TabsTrigger value="in">Bảng kê mua vào</TabsTrigger>
        </TabsList>
        <TabsContent value="out" className="rounded-lg border border-border bg-card">
          <Table rows={data?.sales ?? []} cols={["einvoice_code", "issue_date", "customer_name", "customer_tax_id", "subtotal", "vat_amount", "total"]}
            headers={["Mã HĐ", "Ngày", "Người mua", "MST", "Tiền hàng", "VAT", "Tổng"]} />
        </TabsContent>
        <TabsContent value="in" className="rounded-lg border border-border bg-card">
          <Table rows={data?.purchases ?? []} cols={["invoice_no", "issue_date", "supplier_name", "supplier_tax_id", "subtotal", "vat_amount", "total"]}
            headers={["Số HĐ", "Ngày", "Người bán", "MST", "Tiền hàng", "VAT", "Tổng"]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, accent, big }: { label: string; value: number; accent?: "rose" | "emerald" | "blue"; big?: boolean }) {
  const color = accent === "rose" ? "text-rose-600" : accent === "emerald" ? "text-emerald-600" : accent === "blue" ? "text-blue-600" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono ${big ? "text-2xl" : "text-lg"} font-semibold ${color}`}>{value.toLocaleString("vi-VN")} đ</div>
    </div>
  );
}

function Table({ rows, cols, headers }: { rows: any[]; cols: string[]; headers: string[] }) {
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
              const isNum = typeof v === "number" || ["subtotal", "vat_amount", "total"].includes(c);
              return <td key={c} className={`px-3 py-2 ${isNum ? "text-right font-mono" : ""}`}>{isNum ? Number(v || 0).toLocaleString("vi-VN") : v ?? "—"}</td>;
            })}
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-12 text-center text-muted-foreground">Không có hóa đơn trong kỳ</td></tr>}
      </tbody>
    </table>
  );
}

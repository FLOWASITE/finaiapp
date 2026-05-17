import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, FileText, Trash2 } from "lucide-react";
import { listSalesInvoices, upsertSalesInvoice } from "@/lib/sales.functions";
import { listProducts } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales/")({ component: SalesPage });

function SalesPage() {
  const list = useServerFn(listSalesInvoices);
  const { data: invoices } = useQuery({ queryKey: ["sales-invoices"], queryFn: () => list({}) });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hóa đơn bán ra</h1>
          <p className="text-sm text-muted-foreground">Xuất hóa đơn điện tử & ghi sổ doanh thu</p>
        </div>
        <NewInvoiceDialog />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Ngày</th>
              <th className="px-4 py-2 text-left">Số HĐ</th>
              <th className="px-4 py-2 text-left">Khách hàng</th>
              <th className="px-4 py-2 text-right">Tiền hàng</th>
              <th className="px-4 py-2 text-right">VAT</th>
              <th className="px-4 py-2 text-right">Tổng</th>
              <th className="px-4 py-2 text-left">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((inv) => (
              <tr key={inv.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2">{inv.issue_date}</td>
                <td className="px-4 py-2 font-mono">
                  <Link to="/sales/$id" params={{ id: inv.id }} className="text-primary hover:underline">
                    {inv.einvoice_code || inv.invoice_no || "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">{inv.customer_name}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(inv.subtotal).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(inv.vat_amount).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{Number(inv.total).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2">
                  <span className={inv.status === "issued" ? "rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700" : "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700"}>
                    {inv.status === "issued" ? "Đã phát hành" : "Nháp"}
                  </span>
                </td>
              </tr>
            ))}
            {(invoices ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Chưa có hóa đơn nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewInvoiceDialog() {
  const upsert = useServerFn(upsertSalesInvoice);
  const list = useServerFn(listProducts);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => list({}), enabled: open });

  const [head, setHead] = useState({
    customer_name: "", customer_tax_id: "",
    issue_date: new Date().toISOString().slice(0, 10), notes: "",
  });
  const [lines, setLines] = useState<Array<{ product_id?: string; description: string; qty: number; unit_price: number; vat_rate: number }>>([
    { description: "", qty: 1, unit_price: 0, vat_rate: 10 },
  ]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const vat = lines.reduce((s, l) => s + l.qty * l.unit_price * (l.vat_rate / 100), 0);

  const m = useMutation({
    mutationFn: () => upsert({ data: { ...head, lines } }),
    onSuccess: () => {
      toast.success("Đã lưu nháp HĐ");
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      setOpen(false);
      setLines([{ description: "", qty: 1, unit_price: 0, vat_rate: 10 }]);
      setHead({ customer_name: "", customer_tax_id: "", issue_date: new Date().toISOString().slice(0, 10), notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Tạo HĐ bán</Button></DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle><FileText className="mr-2 inline h-4 w-4" />Hóa đơn bán hàng (nháp)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Label>Khách hàng</Label><Input value={head.customer_name} onChange={(e) => setHead({ ...head, customer_name: e.target.value })} /></div>
            <div><Label>MST</Label><Input value={head.customer_tax_id} onChange={(e) => setHead({ ...head, customer_tax_id: e.target.value })} /></div>
            <div><Label>Ngày</Label><Input type="date" value={head.issue_date} onChange={(e) => setHead({ ...head, issue_date: e.target.value })} /></div>
            <div className="col-span-2"><Label>Ghi chú</Label><Input value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} /></div>
          </div>
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-2 py-2 text-left">Hàng hóa</th>
                  <th className="px-2 py-2 text-left">Diễn giải</th>
                  <th className="px-2 py-2">SL</th>
                  <th className="px-2 py-2">Đơn giá</th>
                  <th className="px-2 py-2">VAT %</th>
                  <th className="px-2 py-2 text-right">Thành tiền</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1">
                      <Select value={l.product_id ?? ""} onValueChange={(v) => {
                        const p = products?.find((x) => x.id === v);
                        const copy = [...lines];
                        copy[i] = { ...copy[i], product_id: v, description: p?.name ?? copy[i].description, unit_price: p?.unit_price ?? copy[i].unit_price, vat_rate: p?.vat_rate ?? copy[i].vat_rate };
                        setLines(copy);
                      }}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {(products ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1"><Input className="h-8" value={l.description} onChange={(e) => { const c = [...lines]; c[i].description = e.target.value; setLines(c); }} /></td>
                    <td className="px-2 py-1 w-20"><Input className="h-8" type="number" value={l.qty} onChange={(e) => { const c = [...lines]; c[i].qty = Number(e.target.value); setLines(c); }} /></td>
                    <td className="px-2 py-1 w-28"><Input className="h-8" type="number" value={l.unit_price} onChange={(e) => { const c = [...lines]; c[i].unit_price = Number(e.target.value); setLines(c); }} /></td>
                    <td className="px-2 py-1 w-16"><Input className="h-8" type="number" value={l.vat_rate} onChange={(e) => { const c = [...lines]; c[i].vat_rate = Number(e.target.value); setLines(c); }} /></td>
                    <td className="px-2 py-1 text-right font-mono">{(l.qty * l.unit_price).toLocaleString("vi-VN")}</td>
                    <td className="px-2 py-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="ghost" size="sm" className="m-2" onClick={() => setLines([...lines, { description: "", qty: 1, unit_price: 0, vat_rate: 10 }])}>
              <Plus className="mr-1 h-3 w-3" />Thêm dòng
            </Button>
          </div>
          <div className="flex justify-end gap-6 text-sm">
            <div>Tiền hàng: <span className="font-mono">{subtotal.toLocaleString("vi-VN")}</span></div>
            <div>VAT: <span className="font-mono">{vat.toLocaleString("vi-VN")}</span></div>
            <div className="font-semibold">Tổng: <span className="font-mono">{(subtotal + vat).toLocaleString("vi-VN")}</span></div>
          </div>
          <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>Lưu nháp</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

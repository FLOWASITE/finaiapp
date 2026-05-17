import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Send, CheckCircle2 } from "lucide-react";
import { getSalesInvoice, issueSalesInvoice } from "@/lib/sales.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales/$id")({ component: SalesDetail });

function SalesDetail() {
  const { id } = useParams({ from: "/_app/sales/$id" });
  const fn = useServerFn(getSalesInvoice);
  const issue = useServerFn(issueSalesInvoice);
  const qc = useQueryClient();
  const { data: inv, isLoading } = useQuery({ queryKey: ["sales-invoice", id], queryFn: () => fn({ data: { id } }) });

  const m = useMutation({
    mutationFn: () => issue({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Đã phát hành: ${r.einvoice_code}`);
      qc.invalidateQueries({ queryKey: ["sales-invoice", id] });
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !inv) return <div className="p-8">Đang tải…</div>;

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/sales" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" />Quay lại
      </Link>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-bold">HÓA ĐƠN GIÁ TRỊ GIA TĂNG</h1>
            <p className="text-sm text-muted-foreground">Ký hiệu: {inv.invoice_series}{inv.invoice_no ? ` — Số: ${inv.invoice_no}` : ""}</p>
            {inv.einvoice_code && (
              <p className="mt-1 text-xs text-emerald-700">
                <CheckCircle2 className="inline h-3 w-3 mr-1" />Mã CQT: <span className="font-mono">{inv.einvoice_code}</span>
              </p>
            )}
          </div>
          <div className="text-right text-sm">
            <div>Ngày: {inv.issue_date}</div>
            <div className={inv.status === "issued" ? "text-emerald-600 font-semibold" : "text-amber-600"}>
              {inv.status === "issued" ? "Đã phát hành" : "Nháp"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Khách hàng:</span> {inv.customer_name}</div>
          <div><span className="text-muted-foreground">MST:</span> {inv.customer_tax_id ?? "—"}</div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-2 py-2 text-left">STT</th>
              <th className="px-2 py-2 text-left">Diễn giải</th>
              <th className="px-2 py-2 text-right">SL</th>
              <th className="px-2 py-2 text-right">Đơn giá</th>
              <th className="px-2 py-2 text-right">VAT %</th>
              <th className="px-2 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {(inv.sales_invoice_lines ?? []).map((l: any, i: number) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-2 py-2">{i + 1}</td>
                <td className="px-2 py-2">{l.description}</td>
                <td className="px-2 py-2 text-right">{l.qty}</td>
                <td className="px-2 py-2 text-right font-mono">{Number(l.unit_price).toLocaleString("vi-VN")}</td>
                <td className="px-2 py-2 text-right">{l.vat_rate}%</td>
                <td className="px-2 py-2 text-right font-mono">{Number(l.amount).toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span>Cộng tiền hàng:</span><span className="font-mono">{Number(inv.subtotal).toLocaleString("vi-VN")}</span></div>
            <div className="flex justify-between"><span>Thuế GTGT:</span><span className="font-mono">{Number(inv.vat_amount).toLocaleString("vi-VN")}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Tổng thanh toán:</span><span className="font-mono">{Number(inv.total).toLocaleString("vi-VN")}</span>
            </div>
          </div>
        </div>

        {inv.einvoice_qr && (
          <div className="mt-4 rounded border border-dashed border-border p-3 text-xs">
            <div className="text-muted-foreground">Tra cứu HĐĐT:</div>
            <a href={inv.einvoice_qr} target="_blank" rel="noreferrer" className="text-primary underline break-all">{inv.einvoice_qr}</a>
          </div>
        )}

        {inv.status !== "issued" && (
          <Button className="mt-6 w-full" onClick={() => m.mutate()} disabled={m.isPending}>
            <Send className="mr-2 h-4 w-4" />Phát hành hóa đơn điện tử & ghi sổ
          </Button>
        )}
      </div>
    </div>
  );
}

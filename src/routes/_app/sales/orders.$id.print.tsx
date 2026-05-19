import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSalesOrder } from "@/lib/sales-orders.functions";
import { getActiveTenant } from "@/lib/tenants.functions";

export const Route = createFileRoute("/_app/sales/orders/$id/print")({
  component: OrderPrintPage,
});

const fmt = (n: any) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));
const fmt2 = (n: any) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(n ?? 0));

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã duyệt",
  partial: "Giao một phần",
  fulfilled: "Hoàn thành",
  closed: "Đã đóng",
  cancelled: "Đã huỷ",
};

// Số tiền bằng chữ (VND)
function numberToVietnameseWords(num: number): string {
  if (!isFinite(num)) return "";
  num = Math.round(num);
  if (num === 0) return "Không đồng";
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const readTriplet = (n: number, full: boolean): string => {
    const tr = n.toString().padStart(3, "0");
    const h = +tr[0], t = +tr[1], u = +tr[2];
    const parts: string[] = [];
    if (full || h > 0) {
      parts.push(`${digits[h]} trăm`);
    }
    if (t > 1) {
      parts.push(`${digits[t]} mươi`);
      if (u === 1) parts.push("mốt");
      else if (u === 5) parts.push("lăm");
      else if (u > 0) parts.push(digits[u]);
    } else if (t === 1) {
      parts.push("mười");
      if (u === 5) parts.push("lăm");
      else if (u > 0) parts.push(digits[u]);
    } else if (t === 0) {
      if (u > 0) {
        if (full || h > 0) parts.push("lẻ");
        parts.push(digits[u]);
      }
    }
    return parts.join(" ").trim();
  };
  const units = ["", "nghìn", "triệu", "tỷ"];
  const groups: number[] = [];
  let n = num;
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0 && i !== 0) continue;
    const w = readTriplet(g, i !== groups.length - 1);
    if (w) words.push(`${w}${units[i] ? " " + units[i] : ""}`);
  }
  const s = words.join(" ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + " đồng";
}

function OrderPrintPage() {
  const { id } = Route.useParams();
  const getOrder = useServerFn(getSalesOrder);
  const getTenant = useServerFn(getActiveTenant);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["sales-order", id],
    queryFn: () => getOrder({ data: { id } }),
  });
  const { data: tenantRes } = useQuery<any>({
    queryKey: ["active-tenant"],
    queryFn: () => getTenant(),
  });

  if (isLoading || !data) return <div className="container py-8">Đang tải…</div>;

  const t = tenantRes?.tenant ?? {};
  const lines: any[] = data.sales_order_lines ?? [];
  const dt = data.order_date ? new Date(data.order_date) : new Date();

  const subtotal = lines.reduce((s, l) => s + Number(l.pre_vat_amount ?? l.amount ?? 0), 0);
  const discount = lines.reduce((s, l) => s + Number(l.discount_amount ?? 0), 0);
  const vat = lines.reduce((s, l) => s + Number(l.vat_amount ?? 0), 0);
  const total = Number(data.total ?? subtotal + vat);

  const depositRequired = Number(data.deposit_required ?? 0);
  const depositReceived = Number(data.deposit_received ?? 0);

  return (
    <div className="container mx-auto py-8 space-y-4 print:py-0 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/sales/orders/$id" params={{ id }}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Đơn đặt hàng</h1>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          In
        </Button>
      </div>

      <div className="bg-white p-10 print:p-0 max-w-5xl mx-auto text-[12px] leading-relaxed font-serif print:font-serif text-black">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="max-w-[60%]">
            <div className="font-bold uppercase text-[13px]">
              {t.company_name || t.name || "—"}
            </div>
            {t.address && <div>Địa chỉ: {t.address}</div>}
            <div className="flex gap-4 flex-wrap">
              {t.tax_id && <span>MST: {t.tax_id}</span>}
              {t.phone && <span>ĐT: {t.phone}</span>}
              {t.email && <span>Email: {t.email}</span>}
            </div>
          </div>
          <div className="text-right text-[11px]">
            <div>
              Số:{" "}
              <strong className="font-mono text-[12px]">{data.order_no}</strong>
            </div>
            <div>
              Ngày: {dt.getDate()}/{dt.getMonth() + 1}/{dt.getFullYear()}
            </div>
            {data.expected_delivery_date && (
              <div>Giao dự kiến: {data.expected_delivery_date}</div>
            )}
            {data.valid_until && <div>Hiệu lực đến: {data.valid_until}</div>}
          </div>
        </div>

        <h1 className="text-center font-bold text-2xl tracking-wide mt-6">
          ĐƠN ĐẶT HÀNG
        </h1>
        <div className="text-center italic mt-1">
          Số: <strong>{data.order_no}</strong> — Trạng thái:{" "}
          {STATUS_LABEL[data.status] ?? data.status}
        </div>

        {/* Customer info */}
        <div className="mt-5 border border-foreground/30 p-3 space-y-1">
          <div>
            <strong>Khách hàng:</strong>{" "}
            {data.customers?.name ?? data.customer_name ?? "—"}
            {data.customers?.code ? (
              <span className="text-[11px] ml-2">({data.customers.code})</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            {data.customer_tax_id && <div>MST: {data.customer_tax_id}</div>}
            {data.customers?.phone && <div>ĐT: {data.customers.phone}</div>}
            {data.customers?.email && <div>Email: {data.customers.email}</div>}
            {data.payment_terms && <div>Điều khoản TT: {data.payment_terms}</div>}
          </div>
          {data.ship_address && <div>Địa chỉ giao: {data.ship_address}</div>}
        </div>

        {/* Items table */}
        <table className="w-full mt-4 border-collapse text-[11px] [&_th]:border [&_td]:border [&_th]:border-foreground/40 [&_td]:border-foreground/40 [&_th]:bg-muted/30 [&_th]:p-1 [&_td]:p-1 [&_th]:font-semibold">
          <thead>
            <tr>
              <th className="w-8 text-center">STT</th>
              <th className="w-20">Mã</th>
              <th>Tên hàng hoá/dịch vụ</th>
              <th className="w-14">ĐVT</th>
              <th className="w-16 text-right">SL</th>
              <th className="w-24 text-right">Đơn giá</th>
              <th className="w-16 text-right">CK</th>
              <th className="w-28 text-right">Thành tiền</th>
              <th className="w-12 text-right">%VAT</th>
              <th className="w-24 text-right">Tiền VAT</th>
              <th className="w-28 text-right">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center italic p-3">
                  Chưa có hàng hoá
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              const pre = Number(l.pre_vat_amount ?? l.amount ?? 0);
              const v = Number(l.vat_amount ?? 0);
              return (
                <tr key={l.id}>
                  <td className="text-center">{i + 1}</td>
                  <td>{l.product_code ?? "—"}</td>
                  <td>{l.description}</td>
                  <td className="text-center">{l.unit ?? ""}</td>
                  <td className="text-right tabular-nums">
                    {fmt2(l.qty_ordered)}
                  </td>
                  <td className="text-right tabular-nums">
                    {fmt(l.unit_price)}
                  </td>
                  <td className="text-right tabular-nums">
                    {fmt(l.discount_amount)}
                  </td>
                  <td className="text-right tabular-nums">{fmt(pre)}</td>
                  <td className="text-right tabular-nums">
                    {l.vat_rate != null ? `${l.vat_rate}%` : ""}
                  </td>
                  <td className="text-right tabular-nums">{fmt(v)}</td>
                  <td className="text-right tabular-nums">{fmt(pre + v)}</td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td colSpan={6} className="text-right">
                Cộng
              </td>
              <td className="text-right tabular-nums">{fmt(discount)}</td>
              <td className="text-right tabular-nums">{fmt(subtotal)}</td>
              <td></td>
              <td className="text-right tabular-nums">{fmt(vat)}</td>
              <td className="text-right tabular-nums">{fmt(subtotal + vat)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals summary */}
        <div className="flex justify-end mt-3">
          <table className="text-[12px]">
            <tbody>
              <tr>
                <td className="pr-6">Cộng tiền hàng:</td>
                <td className="text-right tabular-nums min-w-[140px]">
                  {fmt(subtotal)}
                </td>
              </tr>
              {discount > 0 && (
                <tr>
                  <td className="pr-6">Chiết khấu:</td>
                  <td className="text-right tabular-nums">{fmt(discount)}</td>
                </tr>
              )}
              <tr>
                <td className="pr-6">Tiền thuế GTGT:</td>
                <td className="text-right tabular-nums">{fmt(vat)}</td>
              </tr>
              <tr className="font-bold text-[13px]">
                <td className="pr-6 pt-1 border-t border-foreground/40">
                  Tổng thanh toán:
                </td>
                <td className="text-right tabular-nums pt-1 border-t border-foreground/40">
                  {fmt(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-2 italic">
          Số tiền bằng chữ:{" "}
          <strong className="not-italic">{numberToVietnameseWords(total)}</strong>
        </div>

        {/* Deposit info (optional) */}
        {data.deposit_enabled && depositRequired > 0 && (
          <div className="mt-4 border border-foreground/30 p-2 text-[11px]">
            <strong>Đặt cọc:</strong> Yêu cầu {fmt(depositRequired)}
            {data.deposit_percent ? ` (${data.deposit_percent}%)` : ""} — Đã thu{" "}
            {fmt(depositReceived)} — Còn lại{" "}
            {fmt(Math.max(0, depositRequired - depositReceived))}
            {data.deposit_due_date && (
              <span> — Hạn cọc: {data.deposit_due_date}</span>
            )}
          </div>
        )}

        {/* Notes */}
        {data.notes && (
          <div className="mt-3">
            <strong>Ghi chú:</strong>
            <div className="border border-foreground/30 p-2 mt-1 whitespace-pre-wrap">
              {data.notes}
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-4 gap-4 pt-12 text-center text-[12px]">
          <div>
            <div className="font-bold">Khách hàng</div>
            <div className="italic text-[11px]">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Người lập</div>
            <div className="italic text-[11px]">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Kế toán trưởng</div>
            <div className="italic text-[11px]">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Giám đốc</div>
            <div className="italic text-[11px]">(Ký, họ tên, đóng dấu)</div>
          </div>
        </div>
      </div>

      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } body { background: white; } }`}</style>
    </div>
  );
}

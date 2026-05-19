import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSalesOrder } from "@/lib/sales-orders.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

export const Route = createFileRoute("/_app/sales/orders/$id")({
  component: OrderDetail,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp", confirmed: "Đã duyệt", partial: "Giao một phần",
  fulfilled: "Hoàn thành", closed: "Đã đóng", cancelled: "Đã huỷ",
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

function OrderDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getSalesOrder);
  const { data, isLoading } = useQuery<any>({
    queryKey: ["sales-order", id],
    queryFn: () => getFn({ data: { id } }),
  });

  if (isLoading) return <div className="p-6">Đang tải...</div>;
  if (!data) return <div className="p-6">Không tìm thấy đơn</div>;

  const lines = data.sales_order_lines ?? [];
  const invoices = data.invoices ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sales/orders"><ArrowLeft className="h-4 w-4 mr-1" /> Quay lại</Link>
        </Button>
        <h1 className="text-2xl font-semibold font-mono">{data.order_no}</h1>
        <Badge variant="secondary">{STATUS_LABEL[data.status] ?? data.status}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardContent className="p-4 space-y-1 text-sm">
          <div><span className="text-muted-foreground">Khách hàng:</span> <b>{data.customers?.name ?? data.customer_name ?? "—"}</b></div>
          <div><span className="text-muted-foreground">MST:</span> {data.customer_tax_id ?? "—"}</div>
          <div><span className="text-muted-foreground">Địa chỉ giao:</span> {data.ship_address ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 space-y-1 text-sm">
          <div><span className="text-muted-foreground">Ngày đặt:</span> {data.order_date}</div>
          <div><span className="text-muted-foreground">Ngày giao dự kiến:</span> {data.expected_delivery_date ?? "—"}</div>
          <div><span className="text-muted-foreground">Tổng giá trị:</span> <b>{fmt(Number(data.total))}</b></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Chi tiết hàng hoá</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Diễn giải</th>
                <th className="p-2 text-right">SL đặt</th>
                <th className="p-2 text-right">Đã giao</th>
                <th className="p-2 text-right">Đơn giá</th>
                <th className="p-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.line_no}</td>
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(l.qty_ordered))}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(l.qty_delivered))}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(l.unit_price))}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(l.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Hoá đơn đã xuất</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Chưa có hoá đơn nào từ đơn này</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Số HĐ</th>
                  <th className="p-2">Ngày</th>
                  <th className="p-2 text-right">Tổng</th>
                  <th className="p-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i: any) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-2 font-mono text-xs">
                      <Link to="/sales/$id" params={{ id: i.id }} className="hover:underline inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" />{i.invoice_no ?? i.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2">{i.issue_date}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(Number(i.total))}</td>
                    <td className="p-2">{i.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

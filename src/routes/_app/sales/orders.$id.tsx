import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getSalesOrder } from "@/lib/sales-orders.functions";
import {
  listSalesOrderDeposits, upsertSalesOrderDeposit, postSalesOrderDeposit,
  voidSalesOrderDeposit, deleteSalesOrderDeposit, listReservationsForOrder,
} from "@/lib/deposits.functions";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, Plus, Trash2, CheckCircle2, XCircle, Printer } from "lucide-react";

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
        <div className="ml-auto">
          <Button variant="outline" size="sm" asChild>
            <Link to="/sales/orders/$id/print" params={{ id }} target="_blank">
              <Printer className="h-4 w-4 mr-1" /> In
            </Link>
          </Button>
        </div>
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

      {data.deposit_enabled && <DepositSection orderId={id} required={Number(data.deposit_required || 0)} received={Number(data.deposit_received || 0)} status={data.deposit_status} />}
      {data.reserve_enabled && <ReservationSection orderId={id} />}



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

function DepositSection({ orderId, required, received, status }: { orderId: string; required: number; received: number; status: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSalesOrderDeposits);
  const upsertFn = useServerFn(upsertSalesOrderDeposit);
  const postFn = useServerFn(postSalesOrderDeposit);
  const voidFn = useServerFn(voidSalesOrderDeposit);
  const delFn = useServerFn(deleteSalesOrderDeposit);
  const { data: deposits = [] } = useQuery<any[]>({
    queryKey: ["so-deposits", orderId],
    queryFn: () => listFn({ data: { orderId } }) as Promise<any[]>,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["so-deposits", orderId] });
    qc.invalidateQueries({ queryKey: ["sales-order", orderId] });
  };
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState<number>(Math.max(0, required - received));
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [cashAccount, setCashAccount] = useState<string>("1111");
  const [advanceAccount, setAdvanceAccount] = useState<string>("131");
  const [reference, setReference] = useState("");

  const create = useMutation({
    mutationFn: () => upsertFn({ data: { order_id: orderId, pay_date: payDate, amount, method, reference, cash_account: cashAccount, advance_account: advanceAccount } }),
    onSuccess: () => { toast.success("Đã lưu phiếu cọc"); setShowForm(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });
  const postM = useMutation({
    mutationFn: (id: string) => postFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã ghi sổ"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });
  const voidM = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã huỷ"); refresh(); },
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const STATUS_BADGE: Record<string, string> = { none: "—", pending: "Chờ thu", partial: "Đã thu một phần", received: "Đã thu đủ" };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Đặt cọc</CardTitle>
        <Button size="sm" onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4 mr-1" /> Phiếu cọc</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground text-xs">Yêu cầu</div><div className="font-semibold tabular-nums">{fmt(required)}</div></div>
          <div><div className="text-muted-foreground text-xs">Đã thu</div><div className="font-semibold tabular-nums">{fmt(received)}</div></div>
          <div><div className="text-muted-foreground text-xs">Còn lại</div><div className="font-semibold tabular-nums">{fmt(Math.max(0, required - received))}</div></div>
          <div><div className="text-muted-foreground text-xs">Trạng thái</div><Badge variant="secondary">{STATUS_BADGE[status] ?? status}</Badge></div>
        </div>

        {showForm && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 border rounded-md">
            <div><Label className="text-xs">Ngày</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <div><Label className="text-xs">Số tiền</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div>
              <Label className="text-xs">PT thanh toán</Label>
              <select className="w-full h-10 border rounded-md px-2 bg-background text-sm" value={method} onChange={(e) => { const v = e.target.value as any; setMethod(v); setCashAccount(v === "cash" ? "1111" : "1121"); }}>
                <option value="cash">Tiền mặt</option><option value="bank">Ngân hàng</option>
              </select>
            </div>
            <div><Label className="text-xs">TK tiền</Label><AccountCombobox value={cashAccount} onChange={(v) => setCashAccount(v ?? "")} /></div>
            <div><Label className="text-xs">TK theo dõi cọc</Label><AccountCombobox value={advanceAccount} onChange={(v) => setAdvanceAccount(v ?? "131")} /></div>
            <div><Label className="text-xs">Tham chiếu</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <div className="md:col-span-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Huỷ</Button>
              <Button size="sm" disabled={create.isPending || amount <= 0} onClick={() => create.mutate()}>Lưu phiếu</Button>
            </div>
          </div>
        )}

        {deposits.length === 0 ? (
          <div className="text-sm text-muted-foreground">Chưa có phiếu cọc</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/40 text-left"><tr>
                <th className="p-2">Số phiếu</th><th className="p-2">Ngày</th><th className="p-2 text-right">Số tiền</th>
                <th className="p-2">PT</th><th className="p-2">Trạng thái</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{d.deposit_no}</td>
                    <td className="p-2">{d.pay_date}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(Number(d.amount))}</td>
                    <td className="p-2">{d.method === "cash" ? "Tiền mặt" : "NH"}</td>
                    <td className="p-2"><Badge variant={d.status === "posted" ? "default" : d.status === "void" ? "destructive" : "outline"}>{d.status}</Badge></td>
                    <td className="p-2 text-right space-x-1">
                      {d.status === "uploaded" && <Button size="sm" variant="outline" onClick={() => postM.mutate(d.id)}><CheckCircle2 className="h-3 w-3 mr-1" />Ghi sổ</Button>}
                      {d.status !== "void" && d.status === "posted" && <Button size="sm" variant="ghost" onClick={() => voidM.mutate(d.id)}><XCircle className="h-3 w-3 mr-1" />Huỷ</Button>}
                      {d.status !== "posted" && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Xoá phiếu cọc?")) delM.mutate(d.id); }}><Trash2 className="h-3 w-3" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReservationSection({ orderId }: { orderId: string }) {
  const listFn = useServerFn(listReservationsForOrder);
  const { data } = useQuery<any>({
    queryKey: ["so-reservations", orderId],
    queryFn: () => listFn({ data: { orderId } }),
  });
  const lines: any[] = data?.lines ?? [];
  const reservations: any[] = data?.reservations ?? [];
  const byLine = new Map(reservations.map((r) => [r.ref_id, r]));

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Giữ tồn kho</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-2">Diễn giải</th>
            <th className="p-2 text-right">SL đặt</th>
            <th className="p-2 text-right">Đã giao</th>
            <th className="p-2 text-right">Đang giữ</th>
            <th className="p-2">Trạng thái giữ</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => {
              const r = byLine.get(l.id);
              const reserved = r ? Number(r.qty_reserved) - Number(r.qty_released) : 0;
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(l.qty_ordered))}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(Number(l.qty_delivered))}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(reserved)}</td>
                  <td className="p-2">{r ? <Badge variant={r.status === "active" ? "default" : "outline"}>{r.status}</Badge> : <span className="text-xs text-muted-foreground">Chưa giữ</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

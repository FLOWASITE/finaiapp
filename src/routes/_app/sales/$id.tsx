import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Send, CheckCircle2, XCircle, Plus, Trash2, Wallet } from "lucide-react";
import { getSalesInvoice, issueSalesInvoice, voidSalesInvoice } from "@/lib/sales.functions";
import { recordReceipt, deleteReceipt } from "@/lib/receipts.functions";
import { getLinkedEInvoice } from "@/lib/einvoices.functions";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales/$id")({ component: SalesDetail });

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("vi-VN");
}

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-blue-100 text-blue-700",
  unpaid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-zinc-200 text-zinc-600",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Đã thu",
  partial: "Thu một phần",
  unpaid: "Chưa thu",
  overdue: "Quá hạn",
  void: "Đã hủy",
};

function SalesDetail() {
  const { id } = useParams({ from: "/_app/sales/$id" });
  const fn = useServerFn(getSalesInvoice);
  const issue = useServerFn(issueSalesInvoice);
  const voidFn = useServerFn(voidSalesInvoice);
  const linkedFn = useServerFn(getLinkedEInvoice);
  const qc = useQueryClient();
  const { data: inv, isLoading } = useQuery({
    queryKey: ["sales-invoice", id],
    queryFn: () => fn({ data: { id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: linked } = useQuery({
    queryKey: ["sales-einvoice", id],
    queryFn: () => linkedFn({ data: { kind: "out", invoiceId: id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const issueM = useMutation({
    mutationFn: () => issue({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Đã phát hành: ${r.einvoice_code}`);
      qc.invalidateQueries({ queryKey: ["sales-invoice", id] });
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const voidM = useMutation({
    mutationFn: (reason: string) => voidFn({ data: { id, reason } }),
    onSuccess: () => {
      toast.success("Đã hủy hóa đơn");
      qc.invalidateQueries({ queryKey: ["sales-invoice", id] });
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !inv) return <div className="p-8">Đang tải…</div>;

  const remaining = Number(inv.total) - Number(inv.paid_amount);
  const ps = inv.status === "void" ? "void" : inv.payment_status;

  return (
    <div className="p-8 max-w-5xl space-y-4">
      <Link
        to="/sales"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />Quay lại danh sách
      </Link>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-bold">HÓA ĐƠN GIÁ TRỊ GIA TĂNG</h1>
            <p className="text-sm text-muted-foreground">
              Ký hiệu: {inv.invoice_series ?? "—"}
              {inv.invoice_no ? ` — Số: ${inv.invoice_no}` : ""}
            </p>
            {inv.einvoice_code && (
              <p className="mt-1 text-xs text-emerald-700">
                <CheckCircle2 className="inline h-3 w-3 mr-1" />
                Mã CQT: <span className="font-mono">{inv.einvoice_code}</span>
              </p>
            )}
            {linked?.einvoice && (
              <Link
                to="/einvoices/$id"
                params={{ id: linked.einvoice.id }}
                className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
              >
                <FileText className="h-3 w-3" />
                Đã gắn HĐĐT: {linked.einvoice.invoice_series ?? ""}
                {linked.einvoice.invoice_no ?? ""}
              </Link>
            )}
          </div>
          <div className="text-right text-sm space-y-1">
            <div>Ngày HĐ: <strong>{inv.issue_date}</strong></div>
            {inv.due_date && <div>Hạn TT: <strong>{inv.due_date}</strong></div>}
            <div>
              {inv.status === "draft" ? (
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">Nháp</span>
              ) : (
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[ps] ?? ""}`}>
                  {STATUS_LABEL[ps] ?? ps}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Khách hàng:</span>{" "}
            <strong>{inv.customer_name ?? "—"}</strong>
          </div>
          <div><span className="text-muted-foreground">MST:</span> {inv.customer_tax_id ?? "—"}</div>
          {inv.customer_email && (
            <div><span className="text-muted-foreground">Email:</span> {inv.customer_email}</div>
          )}
          {inv.billing_address && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Địa chỉ:</span> {inv.billing_address}
            </div>
          )}
          {inv.currency && inv.currency !== "VND" && (
            <div>
              <span className="text-muted-foreground">Tiền tệ:</span> {inv.currency} (tỉ giá{" "}
              {fmt(inv.fx_rate)})
            </div>
          )}
        </div>

        <table className="mt-4 w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-2 py-2 text-left">STT</th>
              <th className="px-2 py-2 text-left">Diễn giải</th>
              <th className="px-2 py-2 text-right">SL</th>
              <th className="px-2 py-2 text-right">Đơn giá</th>
              <th className="px-2 py-2 text-right">CK %</th>
              <th className="px-2 py-2 text-right">Mã thuế</th>
              <th className="px-2 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {(inv.sales_invoice_lines ?? []).map((l: any, i: number) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-2 py-2">{i + 1}</td>
                <td className="px-2 py-2">{l.description}</td>
                <td className="px-2 py-2 text-right">{l.qty}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(l.unit_price)}</td>
                <td className="px-2 py-2 text-right">{l.line_discount_percent || 0}%</td>
                <td className="px-2 py-2 text-right font-mono">{l.vat_code}</td>
                <td className="px-2 py-2 text-right font-mono">{fmt(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-80 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Cộng tiền hàng:</span>
              <span className="font-mono">{fmt(inv.subtotal)}</span>
            </div>
            {(Number(inv.discount_percent) > 0 || Number(inv.discount_amount) > 0) && (
              <div className="flex justify-between text-muted-foreground">
                <span>Chiết khấu HĐ:</span>
                <span className="font-mono">
                  {inv.discount_percent}% + {fmt(inv.discount_amount)}
                </span>
              </div>
            )}
            {Number(inv.shipping_fee) > 0 && (
              <div className="flex justify-between">
                <span>Vận chuyển:</span>
                <span className="font-mono">{fmt(inv.shipping_fee)}</span>
              </div>
            )}
            {Number(inv.other_fees) > 0 && (
              <div className="flex justify-between">
                <span>Phí khác:</span>
                <span className="font-mono">{fmt(inv.other_fees)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Thuế GTGT:</span>
              <span className="font-mono">{fmt(inv.vat_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Tổng thanh toán:</span>
              <span className="font-mono">
                {fmt(inv.total)} {inv.currency}
              </span>
            </div>
            {inv.status === "issued" && (
              <>
                <div className="flex justify-between text-emerald-700">
                  <span>Đã thu:</span>
                  <span className="font-mono">{fmt(inv.paid_amount)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Còn phải thu:</span>
                  <span className="font-mono">{fmt(remaining)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {inv.einvoice_qr && (
          <div className="mt-4 rounded border border-dashed border-border p-3 text-xs">
            <div className="text-muted-foreground">Tra cứu HĐĐT:</div>
            <a
              href={inv.einvoice_qr}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline break-all"
            >
              {inv.einvoice_qr}
            </a>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {inv.status === "draft" && (
            <Button onClick={() => issueM.mutate()} disabled={issueM.isPending}>
              <Send className="mr-2 h-4 w-4" />Phát hành & ghi sổ
            </Button>
          )}
          {inv.status === "issued" && remaining > 0 && (
            <ReceiptDialog invoiceId={id} remaining={remaining} />
          )}
          {inv.status !== "void" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <XCircle className="mr-2 h-4 w-4" />Hủy HĐ
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hủy hóa đơn?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Hủy sẽ tạo bút toán đảo và hoàn nhập tồn kho. Hành động không thể quay lại.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Đóng</AlertDialogCancel>
                  <AlertDialogAction onClick={() => voidM.mutate("Hủy theo yêu cầu")}>
                    Xác nhận hủy
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Receipts panel */}
      {inv.status === "issued" && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-3">
            <Wallet className="mr-2 inline h-4 w-4" />Phiếu thu
          </h2>
          {(inv.customer_receipts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có phiếu thu nào</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-left">Phương thức</th>
                  <th className="px-3 py-2 text-left">Số chứng từ</th>
                  <th className="px-3 py-2 text-right">Số tiền</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {(inv.customer_receipts ?? []).map((r: any) => (
                  <ReceiptRow key={r.id} r={r} invoiceId={id} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ r, invoiceId }: { r: any; invoiceId: string }) {
  const del = useServerFn(deleteReceipt);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id: r.id } }),
    onSuccess: () => {
      toast.success("Đã hủy phiếu thu");
      qc.invalidateQueries({ queryKey: ["sales-invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const methodLabel: Record<string, string> = {
    cash: "Tiền mặt",
    bank: "Chuyển khoản",
    card: "Thẻ",
    other: "Khác",
  };
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">{r.pay_date}</td>
      <td className="px-3 py-2">{methodLabel[r.method] ?? r.method}</td>
      <td className="px-3 py-2 font-mono">{r.reference || "—"}</td>
      <td className="px-3 py-2 text-right font-mono">{Number(r.amount).toLocaleString("vi-VN")}</td>
      <td className="px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => m.mutate()}
          disabled={m.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

function ReceiptDialog({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const rec = useServerFn(recordReceipt);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    pay_date: new Date().toISOString().slice(0, 10),
    method: "bank" as "cash" | "bank" | "card" | "other",
    amount: remaining,
    reference: "",
    notes: "",
  });

  const m = useMutation({
    mutationFn: () =>
      rec({
        data: {
          invoice_id: invoiceId,
          pay_date: form.pay_date,
          method: form.method,
          amount: Number(form.amount),
          reference: form.reference || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Đã ghi nhận phiếu thu");
      qc.invalidateQueries({ queryKey: ["sales-invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      qc.invalidateQueries({ queryKey: ["sales-stats"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setForm((f) => ({ ...f, amount: remaining }));
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />Ghi phiếu thu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Phiếu thu tiền khách hàng</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ngày thu</Label>
              <Input
                type="date"
                value={form.pay_date}
                onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Phương thức</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setForm({ ...form, method: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Chuyển khoản (112)</SelectItem>
                  <SelectItem value="cash">Tiền mặt (111)</SelectItem>
                  <SelectItem value="card">Thẻ (112)</SelectItem>
                  <SelectItem value="other">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Số tiền (còn phải thu: {remaining.toLocaleString("vi-VN")})</Label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Số chứng từ (UNC, biên lai…)</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || form.amount <= 0}>
            Lưu phiếu thu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

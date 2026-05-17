import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listReceipts,
  listOutstandingInvoices,
  receiptsStats,
  recordReceipt,
  deleteReceipt,
} from "@/lib/receipts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Trash2, Download, Wallet, Banknote, CreditCard, FileText } from "lucide-react";

type ReceiptsSearch = { invoice?: string; customer?: string };

export const Route = createFileRoute("/_app/receipts/")({
  component: ReceiptsPage,
  validateSearch: (s: Record<string, unknown>): ReceiptsSearch => ({
    invoice: typeof s.invoice === "string" ? s.invoice : undefined,
    customer: typeof s.customer === "string" ? s.customer : undefined,
  }),
});

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => today().slice(0, 8) + "01";

const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank: "Chuyển khoản",
  card: "Thẻ",
  other: "Khác",
};

function ReceiptsPage() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const { invoice: invoiceParam, customer: customerParam } = Route.useSearch();
  const listFn = useServerFn(listReceipts);
  const statsFn = useServerFn(receiptsStats);
  const outFn = useServerFn(listOutstandingInvoices);
  const recordFn = useServerFn(recordReceipt);
  const delFn = useServerFn(deleteReceipt);

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [preselectInvoice, setPreselectInvoice] = useState<string | undefined>(undefined);

  // Auto-open dialog from ?invoice= or ?customer= query
  useEffect(() => {
    if (invoiceParam || customerParam) {
      setPreselectInvoice(invoiceParam);
      setOpenNew(true);
    }
  }, [invoiceParam, customerParam]);

  const filter = { from, to, method };
  const { data: rows = [] } = useQuery({
    queryKey: ["receipts", filter],
    queryFn: () => listFn({ data: filter }),
  });
  const { data: stats } = useQuery({
    queryKey: ["receipts-stats", from, to],
    queryFn: () => statsFn({ data: { from, to } }),
  });
  const { data: outstanding = [] } = useQuery({
    queryKey: ["outstanding-invoices"],
    queryFn: () => outFn(),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r: any) =>
      [r.customer_name, r.reference, r.notes, r.sales_invoices?.invoice_no]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(s)),
    );
  }, [rows, search]);

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá phiếu thu (đảo bút toán)");
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["receipts-stats"] });
      qc.invalidateQueries({ queryKey: ["outstanding-invoices"] });
    },
    onError: (e: any) => toast.error(e?.message || "Không xoá được"),
  });

  const exportCsv = () => {
    const header = [
      "Ngày", "Khách hàng", "Hoá đơn", "PT thanh toán",
      "Tham chiếu", "Số tiền", "Ghi chú",
    ];
    const lines = filtered.map((r: any) => [
      r.pay_date,
      r.customer_name ?? "",
      r.sales_invoices?.invoice_no ?? "",
      METHOD_LABEL[r.method] ?? r.method,
      r.reference ?? "",
      r.amount,
      (r.notes ?? "").replace(/\n/g, " "),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `phieu-thu_${from}_${to}.csv`;
    a.click();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phiếu thu khách hàng</h1>
          <p className="text-sm text-muted-foreground">
            Ghi nhận tiền vào, đối ứng công nợ TK 131 và xuất đối soát
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Xuất CSV
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> Tạo phiếu thu
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng thu kỳ</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats?.total ?? 0)}</div>
            <p className="text-xs text-muted-foreground">{stats?.count ?? 0} phiếu</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tiền mặt (111)</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats?.cash ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ngân hàng (112)</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats?.bank ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Công nợ còn lại (131)</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{fmt(stats?.outstanding ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hình thức</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="cash">Tiền mặt</SelectItem>
                <SelectItem value="bank">Chuyển khoản</SelectItem>
                <SelectItem value="card">Thẻ</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input
              placeholder="Khách hàng, số HĐ, tham chiếu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Ngày</th>
              <th className="px-4 py-2 text-left">Khách hàng</th>
              <th className="px-4 py-2 text-left">Hoá đơn</th>
              <th className="px-4 py-2 text-left">Hình thức</th>
              <th className="px-4 py-2 text-left">Tham chiếu</th>
              <th className="px-4 py-2 text-right">Số tiền</th>
              <th className="px-4 py-2 text-center">Đối soát</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: any) => {
              const inv = r.sales_invoices;
              const status = inv?.payment_status ?? "—";
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 whitespace-nowrap">{r.pay_date}</td>
                  <td className="px-4 py-2">{r.customer_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    {inv?.invoice_no ? (
                      <Link to="/sales/$id" params={{ id: r.invoice_id }} className="text-primary hover:underline">
                        {inv.invoice_no}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2">{METHOD_LABEL[r.method] ?? r.method}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.reference ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(r.amount)}</td>
                  <td className="px-4 py-2 text-center">
                    <PaymentBadge status={status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Xoá phiếu thu?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sẽ tạo bút toán đảo và cập nhật lại công nợ hoá đơn.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Huỷ</AlertDialogCancel>
                          <AlertDialogAction onClick={() => delMut.mutate(r.id)}>
                            Xoá
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  Không có phiếu thu trong kỳ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NewReceiptDialog
        open={openNew}
        onOpenChange={setOpenNew}
        outstanding={outstanding}
        onSubmit={async (payload) => {
          try {
            await recordFn({ data: payload });
            toast.success("Đã ghi nhận phiếu thu");
            setOpenNew(false);
            qc.invalidateQueries({ queryKey: ["receipts"] });
            qc.invalidateQueries({ queryKey: ["receipts-stats"] });
            qc.invalidateQueries({ queryKey: ["outstanding-invoices"] });
          } catch (e: any) {
            toast.error(e?.message || "Lỗi khi ghi nhận");
          }
        }}
      />
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Đã thu đủ", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    partial: { label: "Thu một phần", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    unpaid: { label: "Chưa thu", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    overdue: { label: "Quá hạn", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  };
  const info = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={info.cls}>{info.label}</Badge>;
}

function NewReceiptDialog({
  open,
  onOpenChange,
  outstanding,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  outstanding: any[];
  onSubmit: (p: any) => Promise<void>;
}) {
  const [invoiceId, setInvoiceId] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [method, setMethod] = useState<"cash" | "bank" | "card" | "other">("bank");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = outstanding.find((i) => i.id === invoiceId);
  const remaining = selected ? Number(selected.total) - Number(selected.paid_amount) : 0;

  const reset = () => {
    setInvoiceId(""); setAmount(""); setReference(""); setNotes("");
    setMethod("bank"); setPayDate(today());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo phiếu thu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Hoá đơn còn nợ *</Label>
            <Select value={invoiceId} onValueChange={(v) => {
              setInvoiceId(v);
              const inv = outstanding.find((i) => i.id === v);
              if (inv) setAmount(String(Number(inv.total) - Number(inv.paid_amount)));
            }}>
              <SelectTrigger><SelectValue placeholder="Chọn hoá đơn..." /></SelectTrigger>
              <SelectContent>
                {outstanding.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Không có hoá đơn còn nợ
                  </div>
                )}
                {outstanding.map((inv) => {
                  const rem = Number(inv.total) - Number(inv.paid_amount);
                  return (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_no ?? "—"} · {inv.customer_name ?? "?"} · còn {fmt(rem)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Tổng HĐ {fmt(selected.total)} · đã thu {fmt(selected.paid_amount)} ·{" "}
                <span className="text-amber-600 font-medium">còn lại {fmt(remaining)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ngày thu *</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hình thức *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Tiền mặt (111)</SelectItem>
                  <SelectItem value="bank">Chuyển khoản (112)</SelectItem>
                  <SelectItem value="card">Thẻ (112)</SelectItem>
                  <SelectItem value="other">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Số tiền *</Label>
              {selected && remaining > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setAmount(String(remaining))}
                >
                  Lấy số còn lại ({fmt(remaining)})
                </Button>
              )}
            </div>
            <Input
              type="number"
              min={0}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="font-mono"
            />
            {amount && Number(amount) > 0 && (
              <p className="text-xs text-muted-foreground">
                {fmt(Number(amount))} đ
                {selected && Number(amount) > remaining + 0.01 && (
                  <span className="ml-2 text-rose-600 font-medium">
                    Vượt công nợ còn lại
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Số tham chiếu (UNC, sao kê, mã GD...)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: UNC-2026/05/0123"
              maxLength={255}
            />
          </div>

          <div className="space-y-1">
            <Label>Ghi chú</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Diễn giải nội dung thu tiền..."
              rows={2}
              maxLength={500}
            />
          </div>

          {amount && Number(amount) > 0 && (
            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-medium text-foreground">Bút toán đối ứng</div>
              <div className="flex justify-between font-mono">
                <span>Nợ {method === "cash" ? "111" : "112"} — {method === "cash" ? "Tiền mặt" : "Tiền gửi NH"}</span>
                <span>{fmt(Number(amount))}</span>
              </div>
              <div className="flex justify-between font-mono text-muted-foreground">
                <span>     Có 131 — Phải thu khách hàng</span>
                <span>{fmt(Number(amount))}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            disabled={!invoiceId || !amount || submitting || Number(amount) <= 0 || (selected && Number(amount) > remaining + 0.01)}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit({
                  invoice_id: invoiceId,
                  pay_date: payDate,
                  method,
                  amount: Number(amount),
                  reference: reference || null,
                  notes: notes || null,
                });
                reset();
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Đang lưu..." : "Ghi nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

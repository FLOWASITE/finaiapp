import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Plus,
  FileText,
  Trash2,
  Search,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Receipt,
} from "lucide-react";
import {
  listSalesInvoices,
  upsertSalesInvoice,
  salesDashboardStats,
} from "@/lib/sales.functions";
import { listProducts } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CustomerCombobox, type CustomerLite } from "@/components/customer-combobox";
import { VAT_CODES, type VatCode, calcLineTax } from "@/lib/vat-codes";

export const Route = createFileRoute("/_app/sales/")({ component: SalesPage });

type EditorLine = {
  product_id?: string | null;
  description: string;
  qty: number;
  unit_price: number;
  vat_code: VatCode;
  line_discount_percent: number;
  line_discount_amount: number;
};

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-blue-100 text-blue-700",
  unpaid: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-zinc-200 text-zinc-600 line-through",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Đã thu",
  partial: "Thu một phần",
  unpaid: "Chưa thu",
  overdue: "Quá hạn",
  void: "Đã hủy",
};

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("vi-VN");
}

function SalesPage() {
  const list = useServerFn(listSalesInvoices);
  const stats = useServerFn(salesDashboardStats);
  const { data: invoices } = useQuery({ queryKey: ["sales-invoices"], queryFn: () => list({}) });
  const { data: kpi } = useQuery({ queryKey: ["sales-stats"], queryFn: () => stats({}) });
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (invoices ?? []).filter((inv: any) => {
      if (filterStatus !== "all" && inv.payment_status !== filterStatus) return false;
      if (!term) return true;
      return (
        (inv.customer_name ?? "").toLowerCase().includes(term) ||
        (inv.einvoice_code ?? "").toLowerCase().includes(term) ||
        (inv.invoice_no ?? "").toLowerCase().includes(term) ||
        (inv.customer_tax_id ?? "").toLowerCase().includes(term)
      );
    });
  }, [invoices, q, filterStatus]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bán hàng</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý hóa đơn bán ra, doanh thu & công nợ phải thu
          </p>
        </div>
        <NewInvoiceDialog />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          label="Doanh thu tháng này"
          value={fmt(kpi?.revenue_month)}
          sub={`${kpi?.invoices_month ?? 0} hóa đơn`}
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5 text-blue-600" />}
          label="Phải thu tháng này"
          value={fmt(kpi?.outstanding)}
          sub="Tổng còn phải thu"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          label="Công nợ quá hạn"
          value={fmt(kpi?.overdue)}
          sub="Cần đôn đốc"
          tone={Number(kpi?.overdue ?? 0) > 0 ? "danger" : undefined}
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5 text-violet-600" />}
          label="Đã thu (luỹ kế)"
          value={fmt(Number(kpi?.revenue_month ?? 0) - Number(kpi?.outstanding ?? 0))}
          sub="Tháng này"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm theo khách, số HĐ, mã CQT, MST…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="unpaid">Chưa thu</SelectItem>
            <SelectItem value="partial">Thu một phần</SelectItem>
            <SelectItem value="paid">Đã thu</SelectItem>
            <SelectItem value="overdue">Quá hạn</SelectItem>
            <SelectItem value="void">Đã hủy</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Ngày</th>
              <th className="px-4 py-2 text-left">Số HĐ</th>
              <th className="px-4 py-2 text-left">Khách hàng</th>
              <th className="px-4 py-2 text-left">Hạn TT</th>
              <th className="px-4 py-2 text-right">Tổng</th>
              <th className="px-4 py-2 text-right">Đã thu</th>
              <th className="px-4 py-2 text-right">Còn lại</th>
              <th className="px-4 py-2 text-left">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv: any) => {
              const remaining = Number(inv.total) - Number(inv.paid_amount);
              const ps = inv.status === "void" ? "void" : inv.payment_status;
              return (
                <tr key={inv.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 whitespace-nowrap">{inv.issue_date}</td>
                  <td className="px-4 py-2 font-mono">
                    <Link
                      to="/sales/$id"
                      params={{ id: inv.id }}
                      className="text-primary hover:underline"
                    >
                      {inv.einvoice_code || inv.invoice_no || "(nháp)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{inv.customer_name || "—"}</div>
                    {inv.customers?.code && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {inv.customers.code}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{inv.due_date || "—"}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(inv.total)}</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-700">
                    {fmt(inv.paid_amount)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {remaining > 0 ? fmt(remaining) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {inv.status === "draft" ? (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        Nháp
                      </span>
                    ) : (
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[ps] ?? ""}`}>
                        {STATUS_LABEL[ps] ?? ps}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  Không có hóa đơn nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold font-mono ${tone === "danger" ? "text-red-600" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function NewInvoiceDialog() {
  const upsert = useServerFn(upsertSalesInvoice);
  const list = useServerFn(listProducts);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => list({}),
    enabled: open,
  });

  const today = new Date().toISOString().slice(0, 10);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [head, setHead] = useState({
    issue_date: today,
    due_date: "",
    payment_terms_days: 30,
    currency: "VND",
    fx_rate: 1,
    discount_percent: 0,
    discount_amount: 0,
    shipping_fee: 0,
    other_fees: 0,
    notes: "",
    billing_address: "",
    customer_email: "",
  });
  const [lines, setLines] = useState<EditorLine[]>([
    {
      description: "",
      qty: 1,
      unit_price: 0,
      vat_code: "10",
      line_discount_percent: 0,
      line_discount_amount: 0,
    },
  ]);

  // Auto sync customer to head when picked
  const onPickCustomer = (c: CustomerLite | null) => {
    setCustomer(c);
    if (c) {
      setHead((h) => ({
        ...h,
        payment_terms_days: c.payment_terms_days ?? h.payment_terms_days,
        currency: c.currency || h.currency,
        customer_email: c.email || h.customer_email,
        billing_address: c.address || h.billing_address,
      }));
    }
  };

  // Compute totals client-side preview
  const totals = useMemo(() => {
    let preVat = 0,
      vat = 0;
    for (const l of lines) {
      const t = calcLineTax({
        qty: l.qty,
        unit_price: l.unit_price,
        line_discount_percent: l.line_discount_percent,
        line_discount_amount: l.line_discount_amount,
        vat_code: l.vat_code,
      });
      preVat += t.pre_vat_amount;
      vat += t.line_vat_amount;
    }
    const headerDisc = Math.min(
      preVat,
      preVat * (head.discount_percent / 100) + head.discount_amount,
    );
    const subtotal = Math.max(0, preVat - headerDisc);
    const vatScaled = preVat > 0 ? vat * (subtotal / preVat) : 0;
    const total = subtotal + vatScaled + Number(head.shipping_fee) + Number(head.other_fees);
    return { subtotal, vat: vatScaled, total };
  }, [lines, head]);

  const m = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          customer_id: customer?.id ?? null,
          customer_name: customer?.name,
          customer_tax_id: customer?.tax_id ?? null,
          customer_email: head.customer_email || null,
          billing_address: head.billing_address || null,
          issue_date: head.issue_date,
          due_date: head.due_date || null,
          payment_terms_days: head.payment_terms_days,
          currency: head.currency,
          fx_rate: head.fx_rate,
          discount_percent: head.discount_percent,
          discount_amount: head.discount_amount,
          shipping_fee: head.shipping_fee,
          other_fees: head.other_fees,
          notes: head.notes || null,
          lines: lines.map((l) => ({
            ...l,
            product_id: l.product_id || null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu hóa đơn nháp");
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      qc.invalidateQueries({ queryKey: ["sales-stats"] });
      setOpen(false);
      setCustomer(null);
      setLines([
        {
          description: "",
          qty: 1,
          unit_price: 0,
          vat_code: "10",
          line_discount_percent: 0,
          line_discount_amount: 0,
        },
      ]);
      setHead({
        issue_date: today,
        due_date: "",
        payment_terms_days: 30,
        currency: "VND",
        fx_rate: 1,
        discount_percent: 0,
        discount_amount: 0,
        shipping_fee: 0,
        other_fees: 0,
        notes: "",
        billing_address: "",
        customer_email: "",
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />Tạo HĐ bán
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <FileText className="mr-2 inline h-4 w-4" />
            Hóa đơn bán hàng (nháp)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer & header */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Khách hàng *</Label>
              <CustomerCombobox value={customer?.id ?? null} onChange={onPickCustomer} />
            </div>
            <div>
              <Label>Email gửi HĐ</Label>
              <Input
                type="email"
                value={head.customer_email}
                onChange={(e) => setHead({ ...head, customer_email: e.target.value })}
              />
            </div>
            <div>
              <Label>Ngày HĐ</Label>
              <Input
                type="date"
                value={head.issue_date}
                onChange={(e) => setHead({ ...head, issue_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Hạn TT (ngày)</Label>
              <Input
                type="number"
                value={head.payment_terms_days}
                onChange={(e) =>
                  setHead({ ...head, payment_terms_days: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Ngày đến hạn</Label>
              <Input
                type="date"
                value={head.due_date}
                onChange={(e) => setHead({ ...head, due_date: e.target.value })}
                placeholder="Tự tính từ hạn TT"
              />
            </div>
            <div>
              <Label>Tiền tệ</Label>
              <Select value={head.currency} onValueChange={(v) => setHead({ ...head, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">VND</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="JPY">JPY</SelectItem>
                  <SelectItem value="CNY">CNY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tỉ giá quy đổi</Label>
              <Input
                type="number"
                step="0.0001"
                value={head.fx_rate}
                disabled={head.currency === "VND"}
                onChange={(e) => setHead({ ...head, fx_rate: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-3">
              <Label>Địa chỉ giao hàng</Label>
              <Input
                value={head.billing_address}
                onChange={(e) => setHead({ ...head, billing_address: e.target.value })}
              />
            </div>
          </div>

          {/* Lines */}
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-2 py-2 text-left w-32">Mã SP</th>
                  <th className="px-2 py-2 text-left">Diễn giải</th>
                  <th className="px-2 py-2 w-16">SL</th>
                  <th className="px-2 py-2 w-28">Đơn giá</th>
                  <th className="px-2 py-2 w-20">CK %</th>
                  <th className="px-2 py-2 w-32">Mã thuế</th>
                  <th className="px-2 py-2 text-right w-32">Thành tiền</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const t = calcLineTax({
                    qty: l.qty,
                    unit_price: l.unit_price,
                    line_discount_percent: l.line_discount_percent,
                    line_discount_amount: l.line_discount_amount,
                    vat_code: l.vat_code,
                  });
                  const upd = (patch: Partial<EditorLine>) => {
                    const c = [...lines];
                    c[i] = { ...c[i], ...patch };
                    setLines(c);
                  };
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">
                        <Select
                          value={l.product_id ?? ""}
                          onValueChange={(v) => {
                            const p = products?.find((x) => x.id === v);
                            upd({
                              product_id: v,
                              description: p?.name ?? l.description,
                              unit_price: p?.unit_price ?? l.unit_price,
                              vat_code: ((p?.vat_rate ?? 10).toString() as VatCode),
                            });
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {(products ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8"
                          value={l.description}
                          onChange={(e) => upd({ description: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8"
                          type="number"
                          value={l.qty}
                          onChange={(e) => upd({ qty: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8"
                          type="number"
                          value={l.unit_price}
                          onChange={(e) => upd({ unit_price: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8"
                          type="number"
                          value={l.line_discount_percent}
                          onChange={(e) =>
                            upd({ line_discount_percent: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Select
                          value={l.vat_code}
                          onValueChange={(v) => upd({ vat_code: v as VatCode })}
                        >
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {VAT_CODES.map((v) => (
                              <SelectItem key={v.code} value={v.code}>
                                {v.code === "0" || v.code === "5" || v.code === "8" || v.code === "10"
                                  ? `${v.code}%`
                                  : v.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1 text-right font-mono">
                        {fmt(t.line_total)}
                      </td>
                      <td className="px-2 py-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setLines(lines.filter((_, j) => j !== i))}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button
              variant="ghost"
              size="sm"
              className="m-2"
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    description: "",
                    qty: 1,
                    unit_price: 0,
                    vat_code: "10",
                    line_discount_percent: 0,
                    line_discount_amount: 0,
                  },
                ])
              }
            >
              <Plus className="mr-1 h-3 w-3" />Thêm dòng
            </Button>
          </div>

          {/* Footer */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Textarea
                rows={4}
                value={head.notes}
                onChange={(e) => setHead({ ...head, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2 items-center">
                <Label>Chiết khấu HĐ %</Label>
                <Input
                  type="number"
                  className="h-8"
                  value={head.discount_percent}
                  onChange={(e) =>
                    setHead({ ...head, discount_percent: Number(e.target.value) })
                  }
                />
                <Label>Chiết khấu HĐ (tiền)</Label>
                <Input
                  type="number"
                  className="h-8"
                  value={head.discount_amount}
                  onChange={(e) =>
                    setHead({ ...head, discount_amount: Number(e.target.value) })
                  }
                />
                <Label>Phí vận chuyển</Label>
                <Input
                  type="number"
                  className="h-8"
                  value={head.shipping_fee}
                  onChange={(e) => setHead({ ...head, shipping_fee: Number(e.target.value) })}
                />
                <Label>Phí khác</Label>
                <Input
                  type="number"
                  className="h-8"
                  value={head.other_fees}
                  onChange={(e) => setHead({ ...head, other_fees: Number(e.target.value) })}
                />
              </div>
              <div className="border-t border-border pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Cộng tiền hàng:</span>
                  <span className="font-mono">{fmt(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Thuế GTGT:</span>
                  <span className="font-mono">{fmt(totals.vat)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-border pt-1">
                  <span>Tổng thanh toán:</span>
                  <span className="font-mono">
                    {fmt(totals.total)} {head.currency}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => m.mutate()}
            disabled={m.isPending || !customer || lines.some((l) => !l.description)}
          >
            Lưu nháp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

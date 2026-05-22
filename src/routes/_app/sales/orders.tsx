import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { toast } from "sonner";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { Plus, Search, Trash2, FileText, CheckCircle2, XCircle, MoreHorizontal, Pencil } from "lucide-react";
import {
  listSalesOrders,
  upsertSalesOrder,
  confirmSalesOrder,
  cancelSalesOrder,
  closeSalesOrder,
  deleteSalesOrder,
  salesOrderStats,
  getSalesOrder,
} from "@/lib/sales-orders.functions";
import { listProducts } from "@/lib/inventory.functions";
import { CustomerCombobox, type CustomerLite } from "@/components/customer-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/sales/orders")({
  component: SalesOrdersPage,
});

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Nháp", variant: "outline" },
  confirmed: { label: "Đã duyệt", variant: "secondary" },
  partial: { label: "Giao một phần", variant: "secondary" },
  fulfilled: { label: "Hoàn thành", variant: "default" },
  closed: { label: "Đã đóng", variant: "outline" },
  cancelled: { label: "Đã huỷ", variant: "destructive" },
};

type LineForm = {
  product_id?: string | null;
  description: string;
  unit?: string;
  qty_ordered: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
};

const emptyLine = (): LineForm => ({
  description: "",
  unit: "",
  qty_ordered: 1,
  unit_price: 0,
  discount_percent: 0,
  vat_rate: 10,
});

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function SalesOrdersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSalesOrders);
  const stats = useServerFn(salesOrderStats);
  const upsert = useServerFn(upsertSalesOrder);
  const confirmFn = useServerFn(confirmSalesOrder);
  const cancelFn = useServerFn(cancelSalesOrder);
  const closeFn = useServerFn(closeSalesOrder);
  const removeFn = useServerFn(deleteSalesOrder);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: rowsResp, isLoading } = useQuery({
    queryKey: ["sales-orders", { search, statusFilter }],
    queryFn: () =>
      list({
        data: {
          search: search || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
        },
      }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: kpi } = useQuery({
    queryKey: ["sales-orders-stats"],
    queryFn: () => stats({ data: {} }) as Promise<{ count: number; value: number; partial: number; fulfilled: number; draft: number; confirmed: number }>,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const rows: any[] = (rowsResp as any)?.rows ?? [];

  const upsertMut = useMutation({
    mutationFn: (input: any) => upsert({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["sales-orders-stats"] });
      toast.success("Đã lưu đơn đặt hàng");
      setOpenForm(false);
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi lưu đơn"),
  });

  const action = (fn: any, msg: string) =>
    useMutation({
      mutationFn: (id: string) => fn({ data: { id } }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["sales-orders"] });
        toast.success(msg);
      },
      onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
    });

  const confirmMut = action(confirmFn, "Đã duyệt đơn");
  const closeMut = action(closeFn, "Đã đóng đơn");
  const removeMut = action(removeFn, "Đã xoá đơn");
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      toast.success("Đã huỷ đơn");
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi huỷ đơn"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Đơn đặt hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý cam kết bán hàng & theo dõi tiến độ giao</p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setOpenForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Đơn mới
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Tổng đơn" value={kpi?.count ?? 0} />
        <KpiCard label="Giá trị cam kết" value={fmt(Number(kpi?.value ?? 0))} />
        <KpiCard label="Đang giao" value={kpi?.partial ?? 0} sub="đơn" />
        <KpiCard label="Hoàn thành" value={kpi?.fulfilled ?? 0} sub="đơn" />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo số đơn / khách hàng..."
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-2">Số đơn</th>
                <th className="p-2">Ngày</th>
                <th className="p-2">Khách hàng</th>
                <th className="p-2 text-right">Giá trị</th>
                <th className="p-2 w-40">Tiến độ</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Đang tải...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Chưa có đơn đặt hàng</td></tr>
              ) : (
                rows.map((r: any) => {
                  const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.draft;
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">
                        <Link to="/sales/orders/$id" params={{ id: r.id }} className="hover:underline">
                          {r.order_no}
                        </Link>
                      </td>
                      <td className="p-2">{r.order_date}</td>
                      <td className="p-2">{r.customers?.name ?? r.customer_name ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums">{fmt(Number(r.total || 0))}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${r.progress ?? 0}%` }} />
                          </div>
                          <span className="text-xs tabular-nums w-10 text-right">{Math.round(r.progress ?? 0)}%</span>
                        </div>
                      </td>
                      <td className="p-2"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="p-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/sales/orders/$id" params={{ id: r.id }}>
                                <FileText className="h-4 w-4 mr-2" /> Xem chi tiết
                              </Link>
                            </DropdownMenuItem>
                            {r.status === "draft" && (
                              <>
                                <DropdownMenuItem onClick={() => { setEditingId(r.id); setOpenForm(true); }}>
                                  <Pencil className="h-4 w-4 mr-2" /> Sửa
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => confirmMut.mutate(r.id)}>
                                  <CheckCircle2 className="h-4 w-4 mr-2" /> Duyệt
                                </DropdownMenuItem>
                              </>
                            )}
                            {(r.status === "confirmed" || r.status === "partial") && (
                              <DropdownMenuItem onClick={() => closeMut.mutate(r.id)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Đóng đơn
                              </DropdownMenuItem>
                            )}
                            {r.status !== "cancelled" && r.status !== "fulfilled" && (
                              <DropdownMenuItem onClick={() => cancelMut.mutate(r.id)}>
                                <XCircle className="h-4 w-4 mr-2" /> Huỷ
                              </DropdownMenuItem>
                            )}
                            {r.status === "draft" && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Xoá đơn nháp này?")) removeMut.mutate(r.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Xoá
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <OrderFormDialog
        open={openForm}
        onOpenChange={(v) => {
          setOpenForm(v);
          if (!v) setEditingId(null);
        }}
        editingId={editingId}
        onSubmit={(payload) => upsertMut.mutate(payload)}
        submitting={upsertMut.isPending}
      />
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">
          {value} {sub && <span className="text-xs text-muted-foreground font-normal">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderFormDialog({
  open,
  onOpenChange,
  editingId,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingId: string | null;
  onSubmit: (payload: any) => void;
  submitting: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [orderDate, setOrderDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState("");
  const [shipAddress, setShipAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [reserveEnabled, setReserveEnabled] = useState(false);
  const [depositRequired, setDepositRequired] = useState<number>(0);
  const [depositPercent, setDepositPercent] = useState<number | "">("");
  const [depositDueDate, setDepositDueDate] = useState("");

  const products = useServerFn(listProducts);
  const { data: productList } = useQuery({
    queryKey: ["products-light"],
    queryFn: () => products({}),
    ...QUERY_PRESETS.REFERENCE,
  });

  // Load existing order when editing
  const getOrderFn = useServerFn(getSalesOrder);
  const { data: existing } = useQuery<any>({
    queryKey: ["sales-order", editingId],
    queryFn: () => getOrderFn({ data: { id: editingId! } }),
    enabled: !!editingId && open,
  });

  // Hydrate when existing arrives
  useMemo(() => {
    if (existing && editingId) {
      setOrderDate(existing.order_date);
      setExpectedDate(existing.expected_delivery_date ?? "");
      setShipAddress(existing.ship_address ?? "");
      setNotes(existing.notes ?? "");
      setDepositEnabled(!!existing.deposit_enabled);
      setReserveEnabled(!!existing.reserve_enabled);
      setDepositRequired(Number(existing.deposit_required ?? 0));
      setDepositPercent(existing.deposit_percent != null ? Number(existing.deposit_percent) : "");
      setDepositDueDate(existing.deposit_due_date ?? "");
      if (existing.customer_id) {
        setCustomer({
          id: existing.customer_id,
          code: null,
          name: existing.customer_name ?? existing.customers?.name ?? "",
          tax_id: existing.customer_tax_id ?? null,
          email: existing.customers?.email ?? null,
          address: null,
          payment_terms_days: existing.payment_terms_days ?? 0,
          currency: existing.currency ?? "VND",
        });
      }
      setLines(
        (existing.sales_order_lines ?? []).map((l: any) => ({
          product_id: l.product_id,
          description: l.description,
          unit: l.unit ?? "",
          qty_ordered: Number(l.qty_ordered),
          unit_price: Number(l.unit_price),
          discount_percent: Number(l.discount_percent),
          vat_rate: Number(l.vat_rate),
        })),
      );
    } else if (!editingId && open) {
      setCustomer(null);
      setOrderDate(today);
      setExpectedDate("");
      setShipAddress("");
      setNotes("");
      setLines([emptyLine()]);
      setDepositEnabled(false);
      setReserveEnabled(false);
      setDepositRequired(0);
      setDepositPercent("");
      setDepositDueDate("");
    }
  }, [existing, editingId, open]);

  const totals = useMemo(() => {
    let sub = 0, vat = 0;
    for (const l of lines) {
      const gross = l.qty_ordered * l.unit_price;
      const disc = gross * (l.discount_percent / 100);
      const pre = Math.max(0, gross - disc);
      sub += pre;
      vat += pre * (l.vat_rate / 100);
    }
    return { sub, vat, total: sub + vat };
  }, [lines]);

  function updateLine(i: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(status: "draft" | "confirmed") {
    if (!customer) return toast.error("Chọn khách hàng");
    const validLines = lines.filter((l) => l.description && l.qty_ordered > 0);
    if (validLines.length === 0) return toast.error("Thêm ít nhất 1 dòng hàng hoá");
    onSubmit({
      id: editingId || undefined,
      order_date: orderDate,
      expected_delivery_date: expectedDate || null,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_tax_id: customer.tax_id,
      ship_address: shipAddress || null,
      currency: "VND",
      fx_rate: 1,
      payment_terms_days: customer.payment_terms_days ?? null,
      notes: notes || null,
      status,
      deposit_enabled: depositEnabled,
      reserve_enabled: reserveEnabled,
      deposit_required: depositEnabled ? Number(depositRequired || 0) : 0,
      deposit_percent: depositEnabled && depositPercent !== "" ? Number(depositPercent) : null,
      deposit_due_date: depositEnabled ? (depositDueDate || null) : null,
      lines: validLines.map((l, idx) => ({
        line_no: idx + 1,
        product_id: l.product_id || null,
        description: l.description,
        unit: l.unit || null,
        qty_ordered: l.qty_ordered,
        unit_price: l.unit_price,
        discount_percent: l.discount_percent,
        discount_amount: 0,
        vat_rate: l.vat_rate,
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Sửa đơn đặt hàng" : "Đơn đặt hàng mới"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>Khách hàng *</Label>
              <CustomerCombobox value={customer?.id ?? null} onChange={setCustomer} />
            </div>
            <div>
              <Label>Ngày đặt *</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div>
              <Label>Ngày giao dự kiến</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Địa chỉ giao hàng</Label>
              <Input value={shipAddress} onChange={(e) => setShipAddress(e.target.value)} placeholder="Địa chỉ giao..." />
            </div>
          </div>

          {/* Tuỳ chọn: đặt cọc & giữ kho */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={depositEnabled} onChange={(e) => setDepositEnabled(e.target.checked)} />
                  Yêu cầu đặt cọc
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={reserveEnabled} onChange={(e) => setReserveEnabled(e.target.checked)} />
                  Giữ tồn kho khi xác nhận
                </label>
              </div>
              {depositEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Tỉ lệ cọc (%)</Label>
                    <Input type="number" value={depositPercent} onChange={(e) => {
                      const v = e.target.value === "" ? "" : Number(e.target.value);
                      setDepositPercent(v);
                      if (v !== "") setDepositRequired(Math.round(totals.total * (Number(v) / 100)));
                    }} placeholder="VD: 30" />
                  </div>
                  <div>
                    <Label className="text-xs">Số tiền cọc</Label>
                    <Input type="number" value={depositRequired} onChange={(e) => setDepositRequired(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">Hạn nộp cọc</Label>
                    <Input type="date" value={depositDueDate} onChange={(e) => setDepositDueDate(e.target.value)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lines - desktop table */}
          <div className="hidden md:block border rounded-md overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Sản phẩm</th>
                  <th className="p-2">Diễn giải</th>
                  <th className="p-2 w-20">ĐVT</th>
                  <th className="p-2 w-20 text-right">SL</th>
                  <th className="p-2 w-28 text-right">Đơn giá</th>
                  <th className="p-2 w-16 text-right">% CK</th>
                  <th className="p-2 w-16 text-right">% VAT</th>
                  <th className="p-2 w-28 text-right">Thành tiền</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const gross = l.qty_ordered * l.unit_price;
                  const pre = Math.max(0, gross - gross * (l.discount_percent / 100));
                  const amount = pre + pre * (l.vat_rate / 100);
                  return (
                    <tr key={i} className="border-t">
                      <td className="p-1">
                        <Select
                          value={l.product_id ?? ""}
                          onValueChange={(v) => {
                            const p = (productList ?? []).find((x: any) => x.id === v);
                            updateLine(i, {
                              product_id: v,
                              description: p?.name ?? l.description,
                              unit: p?.unit ?? l.unit,
                              unit_price: Number(p?.unit_price ?? l.unit_price),
                            });
                          }}
                        >
                          <SelectTrigger className="h-8"><SelectValue placeholder="Chọn..." /></SelectTrigger>
                          <SelectContent>
                            {(productList ?? []).slice(0, 200).map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1">
                        <Input className="h-8" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                      </td>
                      <td className="p-1">
                        <Input className="h-8" value={l.unit ?? ""} onChange={(e) => updateLine(i, { unit: e.target.value })} />
                      </td>
                      <td className="p-1">
                        <Input className="h-8 text-right" type="number" value={l.qty_ordered} onChange={(e) => updateLine(i, { qty_ordered: Number(e.target.value) })} />
                      </td>
                      <td className="p-1">
                        <Input className="h-8 text-right" type="number" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })} />
                      </td>
                      <td className="p-1">
                        <Input className="h-8 text-right" type="number" value={l.discount_percent} onChange={(e) => updateLine(i, { discount_percent: Number(e.target.value) })} />
                      </td>
                      <td className="p-1">
                        <Input className="h-8 text-right" type="number" value={l.vat_rate} onChange={(e) => updateLine(i, { vat_rate: Number(e.target.value) })} />
                      </td>
                      <td className="p-1 text-right tabular-nums">{fmt(amount)}</td>
                      <td className="p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Lines - mobile cards */}
          <div className="md:hidden space-y-2">
            {lines.map((l, i) => (
              <Card key={i}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium">Dòng #{i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs">Diễn giải</Label>
                    <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">SL</Label>
                      <Input type="number" value={l.qty_ordered} onChange={(e) => updateLine(i, { qty_ordered: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Đơn giá</Label>
                      <Input type="number" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">% CK</Label>
                      <Input type="number" value={l.discount_percent} onChange={(e) => updateLine(i, { discount_percent: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">% VAT</Label>
                      <Input type="number" value={l.vat_rate} onChange={(e) => updateLine(i, { vat_rate: Number(e.target.value) })} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Thêm dòng
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Ghi chú</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tiền hàng</span><span className="tabular-nums">{fmt(totals.sub)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span className="tabular-nums">{fmt(totals.vat)}</span></div>
              <div className="flex justify-between font-semibold text-base border-t pt-1"><span>Tổng</span><span className="tabular-nums">{fmt(totals.total)}</span></div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button variant="secondary" disabled={submitting} onClick={() => handleSubmit("draft")}>Lưu nháp</Button>
          <Button disabled={submitting} onClick={() => handleSubmit("confirmed")}>Lưu & Duyệt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

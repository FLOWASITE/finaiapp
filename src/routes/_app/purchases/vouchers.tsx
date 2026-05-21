import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { Plus, FileText, Check, X, Trash2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import {
  listPurchaseVouchers,
  createPurchaseVoucher,
  postPurchaseVoucher,
  voidPurchaseVoucher,
  deletePurchaseVoucher,
  suggestVoucherNo,
  listLinkablePurchaseInvoices,
} from "@/lib/purchase-vouchers.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { listProducts } from "@/lib/inventory.functions";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/purchases/vouchers")({
  component: PurchaseVouchersPage,
});

// ---------- helpers ----------

function statusBadge(s: string) {
  const map: Record<string, string> = {
    uploaded: "Nháp",
    reviewed: "Đã duyệt",
    posted: "Đã ghi sổ",
    void: "Đã huỷ",
    rejected: "Bị từ chối",
    ai_read: "AI đọc",
  };
  return (
    <Badge variant={s === "posted" ? "default" : s === "void" ? "destructive" : "secondary"}>
      {map[s] ?? s}
    </Badge>
  );
}

function fmtMoney(n: number | string | null | undefined) {
  return new Intl.NumberFormat("vi-VN").format(Number(n ?? 0));
}

// ---------- product picker ----------

function normalizeVi(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function productTypeLabel(p: any): string {
  if (p?.item_type === "service") return "Dịch vụ";
  if (p?.item_type === "combo") return "Combo";
  if (p?.stock_account === "152") return "Nguyên vật liệu";
  if (p?.stock_account === "153") return "Công cụ dụng cụ";
  return "Hàng hóa";
}

function ProductPickerCell({
  value,
  onPick,
}: {
  value: string;
  onPick: (p: any) => void;
}) {
  const fn = useServerFn(listProducts);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products-picker"],
    queryFn: () => fn(),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });

  const filtered = useMemo(() => {
    const list = (products ?? []) as any[];
    if (!q.trim()) return list;
    const nq = normalizeVi(q);
    return list.filter((p) =>
      normalizeVi(p.code).includes(nq) || normalizeVi(p.name).includes(nq),
    );
  }, [products, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          value={value}
          onChange={() => {}}
          onClick={() => setOpen(true)}
          readOnly
          placeholder="Vui lòng chọn"
          className="cursor-pointer"
        />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[920px] p-0">
        <div className="p-2 border-b">
          <Input
            autoFocus
            placeholder="Tìm theo mã hoặc tên sản phẩm…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">Mã sản phẩm</th>
                <th className="px-2 py-1.5 font-medium">Tên sản phẩm</th>
                <th className="px-2 py-1.5 font-medium">Loại sản phẩm</th>
                <th className="px-2 py-1.5 font-medium">Đơn vị</th>
                <th className="px-2 py-1.5 font-medium text-right">Giá mua</th>
                <th className="px-2 py-1.5 font-medium text-right">SL tồn</th>
                <th className="px-2 py-1.5 font-medium text-right">GT tồn</th>
                <th className="px-2 py-1.5 font-medium text-right">Giá xuất kho</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Không có dữ liệu</td></tr>
              ) : filtered.map((p: any) => {
                const onHand = Number(p.on_hand ?? 0);
                const unitCost = Number(p.unit_cost ?? 0);
                return (
                  <tr
                    key={p.id}
                    className="border-t hover:bg-accent cursor-pointer"
                    onClick={() => { onPick(p); setOpen(false); setQ(""); }}
                  >
                    <td className="px-2 py-1.5 font-mono">{p.code}</td>
                    <td className="px-2 py-1.5">{p.name}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{productTypeLabel(p)}</td>
                    <td className="px-2 py-1.5">{p.unit ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(unitCost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(onHand)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(onHand * unitCost)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(p.unit_price ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- line model ----------

type Line = {
  key: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
  amount: number; // before VAT after discount
  discount_pct: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  debit_account: string;
  vat_account: string;
  invoice_no: string;
  line_type: "goods" | "service" | "expense" | "asset";
};

function emptyLine(defaults?: Partial<Line>): Line {
  return {
    key: crypto.randomUUID(),
    product_id: null,
    product_code: "",
    product_name: "",
    description: "",
    unit: "",
    qty: 1,
    unit_price: 0,
    amount: 0,
    discount_pct: 0,
    discount_amount: 0,
    vat_rate: 10,
    vat_amount: 0,
    total: 0,
    debit_account: "156",
    vat_account: "1331",
    invoice_no: "",
    line_type: "goods",
    ...defaults,
  };
}

function recalcLine(l: Line): Line {
  const gross = Number(l.qty || 0) * Number(l.unit_price || 0);
  const disc = l.discount_pct > 0
    ? Math.round((gross * l.discount_pct) / 100)
    : Number(l.discount_amount || 0);
  const amount = Math.max(0, gross - disc);
  const vat_amount = Math.round((amount * Number(l.vat_rate || 0)) / 100);
  return {
    ...l,
    discount_amount: l.discount_pct > 0 ? disc : Number(l.discount_amount || 0),
    amount,
    vat_amount,
    total: amount + vat_amount,
  };
}

// ---------- list page ----------

function PurchaseVouchersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPurchaseVouchers);
  const postFn = useServerFn(postPurchaseVoucher);
  const voidFn = useServerFn(voidPurchaseVoucher);
  const delFn = useServerFn(deletePurchaseVoucher);

  const [openCreate, setOpenCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data, refetch } = useQuery({
    queryKey: ["purchase-vouchers", search, status],
    queryFn: () =>
      listFn({ data: { search: search || undefined, status: status === "all" ? undefined : status } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const postMut = useMutation({
    mutationFn: (id: string) => postFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã ghi sổ"); invalidateLedgers(qc); refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi ghi sổ"),
  });
  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id, reason: "Huỷ thủ công" } }),
    onSuccess: () => { toast.success("Đã huỷ phiếu"); invalidateLedgers(qc); refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi huỷ phiếu"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá phiếu"); refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi xoá"),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu mua hàng</h1>
          <p className="text-sm text-muted-foreground">
            Chứng từ kế toán ghi nhận nghiệp vụ mua. Hỗ trợ nhiều dòng hàng, link tới Hoá đơn mua, tự sinh bút toán / phiếu nhập kho / phiếu chi.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Tạo phiếu mới
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Tìm số phiếu, NCC, diễn giải…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="uploaded">Nháp</SelectItem>
                <SelectItem value="reviewed">Đã duyệt</SelectItem>
                <SelectItem value="posted">Đã ghi sổ</SelectItem>
                <SelectItem value="void">Đã huỷ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số phiếu</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Nhà cung cấp</TableHead>
                <TableHead>Diễn giải</TableHead>
                <TableHead className="text-right">Tổng tiền</TableHead>
                <TableHead>PT TT</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Chưa có phiếu</TableCell></TableRow>
              ) : rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.voucher_no}</TableCell>
                  <TableCell>{r.voucher_date}</TableCell>
                  <TableCell>{r.supplier_name ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.reason ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.total)}</TableCell>
                  <TableCell>
                    {r.payment_method === "cash" ? "Tiền mặt"
                      : r.payment_method === "bank" ? "Ngân hàng" : "Công nợ"}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.status !== "posted" && r.status !== "void" && (
                      <Button size="sm" variant="default" onClick={() => postMut.mutate(r.id)}>
                        <Check className="h-3 w-3 mr-1" /> Ghi sổ
                      </Button>
                    )}
                    {r.status === "posted" && (
                      <Button size="sm" variant="outline" onClick={() => voidMut.mutate(r.id)}>
                        <X className="h-3 w-3 mr-1" /> Huỷ
                      </Button>
                    )}
                    {r.status !== "posted" && (
                      <Button size="sm" variant="ghost" onClick={() => delMut.mutate(r.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    {r.journal_entry_id && (
                      <Link to="/journal" className="inline-flex">
                        <Button size="sm" variant="ghost"><FileText className="h-3 w-3" /></Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateVoucherDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={() => { refetch(); setOpenCreate(false); }}
      />
    </div>
  );
}

// ---------- create dialog ----------

function CreateVoucherDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createPurchaseVoucher);
  const suggestNoFn = useServerFn(suggestVoucherNo);
  const linkInvFn = useServerFn(listLinkablePurchaseInvoices);
  const suppliersFn = useServerFn(listSuppliers);

  const today = new Date().toISOString().slice(0, 10);

  const [header, setHeader] = useState({
    voucher_no: "",
    voucher_date: today,
    supplier_id: "",
    supplier_name: "",
    supplier_address: "",
    customer_group: "",
    invoice_id: "",
    invoice_no: "",
    invoice_date: "",
    reason: "",
    currency: "VND",
    exchange_rate: 1,
    due_date: "",
    debit_account_default: "156",
    credit_account: "3311",
    vat_account_default: "1331",
    payment_method: "credit" as "credit" | "cash" | "bank",
    payment_account: "1111",
    payment_status: "unpaid" as "unpaid" | "partial" | "paid",
    invoice_receipt_type: "with_invoice" as "with_invoice" | "without_invoice" | "invoice_only",
    is_purchase_cost: false,
    is_non_deductible: false,
    auto_allocate_cost: false,
    pay_now: false,
    create_stock_voucher: false,
    discount_pct: 0,
    discount_amount: 0,
  });

  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: () => suppliersFn(),
    enabled: open,
  });
  const { data: invoices } = useQuery({
    queryKey: ["linkable-purchase-invoices", header.supplier_id],
    queryFn: () => linkInvFn({ data: { supplierId: header.supplier_id || undefined } }),
    enabled: open,
  });
  const { data: suggested } = useQuery({
    queryKey: ["pv-suggest-no", header.voucher_date],
    queryFn: () => suggestNoFn({ data: { voucher_date: header.voucher_date } }),
    enabled: open,
  });

  useEffect(() => {
    if (open && !header.voucher_no && suggested?.voucher_no) {
      setHeader((h) => ({ ...h, voucher_no: suggested.voucher_no }));
    }
  }, [open, suggested, header.voucher_no]);

  // totals
  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const vat_amount = lines.reduce((s, l) => s + l.vat_amount, 0);
    const grand = subtotal + vat_amount;
    const hdrDisc = header.discount_pct > 0
      ? Math.round((subtotal * header.discount_pct) / 100)
      : Number(header.discount_amount || 0);
    const total = Math.max(0, grand - hdrDisc);
    return { subtotal, vat_amount, total, hdr_discount: hdrDisc };
  }, [lines, header.discount_pct, header.discount_amount]);

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? recalcLine({ ...l, ...patch }) : l)));

  const addLine = () => setLines((ls) => [...ls, emptyLine({
    debit_account: header.debit_account_default,
    vat_account: header.vat_account_default,
  })]);
  const addMany = () => setLines((ls) => [
    ...ls,
    ...Array.from({ length: 5 }, () => emptyLine({
      debit_account: header.debit_account_default,
      vat_account: header.vat_account_default,
    })),
  ]);
  const clearAll = () => setLines([emptyLine({
    debit_account: header.debit_account_default,
    vat_account: header.vat_account_default,
  })]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)));

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        voucher_no: header.voucher_no,
        voucher_date: header.voucher_date,
        supplier_id: header.supplier_id || null,
        supplier_name: header.supplier_name || null,
        supplier_address: header.supplier_address || null,
        customer_group: header.customer_group || null,
        invoice_id: header.invoice_id || null,
        invoice_no: header.invoice_no || null,
        invoice_date: header.invoice_date || null,
        reason:
          (header.reason && header.reason.trim()) ||
          `Mua hàng từ nhà cung cấp ${header.supplier_name || "---"} theo hoá đơn số ${header.invoice_no || "---"}`,
        currency: header.currency,
        exchange_rate: Number(header.exchange_rate || 1),
        due_date: header.due_date || null,
        subtotal: totals.subtotal,
        vat_amount: totals.vat_amount,
        total: totals.total,
        discount_pct: Number(header.discount_pct || 0),
        discount_amount: totals.hdr_discount,
        debit_account: header.debit_account_default,
        credit_account: header.credit_account,
        vat_account: header.vat_account_default,
        payment_method: header.payment_method,
        payment_account: header.payment_account || null,
        payment_status: header.payment_status,
        invoice_receipt_type: header.invoice_receipt_type,
        is_purchase_cost: header.is_purchase_cost,
        is_non_deductible: header.is_non_deductible,
        auto_allocate_cost: header.auto_allocate_cost,
        pay_now: header.pay_now,
        create_stock_voucher: header.create_stock_voucher,
        warehouse_id: null,
        lines: lines
          .filter((l) => l.amount > 0 || l.qty > 0 || l.product_name || l.description)
          .map((l) => ({
            product_id: l.product_id,
            product_code: l.product_code || null,
            product_name: l.product_name || null,
            description: l.description || null,
            unit: l.unit || null,
            qty: Number(l.qty || 0),
            unit_price: Number(l.unit_price || 0),
            amount: Number(l.amount || 0),
            discount_pct: Number(l.discount_pct || 0),
            discount_amount: Number(l.discount_amount || 0),
            vat_rate: Number(l.vat_rate || 0),
            vat_amount: Number(l.vat_amount || 0),
            total: Number(l.total || 0),
            debit_account: l.debit_account || header.debit_account_default,
            vat_account: l.vat_account || header.vat_account_default,
            invoice_no: l.invoice_no || null,
            line_type: l.line_type,
          })),
      };
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Đã tạo phiếu nháp");
      // reset
      setHeader((h) => ({ ...h, voucher_no: "", reason: "" }));
      setLines([emptyLine()]);
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi tạo phiếu"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:w-[95vw] sm:max-w-[1200px] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Tạo phiếu mua hàng</DialogTitle>
        </DialogHeader>

        {/* Top toggle row */}
        <div className="flex flex-wrap items-center gap-4 border-b pb-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Trạng thái TT</Label>
            <Select value={header.payment_status}
              onValueChange={(v: any) => setHeader({ ...header, payment_status: v })}>
              <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
                <SelectItem value="partial">Thanh toán một phần</SelectItem>
                <SelectItem value="paid">Đã thanh toán</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Hình thức HĐ</Label>
            <Select value={header.invoice_receipt_type}
              onValueChange={(v: any) => setHeader({ ...header, invoice_receipt_type: v })}>
              <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="with_invoice">Nhận kèm hoá đơn</SelectItem>
                <SelectItem value="without_invoice">Nhận chưa kèm hoá đơn</SelectItem>
                <SelectItem value="invoice_only">Chỉ hoá đơn, không hàng</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={header.create_stock_voucher}
              onCheckedChange={(v) => setHeader({ ...header, create_stock_voucher: !!v })} />
            Nhập kho
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={header.is_purchase_cost}
              onCheckedChange={(v) => setHeader({ ...header, is_purchase_cost: !!v })} />
            Chi phí mua hàng
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={header.is_non_deductible}
              onCheckedChange={(v) => setHeader({ ...header, is_non_deductible: !!v })} />
            Chi phí không được trừ
          </label>
        </div>

        <Tabs defaultValue="pmh" className="mt-2">
          <TabsList>
            <TabsTrigger value="pmh">Phiếu mua hàng</TabsTrigger>
            <TabsTrigger value="hd">Hoá đơn</TabsTrigger>
          </TabsList>

          {/* === Tab 1: PMH header === */}
          <TabsContent value="pmh" className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label>Nhà cung cấp *</Label>
                <Select value={header.supplier_id || "none"}
                  onValueChange={(v) => {
                    const s = (suppliers ?? []).find((x: any) => x.id === v);
                    setHeader({
                      ...header,
                      supplier_id: v === "none" ? "" : v,
                      supplier_name: s?.name ?? "",
                      supplier_address: s?.address ?? "",
                    });
                  }}>
                  <SelectTrigger><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không chọn —</SelectItem>
                    {(suppliers ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>TK công nợ phải trả *</Label>
                <Select value={header.credit_account}
                  onValueChange={(v) => setHeader({ ...header, credit_account: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3311">3311 - Phải trả NCC ngắn hạn</SelectItem>
                    <SelectItem value="3312">3312 - Phải trả NCC dài hạn</SelectItem>
                    <SelectItem value="3388">3388 - Phải trả khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nhóm khách hàng</Label>
                <Input value={header.customer_group}
                  onChange={(e) => setHeader({ ...header, customer_group: e.target.value })}
                  placeholder="Vui lòng chọn" />
              </div>
              <div>
                <Label>Số chứng từ *</Label>
                <Input value={header.voucher_no}
                  onChange={(e) => setHeader({ ...header, voucher_no: e.target.value })} />
              </div>

              <div className="col-span-2">
                <Label>Địa chỉ</Label>
                <Input value={header.supplier_address}
                  onChange={(e) => setHeader({ ...header, supplier_address: e.target.value })} />
              </div>
              <div>
                <Label>Ngày chứng từ *</Label>
                <Input type="date" value={header.voucher_date}
                  onChange={(e) => setHeader({ ...header, voucher_date: e.target.value })} />
              </div>
              <div>
                <Label>Hạn thanh toán</Label>
                <Input type="date" value={header.due_date}
                  onChange={(e) => setHeader({ ...header, due_date: e.target.value })} />
              </div>

              <div>
                <Label>Ngoại tệ</Label>
                <Select value={header.currency}
                  onValueChange={(v) => setHeader({ ...header, currency: v, exchange_rate: v === "VND" ? 1 : header.exchange_rate })}>
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
                <Label>Tỷ giá</Label>
                <Input type="number" value={header.exchange_rate}
                  onChange={(e) => setHeader({ ...header, exchange_rate: Number(e.target.value) })}
                  disabled={header.currency === "VND"} />
              </div>
              <div className="col-span-2 text-right">
                <div className="text-sm text-muted-foreground">Tổng</div>
                <div className="text-3xl font-semibold text-primary">{fmtMoney(totals.total)}</div>
              </div>

              <div className="col-span-4">
                <Label>Diễn giải</Label>
                <Input value={header.reason}
                  onChange={(e) => setHeader({ ...header, reason: e.target.value })}
                  placeholder={`Mua hàng từ nhà cung cấp ${header.supplier_name || "---"} theo hoá đơn số ${header.invoice_no || "---"}`} />
              </div>
            </div>

            {/* Sub-tab + chiết khấu */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium border-b-2 border-primary pb-1">Giá trị hàng</span>
                <span className="text-muted-foreground">Chi phí mua hàng</span>
                <label className="flex items-center gap-2">
                  <Checkbox checked={header.auto_allocate_cost}
                    onCheckedChange={(v) => setHeader({ ...header, auto_allocate_cost: !!v })} />
                  Tự phân bổ chi phí mua hàng
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Chiết khấu (%)</Label>
                <Input type="number" className="w-20 h-8" value={header.discount_pct}
                  onChange={(e) => setHeader({ ...header, discount_pct: Number(e.target.value), discount_amount: 0 })} />
                <Label className="text-xs">Chiết khấu</Label>
                <Input type="number" className="w-32 h-8" value={header.discount_amount}
                  onChange={(e) => setHeader({ ...header, discount_amount: Number(e.target.value), discount_pct: 0 })} />
              </div>
            </div>

            {/* Lines table */}
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">STT</TableHead>
                    <TableHead className="min-w-[180px]">Tên sản phẩm (*)</TableHead>
                    <TableHead className="w-24">Mã</TableHead>
                    <TableHead className="w-24">Hoá đơn</TableHead>
                    <TableHead className="w-20">TK nợ</TableHead>
                    <TableHead className="w-16">ĐVT</TableHead>
                    <TableHead className="w-20 text-right">SL (*)</TableHead>
                    <TableHead className="w-28 text-right">Đơn giá (*)</TableHead>
                    <TableHead className="w-16 text-right">CK %</TableHead>
                    <TableHead className="w-28 text-right">CK (đ)</TableHead>
                    <TableHead className="w-28 text-right">Trước thuế</TableHead>
                    <TableHead className="w-16 text-right">VAT %</TableHead>
                    <TableHead className="w-24">TK thuế</TableHead>
                    <TableHead className="w-28 text-right">Tiền thuế</TableHead>
                    <TableHead className="w-28 text-right">Thành tiền</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={l.key}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <ProductPickerCell
                          value={l.product_name}
                          onPick={(p) => updateLine(l.key, {
                            product_id: p.id,
                            product_code: p.code ?? "",
                            product_name: p.name ?? "",
                            unit: p.unit ?? "",
                            unit_price: Number(p.unit_cost ?? 0),
                            vat_rate: Number(p.vat_rate ?? 10),
                            debit_account: p.stock_account ?? l.debit_account,
                            line_type: p.item_type === "service" ? "service" : "goods",
                          })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={l.product_code}
                          onChange={(e) => updateLine(l.key, { product_code: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={l.invoice_no}
                          onChange={(e) => updateLine(l.key, { invoice_no: e.target.value })}
                          placeholder="Số HĐ" />
                      </TableCell>
                      <TableCell>
                        <Input value={l.debit_account}
                          onChange={(e) => updateLine(l.key, { debit_account: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={l.unit}
                          onChange={(e) => updateLine(l.key, { unit: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="text-right" value={l.qty}
                          onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="text-right" value={l.unit_price}
                          onChange={(e) => updateLine(l.key, { unit_price: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="text-right" value={l.discount_pct}
                          onChange={(e) => updateLine(l.key, { discount_pct: Number(e.target.value), discount_amount: 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="text-right" value={l.discount_amount}
                          onChange={(e) => updateLine(l.key, { discount_amount: Number(e.target.value), discount_pct: 0 })} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(l.amount)}</TableCell>
                      <TableCell>
                        <Input type="number" className="text-right" value={l.vat_rate}
                          onChange={(e) => updateLine(l.key, { vat_rate: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input value={l.vat_account}
                          onChange={(e) => updateLine(l.key, { vat_account: e.target.value })} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(l.vat_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtMoney(l.total)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => removeLine(l.key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell colSpan={6} className="text-right">Tổng</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(lines.reduce((s, l) => s + Number(l.qty || 0), 0))}
                    </TableCell>
                    <TableCell colSpan={3}></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(totals.subtotal)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(totals.vat_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(totals.subtotal + totals.vat_amount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button variant="default" size="sm" onClick={addLine}>
                <PlusCircle className="h-3 w-3 mr-1" /> Thêm
              </Button>
              <Button variant="default" size="sm" onClick={addMany}>
                <PlusCircle className="h-3 w-3 mr-1" /> Thêm nhiều
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll}>
                <Trash2 className="h-3 w-3 mr-1" /> Xoá hết
              </Button>
            </div>

            {/* Payment row */}
            <div className="grid grid-cols-4 gap-3 border-t pt-3">
              <div>
                <Label>Phương thức TT</Label>
                <Select value={header.payment_method}
                  onValueChange={(v: any) => setHeader({ ...header, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Công nợ</SelectItem>
                    <SelectItem value="cash">Tiền mặt (111)</SelectItem>
                    <SelectItem value="bank">Ngân hàng (112)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {header.payment_method !== "credit" && (
                <>
                  <div>
                    <Label>TK tiền</Label>
                    <Input value={header.payment_account}
                      onChange={(e) => setHeader({ ...header, payment_account: e.target.value })} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={header.pay_now}
                        onCheckedChange={(v) => setHeader({ ...header, pay_now: !!v })} />
                      Thanh toán ngay → sinh phiếu chi/UNC
                    </label>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* === Tab 2: Hoá đơn === */}
          <TabsContent value="hd" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <Label>Link tới Hoá đơn mua đã có</Label>
                <Select value={header.invoice_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") { setHeader({ ...header, invoice_id: "" }); return; }
                    const inv = invoices?.rows?.find((x: any) => x.id === v);
                    if (inv) {
                      setHeader({
                        ...header,
                        invoice_id: v,
                        invoice_no: inv.invoice_no ?? "",
                        invoice_date: inv.issue_date ?? "",
                        supplier_id: inv.supplier_id ?? header.supplier_id,
                        supplier_name: inv.supplier_name ?? header.supplier_name,
                      });
                    }
                  }}>
                  <SelectTrigger><SelectValue placeholder="Không link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không link —</SelectItem>
                    {(invoices?.rows ?? []).map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.invoice_no ?? "—"} · {i.supplier_name} · {fmtMoney(i.total)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Số hoá đơn</Label>
                <Input value={header.invoice_no}
                  onChange={(e) => setHeader({ ...header, invoice_no: e.target.value })} />
              </div>
              <div>
                <Label>Ngày hoá đơn</Label>
                <Input type="date" value={header.invoice_date}
                  onChange={(e) => setHeader({ ...header, invoice_date: e.target.value })} />
              </div>
              <div>
                <Label>MST NCC</Label>
                <Input placeholder="Auto từ NCC" disabled />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()}
            disabled={mut.isPending || !header.voucher_no}>
            Lưu phiếu nháp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

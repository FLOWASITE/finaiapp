import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, FileCheck2, Loader2, MoreHorizontal, X, FileText, Wallet, TrendingUp, FileX, Check, Paperclip } from "lucide-react";

import {
  listSalesVouchers,
  getSalesVoucher,
  createSalesVoucher,
  updateSalesVoucher,
  deleteSalesVoucher,
  postSalesVoucher,
  voidSalesVoucher,
  suggestSalesVoucherNo,
} from "@/lib/sales-vouchers.functions";
import { listProducts } from "@/lib/inventory.functions";
import { listBranches } from "@/lib/dimensions.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { invalidateLedgers } from "@/lib/query-invalidation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerCombobox } from "@/components/customer-combobox";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function normalizeVi(s: string) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function ProductPickerCell({
  value,
  onPick,
  products,
}: {
  value: string;
  onPick: (p: any) => void;
  products: any[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const nq = normalizeVi(q);
    return products.filter(
      (p) => normalizeVi(p.code).includes(nq) || normalizeVi(p.name).includes(nq),
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
          className="h-8 cursor-pointer"
        />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[680px] p-0">
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
                <th className="px-2 py-1.5 font-medium">Mã</th>
                <th className="px-2 py-1.5 font-medium">Tên</th>
                <th className="px-2 py-1.5 font-medium">ĐVT</th>
                <th className="px-2 py-1.5 font-medium text-right">Giá bán</th>
                <th className="px-2 py-1.5 font-medium text-right">Tồn</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                filtered.map((p: any) => (
                  <tr
                    key={p.id}
                    className="border-t hover:bg-accent cursor-pointer"
                    onClick={() => {
                      onPick(p);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <td className="px-2 py-1.5 font-mono">{p.code}</td>
                    <td className="px-2 py-1.5">{p.name}</td>
                    <td className="px-2 py-1.5">{p.unit ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {new Intl.NumberFormat("vi-VN").format(Number(p.unit_price ?? 0))}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {new Intl.NumberFormat("vi-VN").format(Number(p.on_hand ?? 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const Route = createFileRoute("/_app/sales/vouchers")({
  component: SalesVouchersPage,
});

// ---------------- helpers ----------------

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);

type Line = {
  key: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  unit: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  amount: number;
  total: number;
  debit_account: string;
  credit_account: string;
  vat_account: string;
  line_type: "goods" | "service";
};

const emptyLine = (): Line => ({
  key: Math.random().toString(36).slice(2),
  product_id: null,
  product_code: "",
  product_name: "",
  unit: "",
  qty: 1,
  unit_price: 0,
  discount_pct: 0,
  discount_amount: 0,
  vat_rate: 0,
  vat_amount: 0,
  amount: 0,
  total: 0,
  debit_account: "1311",
  credit_account: "5111",
  vat_account: "33311",
  line_type: "goods",
});

function recalcLine(l: Line): Line {
  const amount = Math.max(0, (l.qty || 0) * (l.unit_price || 0));
  const discount =
    l.discount_pct > 0
      ? Math.round((amount * l.discount_pct) / 100)
      : l.discount_amount || 0;
  const taxable = Math.max(0, amount - discount);
  const vat = Math.round((taxable * (l.vat_rate || 0)) / 100);
  return {
    ...l,
    amount,
    discount_amount: discount,
    vat_amount: vat,
    total: taxable + vat,
  };
}

// ---------------- Page ----------------

type FormState = {
  id?: string;
  voucher_no: string;
  voucher_date: string;
  due_date: string;
  customer_id: string | null;
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_group: string;
  buyer_name: string;
  reason: string;
  currency: string;
  debit_account: string;
  branch_id: string | null;
  payment_method: "credit" | "cash" | "bank";
  payment_status: "unpaid" | "partial" | "paid";
  pay_now: boolean;
  issue_einvoice: boolean;
  create_stock_voucher: boolean;
  discount_pct: number;
  discount_amount: number;
  notes: string;
  lines: Line[];
};

const blankForm = (no = ""): FormState => ({
  voucher_no: no,
  voucher_date: todayISO(),
  due_date: "",
  customer_id: null,
  customer_name: "",
  customer_tax_id: "",
  customer_address: "",
  customer_group: "",
  buyer_name: "",
  reason: "Bán hàng cho khách hàng  --- theo hoá đơn số  ---",
  currency: "VND",
  debit_account: "1311",
  branch_id: null,
  payment_method: "credit",
  payment_status: "unpaid",
  pay_now: false,
  issue_einvoice: false,
  create_stock_voucher: false,
  discount_pct: 0,
  discount_amount: 0,
  notes: "",
  lines: [emptyLine()],
});

function SalesVouchersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const list = useServerFn(listSalesVouchers);
  const get = useServerFn(getSalesVoucher);
  const suggest = useServerFn(suggestSalesVoucherNo);
  const create = useServerFn(createSalesVoucher);
  const update = useServerFn(updateSalesVoucher);
  const del = useServerFn(deleteSalesVoucher);
  const post = useServerFn(postSalesVoucher);
  const voidFn = useServerFn(voidSalesVoucher);

  // ---------- Filters ----------
  type Period = "all" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPeriod, setFPeriod] = useState<Period>("this_month");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");
  const [fCustomerId, setFCustomerId] = useState<string | null>(null);
  const [fSearch, setFSearch] = useState<string>("");

  const periodRange = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const startOfMonth = (yy: number, mm: number) => new Date(yy, mm, 1);
    const endOfMonth = (yy: number, mm: number) => new Date(yy, mm + 1, 0);
    switch (fPeriod) {
      case "this_month":
        return { from: iso(startOfMonth(y, m)), to: iso(endOfMonth(y, m)) };
      case "last_month":
        return { from: iso(startOfMonth(y, m - 1)), to: iso(endOfMonth(y, m - 1)) };
      case "this_quarter": {
        const qStart = Math.floor(m / 3) * 3;
        return { from: iso(startOfMonth(y, qStart)), to: iso(endOfMonth(y, qStart + 2)) };
      }
      case "this_year":
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      case "custom":
        return { from: fFrom || undefined, to: fTo || undefined };
      default:
        return { from: undefined, to: undefined };
    }
  }, [fPeriod, fFrom, fTo]);

  const listInput = useMemo(
    () => ({
      status: fStatus !== "all" ? fStatus : undefined,
      customerId: fCustomerId || undefined,
      from: periodRange.from,
      to: periodRange.to,
      search: fSearch.trim() || undefined,
    }),
    [fStatus, fCustomerId, periodRange, fSearch],
  );

  const {
    data: vouchers,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["sales-vouchers", listInput],
    queryFn: () => list({ data: listInput }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const hasActiveFilters =
    fStatus !== "all" ||
    fPeriod !== "this_month" ||
    !!fCustomerId ||
    !!fSearch.trim();

  function resetFilters() {
    setFStatus("all");
    setFPeriod("this_month");
    setFFrom("");
    setFTo("");
    setFCustomerId(null);
    setFSearch("");
  }

  // ---------- Selection ----------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = (vouchers?.rows ?? []) as any[];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---------- KPI ----------
  const kpi = useMemo(() => {
    let noInvoice = 0;
    let revenue = 0;
    let paid = 0;
    let receivable = 0;
    for (const r of rows) {
      if (r.status === "void") continue;
      const total = Number(r.total || 0);
      const pAmt = Number(r.paid_amount || 0);
      if (!r.einvoice_id) noInvoice += 1;
      revenue += total;
      paid += pAmt;
      receivable += Math.max(0, total - pAmt);
    }
    return { noInvoice, revenue, paid, receivable };
  }, [rows]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());

  async function openCreate() {
    const r = await suggest({ data: { voucher_date: todayISO() } });
    setForm(blankForm(r.voucher_no));
    setOpen(true);
  }

  async function openEdit(id: string) {
    const { voucher } = await get({ data: { id } });
    setForm({
      id: voucher.id,
      voucher_no: voucher.voucher_no,
      voucher_date: voucher.voucher_date,
      due_date: voucher.due_date ?? "",
      customer_id: voucher.customer_id,
      customer_name: voucher.customer_name ?? "",
      customer_tax_id: voucher.customer_tax_id ?? "",
      customer_address: voucher.customer_address ?? "",
      customer_group: voucher.customer_group ?? "",
      buyer_name: voucher.buyer_name ?? "",
      reason: voucher.reason ?? "",
      currency: voucher.currency ?? "VND",
      debit_account: voucher.debit_account ?? "1311",
      branch_id: voucher.branch_id,
      payment_method: voucher.payment_method as "credit" | "cash" | "bank",
      payment_status: voucher.payment_status as "unpaid" | "partial" | "paid",
      pay_now: voucher.pay_now,
      issue_einvoice: voucher.issue_einvoice,
      create_stock_voucher: voucher.create_stock_voucher,
      discount_pct: Number(voucher.discount_pct || 0),
      discount_amount: Number(voucher.discount_amount || 0),
      notes: voucher.notes ?? "",
      lines:
        (voucher.sales_voucher_lines ?? [])
          .sort((a: any, b: any) => a.line_order - b.line_order)
          .map((l: any) => ({
            key: l.id,
            product_id: l.product_id,
            product_code: l.product_code ?? "",
            product_name: l.product_name ?? "",
            unit: l.unit ?? "",
            qty: Number(l.qty),
            unit_price: Number(l.unit_price),
            discount_pct: Number(l.discount_pct),
            discount_amount: Number(l.discount_amount),
            vat_rate: Number(l.vat_rate),
            vat_amount: Number(l.vat_amount),
            amount: Number(l.amount),
            total: Number(l.total),
            debit_account: l.debit_account ?? "1311",
            credit_account: l.credit_account ?? "5111",
            vat_account: l.vat_account ?? "33311",
            line_type: l.line_type,
          })) || [emptyLine()],
    });
    setOpen(true);
  }

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((s, l) => s + l.amount, 0);
    const discount =
      form.discount_pct > 0
        ? Math.round((subtotal * form.discount_pct) / 100)
        : form.discount_amount || 0;
    const vat = form.lines.reduce((s, l) => s + l.vat_amount, 0);
    const total = Math.max(0, subtotal - discount) + vat;
    return { subtotal, discount, vat, total };
  }, [form.lines, form.discount_pct, form.discount_amount]);

  function updateLine(i: number, patch: Partial<Line>) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[i] = recalcLine({ ...lines[i], ...patch });
      return { ...f, lines };
    });
  }
  function removeLine(i: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines,
    }));
  }
  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  }

  function buildPayload() {
    return {
      voucher_no: form.voucher_no,
      voucher_date: form.voucher_date,
      due_date: form.due_date || null,
      customer_id: form.customer_id,
      customer_name: form.customer_name || null,
      customer_tax_id: form.customer_tax_id || null,
      customer_address: form.customer_address || null,
      customer_group: form.customer_group || null,
      buyer_name: form.buyer_name || null,
      reason: form.reason || null,
      currency: form.currency || "VND",
      exchange_rate: 1,
      subtotal: totals.subtotal,
      discount_pct: form.discount_pct,
      discount_amount: totals.discount,
      vat_amount: totals.vat,
      total: totals.total,
      debit_account: form.debit_account || "1311",
      credit_account: "5111",
      vat_account: "33311",
      payment_method: form.payment_method,
      payment_status: form.payment_status,
      pay_now: form.pay_now,
      issue_einvoice: form.issue_einvoice,
      create_stock_voucher: form.create_stock_voucher,
      branch_id: form.branch_id,
      notes: form.notes || null,
      lines: form.lines
        .filter((l) => l.product_name.trim() !== "" || l.qty > 0)
        .map((l) => ({
          product_id: l.product_id,
          product_code: l.product_code || null,
          product_name: l.product_name || null,
          unit: l.unit || null,
          qty: l.qty,
          unit_price: l.unit_price,
          amount: l.amount,
          discount_pct: l.discount_pct,
          discount_amount: l.discount_amount,
          vat_rate: l.vat_rate,
          vat_amount: l.vat_amount,
          total: l.total,
          debit_account: l.debit_account,
          credit_account: l.credit_account,
          vat_account: l.vat_account,
          line_type: l.line_type,
        })),
    };
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload.customer_id && !payload.customer_name) {
        throw new Error("Vui lòng chọn khách hàng");
      }
      if (!payload.reason) throw new Error("Vui lòng nhập mô tả");
      if (payload.lines.length === 0) throw new Error("Cần ít nhất 1 dòng hàng");
      if (form.id) {
        return update({ data: { id: form.id, ...payload } });
      }
      return create({ data: payload });
    },
    onSuccess: () => {
      toast.success("Đã lưu phiếu bán hàng");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Lưu phiếu thất bại"),
  });

  const postMut = useMutation({
    mutationFn: async (id: string) => post({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã ghi sổ phiếu");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      invalidateLedgers(qc);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Ghi sổ thất bại"),
  });

  const saveAndPostMut = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (!payload.customer_id && !payload.customer_name)
        throw new Error("Vui lòng chọn khách hàng");
      if (!payload.reason) throw new Error("Vui lòng nhập mô tả");
      if (payload.lines.length === 0) throw new Error("Cần ít nhất 1 dòng hàng");
      const id = form.id
        ? form.id
        : (await create({ data: payload })).id;
      if (form.id) await update({ data: { id: form.id, ...payload } });
      try {
        await post({ data: { id } });
        return { posted: true as const };
      } catch (e: any) {
        return { posted: false as const, postError: e?.message as string };
      }
    },
    onSuccess: (res) => {
      if (res.posted) toast.success("Đã lưu và ghi sổ");
      else toast.error(res.postError || "Đã lưu nhưng ghi sổ thất bại");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      invalidateLedgers(qc);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Lưu phiếu thất bại"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá phiếu");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xoá phiếu thất bại"),
  });

  const voidMut = useMutation({
    mutationFn: async (id: string) =>
      voidFn({ data: { id, reason: "Huỷ phiếu" } }),
    onSuccess: () => {
      toast.success("Đã huỷ phiếu");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message || "Huỷ phiếu thất bại"),
  });

  return (
    <div className="container mx-auto py-6 px-4 space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Phiếu bán hàng</h1>
          <p className="text-sm text-muted-foreground">
            Lập phiếu bán hàng, ghi sổ doanh thu và công nợ phải thu.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Thêm phiếu
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 items-end">
            <div>
              <Label className="text-xs mb-1 block">Trạng thái</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="draft">Nháp</SelectItem>
                  <SelectItem value="posted">Đã ghi sổ</SelectItem>
                  <SelectItem value="void">Đã huỷ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Kỳ</Label>
              <Select value={fPeriod} onValueChange={(v) => setFPeriod(v as Period)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="this_month">Tháng này</SelectItem>
                  <SelectItem value="last_month">Tháng trước</SelectItem>
                  <SelectItem value="this_quarter">Quý này</SelectItem>
                  <SelectItem value="this_year">Năm nay</SelectItem>
                  <SelectItem value="custom">Tuỳ chọn…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-1">
              <Label className="text-xs mb-1 block">Khách hàng</Label>
              <CustomerCombobox value={fCustomerId} onChange={(c) => setFCustomerId(c?.id ?? null)} />
            </div>
            <div className="lg:col-span-1">
              <Label className="text-xs mb-1 block">Mã phiếu / mô tả</Label>
              <Input
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                placeholder="VD: PBH001"
              />
            </div>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="w-full">
                  <X className="h-4 w-4 mr-1" /> Xoá lọc
                </Button>
              )}
            </div>
            {fPeriod === "custom" && (
              <>
                <div>
                  <Label className="text-xs mb-1 block">Từ ngày</Label>
                  <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Đến ngày</Label>
                  <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>



      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-destructive">
              Lỗi tải dữ liệu: {(error as any)?.message}
            </div>
          ) : (vouchers?.rows ?? []).length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p className="mb-2">Chưa có phiếu bán hàng nào.</p>
              <Button variant="outline" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Tạo phiếu đầu tiên
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số phiếu</TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Mô tả</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(vouchers?.rows ?? []).map((v: any) => (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => openEdit(v.id)}
                    >
                      <TableCell className="font-mono">{v.voucher_no}</TableCell>
                      <TableCell>{v.voucher_date}</TableCell>
                      <TableCell>{v.customer_name ?? "—"}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{v.reason}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(Number(v.total))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            v.status === "posted"
                              ? "default"
                              : v.status === "void"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {v.status === "posted"
                            ? "Đã ghi sổ"
                            : v.status === "void"
                              ? "Đã huỷ"
                              : "Nháp"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(v.id)}>
                              Mở phiếu
                            </DropdownMenuItem>
                            {v.status !== "posted" && v.status !== "void" && (
                              <DropdownMenuItem onClick={() => postMut.mutate(v.id)}>
                                <FileCheck2 className="h-4 w-4 mr-2" /> Ghi sổ
                              </DropdownMenuItem>
                            )}
                            {v.status === "posted" && (
                              <DropdownMenuItem
                                onClick={() => voidMut.mutate(v.id)}
                                className="text-destructive"
                              >
                                Huỷ ghi sổ
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {v.status !== "posted" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm("Xoá phiếu này?")) delMut.mutate(v.id);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Xoá
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <VoucherDialog
        open={open}
        onOpenChange={setOpen}
        form={form}
        setForm={setForm}
        totals={totals}
        addLine={addLine}
        updateLine={updateLine}
        removeLine={removeLine}
        onSave={() => {
          if (saveAndPostMut.isPending) return;
          saveAndPostMut.mutate();
        }}
        saving={saveAndPostMut.isPending}
      />
    </div>
  );
}

// ---------------- Dialog ----------------

function VoucherDialog({
  open,
  onOpenChange,
  form,
  setForm,
  totals,
  addLine,
  updateLine,
  removeLine,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  totals: { subtotal: number; discount: number; vat: number; total: number };
  addLine: () => void;
  updateLine: (i: number, p: Partial<Line>) => void;
  removeLine: (i: number) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const branchFn = useServerFn(listBranches);
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchFn(),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });

  const productsFn = useServerFn(listProducts);
  const { data: products } = useQuery({
    queryKey: ["products-picker"],
    queryFn: () => productsFn(),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] max-h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-primary">Phiếu bán hàng</DialogTitle>
            <Select
              value={form.payment_status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, payment_status: v as any }))
              }
            >
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
                <SelectItem value="partial">Thanh toán một phần</SelectItem>
                <SelectItem value="paid">Đã thanh toán</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.issue_einvoice}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, issue_einvoice: !!v }))
                }
              />
              Xuất HĐ
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.create_stock_voucher}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, create_stock_voucher: !!v }))
                }
              />
              Xuất kho
            </label>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Header */}
          <div className="space-y-3">
            <h3 className="text-primary font-semibold border-b pb-1">Phiếu bán hàng</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">
                  <span className="text-destructive">*</span> Khách hàng
                </Label>
                <CustomerCombobox
                  value={form.customer_id}
                  onChange={(c) =>
                    setForm((f) => ({
                      ...f,
                      customer_id: c?.id ?? null,
                      customer_name: c?.name ?? "",
                      customer_tax_id: c?.tax_id ?? "",
                      customer_address: c?.address ?? "",
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">
                  <span className="text-destructive">*</span> TK công nợ phải thu
                </Label>
                <AccountCombobox
                  value={form.debit_account}
                  onChange={(c) => setForm((f) => ({ ...f, debit_account: c }))}
                  filter={(c) => c.startsWith("131")}
                />
              </div>
              <div>
                <Label className="text-xs">Nhóm khách hàng</Label>
                <Input
                  value={form.customer_group}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_group: e.target.value }))
                  }
                  placeholder="Vui lòng chọn"
                />
              </div>
              <div>
                <Label className="text-xs">
                  <span className="text-destructive">*</span> Số chứng từ
                </Label>
                <Input
                  value={form.voucher_no}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, voucher_no: e.target.value }))
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Hạn thanh toán</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, due_date: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Địa chỉ</Label>
                <Input
                  value={form.customer_address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_address: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Chi nhánh</Label>
                <Select
                  value={form.branch_id ?? ""}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, branch_id: v || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chi nhánh" />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">
                  <span className="text-destructive">*</span> Ngày chứng từ
                </Label>
                <Input
                  type="date"
                  value={form.voucher_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, voucher_date: e.target.value }))
                  }
                />
              </div>

              <div>
                <Label className="text-xs">Nhân viên bán hàng</Label>
                <Input
                  value={form.buyer_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, buyer_name: e.target.value }))
                  }
                  placeholder="Vui lòng chọn"
                />
              </div>
              <div>
                <Label className="text-xs">Người mua hàng</Label>
                <Input
                  value={form.buyer_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, buyer_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Ngoại tệ</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end items-end">
                <Label className="text-xs underline">Tổng</Label>
                <div className="text-2xl font-bold text-primary tabular-nums">
                  {fmtMoney(totals.total)}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">
                <span className="text-destructive">*</span> Mô tả
              </Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b pb-1">
              <h3 className="text-primary font-semibold">Giá trị hàng</h3>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Chiết khấu (%):</Label>
                <Input
                  type="number"
                  className="w-20 h-8"
                  value={form.discount_pct || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount_pct: Number(e.target.value || 0),
                    }))
                  }
                />
                <Label className="text-xs">Chiết khấu</Label>
                <Input
                  type="number"
                  className="w-32 h-8 text-right"
                  value={form.discount_pct > 0 ? totals.discount : form.discount_amount || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discount_amount: Number(e.target.value || 0),
                      discount_pct: 0,
                    }))
                  }
                  disabled={form.discount_pct > 0}
                />
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-10">STT</th>
                    <th className="px-2 py-1.5 text-left min-w-[200px]">
                      Tên sản phẩm <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-left">Mã</th>
                    <th className="px-2 py-1.5 text-left">
                      Tk nợ <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-left">
                      Tk có <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-left">Đơn vị</th>
                    <th className="px-2 py-1.5 text-right">Số lượng (*)</th>
                    <th className="px-2 py-1.5 text-right">Đơn giá (*)</th>
                    <th className="px-2 py-1.5 text-right">Giá trị trước thuế</th>
                    <th className="px-2 py-1.5 text-right">Giảm giá (%)</th>
                    <th className="px-2 py-1.5 text-right">Giảm giá</th>
                    <th className="px-2 py-1.5 text-left">
                      TK thuế GTGT <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-right">Thuế GTGT(%)</th>
                    <th className="px-2 py-1.5 text-right">Tiền thuế</th>
                    <th className="px-2 py-1.5 text-right">Thành tiền</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={l.key} className="border-t">
                      <td className="px-2 py-1 text-center">{i + 1}</td>
                      <td className="px-1 py-1">
                        <ProductPickerCell
                          value={l.product_name}
                          products={(products ?? []) as any[]}
                          onPick={(p) => {
                            updateLine(i, {
                              product_id: p.id,
                              product_code: p.code ?? "",
                              product_name: p.name ?? "",
                              unit: p.unit ?? "",
                              unit_price: Number(p.unit_price ?? 0),
                              vat_rate: Number(p.vat_rate ?? 10),
                              credit_account: p.revenue_account ?? l.credit_account,
                              line_type: p.item_type === "service" ? "service" : "goods",
                            });
                          }}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          className="h-8"
                          value={l.product_code}
                          onChange={(e) =>
                            updateLine(i, { product_code: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 w-[120px]">
                        <Input
                          className="h-8"
                          value={l.debit_account}
                          onChange={(e) =>
                            updateLine(i, { debit_account: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 w-[120px]">
                        <Input
                          className="h-8"
                          value={l.credit_account}
                          onChange={(e) =>
                            updateLine(i, { credit_account: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 w-[80px]">
                        <Input
                          className="h-8"
                          value={l.unit}
                          onChange={(e) => updateLine(i, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 w-[80px]">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={l.qty || ""}
                          onChange={(e) =>
                            updateLine(i, { qty: Number(e.target.value || 0) })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 w-[110px]">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={l.unit_price || ""}
                          onChange={(e) =>
                            updateLine(i, { unit_price: Number(e.target.value || 0) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {fmtMoney(l.amount)}
                      </td>
                      <td className="px-1 py-1 w-[80px]">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={l.discount_pct || ""}
                          onChange={(e) =>
                            updateLine(i, {
                              discount_pct: Number(e.target.value || 0),
                              discount_amount: 0,
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {fmtMoney(l.discount_amount)}
                      </td>
                      <td className="px-1 py-1 w-[120px]">
                        <Input
                          className="h-8"
                          value={l.vat_account}
                          onChange={(e) =>
                            updateLine(i, { vat_account: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 w-[80px]">
                        <Input
                          type="number"
                          className="h-8 text-right"
                          value={l.vat_rate || ""}
                          onChange={(e) =>
                            updateLine(i, { vat_rate: Number(e.target.value || 0) })
                          }
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {fmtMoney(l.vat_amount)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">
                        {fmtMoney(l.total)}
                      </td>
                      <td className="px-1 py-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeLine(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30 font-medium">
                    <td colSpan={6} className="px-2 py-1.5">Tổng</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMoney(form.lines.reduce((s, l) => s + l.qty, 0))}
                    </td>
                    <td></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMoney(totals.subtotal)}
                    </td>
                    <td></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMoney(totals.discount)}
                    </td>
                    <td></td>
                    <td></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMoney(totals.vat)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtMoney(totals.total)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {form.lines.map((l, i) => (
                <Card key={l.key} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Dòng {i + 1}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeLine(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <ProductPickerCell
                    value={l.product_name}
                    products={(products ?? []) as any[]}
                    onPick={(p) => {
                      updateLine(i, {
                        product_id: p.id,
                        product_code: p.code ?? "",
                        product_name: p.name ?? "",
                        unit: p.unit ?? "",
                        unit_price: Number(p.unit_price ?? 0),
                        vat_rate: Number(p.vat_rate ?? 10),
                        credit_account: p.revenue_account ?? l.credit_account,
                        line_type: p.item_type === "service" ? "service" : "goods",
                      });
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Số lượng</Label>
                      <Input
                        type="number"
                        value={l.qty || ""}
                        onChange={(e) =>
                          updateLine(i, { qty: Number(e.target.value || 0) })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Đơn giá</Label>
                      <Input
                        type="number"
                        value={l.unit_price || ""}
                        onChange={(e) =>
                          updateLine(i, { unit_price: Number(e.target.value || 0) })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">TK nợ</Label>
                      <Input
                        value={l.debit_account}
                        onChange={(e) => updateLine(i, { debit_account: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">TK có</Label>
                      <Input
                        value={l.credit_account}
                        onChange={(e) => updateLine(i, { credit_account: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Thuế %</Label>
                      <Input
                        type="number"
                        value={l.vat_rate || ""}
                        onChange={(e) =>
                          updateLine(i, { vat_rate: Number(e.target.value || 0) })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">TK thuế</Label>
                      <Input
                        value={l.vat_account}
                        onChange={(e) => updateLine(i, { vat_account: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 text-xs pt-2 border-t">
                    <div>
                      <div className="text-muted-foreground">Trước thuế</div>
                      <div className="tabular-nums">{fmtMoney(l.amount)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Tiền thuế</div>
                      <div className="tabular-nums">{fmtMoney(l.vat_amount)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Thành tiền</div>
                      <div className="tabular-nums font-medium">{fmtMoney(l.total)}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Thêm
              </Button>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between gap-2 shrink-0 bg-background">
          <div className="text-sm text-muted-foreground">
            Tổng cộng:{" "}
            <span className="text-primary font-bold text-lg tabular-nums">
              {fmtMoney(totals.total)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Huỷ
            </Button>
            <Button variant="default" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {saving ? "Đang lưu…" : "Lưu và thoát"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

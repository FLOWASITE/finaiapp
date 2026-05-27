import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { AttachInvoiceFile } from "@/components/AttachInvoiceFile";
import { Plus, Trash2, RefreshCw, FileCheck2, Loader2, MoreHorizontal, X, FileText, Wallet, TrendingUp, FileX, Check, Paperclip, ChevronDown, Globe2, Upload, Printer, FileSpreadsheet, CircleDollarSign, Landmark, PackagePlus, Eye } from "lucide-react";

import {
  listSalesVouchers,
  getSalesVoucher,
  createSalesVoucher,
  updateSalesVoucher,
  deleteSalesVoucher,
  postSalesVoucher,
  voidSalesVoucher,
  previewVoidSalesVoucher,
  suggestSalesVoucherNo,
  recordSalesVoucherReceipt,
  stickSalesStockVoucher,
} from "@/lib/sales-vouchers.functions";
import { VoidConfirmDialog } from "@/components/void-confirm-dialog";
import { StickStockVoucherDialog, type StickStockTarget } from "@/components/stick-stock-voucher-dialog";
import { listProducts } from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { listBranches } from "@/lib/dimensions.functions";
import { listCustomers } from "@/lib/customers.functions";
import { listPartyGroups } from "@/lib/partyGroups.functions";
import { MoneyInput } from "@/components/ui/money-input";
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
import { DateRangeFilter } from "@/components/date-range-filter";
import { getPresetRange } from "@/lib/date-presets";
import { VoucherFormDialog } from "@/components/voucher-form";
import { BankVoucherFormDialog } from "@/components/bank-voucher-form";
import { usePagination, TablePagination } from "@/components/table-pagination";
import { ProductPickerCell } from "@/components/vouchers/ProductPickerCell";

// ProductPickerCell đã chuyển sang component dùng chung: @/components/vouchers/ProductPickerCell

export const Route = createFileRoute("/_app/sales/vouchers")({
  component: SalesVouchersPage,
  validateSearch: (s: Record<string, unknown>) => ({
    new: s.new === true || s.new === "1" || s.new === 1 ? true : undefined,
    party_id: typeof s.party_id === "string" ? s.party_id : undefined,
    party_name: typeof s.party_name === "string" ? s.party_name : undefined,
    party_tax_id: typeof s.party_tax_id === "string" ? s.party_tax_id : undefined,
    party_address: typeof s.party_address === "string" ? s.party_address : undefined,
    edit: typeof s.edit === "string" ? s.edit : undefined,
  }),
});

// ---------------- helpers ----------------

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "amber" | "emerald" | "sky" | "rose";
}) {
  const toneCls = {
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  } as const;
  return (
    <Card>
      <CardContent className="p-2 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className={`h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-full grid place-items-center ${toneCls[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs text-muted-foreground truncate leading-tight">{label}</div>
          <div className="text-sm sm:text-lg font-semibold tabular-nums truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label?: string }) {
  const text = label ?? (ok ? "Có" : "Không");
  return ok ? (
    <span
      title={text}
      aria-label={text}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    >
      <Check className="h-3 w-3" />
    </span>
  ) : (
    <span
      title={text}
      aria-label={text}
      className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30"
    />
  );
}

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
  warehouse_id: string | null;
  stock_voucher_no: string;
  stock_voucher_date: string;
  stock_voucher_reason: string;
  discount_pct: number;
  discount_amount: number;
  notes: string;
  lines: Line[];
  einvoice: {
    invoice_template: string;
    invoice_series: string;
    invoice_no: string;
    issue_date: string;
    tct_lookup_code: string;
    notes: string;
    pdf_path: string;
    xml_path: string;
  };
};

const blankEinvoice = () => ({
  invoice_template: "",
  invoice_series: "",
  invoice_no: "",
  issue_date: "",
  tct_lookup_code: "",
  notes: "",
  pdf_path: "",
  xml_path: "",
});

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
  warehouse_id: null,
  stock_voucher_no: "",
  stock_voucher_date: "",
  stock_voucher_reason: "",
  discount_pct: 0,
  discount_amount: 0,
  notes: "",
  lines: [emptyLine()],
  einvoice: blankEinvoice(),
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
  const stickSales = useServerFn(stickSalesStockVoucher);
  const voidFn = useServerFn(voidSalesVoucher);
  const previewVoidFn = useServerFn(previewVoidSalesVoucher);
  const branchFnPage = useServerFn(listBranches);
  const productsFnPage = useServerFn(listProducts);

  // ---------- Filters ----------
  const defaultPeriod = useMemo(() => getPresetRange("thisYear"), []);
  const [fStatus, setFStatus] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>(defaultPeriod.from);
  const [fTo, setFTo] = useState<string>(defaultPeriod.to);
  const [fCustomerId, setFCustomerId] = useState<string | null>(null);
  const [fSearch, setFSearch] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const listInput = useMemo(
    () => ({
      status: fStatus !== "all" ? fStatus : undefined,
      customerId: fCustomerId || undefined,
      from: fFrom || undefined,
      to: fTo || undefined,
      search: fSearch.trim() || undefined,
    }),
    [fStatus, fCustomerId, fFrom, fTo, fSearch],
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
    fFrom !== defaultPeriod.from ||
    fTo !== defaultPeriod.to ||
    !!fCustomerId ||
    !!fSearch.trim();

  function resetFilters() {
    setFStatus("all");
    setFFrom(defaultPeriod.from);
    setFTo(defaultPeriod.to);
    setFCustomerId(null);
    setFSearch("");
  }


  // ---------- Selection ----------
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = (vouchers?.rows ?? []) as any[];
  const pagination = usePagination(rows, 20, listInput);
  const pageRows = pagination.pageRows;
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

  function openCreate(prefill?: Partial<FormState>) {
    // Mở dialog ngay; số phiếu fetch song song và patch sau khi có
    setForm({ ...blankForm(), ...(prefill ?? {}) });
    setOpen(true);
    suggest({ data: { voucher_date: todayISO() } })
      .then((r) => {
        setForm((f) => (f.voucher_no ? f : { ...f, voucher_no: r.voucher_no }));
      })
      .catch(() => {});
  }

  // Auto-open create dialog when navigated with ?new=1&party_id=...
  const search = Route.useSearch();
  const navigateRoute = useNavigate();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (search.new && search.party_id) {
      autoOpenedRef.current = true;
      openCreate({
        customer_id: search.party_id,
        customer_name: search.party_name ?? "",
        customer_tax_id: search.party_tax_id ?? "",
        customer_address: search.party_address ?? "",
      });
      navigateRoute({
        to: "/sales/vouchers",
        search: {},
        replace: true,
      });
    } else if (search.edit) {
      autoOpenedRef.current = true;
      openEdit(search.edit).catch(() => {});
      navigateRoute({
        to: "/sales/vouchers",
        search: {},
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.new, search.party_id, search.edit]);

  // Warm-up cache cho dialog tạo phiếu (gọi khi hover/focus nút)
  function prefetchCreate() {
    qc.prefetchQuery({
      queryKey: ["branches"],
      queryFn: () => branchFnPage(),
      ...QUERY_PRESETS.REFERENCE,
    }).catch(() => {});
    qc.prefetchQuery({
      queryKey: ["products-picker"],
      queryFn: () => productsFnPage(),
      ...QUERY_PRESETS.REFERENCE,
    }).catch(() => {});
  }

  async function openEdit(id: string) {
    const { voucher, einvoice } = await get({ data: { id } });
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
      warehouse_id: (voucher as any).warehouse_id ?? null,
      stock_voucher_no: (voucher as any).stock_voucher_no ?? "",
      stock_voucher_date: (voucher as any).stock_voucher_date ?? "",
      stock_voucher_reason: (voucher as any).stock_voucher_reason ?? "",
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
      einvoice: einvoice
        ? {
            invoice_template: einvoice.invoice_template ?? "",
            invoice_series: einvoice.invoice_series ?? "",
            invoice_no: einvoice.invoice_no ?? "",
            issue_date: einvoice.issue_date ?? "",
            tct_lookup_code: einvoice.tct_lookup_code ?? "",
            notes: einvoice.notes ?? "",
            pdf_path: einvoice.pdf_path ?? "",
            xml_path: einvoice.xml_path ?? "",
          }
        : blankEinvoice(),
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
      warehouse_id: form.create_stock_voucher ? (form.warehouse_id || null) : null,
      stock_voucher_no: form.create_stock_voucher ? (form.stock_voucher_no.trim() || null) : null,
      stock_voucher_date: form.create_stock_voucher ? (form.stock_voucher_date || null) : null,
      stock_voucher_reason: form.create_stock_voucher ? (form.stock_voucher_reason.trim() || null) : null,
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
      einvoice: form.issue_einvoice
        ? {
            invoice_template: form.einvoice.invoice_template || null,
            invoice_series: form.einvoice.invoice_series || null,
            invoice_no: form.einvoice.invoice_no || null,
            issue_date: form.einvoice.issue_date || null,
            tct_lookup_code: form.einvoice.tct_lookup_code || null,
            notes: form.einvoice.notes || null,
            pdf_path: form.einvoice.pdf_path || null,
            xml_path: form.einvoice.xml_path || null,
          }
        : null,
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
      if (form.issue_einvoice && !form.einvoice.invoice_no.trim()) {
        throw new Error("Vui lòng nhập Số hoá đơn cho HĐĐT đầu ra");
      }
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
      let postError: string | undefined;
      try {
        await post({ data: { id } });
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (!/đã ghi sổ/i.test(msg)) postError = msg;
      }
      // Fallback: nếu tick Xuất kho mà post chưa sinh phiếu kho, gọi stickSalesStockVoucher.
      if (form.create_stock_voucher && form.warehouse_id) {
        try {
          await stickSales({ data: { id, warehouseId: form.warehouse_id } });
        } catch (e: any) {
          const msg = String(e?.message || "");
          if (!/đã có phiếu xuất kho/i.test(msg)) {
            postError = postError || msg;
          }
        }
      }
      return postError
        ? { posted: false as const, postError }
        : { posted: true as const };
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

  const [voidDlg, setVoidDlg] = useState<{ open: boolean; id?: string; items: Array<{ type: string; label: string; detail?: string }> }>({ open: false, items: [] });
  const [stickTarget, setStickTarget] = useState<StickStockTarget>(null);

  const openVoidDialog = async (id: string) => {
    try {
      const res = await previewVoidFn({ data: { id } });
      setVoidDlg({ open: true, id, items: res.items });
    } catch (e: any) {
      toast.error(e?.message || "Không lấy được thông tin huỷ");
    }
  };

  const voidMut = useMutation({
    mutationFn: async (id: string) =>
      voidFn({ data: { id, reason: "Huỷ ghi sổ" } }),
    onSuccess: () => {
      toast.success("Đã huỷ ghi sổ, phiếu có thể ghi sổ lại");
      setVoidDlg({ open: false, items: [] });
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message || "Huỷ ghi sổ thất bại"),
  });

  // (Quick-pay dialog removed — replaced by full VoucherFormDialog / BankVoucherFormDialog below.)


  // Cash/Bank receipt dialogs (replaces the old quick-pay dialog)
  const [payCash, setPayCash] = useState<{ open: boolean; prefill?: any }>({ open: false });
  const [payBank, setPayBank] = useState<{ open: boolean; prefill?: any }>({ open: false });

  const recordReceipt = useServerFn(recordSalesVoucherReceipt);
  const payMut = useMutation({
    mutationFn: (input: { voucher_id: string; method: "cash" | "bank"; amount: number }) =>
      recordReceipt({ data: input }),
    onSuccess: () => {
      toast.success("Đã thu tiền & cập nhật công nợ");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message ?? "Không thu được tiền"),
  });

  const openPay = (v: any, method: "cash" | "bank") => {
    const remain = Math.max(0, Number(v.total || 0) - Number(v.paid_amount || 0));
    if (remain <= 0) {
      toast.info("Phiếu đã thanh toán đủ");
      return;
    }
    // Thu nhanh: tạo cash/bank voucher + cập nhật paid_amount của phiếu bán trong 1 lần
    payMut.mutate({ voucher_id: v.id, method, amount: remain });
  };


  return (
    <div>
      <SalesTabs />
    <div className="py-6 px-4 space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Phiếu bán hàng</h1>
          <p className="text-sm text-muted-foreground">
            Lập phiếu bán hàng, ghi sổ doanh thu và công nợ phải thu.
          </p>
        </div>
        <div className="shrink-0 inline-flex rounded-md shadow-sm">
          <Button
            onClick={() => openCreate()}
            onMouseEnter={prefetchCreate}
            onFocus={prefetchCreate}
            className="rounded-r-none border-r border-primary-foreground/20"
          >
            <Plus className="h-4 w-4 mr-1" /> Phiếu BH trong nước
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-l-none px-2" aria-label="Tuỳ chọn thêm phiếu">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => openCreate()}>
                <Plus className="h-4 w-4 mr-2" /> Phiếu BH trong nước
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openCreate()}>
                <Globe2 className="h-4 w-4 mr-2" /> Phiếu BH xuất khẩu
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => toast.info("Tính năng import đang phát triển")}>
                <Upload className="h-4 w-4 mr-2" /> Import phiếu BH trong nước
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Tính năng import đang phát triển")}>
                <Upload className="h-4 w-4 mr-2" /> Import phiếu BH xuất khẩu
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Tải danh sách (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Đang chuẩn bị file Excel...")}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Tải Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (selected.size === 0) {
                    toast.info("Chưa chọn phiếu nào để xoá");
                    return;
                  }
                  toast.info(`Đã chọn ${selected.size} phiếu — dùng nút Xoá ở thanh hành động.`);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Xoá tất cả đã chọn
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileX className="h-5 w-5" />}
          label="Chưa xuất hoá đơn"
          value={kpi.noInvoice.toLocaleString("vi-VN")}
          tone="amber"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Doanh thu (trong bộ lọc)"
          value={fmtMoney(kpi.revenue)}
          tone="emerald"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label="Đã thanh toán"
          value={fmtMoney(kpi.paid)}
          tone="sky"
        />
        <KpiCard
          icon={<FileText className="h-5 w-5" />}
          label="Tổng nợ phải thu"
          value={fmtMoney(kpi.receivable)}
          tone="rose"
        />
      </div>


      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="flex items-center justify-between mb-2 md:hidden">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="text-sm font-medium inline-flex items-center gap-1"
            >
              Bộ lọc{hasActiveFilters ? ` (đang lọc)` : ""}
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 px-2 text-xs">
                <X className="h-3 w-3 mr-1" /> Xoá lọc
              </Button>
            )}
          </div>
          <div className={`${showFilters ? "grid" : "hidden"} md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 items-end`}>
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
              <DateRangeFilter from={fFrom} to={fTo} onChange={(r) => { setFFrom(r.from); setFTo(r.to); }} className="w-full justify-start" />
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
            <div className="hidden md:flex gap-2">
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="w-full">
                  <X className="h-4 w-4 mr-1" /> Xoá lọc
                </Button>
              )}
            </div>
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
            <EmptyState
              title="Chưa có phiếu bán hàng nào"
              description="Tạo phiếu đầu tiên để Fin theo dõi doanh thu."
              cta={
                <Button variant="outline" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4 mr-1" /> Tạo phiếu đầu tiên
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-[13px]">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-9 px-2">
                      <Checkbox
                        checked={allSelected || (someSelected && "indeterminate")}
                        onCheckedChange={toggleAll}
                        aria-label="Chọn tất cả"
                      />
                    </TableHead>
                    <TableHead className="w-10 text-center">STT</TableHead>
                    <TableHead className="whitespace-nowrap">Ngày chứng từ</TableHead>
                    <TableHead className="whitespace-nowrap">Số chứng từ</TableHead>
                    <TableHead className="whitespace-nowrap">Số hoá đơn</TableHead>
                    <TableHead className="whitespace-nowrap">Ngày hoá đơn</TableHead>
                    <TableHead className="min-w-[200px]">Khách hàng</TableHead>
                    <TableHead className="min-w-[260px]">Mô tả</TableHead>
                    <TableHead className="whitespace-nowrap">Loại phiếu</TableHead>
                    <TableHead className="whitespace-nowrap">Số phiếu xuất</TableHead>
                    <TableHead className="whitespace-nowrap">Ngày xuất kho</TableHead>
                    <TableHead className="text-center whitespace-nowrap">TT xuất kho</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Trạng thái</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Giá trị đơn hàng</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Chiết khấu</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Đã thanh toán</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Còn phải thu</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Tài liệu</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Thanh toán</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((v: any, i: number) => { const idx = (pagination.page - 1) * pagination.pageSize + i;
                    const total = Number(v.total || 0);
                    const paid = Number(v.paid_amount || 0);
                    const remain = Math.max(0, total - paid);
                    const isSel = selected.has(v.id);
                    const isPosted = v.status === "posted";
                    const isVoid = v.status === "void";
                    const isPaid =
                      v.payment_status === "paid" ||
                      Number(v.paid_amount || 0) >= Number(v.total || 0) - 0.01;
                    return (
                      <TableRow
                        key={v.id}
                        className={`cursor-pointer hover:bg-accent/60 ${isSel ? "bg-primary/5" : ""}`}
                        onClick={() => openEdit(v.id)}
                        style={{ height: 40 }}
                      >
                        <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleOne(v.id)}
                            aria-label="Chọn dòng"
                          />
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground tabular-nums">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{v.voucher_date}</TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          {v.voucher_no}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                          {v.einvoice_no ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {(v as any).einvoice_date ?? "—"}
                        </TableCell>
                        <TableCell className="truncate max-w-[260px]">
                          {v.customer_name ?? "—"}
                        </TableCell>
                        <TableCell className="truncate max-w-[320px]">{v.reason}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          Trong nước
                        </TableCell>
                        <TableCell className="font-mono whitespace-nowrap text-muted-foreground">
                          {v.stock_voucher_no ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {(v as any).stock_voucher_date ?? "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusDot ok={!!v.stock_voucher_id} />
                        </TableCell>
                        <TableCell className="text-center">
                          {isVoid ? (
                            <span
                              title="Đã huỷ"
                              aria-label="Đã huỷ"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          ) : (
                            <StatusDot ok={isPosted} label={isPosted ? "Đã ghi sổ" : "Chưa ghi sổ"} />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {total > 0 ? fmtMoney(total) : "0"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtMoney(Number(v.discount_amount || 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {paid > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">{fmtMoney(paid)}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {remain > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400">{fmtMoney(remain)}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {v.einvoice_id ? (
                            <Paperclip className="h-3.5 w-3.5 inline text-muted-foreground" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {isPaid ? (
                            <StatusDot ok />
                          ) : isPosted && !isVoid ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openPay(v, "cash")}
                                title="Tạo phiếu thu tiền mặt"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                              >
                                <CircleDollarSign className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openPay(v, "bank")}
                                title="Tạo báo có ngân hàng"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                              >
                                <Landmark className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <StatusDot ok={false} />
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-primary hover:text-primary"
                              onClick={() => openEdit(v.id)}
                              title="Mở phiếu bán hàng"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(v.id)}>
                                  <Eye className="h-4 w-4 mr-2" /> Mở phiếu
                                </DropdownMenuItem>
                                {!isPosted && (
                                  <DropdownMenuItem onClick={() => postMut.mutate(v.id)}>
                                    <FileCheck2 className="h-4 w-4 mr-2" /> {v.posted_at ? "Ghi sổ lại" : "Ghi sổ"}
                                  </DropdownMenuItem>
                                )}
                                {isPosted && (
                                  <DropdownMenuItem
                                    onClick={() => openVoidDialog(v.id)}
                                    className="text-destructive"
                                  >
                                    <X className="h-4 w-4 mr-2" /> Huỷ ghi sổ
                                  </DropdownMenuItem>
                                )}
                                {!v.stock_voucher_id && (
                                  <DropdownMenuItem
                                    onClick={() => setStickTarget({ kind: "sales", id: v.id, voucher_no: v.voucher_no })}
                                  >
                                    <PackagePlus className="h-4 w-4 mr-2" /> Tạo phiếu xuất kho
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {!isPosted && (
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {rows.length > 0 && (() => {
                  const t = rows.reduce(
                    (a: any, v: any) => {
                      const total = Number(v.total || 0);
                      const paid = Number(v.paid_amount || 0);
                      a.total += total;
                      a.discount += Number(v.discount_amount || 0);
                      a.paid += paid;
                      a.remain += Math.max(0, total - paid);
                      return a;
                    },
                    { total: 0, discount: 0, paid: 0, remain: 0 }
                  );
                  return (
                    <tfoot className="bg-muted/40 font-semibold border-t-2 border-border">
                      <tr style={{ height: 40 }}>
                        <td colSpan={13} className="px-3 py-2 text-right">Tổng cộng ({rows.length} phiếu)</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.total)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.discount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(t.paid)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">{fmtMoney(t.remain)}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </Table>
            </div>
          )}
          <TablePagination {...pagination} />
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

      <VoucherFormDialog
        type="receipt"
        open={payCash.open}
        onOpenChange={(o) => setPayCash((s) => ({ ...s, open: o }))}
        prefill={payCash.prefill}
        onSaved={() => qc.invalidateQueries({ queryKey: ["sales-vouchers"] })}
      />
      <BankVoucherFormDialog
        type="receipt"
        open={payBank.open}
        onOpenChange={(o) => setPayBank((s) => ({ ...s, open: o }))}
        prefill={payBank.prefill}
        onSaved={() => qc.invalidateQueries({ queryKey: ["sales-vouchers"] })}
      />
      <VoidConfirmDialog
        open={voidDlg.open}
        onOpenChange={(o) => setVoidDlg((s) => ({ ...s, open: o }))}
        items={voidDlg.items}
        loading={voidMut.isPending}
        onConfirm={() => voidDlg.id && voidMut.mutate(voidDlg.id)}
      />
      <StickStockVoucherDialog target={stickTarget} onClose={() => setStickTarget(null)} />
    </div>
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

  const warehousesFn = useServerFn(listWarehouses);
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-picker"],
    queryFn: () => warehousesFn(),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });

  // Auto-fill default warehouse when stock voucher panel opens
  useEffect(() => {
    if (form.create_stock_voucher && !form.warehouse_id) {
      const list = (warehouses ?? []) as any[];
      const def = list.find((w) => w.is_default) ?? list[0];
      if (def) setForm((f) => ({ ...f, warehouse_id: def.id }));
    }
  }, [form.create_stock_voucher, warehouses, form.warehouse_id]);

  const customersFn = useServerFn(listCustomers);
  const customerGroupsFn = useServerFn(listPartyGroups);
  const { data: customersAll } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersFn({}),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });
  const { data: customerGroups } = useQuery({
    queryKey: ["party-groups", "customer"],
    queryFn: () => customerGroupsFn({ data: { kind: "customer" } }),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });
  const customerById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of (customersAll ?? []) as any[]) m.set(c.id, c);
    return m;
  }, [customersAll]);
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of (customerGroups ?? []) as any[]) m.set(g.id, g.name);
    return m;
  }, [customerGroups]);

  // Auto-update "Mô tả" khi người dùng chưa chỉnh tay
  const [reasonTouched, setReasonTouched] = useState(false);
  useEffect(() => {
    if (!open) setReasonTouched(false);
  }, [open]);
  useEffect(() => {
    if (!open || reasonTouched) return;
    const next = `Bán hàng cho khách hàng ${form.customer_name || "---"} theo hoá đơn số ${form.einvoice.invoice_no || form.voucher_no || "---"}`;
    if (next !== form.reason) {
      setForm((f) => ({ ...f, reason: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reasonTouched, form.customer_name, form.voucher_no, form.einvoice.invoice_no]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[99vw] sm:w-[98vw] sm:max-w-[1800px] xl:max-w-[1950px] max-h-[97vh] flex flex-col p-0 gap-0">
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
          {/* Khu vực Phiếu xuất kho */}
          {form.create_stock_voucher && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <h4 className="text-sm font-semibold text-primary">Phiếu xuất kho</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs"><span className="text-destructive">*</span> Kho</Label>
                  <Select
                    value={form.warehouse_id ?? ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, warehouse_id: v || null }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Chọn kho" /></SelectTrigger>
                    <SelectContent>
                      {((warehouses ?? []) as any[]).map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Số phiếu xuất kho</Label>
                  <Input
                    className="h-9"
                    placeholder={`XK-${form.voucher_no || ""}`}
                    value={form.stock_voucher_no}
                    onChange={(e) => setForm((f) => ({ ...f, stock_voucher_no: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Ngày phiếu xuất kho</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={form.stock_voucher_date || form.voucher_date}
                    onChange={(e) => setForm((f) => ({ ...f, stock_voucher_date: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">Diễn giải</Label>
                  <Input
                    className="h-9"
                    placeholder={`Xuất kho theo phiếu ${form.voucher_no || ""}`}
                    value={form.stock_voucher_reason}
                    onChange={(e) => setForm((f) => ({ ...f, stock_voucher_reason: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

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
                  onChange={(c) => {
                    const full = c?.id ? customerById.get(c.id) : null;
                    const groupId = (full as any)?.group_id ?? null;
                    const groupName = groupId ? (groupNameById.get(groupId) ?? "") : "";
                    setForm((f) => ({
                      ...f,
                      customer_id: c?.id ?? null,
                      customer_name: c?.name ?? "",
                      customer_tax_id: c?.tax_id ?? "",
                      customer_address: c?.address ?? "",
                      customer_group: groupName || f.customer_group,
                    }));
                  }}
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
                onChange={(e) => {
                  setReasonTouched(true);
                  setForm((f) => ({ ...f, reason: e.target.value }));
                }}
                rows={2}
              />

            </div>
          </div>

          {form.issue_einvoice && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <h3 className="text-primary font-semibold border-b border-primary/20 pb-1">
                Thông tin hoá đơn đầu ra
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Mẫu số</Label>
                  <Input
                    value={form.einvoice.invoice_template}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einvoice: { ...f.einvoice, invoice_template: e.target.value },
                      }))
                    }
                    placeholder="VD: 1/001"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ký hiệu</Label>
                  <Input
                    value={form.einvoice.invoice_series}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einvoice: { ...f.einvoice, invoice_series: e.target.value },
                      }))
                    }
                    placeholder="VD: K25TAA"
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    <span className="text-destructive">*</span> Số hoá đơn
                  </Label>
                  <Input
                    value={form.einvoice.invoice_no}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einvoice: { ...f.einvoice, invoice_no: e.target.value },
                      }))
                    }
                    placeholder="VD: 00000123"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ngày hoá đơn</Label>
                  <Input
                    type="date"
                    value={form.einvoice.issue_date || form.voucher_date}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einvoice: { ...f.einvoice, issue_date: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Mã tra cứu CQT</Label>
                  <Input
                    value={form.einvoice.tct_lookup_code}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einvoice: { ...f.einvoice, tct_lookup_code: e.target.value },
                      }))
                    }
                    placeholder="Mã tra cứu trên hoá đơn điện tử"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Ghi chú HĐĐT</Label>
                  <Input
                    value={form.einvoice.notes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        einvoice: { ...f.einvoice, notes: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <AttachInvoiceFile
                    bucket="einvoices"
                    filePath={form.einvoice.pdf_path}
                    label="File PDF hoá đơn điện tử"
                    accept="application/pdf,image/*"
                    allowClear
                    onUploaded={(path: string) =>
                      setForm((f) => ({ ...f, einvoice: { ...f.einvoice, pdf_path: path } }))
                    }
                    onClear={() =>
                      setForm((f) => ({ ...f, einvoice: { ...f.einvoice, pdf_path: "" } }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <AttachInvoiceFile
                    bucket="einvoices"
                    filePath={form.einvoice.xml_path}
                    label="File XML hoá đơn điện tử"
                    accept=".xml,text/xml,application/xml"
                    allowClear
                    onUploaded={(path: string) =>
                      setForm((f) => ({ ...f, einvoice: { ...f.einvoice, xml_path: path } }))
                    }
                    onClear={() =>
                      setForm((f) => ({ ...f, einvoice: { ...f.einvoice, xml_path: "" } }))
                    }
                  />
                </div>
              </div>
            </div>
          )}


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
              <table className="w-full min-w-[1550px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-10">STT</th>
                    <th className="px-2 py-1.5 text-left min-w-[220px]">
                      Tên sản phẩm <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-left w-28">Mã</th>
                    <th className="px-2 py-1.5 text-left w-24">
                      Tk nợ <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-left w-24">
                      Tk có <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-left w-20">Đơn vị</th>
                    <th className="px-2 py-1.5 text-right w-24">Số lượng (*)</th>
                    <th className="px-2 py-1.5 text-right w-32">Đơn giá (*)</th>
                    <th className="px-2 py-1.5 text-right w-32">Giá trị trước thuế</th>
                    <th className="px-2 py-1.5 text-right w-20">Giảm giá (%)</th>
                    <th className="px-2 py-1.5 text-right w-28">Giảm giá</th>
                    <th className="px-2 py-1.5 text-left w-28">
                      TK thuế GTGT <span className="text-destructive">(*)</span>
                    </th>
                    <th className="px-2 py-1.5 text-right w-20">Thuế GTGT(%)</th>
                    <th className="px-2 py-1.5 text-right w-32">Tiền thuế</th>
                    <th className="px-2 py-1.5 text-right w-32">Thành tiền</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={l.key} className="border-t">
                      <td className="px-2 py-1 text-center">{i + 1}</td>
                      <td className="px-1 py-1">
                        <ProductPickerCell
                          mode="sales"
                          value={l.product_name}
                          code={l.product_code}
                          products={(products ?? []) as any[]}
                          onClear={() =>
                            updateLine(i, {
                              product_id: null,
                              product_code: "",
                              product_name: "",
                            })
                          }
                          onPick={(p: any) => {
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
                        <MoneyInput
                          className="h-8"
                          value={l.unit_price || 0}
                          onChange={(n) => updateLine(i, { unit_price: n })}
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
                    mode="sales"
                    value={l.product_name}
                    code={l.product_code}
                    products={(products ?? []) as any[]}
                    onPick={(p: any) => {
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
                      <MoneyInput
                        value={l.unit_price || 0}
                        onChange={(n) => updateLine(i, { unit_price: n })}
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

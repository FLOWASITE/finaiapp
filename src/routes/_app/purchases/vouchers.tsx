import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, FileText, Check, X, Trash2, PlusCircle, ChevronDown, Loader2, AlertCircle, Inbox, Upload, ExternalLink, FileX, Wallet, TrendingDown, Paperclip, MoreHorizontal, CircleDollarSign, Landmark, Calendar, MoreVertical, PackagePlus, Eye, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { PurchaseTabs } from "@/components/purchases/PurchaseTabs";
import { supabase } from "@/integrations/supabase/client";
import { AttachInvoiceFile } from "@/components/AttachInvoiceFile";

import {
  listPurchaseVouchers,
  createPurchaseVoucher,
  updatePurchaseVoucher,
  getPurchaseVoucher,
  postPurchaseVoucher,
  voidPurchaseVoucher,
  previewVoidPurchaseVoucher,
  deletePurchaseVoucher,
  suggestVoucherNo,
  listLinkablePurchaseInvoices,
  recordPurchaseVoucherPayment,
  stickStockVoucher,
} from "@/lib/purchase-vouchers.functions";
import { VoidConfirmDialog } from "@/components/void-confirm-dialog";
import { StickStockVoucherDialog, type StickStockTarget } from "@/components/stick-stock-voucher-dialog";
import { listSuppliers } from "@/lib/purchases.functions";
import { listPartyGroups } from "@/lib/partyGroups.functions";
import { listProducts } from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PartyForm } from "@/components/party-form";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { VoucherFormDialog } from "@/components/voucher-form";
import { BankVoucherFormDialog } from "@/components/bank-voucher-form";
import { usePagination, TablePagination } from "@/components/table-pagination";
import { ProductPickerCell } from "@/components/vouchers/ProductPickerCell";

export const Route = createFileRoute("/_app/purchases/vouchers")({
  component: PurchaseVouchersPage,
  validateSearch: (s: Record<string, unknown>) => ({
    new: s.new === true || s.new === "1" || s.new === 1 ? true : undefined,
    party_id: typeof s.party_id === "string" ? s.party_id : undefined,
    party_name: typeof s.party_name === "string" ? s.party_name : undefined,
    party_tax_id: typeof s.party_tax_id === "string" ? s.party_tax_id : undefined,
    party_address: typeof s.party_address === "string" ? s.party_address : undefined,
    edit: typeof s.edit === "string" ? s.edit : undefined,
  }),
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

const firstOfYearISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDateVN = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "amber" | "emerald" | "sky" | "rose";
}) {
  const toneCls = {
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
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
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
    >
      <X className="h-3 w-3" />
    </span>
  );
}

const PURCHASE_TABS: Array<{ label: string; to?: string; disabled?: boolean }> = [
  { label: "Đơn đặt hàng", disabled: true },
  { label: "Phiếu mua hàng", to: "/purchases/vouchers" },
  { label: "Hoá đơn", to: "/invoices" },
  { label: "Phiếu nhập kho", disabled: true },
  { label: "Trả lại hàng mua", disabled: true },
];

// ProductPickerCell đã chuyển sang component dùng chung: @/components/vouchers/ProductPickerCell

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
  const previewVoidFn = useServerFn(previewVoidPurchaseVoucher);
  const delFn = useServerFn(deletePurchaseVoucher);
  const suppliersFnPage = useServerFn(listSuppliers);
  const linkInvFnPage = useServerFn(listLinkablePurchaseInvoices);
  const suggestNoFnPage = useServerFn(suggestVoucherNo);

  const [openCreate, setOpenCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>(firstOfYearISO());
  const [fTo, setFTo] = useState<string>(todayISO());
  const [showFilters, setShowFilters] = useState<boolean>(false);
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialParty, setInitialParty] = useState<{ id: string; name: string; tax_id?: string; address?: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const searchParams = Route.useSearch();
  const navigateRoute = useNavigate();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (searchParams.new && searchParams.party_id) {
      autoOpenedRef.current = true;
      setInitialParty({
        id: searchParams.party_id,
        name: searchParams.party_name ?? "",
        tax_id: searchParams.party_tax_id,
        address: searchParams.party_address,
      });
      setOpenCreate(true);
      navigateRoute({ to: "/purchases/vouchers", search: {}, replace: true });
    } else if (searchParams.edit) {
      autoOpenedRef.current = true;
      setEditId(searchParams.edit);
      navigateRoute({ to: "/purchases/vouchers", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.new, searchParams.party_id, searchParams.edit]);

  const payFn = useServerFn(recordPurchaseVoucherPayment);
  const payMut = useMutation({
    mutationFn: (v: { voucher_id: string; method: "cash" | "bank"; amount: number }) =>
      payFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.method === "cash" ? "Đã chi tiền mặt" : "Đã chi qua ngân hàng");
      qc.invalidateQueries({ queryKey: ["purchase-vouchers"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi chi tiền"),
  });

  const openPayCash = (r: any, remain: number) => {
    if (r.status !== "posted") { toast.info("Cần ghi sổ phiếu trước khi chi tiền"); return; }
    if (remain <= 0) { toast.info("Phiếu đã thanh toán đủ"); return; }
    payMut.mutate({ voucher_id: r.id, method: "cash", amount: remain });
  };
  const openPayBank = (r: any, remain: number) => {
    if (r.status !== "posted") { toast.info("Cần ghi sổ phiếu trước khi chi tiền"); return; }
    if (remain <= 0) { toast.info("Phiếu đã thanh toán đủ"); return; }
    payMut.mutate({ voucher_id: r.id, method: "bank", amount: remain });
  };

  const { data, refetch, isLoading, isError, error } = useQuery({
    queryKey: ["purchase-vouchers", search, status, fFrom, fTo],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          status: status === "all" ? undefined : status,
          from: fFrom || undefined,
          to: fTo || undefined,
        },
      }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  function prefetchCreate() {
    const today = new Date().toISOString().slice(0, 10);
    qc.prefetchQuery({
      queryKey: ["suppliers-list"],
      queryFn: () => suppliersFnPage(),
      ...QUERY_PRESETS.REFERENCE,
    }).catch(() => {});
    qc.prefetchQuery({
      queryKey: ["linkable-purchase-invoices", ""],
      queryFn: () => linkInvFnPage({ data: { supplierId: undefined } }),
      ...QUERY_PRESETS.TRANSACTIONAL,
    }).catch(() => {});
    qc.prefetchQuery({
      queryKey: ["pv-suggest-no", today],
      queryFn: () => suggestNoFnPage({ data: { voucher_date: today } }),
      ...QUERY_PRESETS.TRANSACTIONAL,
    }).catch(() => {});
  }

  const postMut = useMutation({
    mutationFn: (id: string) => postFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã ghi sổ"); invalidateLedgers(qc); refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi ghi sổ"),
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
    mutationFn: (id: string) => voidFn({ data: { id, reason: "Huỷ ghi sổ" } }),
    onSuccess: () => {
      toast.success("Đã huỷ ghi sổ, phiếu có thể ghi sổ lại");
      setVoidDlg({ open: false, items: [] });
      invalidateLedgers(qc);
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi huỷ ghi sổ"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá phiếu"); refetch(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi xoá"),
  });

  const rows: any[] = data?.rows ?? [];
  const pagination = usePagination(rows, 20, `${search}|${status}|${fFrom}|${fTo}`);
  const pageRows = pagination.pageRows;

  // Phiếu xem là "đã thanh toán đủ" khi paid_amount >= total, hoặc payment_status='paid',
  // hoặc thanh toán ngay khi tạo (cash/bank với cash_voucher_id/bank_voucher_id).
  const isPaidRow = (r: any) => {
    const total = Number(r.total || 0);
    const paid = Number(r.paid_amount || 0);
    if (r.payment_status === "paid") return true;
    if (total > 0 && paid >= total - 0.01) return true;
    return !!(r.cash_voucher_id || r.bank_voucher_id);
  };
  const paidOf = (r: any) => {
    const total = Number(r.total || 0);
    const paid = Number(r.paid_amount || 0);
    if (paid > 0) return Math.min(paid, total);
    return isPaidRow(r) ? total : 0;
  };

  const kpi = useMemo(() => {
    let noInvoice = 0;
    let revenue = 0;
    let paid = 0;
    let payable = 0;
    for (const r of rows) {
      if (r.status === "void") continue;
      const total = Number(r.total || 0);
      const p = isPaidRow(r) ? total : 0;
      if (!r.invoice_id) noInvoice += 1;
      revenue += total;
      paid += p;
      payable += Math.max(0, total - p);
    }
    return { noInvoice, revenue, paid, payable };
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
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

  return (
    <div>
      <PurchaseTabs />
    <div className="space-y-4 p-4">

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileX className="h-5 w-5" />}
          label="Chưa nhận hoá đơn"
          value={kpi.noInvoice.toLocaleString("vi-VN")}
          tone="amber"
        />
        <KpiCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Giá trị mua (trong bộ lọc)"
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
          label="Tổng nợ phải trả"
          value={fmtMoney(kpi.payable)}
          tone="rose"
        />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-2 sm:p-3">
          <div className="flex items-center justify-between mb-2 md:hidden">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="text-sm font-medium inline-flex items-center gap-1"
            >
              Bộ lọc
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </button>
            <span className="text-xs text-muted-foreground">Tổng: <span className="font-semibold text-foreground">{rows.length}</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`${showFilters ? "flex" : "hidden"} md:flex flex-wrap items-center gap-2 w-full md:w-auto`}>
              <DateRangeFilter from={fFrom} to={fTo} onChange={(r) => { setFFrom(r.from); setFTo(r.to); }} />
              <Input
                placeholder="Tìm số phiếu, NCC, diễn giải…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 max-w-xs"
              />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="uploaded">Nháp</SelectItem>
                  <SelectItem value="reviewed">Đã duyệt</SelectItem>
                  <SelectItem value="posted">Đã ghi sổ</SelectItem>
                  <SelectItem value="void">Đã huỷ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={selected.size === 0}
                onClick={() => toast.info("Thanh toán nhanh — đang phát triển")}
              >
                <CircleDollarSign className="h-4 w-4 mr-1.5" /> Thanh toán nhanh ({selected.size})
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    Phiếu đã chọn ({selected.size}) <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    disabled={selected.size === 0}
                    onClick={() => {
                      selected.forEach((id) => {
                        const r = rows.find((x) => x.id === id);
                        if (r && r.status !== "posted" && r.status !== "void") postMut.mutate(id);
                      });
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" /> Ghi sổ hàng loạt
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={selected.size === 0}
                    onClick={() => {
                      const ids = Array.from(selected).filter((id) => {
                        const r = rows.find((x) => x.id === id);
                        return r && r.status === "posted";
                      });
                      if (ids.length === 0) { toast.info("Không có phiếu đã ghi sổ trong danh sách chọn"); return; }
                      if (!confirm(`Huỷ ghi sổ ${ids.length} phiếu? Các phiếu chi, phiếu nhập và bút toán liên quan sẽ bị xoá.`)) return;
                      ids.forEach((id) => voidMut.mutate(id));
                    }}
                  >
                    <X className="h-4 w-4 mr-2" /> Huỷ ghi sổ hàng loạt
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={selected.size === 0}
                    onClick={() => {
                      if (!confirm(`Xoá ${selected.size} phiếu đã chọn?`)) return;
                      selected.forEach((id) => delMut.mutate(id));
                      setSelected(new Set());
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Xoá đã chọn
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="inline-flex rounded-md shadow-sm">
                <Button
                  size="sm"
                  className="h-9 rounded-r-none border-r border-primary-foreground/20"
                  onClick={() => setOpenCreate(true)}
                  onMouseEnter={prefetchCreate}
                  onFocus={prefetchCreate}
                >
                  <Plus className="h-4 w-4 mr-1" /> Phiếu MH trong nước
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-9 rounded-l-none px-2" aria-label="Tuỳ chọn thêm">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setOpenCreate(true)}>
                      <Plus className="h-4 w-4 mr-2" /> Phiếu MH trong nước
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.info("Tính năng đang phát triển")}>
                      <Upload className="h-4 w-4 mr-2" /> Phiếu MH nhập khẩu
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toast.info("Tính năng đang phát triển")}>
                      <Upload className="h-4 w-4 mr-2" /> Import từ Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => toast.info("Cấu hình cột — đang phát triển")}
                aria-label="Cấu hình cột"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              <span className="hidden md:inline text-sm text-muted-foreground whitespace-nowrap">
                Tổng: <span className="font-semibold text-foreground">{rows.length}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <p className="text-sm font-medium">Không tải được dữ liệu</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">{error instanceof Error ? error.message : ""}</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <Loader2 className="mr-2 h-3 w-3" /> Thử lại
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Chưa có phiếu mua hàng nào"
              description="Tạo phiếu đầu tiên để Fin theo dõi chi phí mua hàng."
              cta={
                <Button variant="outline" onClick={() => setOpenCreate(true)}>
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
                    <TableHead className="whitespace-nowrap">Ký hiệu</TableHead>
                    <TableHead className="min-w-[200px]">Nhà cung cấp</TableHead>
                    <TableHead className="min-w-[260px]">Mô tả</TableHead>
                    <TableHead className="whitespace-nowrap">Loại</TableHead>
                    <TableHead className="whitespace-nowrap">Chi nhánh</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Chi phí MH</TableHead>
                    <TableHead className="whitespace-nowrap">Số phiếu nhập</TableHead>
                    <TableHead className="whitespace-nowrap">Ngày nhập kho</TableHead>
                    <TableHead className="text-center whitespace-nowrap">TT nhập kho</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Trạng thái</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Giá trị đơn hàng</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Chiết khấu</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Đã thanh toán</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Còn phải trả</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Tài liệu</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Thanh toán</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r: any, i: number) => { const idx = (pagination.page - 1) * pagination.pageSize + i;
                    const total = Number(r.total || 0);
                    const paid = paidOf(r);
                    const remain = Math.max(0, total - paid);
                    const isSel = selected.has(r.id);
                    const isPosted = r.status === "posted";
                    const isVoid = r.status === "void";
                    return (
                      <TableRow
                        key={r.id}
                        className={`cursor-pointer hover:bg-accent/60 ${isSel ? "bg-primary/5" : ""}`}
                        onClick={() => setEditId(r.id)}
                        style={{ height: 40 }}
                      >
                        <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleOne(r.id)}
                            aria-label="Chọn dòng"
                          />
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDateVN(r.voucher_date)}</TableCell>
                        <TableCell className="font-mono whitespace-nowrap">{r.voucher_no}</TableCell>
                        <TableCell className="font-mono text-muted-foreground whitespace-nowrap">{r.invoice_no ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.invoice_date ? fmtDateVN(r.invoice_date) : "—"}</TableCell>
                        <TableCell className="font-mono text-muted-foreground whitespace-nowrap">{r.invoice_series ?? "—"}</TableCell>
                        <TableCell className="truncate max-w-[260px]" title={r.supplier_name ?? ""}>{r.supplier_name ?? "—"}</TableCell>
                        <TableCell className="truncate max-w-[320px]" title={r.reason ?? ""}>{r.reason ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">Trong nước</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.branch_name ?? "—"}</TableCell>
                        <TableCell className="text-center"><StatusDot ok={!!r.is_purchase_cost} /></TableCell>
                        <TableCell className="font-mono whitespace-nowrap text-muted-foreground">{r.stock_voucher_no ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.stock_voucher_date ? fmtDateVN(r.stock_voucher_date) : "—"}</TableCell>
                        <TableCell className="text-center"><StatusDot ok={!!r.stock_voucher_id} /></TableCell>
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
                        <TableCell className="text-right tabular-nums">{total > 0 ? fmtMoney(total) : "0"}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoney(Number(r.discount_amount || 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {paid > 0 ? <span className="text-emerald-600 dark:text-emerald-400">{fmtMoney(paid)}</span> : "0"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {remain > 0 ? <span className="text-rose-600 dark:text-rose-400">{fmtMoney(remain)}</span> : "0"}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.invoice_id ? (
                            <Paperclip className="h-3.5 w-3.5 inline text-muted-foreground" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {paid >= total && total > 0 ? (
                            <StatusDot ok />
                          ) : !isVoid ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openPayCash(r, remain)}
                                title="Tạo phiếu chi tiền mặt"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm"
                              >
                                <CircleDollarSign className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openPayBank(r, remain)}
                                title="Tạo phiếu chi ngân hàng"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm"
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
                              onClick={() => setEditId(r.id)}
                              title="Mở phiếu mua hàng"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setEditId(r.id)}>
                                  <Eye className="h-4 w-4 mr-2" /> Mở phiếu
                                </DropdownMenuItem>
                                {!isPosted && (
                                  <DropdownMenuItem onClick={() => postMut.mutate(r.id)}>
                                    <Check className="h-4 w-4 mr-2" /> {r.posted_at ? "Ghi sổ lại" : "Ghi sổ"}
                                  </DropdownMenuItem>
                                )}
                                {isPosted && (
                                  <DropdownMenuItem
                                    onClick={() => openVoidDialog(r.id)}
                                    className="text-destructive"
                                  >
                                    <X className="h-4 w-4 mr-2" /> Huỷ ghi sổ
                                  </DropdownMenuItem>
                                )}
                                {r.journal_entry_id && (
                                  <DropdownMenuItem asChild>
                                    <Link to="/journal">
                                      <FileText className="h-4 w-4 mr-2" /> Xem bút toán
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                {!r.stock_voucher_id && (
                                  <DropdownMenuItem
                                    onClick={() => setStickTarget({ kind: "purchase", id: r.id, voucher_no: r.voucher_no })}
                                  >
                                    <PackagePlus className="h-4 w-4 mr-2" /> Tạo phiếu nhập kho
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={isPosted}
                                  onClick={() => delMut.mutate(r.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Xoá
                                </DropdownMenuItem>
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
                    (a: any, r: any) => {
                      const total = Number(r.total || 0);
                      const paid = paidOf(r);
                      a.total += total;
                      a.discount += Number(r.discount_amount || 0);
                      a.paid += paid;
                      a.remain += Math.max(0, total - paid);
                      return a;
                    },
                    { total: 0, discount: 0, paid: 0, remain: 0 }
                  );
                  return (
                    <tfoot className="bg-muted/40 font-semibold border-t-2 border-border">
                      <tr style={{ height: 40 }}>
                        <td colSpan={16} className="px-3 py-2 text-right">Tổng cộng ({rows.length} phiếu)</td>
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

      <CreateVoucherDialog
        open={openCreate || !!editId}
        onOpenChange={(v) => { setOpenCreate(v); setEditId(null); if (!v) setInitialParty(null); }}
        onCreated={() => { refetch(); setOpenCreate(false); setEditId(null); setInitialParty(null); }}
        onUpdated={() => { refetch(); setEditId(null); }}
        initialParty={initialParty}
        editId={editId}
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

// ---------- create dialog ----------

function CreateVoucherDialog({
  open, onOpenChange, onCreated, onUpdated, initialParty, editId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  onUpdated?: () => void;
  initialParty?: { id: string; name: string; tax_id?: string; address?: string } | null;
  editId?: string | null;
}) {
  const createFn = useServerFn(createPurchaseVoucher);
  const updateFn = useServerFn(updatePurchaseVoucher);
  const getFn = useServerFn(getPurchaseVoucher);
  const postFn = useServerFn(postPurchaseVoucher);
  const stickFn = useServerFn(stickStockVoucher);
  const suggestNoFn = useServerFn(suggestVoucherNo);
  const linkInvFn = useServerFn(listLinkablePurchaseInvoices);
  const suppliersFn = useServerFn(listSuppliers);
  const qc = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const isMobile = useIsMobile();
  const [discountOpen, setDiscountOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  useEffect(() => {
    setDiscountOpen(!isMobile);
    setPaymentOpen(!isMobile);
  }, [isMobile]);

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
    invoice_file_path: "",

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
    warehouse_id: "" as string,
    stock_voucher_no: "",
    stock_voucher_date: "",
    stock_voucher_reason: "",
    discount_pct: 0,
    discount_amount: 0,
  });

  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [openNewSupplier, setOpenNewSupplier] = useState(false);

  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: () => suppliersFn(),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["linkable-purchase-invoices", header.supplier_id],
    queryFn: () => linkInvFn({ data: { supplierId: header.supplier_id || undefined } }),
    enabled: open,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: suggested } = useQuery({
    queryKey: ["pv-suggest-no", header.voucher_date],
    queryFn: () => suggestNoFn({ data: { voucher_date: header.voucher_date } }),
    enabled: open,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const warehousesFn = useServerFn(listWarehouses);
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-picker"],
    queryFn: () => warehousesFn(),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });

  useEffect(() => {
    if (header.create_stock_voucher && !header.warehouse_id) {
      const list = (warehouses ?? []) as any[];
      const def = list.find((w) => w.is_default) ?? list[0];
      if (def) setHeader((h) => ({ ...h, warehouse_id: def.id }));
    }
  }, [header.create_stock_voucher, warehouses, header.warehouse_id]);

  // Nhóm NCC để auto-fill khi chọn NCC
  const supplierGroupsFn = useServerFn(listPartyGroups);
  const { data: supplierGroups } = useQuery({
    queryKey: ["party-groups", "supplier"],
    queryFn: () => supplierGroupsFn({ data: { kind: "supplier" } }),
    enabled: open,
    ...QUERY_PRESETS.REFERENCE,
  });
  const supplierGroupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of (supplierGroups ?? []) as any[]) m.set(g.id, g.name);
    return m;
  }, [supplierGroups]);

  // Prefill supplier from initialParty (when navigated from party list)
  const prefilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { prefilledRef.current = null; return; }
    if (!initialParty?.id) return;
    if (prefilledRef.current === initialParty.id) return;
    prefilledRef.current = initialParty.id;
    setHeader((h) => ({
      ...h,
      supplier_id: initialParty.id,
      supplier_name: initialParty.name ?? h.supplier_name,
      supplier_address: initialParty.address ?? h.supplier_address,
    }));
  }, [open, initialParty]);

  // Fill group name once supplier list + groups are available
  useEffect(() => {
    if (!open || !initialParty?.id) return;
    const s = ((suppliers ?? []) as any[]).find((x) => x.id === initialParty.id);
    const groupId = (s as any)?.group_id ?? null;
    const groupName = groupId ? (supplierGroupNameById.get(groupId) ?? "") : "";
    if (groupName) setHeader((h) => (h.customer_group ? h : { ...h, customer_group: groupName }));
  }, [open, initialParty, suppliers, supplierGroupNameById]);

  // Load edit data
  const editLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !editId) { editLoadedRef.current = null; return; }
    if (editLoadedRef.current === editId) return;
    editLoadedRef.current = editId;
    (async () => {
      try {
        const { voucher } = await getFn({ data: { id: editId } });
        const v = voucher as any;
        setHeader({
          voucher_no: v.voucher_no ?? "",
          voucher_date: v.voucher_date ?? today,
          supplier_id: v.supplier_id ?? "",
          supplier_name: v.supplier_name ?? "",
          supplier_address: v.supplier_address ?? "",
          customer_group: v.customer_group ?? "",
          invoice_id: v.invoice_id ?? "",
          invoice_no: v.invoice_no ?? "",
          invoice_date: v.invoice_date ?? "",
          invoice_file_path: "",
          reason: v.reason ?? "",
          currency: v.currency ?? "VND",
          exchange_rate: v.exchange_rate ?? 1,
          due_date: v.due_date ?? "",
          debit_account_default: v.debit_account ?? "156",
          credit_account: v.credit_account ?? "3311",
          vat_account_default: v.vat_account ?? "1331",
          payment_method: v.payment_method ?? "credit",
          payment_account: v.payment_account ?? "1111",
          payment_status: v.payment_status ?? "unpaid",
          invoice_receipt_type: v.invoice_receipt_type ?? "with_invoice",
          is_purchase_cost: v.is_purchase_cost ?? false,
          is_non_deductible: v.is_non_deductible ?? false,
          auto_allocate_cost: v.auto_allocate_cost ?? false,
          pay_now: v.pay_now ?? false,
          create_stock_voucher: v.create_stock_voucher ?? false,
          warehouse_id: v.warehouse_id ?? "",
          stock_voucher_no: v.stock_voucher_no ?? "",
          stock_voucher_date: v.stock_voucher_date ?? "",
          stock_voucher_reason: v.stock_voucher_reason ?? "",
          discount_pct: v.discount_pct ?? 0,
          discount_amount: v.discount_amount ?? 0,
        });
        setLines(
          (v.purchase_voucher_lines ?? []).map((l: any) => ({
            key: l.id || crypto.randomUUID(),
            product_id: l.product_id ?? null,
            product_code: l.product_code ?? "",
            product_name: l.product_name ?? "",
            description: l.description ?? "",
            unit: l.unit ?? "",
            qty: Number(l.qty ?? 1),
            unit_price: Number(l.unit_price ?? 0),
            amount: Number(l.amount ?? 0),
            discount_pct: Number(l.discount_pct ?? 0),
            discount_amount: Number(l.discount_amount ?? 0),
            vat_rate: Number(l.vat_rate ?? 10),
            vat_amount: Number(l.vat_amount ?? 0),
            total: Number(l.total ?? 0),
            debit_account: l.debit_account ?? v.debit_account ?? "156",
            vat_account: l.vat_account ?? v.vat_account ?? "1331",
            invoice_no: l.invoice_no ?? "",
            line_type: l.line_type ?? "goods",
          }))
        );
      } catch (e: any) {
        toast.error(e?.message || "Không tải được phiếu");
      }
    })();
  }, [open, editId]);

  // Auto-update "Diễn giải" khi user chưa chỉnh tay
  const [reasonTouched, setReasonTouched] = useState(false);
  useEffect(() => {
    if (!open) setReasonTouched(false);
  }, [open]);
  useEffect(() => {
    if (!open || reasonTouched) return;
    const next = `Mua hàng từ nhà cung cấp ${header.supplier_name || "---"} theo hoá đơn số ${header.invoice_no || header.voucher_no || "---"}`;
    if (next !== header.reason) {
      setHeader((h) => ({ ...h, reason: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reasonTouched, header.supplier_name, header.voucher_no, header.invoice_no]);

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
      if (header.create_stock_voucher) {
        if (!header.warehouse_id) {
          throw new Error("Vui lòng chọn kho để tạo phiếu nhập kho");
        }
        const hasGoodsRow = lines.some(
          (l) => l.line_type === "goods" && Number(l.qty || 0) > 0 && (l.product_name || l.product_code),
        );
        if (!hasGoodsRow) {
          throw new Error(
            "Phiếu nhập kho yêu cầu ít nhất một dòng hàng hoá có tên/mã và số lượng > 0.",
          );
        }
      }
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
        warehouse_id: header.create_stock_voucher ? (header.warehouse_id || null) : null,
        stock_voucher_no: header.create_stock_voucher ? (header.stock_voucher_no.trim() || null) : null,
        stock_voucher_date: header.create_stock_voucher ? (header.stock_voucher_date || null) : null,
        stock_voucher_reason: header.create_stock_voucher ? (header.stock_voucher_reason.trim() || null) : null,
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
      const vid = editId ?? (await createFn({ data: payload })).id;
      if (editId) {
        await updateFn({ data: { id: editId, ...payload } });
      }
      try {
        await postFn({ data: { id: vid } });
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (!/đã ghi sổ/i.test(msg)) {
          toast.error(msg || "Đã lưu nháp nhưng ghi sổ thất bại");
        }
      }
      // Fallback: nếu tick Nhập kho mà post chưa sinh phiếu kho, gọi stickStockVoucher.
      if (header.create_stock_voucher && header.warehouse_id) {
        try {
          await stickFn({ data: { id: vid, warehouseId: header.warehouse_id } });
        } catch (e: any) {
          const msg = String(e?.message || "");
          // Bỏ qua nếu phiếu đã có phiếu nhập kho (post đã tạo thành công).
          if (!/đã có phiếu nhập kho/i.test(msg)) {
            toast.error(msg || "Không tạo được phiếu nhập kho");
          }
        }
      }
      return { id: vid };
    },
    onSuccess: () => {
      toast.success(editId ? "Đã cập nhật phiếu" : "Đã lưu và ghi sổ");
      invalidateLedgers(qc);
      setHeader((h) => ({ ...h, voucher_no: "", reason: "" }));
      setLines([emptyLine()]);
      if (editId) onUpdated?.();
      else onCreated();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : (editId ? "Lỗi cập nhật phiếu" : "Lỗi tạo phiếu")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[99vw] sm:w-[98vw] sm:max-w-[1800px] xl:max-w-[1950px] max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editId ? "Phiếu mua hàng" : "Tạo phiếu mua hàng"}</DialogTitle>
        </DialogHeader>

        {/* Top toggle row */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 border-b pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Label className="text-xs whitespace-nowrap">Trạng thái TT</Label>
            <Select value={header.payment_status}
              onValueChange={(v: any) => setHeader({ ...header, payment_status: v })}>
              <SelectTrigger className="w-36 sm:w-44 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
                <SelectItem value="partial">Thanh toán một phần</SelectItem>
                <SelectItem value="paid">Đã thanh toán</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Label className="text-xs whitespace-nowrap">Hình thức HĐ</Label>
            <Select value={header.invoice_receipt_type}
              onValueChange={(v: any) => setHeader({ ...header, invoice_receipt_type: v })}>
              <SelectTrigger className="w-40 sm:w-48 h-8"><SelectValue /></SelectTrigger>
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

        {header.create_stock_voucher && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 mt-3">
            <h4 className="text-sm font-semibold text-primary">Phiếu nhập kho</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs"><span className="text-destructive">*</span> Kho</Label>
                <Select
                  value={header.warehouse_id || ""}
                  onValueChange={(v) => setHeader((h) => ({ ...h, warehouse_id: v }))}
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
                <Label className="text-xs">Số phiếu nhập kho</Label>
                <Input
                  className="h-9"
                  placeholder={`NK-${header.voucher_no || ""}`}
                  value={header.stock_voucher_no}
                  onChange={(e) => setHeader((h) => ({ ...h, stock_voucher_no: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Ngày phiếu nhập kho</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={header.stock_voucher_date || header.voucher_date}
                  onChange={(e) => setHeader((h) => ({ ...h, stock_voucher_date: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Diễn giải</Label>
                <Input
                  className="h-9"
                  placeholder={`Nhập kho từ phiếu ${header.voucher_no || ""}`}
                  value={header.stock_voucher_reason}
                  onChange={(e) => setHeader((h) => ({ ...h, stock_voucher_reason: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}


        <Tabs defaultValue="pmh" className="mt-2">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="pmh" className="flex-1 sm:flex-none">Phiếu mua hàng</TabsTrigger>
            <TabsTrigger value="hd" className="flex-1 sm:flex-none">Hoá đơn</TabsTrigger>
          </TabsList>

          {/* === Tab 1: PMH header === */}
          <TabsContent value="pmh" className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-12 gap-x-3 gap-y-2 [&_label]:text-xs [&_label]:mb-0.5 [&_input]:h-9 [&_button[role=combobox]]:h-9">
              <div className="col-span-2 lg:col-span-3">
                <Label>Nhà cung cấp *</Label>
                {suppliersLoading ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md text-sm text-muted-foreground bg-muted/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải danh sách NCC…
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Select value={header.supplier_id || "none"}
                      onValueChange={(v) => {
                        const s = (suppliers ?? []).find((x: any) => x.id === v);
                        const groupId = (s as any)?.group_id ?? null;
                        const groupName = groupId ? (supplierGroupNameById.get(groupId) ?? "") : "";
                        setHeader({
                          ...header,
                          supplier_id: v === "none" ? "" : v,
                          supplier_name: s?.name ?? "",
                          supplier_address: s?.address ?? "",
                          customer_group: groupName || header.customer_group,
                        });
                      }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Không chọn —</SelectItem>
                        {(suppliers ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="Tạo nhà cung cấp mới"
                      onClick={() => setOpenNewSupplier(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2">
                <Label>TK công nợ *</Label>
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
              <div className="lg:col-span-2">
                <Label>Số chứng từ *</Label>
                <Input value={header.voucher_no}
                  onChange={(e) => setHeader({ ...header, voucher_no: e.target.value })} />
              </div>
              <div className="lg:col-span-2">
                <Label>Ngày chứng từ *</Label>
                <Input type="date" value={header.voucher_date}
                  onChange={(e) => setHeader({ ...header, voucher_date: e.target.value })} />
              </div>
              <div className="lg:col-span-3">
                <Label>Hạn thanh toán</Label>
                <Input type="date" value={header.due_date}
                  onChange={(e) => setHeader({ ...header, due_date: e.target.value })} />
              </div>

              <div className="col-span-2 lg:col-span-3">
                <Label>Địa chỉ</Label>
                <Input value={header.supplier_address}
                  onChange={(e) => setHeader({ ...header, supplier_address: e.target.value })} />
              </div>
              <div className="lg:col-span-2">
                <Label>Nhóm khách hàng</Label>
                <Input value={header.customer_group}
                  onChange={(e) => setHeader({ ...header, customer_group: e.target.value })}
                  placeholder="Vui lòng chọn" />
              </div>
              <div className="lg:col-span-1">
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
              <div className="lg:col-span-1">
                <Label>Tỷ giá</Label>
                <Input type="number" value={header.exchange_rate}
                  onChange={(e) => setHeader({ ...header, exchange_rate: Number(e.target.value) })}
                  disabled={header.currency === "VND"} />
              </div>
              <div className="col-span-2 lg:col-span-3">
                <Label>Diễn giải</Label>
                <Input value={header.reason}
                  onChange={(e) => { setReasonTouched(true); setHeader({ ...header, reason: e.target.value }); }}
                  placeholder={`Mua hàng NCC ${header.supplier_name || "---"}`} />
              </div>
              <div className="col-span-2 lg:col-span-2 flex flex-col items-end justify-end">
                <div className="text-[11px] text-muted-foreground leading-none">Tổng</div>
                <div className="text-lg font-semibold text-primary leading-tight tabular-nums">{fmtMoney(totals.total)}</div>
              </div>
            </div>


            {/* Sub-tab + chiết khấu (collapsible on mobile) */}
            <Collapsible open={discountOpen} onOpenChange={setDiscountOpen} className="border-t pt-3">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm font-medium sm:hidden">
                <span>Chiết khấu & phân bổ chi phí</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${discountOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent forceMount className="data-[state=closed]:hidden sm:!block">
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-0">
                  <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
                    <span className="font-medium border-b-2 border-primary pb-1">Giá trị hàng</span>
                    <span className="text-muted-foreground">Chi phí mua hàng</span>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={header.auto_allocate_cost}
                        onCheckedChange={(v) => setHeader({ ...header, auto_allocate_cost: !!v })} />
                      Tự phân bổ chi phí mua hàng
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Chiết khấu (%)</Label>
                    <Input type="number" className="w-20 h-8" value={header.discount_pct}
                      onChange={(e) => setHeader({ ...header, discount_pct: Number(e.target.value), discount_amount: 0 })} />
                    <Label className="text-xs whitespace-nowrap">Chiết khấu</Label>
                    <Input type="number" className="w-28 sm:w-32 h-8" value={header.discount_amount}
                      onChange={(e) => setHeader({ ...header, discount_amount: Number(e.target.value), discount_pct: 0 })} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Lines — desktop table */}
            <div className="hidden sm:block overflow-x-auto border rounded-md">
              <Table className="min-w-[1430px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">STT</TableHead>
                    <TableHead className="min-w-[220px]">Tên sản phẩm (*)</TableHead>
                    <TableHead className="w-32">Hoá đơn</TableHead>
                    <TableHead className="w-24">TK nợ</TableHead>
                    <TableHead className="w-20">ĐVT</TableHead>
                    <TableHead className="w-24 text-right">SL (*)</TableHead>
                    <TableHead className="w-32 text-right">Đơn giá (*)</TableHead>
                    <TableHead className="w-20 text-right">CK %</TableHead>
                    <TableHead className="w-32 text-right">CK (đ)</TableHead>
                    <TableHead className="w-32 text-right">Trước thuế</TableHead>
                    <TableHead className="w-20 text-right">VAT %</TableHead>
                    <TableHead className="w-28">TK thuế</TableHead>
                    <TableHead className="w-32 text-right">Tiền thuế</TableHead>
                    <TableHead className="w-32 text-right">Thành tiền</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={l.key}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <ProductPickerCell
                          mode="purchase"
                          value={l.product_name}
                          code={l.product_code}
                          onClear={() =>
                            updateLine(l.key, {
                              product_id: null,
                              product_code: "",
                              product_name: "",
                            })
                          }
                          onPick={(p: any) => updateLine(l.key, {
                            product_id: p.id,
                            product_code: p.code ?? "",
                            product_name: p.name ?? "",
                            unit: p.unit ?? "",
                            unit_price: Number(p.unit_cost ?? 0),
                            vat_rate: Number(p.vat_rate ?? 10),
                            debit_account:
                              p.item_type === "service"
                                ? (p.expense_account || "642")
                                : (p.stock_account ?? l.debit_account),
                            line_type: p.item_type === "service" ? "service" : "goods",
                          })}
                        />
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
                        <MoneyInput className="text-right" value={l.unit_price || 0}
                          onChange={(n) => updateLine(l.key, { unit_price: n })} />
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
                    <TableCell colSpan={5} className="text-right">Tổng</TableCell>
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

            {/* Lines — mobile cards */}
            <div className="block sm:hidden space-y-3">
              {lines.map((l, i) => (
                <Card key={l.key} className="overflow-hidden">
                  <CardHeader className="p-3 pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Dòng {i + 1}</span>
                      <Button size="sm" variant="ghost" onClick={() => removeLine(l.key)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    <ProductPickerCell
                      mode="purchase"
                      value={l.product_name}
                      code={l.product_code}
                      onPick={(p: any) => updateLine(l.key, {
                        product_id: p.id,
                        product_code: p.code ?? "",
                        product_name: p.name ?? "",
                        unit: p.unit ?? "",
                        unit_price: Number(p.unit_cost ?? 0),
                        vat_rate: Number(p.vat_rate ?? 10),
                        debit_account:
                          p.item_type === "service"
                            ? (p.expense_account || "642")
                            : (p.stock_account ?? l.debit_account),
                        line_type: p.item_type === "service" ? "service" : "goods",
                      })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Hoá đơn</Label>
                        <Input value={l.invoice_no}
                          onChange={(e) => updateLine(l.key, { invoice_no: e.target.value })}
                          placeholder="Số HĐ" />
                      </div>
                      <div>
                        <Label className="text-xs">TK nợ</Label>
                        <Input value={l.debit_account}
                          onChange={(e) => updateLine(l.key, { debit_account: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">ĐVT</Label>
                        <Input value={l.unit}
                          onChange={(e) => updateLine(l.key, { unit: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">SL</Label>
                        <Input type="number" value={l.qty}
                          onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">Đơn giá</Label>
                        <MoneyInput value={l.unit_price || 0}
                          onChange={(n) => updateLine(l.key, { unit_price: n })} />
                      </div>
                      <div>
                        <Label className="text-xs">CK %</Label>
                        <Input type="number" value={l.discount_pct}
                          onChange={(e) => updateLine(l.key, { discount_pct: Number(e.target.value), discount_amount: 0 })} />
                      </div>
                      <div>
                        <Label className="text-xs">CK (đ)</Label>
                        <Input type="number" value={l.discount_amount}
                          onChange={(e) => updateLine(l.key, { discount_amount: Number(e.target.value), discount_pct: 0 })} />
                      </div>
                      <div>
                        <Label className="text-xs">VAT %</Label>
                        <Input type="number" value={l.vat_rate}
                          onChange={(e) => updateLine(l.key, { vat_rate: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label className="text-xs">TK thuế</Label>
                        <Input value={l.vat_account}
                          onChange={(e) => updateLine(l.key, { vat_account: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-dashed">
                      <div className="text-center">
                        <div className="text-muted-foreground">Trước thuế</div>
                        <div className="font-medium tabular-nums">{fmtMoney(l.amount)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground">Tiền thuế</div>
                        <div className="font-medium tabular-nums">{fmtMoney(l.vat_amount)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground">Thành tiền</div>
                        <div className="font-semibold tabular-nums text-primary">{fmtMoney(l.total)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Mobile totals */}
              <div className="border rounded-md p-3 bg-muted/30 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng SL</span>
                  <span className="font-medium tabular-nums">{fmtMoney(lines.reduce((s, l) => s + Number(l.qty || 0), 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trước thuế</span>
                  <span className="font-medium tabular-nums">{fmtMoney(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền thuế</span>
                  <span className="font-medium tabular-nums">{fmtMoney(totals.vat_amount)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold pt-1 border-t border-dashed">
                  <span>Thành tiền</span>
                  <span className="tabular-nums text-primary">{fmtMoney(totals.subtotal + totals.vat_amount)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
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

            {/* Payment row (collapsible on mobile) */}
            <Collapsible open={paymentOpen} onOpenChange={setPaymentOpen} className="border-t pt-3">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm font-medium sm:hidden">
                <span>Thanh toán</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${paymentOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent forceMount className="data-[state=closed]:hidden sm:!block">
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:mt-0">
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
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* === Tab 2: Hoá đơn === */}
          <TabsContent value="hd" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <Label>Link tới Hoá đơn mua đã có</Label>
                {invoicesLoading ? (
                  <div className="flex items-center gap-2 h-10 px-3 border rounded-md text-sm text-muted-foreground bg-muted/50">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải danh sách hoá đơn…
                  </div>
                ) : (
                  <Select value={header.invoice_id || "none"}
                    onValueChange={(v) => {
                      if (v === "none") { setHeader({ ...header, invoice_id: "", invoice_file_path: "" }); return; }
                      const inv = invoices?.rows?.find((x: any) => x.id === v);
                      if (inv) {
                        setHeader({
                          ...header,
                          invoice_id: v,
                          invoice_no: inv.invoice_no ?? "",
                          invoice_date: inv.issue_date ?? "",
                          invoice_file_path: inv.file_path ?? "",
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
                )}
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
              <div className="sm:col-span-3">
                <AttachInvoiceFile
                  filePath={header.invoice_file_path}
                  onUploaded={async (path: string) => {
                    // If there is no linked invoice yet → create one with this file
                    if (!header.invoice_id) {
                      const { data: userData } = await supabase.auth.getUser();
                      const uid = userData.user?.id;
                      if (!uid) { toast.error("Chưa đăng nhập"); return; }
                      const { data: inv, error } = await supabase
                        .from("invoices")
                        .insert({
                          user_id: uid,
                          file_path: path,
                          supplier_id: header.supplier_id || null,
                          supplier_name: header.supplier_name || null,
                          invoice_no: header.invoice_no || null,
                          issue_date: header.invoice_date || null,
                          status: "uploaded",
                        })
                        .select("id")
                        .single();
                      if (error || !inv) { toast.error("Lỗi tạo hoá đơn: " + (error?.message ?? "")); return; }
                      setHeader((h) => ({ ...h, invoice_id: inv.id, invoice_file_path: path }));
                      qc.invalidateQueries({ queryKey: ["linkable-purchase-invoices"] });
                      toast.success("Đã đính kèm & tạo hoá đơn");
                    } else {
                      // Update file_path on existing linked invoice
                      const { error } = await supabase
                        .from("invoices")
                        .update({ file_path: path })
                        .eq("id", header.invoice_id);
                      if (error) { toast.error("Lỗi cập nhật: " + error.message); return; }
                      setHeader((h) => ({ ...h, invoice_file_path: path }));
                      toast.success("Đã cập nhật file hoá đơn");
                    }
                  }}
                />
              </div>

            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 sm:mx-0 sm:mb-0 sm:static z-10 flex-col-reverse sm:flex-row gap-2 border-t bg-background/95 backdrop-blur px-4 py-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:p-0 [padding-bottom:calc(env(safe-area-inset-bottom)+0.75rem)] sm:[padding-bottom:0]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending} className="w-full sm:w-auto">Huỷ</Button>
          <Button onClick={() => mut.mutate()}
            disabled={mut.isPending || !header.voucher_no}
            className="w-full sm:w-auto">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {mut.isPending ? "Đang lưu…" : "Lưu và thoát"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={openNewSupplier} onOpenChange={setOpenNewSupplier}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo nhà cung cấp mới</DialogTitle>
          </DialogHeader>
          <PartyForm
            mode="supplier"
            compact
            onDone={async (id) => {
              setOpenNewSupplier(false);
              await qc.invalidateQueries({ queryKey: ["suppliers-list"] });
              const fresh = await qc.fetchQuery({
                queryKey: ["suppliers-list"],
                queryFn: () => suppliersFn(),
              });
              const s = (fresh as any[] | undefined)?.find((x) => x.id === id);
              if (s) {
                const groupId = (s as any).group_id ?? null;
                const groupName = groupId ? (supplierGroupNameById.get(groupId) ?? "") : "";
                setHeader((h) => ({
                  ...h,
                  supplier_id: s.id,
                  supplier_name: s.name ?? "",
                  supplier_address: s.address ?? "",
                  customer_group: groupName || h.customer_group,
                }));
              }
              toast.success("Đã tạo nhà cung cấp");
            }}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

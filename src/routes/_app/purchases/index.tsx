import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  FileText,
  Trash2,
  Search,
  AlertTriangle,
  Wallet,
  Receipt,
  Users,
  Banknote,
  CreditCard,
  Download,
  Clock,
  TrendingDown,
  Upload,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listPurchaseInvoices, listSuppliers } from "@/lib/purchases.functions";
import { purchasesDashboard } from "@/lib/purchases-dashboard.functions";
import {
  listSupplierPayments,
  payablesStats,
  listOutstandingPurchaseInvoices,
  recordPayment,
  deleteSupplierPayment,
} from "@/lib/payables.functions";
import { extractInvoice } from "@/lib/invoices.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type PurchaseTab = "invoices" | "payments" | "overdue" | "suppliers";
type PurchaseSearch = {
  tab?: PurchaseTab;
  status?: string;
  invoice?: string;
  supplier?: string;
};

export const Route = createFileRoute("/_app/purchases/")({
  component: PurchasesHubPage,
  validateSearch: (s: Record<string, unknown>): PurchaseSearch => {
    const tab = s.tab;
    return {
      tab:
        tab === "payments" || tab === "overdue" || tab === "suppliers"
          ? tab
          : "invoices",
      status: typeof s.status === "string" ? s.status : undefined,
      invoice: typeof s.invoice === "string" ? s.invoice : undefined,
      supplier: typeof s.supplier === "string" ? s.supplier : undefined,
    };
  },
});

// ---------- helpers ----------
const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN");
const fmtShort = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
};
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => today().slice(0, 8) + "01";

const PAY_STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-blue-100 text-blue-700",
  unpaid: "bg-amber-100 text-amber-700",
};
const PAY_STATUS_LABEL: Record<string, string> = {
  paid: "Đã trả",
  partial: "Trả một phần",
  unpaid: "Chưa trả",
};
const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank: "Chuyển khoản",
};
const AGING_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#f97316", "#ef4444"];

// ============================================================
// MAIN HUB PAGE
// ============================================================
function PurchasesHubPage() {
  const navigate = Route.useNavigate();
  const { tab = "invoices", status, invoice, supplier } = Route.useSearch();

  const dashFn = useServerFn(purchasesDashboard);
  const { data: dash } = useQuery({
    queryKey: ["purchases-dashboard"],
    queryFn: () => dashFn(),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const setTab = (t: PurchaseTab, extra: Partial<PurchaseSearch> = {}) =>
    navigate({
      search: (prev: PurchaseSearch) => ({ ...prev, tab: t, ...extra }),
      replace: true,
    });

  const clickStatus = (s: string | undefined) =>
    setTab("invoices", { status: s });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Mua hàng</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tổng quan chi phí, hoá đơn và phiếu chi — đối ứng công nợ TK 331
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewPaymentInline preselectInvoiceId={invoice} preselectSupplierId={supplier} />
          <Button variant="outline" asChild>
            <Link to="/invoices">
              <Plus className="mr-2 h-4 w-4" /> Nhập tay
            </Link>
          </Button>
          <UploadInvoiceButton />
        </div>
      </div>

      {/* Money strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MoneyCard
          tone="primary"
          icon={<TrendingDown className="h-4 w-4" />}
          label="Chi phí mua tháng"
          value={fmt(dash?.kpi.expense_month ?? 0)}
          sub={`${dash?.kpi.invoices_month ?? 0} hoá đơn`}
          onClick={() => clickStatus(undefined)}
          active={tab === "invoices" && !status}
        />
        <MoneyCard
          tone="success"
          icon={<Wallet className="h-4 w-4" />}
          label="Đã trả tháng"
          value={fmt(dash?.kpi.paid_month ?? 0)}
          sub={
            dash && dash.kpi.expense_month > 0
              ? `${Math.round((dash.kpi.paid_month / dash.kpi.expense_month) * 100)}% chi phí`
              : "—"
          }
          onClick={() => setTab("payments")}
          active={tab === "payments"}
        />
        <MoneyCard
          tone="warning"
          icon={<Receipt className="h-4 w-4" />}
          label="Phải trả (331)"
          value={fmt(dash?.kpi.outstanding_total ?? 0)}
          sub={`${dash?.kpi.open_invoices ?? 0} HĐ chưa trả`}
          onClick={() => clickStatus("unpaid")}
          active={tab === "invoices" && status === "unpaid"}
        />
        <MoneyCard
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Quá hạn"
          value={fmt(dash?.kpi.overdue_total ?? 0)}
          sub={`${dash?.kpi.overdue_count ?? 0} HĐ trễ hạn`}
          onClick={() => setTab("overdue")}
          active={tab === "overdue"}
        />
      </div>

      {/* Paid windows */}
      <div className="grid gap-3 grid-cols-3">
        <MiniKpi label="Đã trả 30 ngày" value={fmt(dash?.kpi.paid_30 ?? 0)} />
        <MiniKpi label="Đã trả 60 ngày" value={fmt(dash?.kpi.paid_60 ?? 0)} />
        <MiniKpi label="Đã trả 90 ngày" value={fmt(dash?.kpi.paid_90 ?? 0)} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Chi phí vs Đã trả — 6 tháng</CardTitle>
          </CardHeader>
          <CardContent className="h-56 sm:h-64 px-2 sm:px-6">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dash?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={fmtShort} className="text-xs" />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Bar
                  dataKey="expense"
                  name="Chi phí"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="paid"
                  name="Đã trả"
                  stroke="#10b981"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tuổi nợ phải trả</CardTitle>
          </CardHeader>
          <CardContent className="h-56 sm:h-64 px-2 sm:px-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    dash
                      ? [
                          { name: "Trong hạn", value: dash.aging.current },
                          { name: "1–30", value: dash.aging["1-30"] },
                          { name: "31–60", value: dash.aging["31-60"] },
                          { name: "61–90", value: dash.aging["61-90"] },
                          { name: ">90", value: dash.aging["90+"] },
                        ]
                      : []
                  }
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {AGING_COLORS.map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as PurchaseTab, { status: undefined })}>
        <TabsList className="flex w-full overflow-x-auto sm:w-auto sm:inline-flex">
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Hoá đơn mua</span>
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Banknote className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Phiếu chi</span>
          </TabsTrigger>
          <TabsTrigger value="overdue">
            <AlertTriangle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Quá hạn</span>
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <Users className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Top NCC nợ</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab statusFilter={status} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab preselectInvoice={invoice} preselectSupplier={supplier} />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <OverdueTab overdue={dash?.overdue ?? []} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <TopSuppliersTab
            top={dash?.top_suppliers ?? []}
            onPick={(sid) => setTab("payments", { supplier: sid })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// CARDS
// ============================================================
function MoneyCard({
  label,
  value,
  sub,
  icon,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "danger"
      ? "text-rose-600"
      : tone === "primary"
      ? "text-primary"
      : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border bg-card p-3 sm:p-4 transition-colors hover:bg-muted/40 ${
        active ? "border-primary ring-1 ring-primary/30" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <span>{icon}</span>
      </div>
      <div className={`mt-2 text-lg sm:text-2xl font-bold font-mono ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] sm:text-xs text-muted-foreground truncate">{sub}</div>}
    </button>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div className="flex items-center gap-1.5 text-[11px] sm:text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className="font-mono font-semibold text-sm sm:text-base">{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniPayCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "warning";
}) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${tone === "warning" ? "text-amber-600" : ""}`}>
          {value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PayBadge({ status }: { status: string }) {
  const info =
    PAY_STATUS_BADGE[status] !== undefined
      ? { label: PAY_STATUS_LABEL[status], cls: PAY_STATUS_BADGE[status] }
      : { label: status || "—", cls: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={info.cls + " border-transparent"}>
      {info.label}
    </Badge>
  );
}

// ============================================================
// UPLOAD INVOICE BUTTON (OCR)
// ============================================================
function UploadInvoiceButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const extract = useServerFn(extractInvoice);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Chưa đăng nhập");
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw upErr;
      const { data: inv, error: insErr } = await supabase
        .from("invoices")
        .insert({ user_id: userId, file_path: path, status: "pending" })
        .select("id")
        .single();
      if (insErr || !inv) throw insErr || new Error("Không tạo được hoá đơn");
      toast.info("Đang bóc tách bằng AI...");
      await extract({ data: { invoiceId: inv.id } });
      toast.success("Bóc tách xong");
      router.navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onUpload}
        disabled={uploading}
      />
      <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
        <Upload className="mr-2 h-4 w-4" />
        {uploading ? "Đang xử lý..." : "Upload HĐ"}
      </Button>
    </>
  );
}

// ============================================================
// TAB: INVOICES
// ============================================================
function InvoicesTab({ statusFilter }: { statusFilter?: string }) {
  const list = useServerFn(listPurchaseInvoices);
  const suppFn = useServerFn(listSuppliers);
  const { data } = useQuery({
    queryKey: ["purchase-invoices-hub"],
    queryFn: () => list({ data: {} }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppFn(),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const [q, setQ] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [payFilter, setPayFilter] = useState<string>(statusFilter ?? "all");

  useEffect(() => {
    if (statusFilter) setPayFilter(statusFilter);
  }, [statusFilter]);

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((inv: any) => {
      if (supplierFilter !== "all" && inv.supplier_id !== supplierFilter) return false;
      const remaining = Number(inv.total || 0) - Number(inv.paid || 0);
      const ps =
        remaining <= 0.5 ? "paid" : Number(inv.paid || 0) > 0 ? "partial" : "unpaid";
      if (payFilter !== "all" && ps !== payFilter) return false;
      if (!term) return true;
      return (
        (inv.supplier_name ?? "").toLowerCase().includes(term) ||
        (inv.invoice_no ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, supplierFilter, payFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm số HĐ, nhà cung cấp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="NCC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả NCC</SelectItem>
            {suppliers.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả TT</SelectItem>
            <SelectItem value="unpaid">Chưa trả</SelectItem>
            <SelectItem value="partial">Trả một phần</SelectItem>
            <SelectItem value="paid">Đã trả</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">Ngày</th>
              <th className="px-2 sm:px-4 py-2 text-left">Số HĐ</th>
              <th className="px-2 sm:px-4 py-2 text-left">Nhà cung cấp</th>
              <th className="px-2 sm:px-4 py-2 text-right hidden md:table-cell">Tổng</th>
              <th className="px-2 sm:px-4 py-2 text-right hidden lg:table-cell">Đã trả</th>
              <th className="px-2 sm:px-4 py-2 text-right">Còn nợ</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">TT</th>
              <th className="px-2 sm:px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv: any) => {
              const remaining = Number(inv.total || 0) - Number(inv.paid || 0);
              const ps =
                remaining <= 0.5 ? "paid" : Number(inv.paid || 0) > 0 ? "partial" : "unpaid";
              return (
                <tr key={inv.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 sm:px-4 py-2 whitespace-nowrap hidden sm:table-cell">
                    {inv.issue_date ?? "—"}
                  </td>
                  <td className="px-2 sm:px-4 py-2 font-mono">
                    <Link
                      to="/invoices/$id"
                      params={{ id: inv.id }}
                      className="text-primary hover:underline"
                    >
                      {inv.invoice_no || "(nháp)"}
                    </Link>
                    <div className="sm:hidden text-[11px] text-muted-foreground font-sans mt-0.5">
                      {inv.issue_date ?? ""}
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-2">
                    <div className="font-medium truncate max-w-[160px] sm:max-w-none">
                      {inv.supplier_name ?? "—"}
                    </div>
                    <div className="sm:hidden mt-1">
                      <span className={`rounded px-2 py-0.5 text-[10px] ${PAY_STATUS_BADGE[ps]}`}>
                        {PAY_STATUS_LABEL[ps]}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right font-mono hidden md:table-cell">
                    {fmt(inv.total)}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right font-mono text-emerald-700 hidden lg:table-cell">
                    {fmt(inv.paid)}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right font-mono">
                    {remaining > 0 ? fmt(remaining) : "—"}
                  </td>
                  <td className="px-2 sm:px-4 py-2 hidden sm:table-cell">
                    <span className={`rounded px-2 py-0.5 text-xs ${PAY_STATUS_BADGE[ps]}`}>
                      {PAY_STATUS_LABEL[ps]}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right">
                    {remaining > 0 && (
                      <Button size="sm" variant="outline" asChild className="h-7">
                        <Link to="/purchases" search={{ tab: "payments", invoice: inv.id }}>
                          <Banknote className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Chi</span>
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  Không có hoá đơn nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// TAB: OVERDUE
// ============================================================
function OverdueTab({ overdue }: { overdue: any[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="px-2 sm:px-4 py-2 text-left">Số HĐ</th>
            <th className="px-2 sm:px-4 py-2 text-left">Nhà cung cấp</th>
            <th className="px-2 sm:px-4 py-2 text-right">Trễ</th>
            <th className="px-2 sm:px-4 py-2 text-right">Còn nợ</th>
            <th className="px-2 sm:px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {overdue.map((o: any) => (
            <tr key={o.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-2 sm:px-4 py-2">
                <Link
                  to="/invoices/$id"
                  params={{ id: o.id }}
                  className="text-primary hover:underline"
                >
                  {o.invoice_no ?? "—"}
                </Link>
              </td>
              <td className="px-2 sm:px-4 py-2 truncate max-w-[160px] sm:max-w-none">
                {o.supplier_name ?? "—"}
              </td>
              <td className="px-2 sm:px-4 py-2 text-right">
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                  {o.days_late} ngày
                </Badge>
              </td>
              <td className="px-2 sm:px-4 py-2 text-right font-mono font-semibold text-rose-600">
                {fmt(o.remaining)}
              </td>
              <td className="px-2 sm:px-4 py-2 text-right">
                <Button size="sm" variant="outline" asChild className="h-7">
                  <Link to="/purchases" search={{ tab: "payments", invoice: o.id }}>
                    <Banknote className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">Chi</span>
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
          {overdue.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                Không có hoá đơn quá hạn 🎉
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// TAB: TOP SUPPLIERS
// ============================================================
function TopSuppliersTab({
  top,
  onPick,
}: {
  top: any[];
  onPick: (supplierId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="px-2 sm:px-4 py-2 text-left">Nhà cung cấp</th>
            <th className="px-2 sm:px-4 py-2 text-right">HĐ</th>
            <th className="px-2 sm:px-4 py-2 text-right">Quá hạn</th>
            <th className="px-2 sm:px-4 py-2 text-right">Tổng nợ</th>
            <th className="px-2 sm:px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {top.map((c: any, i: number) => (
            <tr key={i} className="border-t border-border hover:bg-muted/30">
              <td className="px-2 sm:px-4 py-2 truncate max-w-[160px] sm:max-w-none">
                {c.supplier_name}
              </td>
              <td className="px-2 sm:px-4 py-2 text-right">{c.invoices}</td>
              <td className="px-2 sm:px-4 py-2 text-right font-mono text-rose-600">
                {c.overdue > 0 ? fmt(c.overdue) : "—"}
              </td>
              <td className="px-2 sm:px-4 py-2 text-right font-mono font-semibold">
                {fmt(c.outstanding)}
              </td>
              <td className="px-2 sm:px-4 py-2 text-right">
                {c.supplier_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => onPick(c.supplier_id)}
                  >
                    <Banknote className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">Chi</span>
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {top.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                Chưa có công nợ
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// TAB: PAYMENTS
// ============================================================
function PaymentsTab({
  preselectInvoice,
  preselectSupplier,
}: {
  preselectInvoice?: string;
  preselectSupplier?: string;
}) {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const listFn = useServerFn(listSupplierPayments);
  const statsFn = useServerFn(payablesStats);
  const outFn = useServerFn(listOutstandingPurchaseInvoices);
  const recordFn = useServerFn(recordPayment);
  const delFn = useServerFn(deleteSupplierPayment);

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [preInv, setPreInv] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (preselectInvoice || preselectSupplier) {
      setPreInv(preselectInvoice);
      setOpenNew(true);
    }
  }, [preselectInvoice, preselectSupplier]);

  const filter = { from, to, method };
  const { data: rows = [] } = useQuery({
    queryKey: ["supplier-payments", filter],
    queryFn: () => listFn({ data: filter }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: stats } = useQuery({
    queryKey: ["payables-stats", from, to],
    queryFn: () => statsFn({ data: { from, to } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const { data: outstanding = [] } = useQuery({
    queryKey: ["outstanding-purchase-invoices"],
    queryFn: () => outFn(),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r: any) =>
      [r.supplier_name, r.reference, r.invoices?.invoice_no]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(s)),
    );
  }, [rows, search]);

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá phiếu chi (đảo bút toán)");
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["purchase-invoices-hub"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message || "Không xoá được"),
  });

  const clearPreselect = () => {
    if (preselectInvoice || preselectSupplier) {
      navigate({
        search: (prev: PurchaseSearch) => ({
          ...prev,
          invoice: undefined,
          supplier: undefined,
        }),
        replace: true,
      });
    }
  };

  const exportCsv = () => {
    const header = ["Ngày", "Nhà cung cấp", "Hoá đơn", "PT", "Tham chiếu", "Số tiền"];
    const lines = filtered.map((r: any) => [
      r.pay_date,
      r.supplier_name ?? "",
      r.invoices?.invoice_no ?? "",
      METHOD_LABEL[r.method] ?? r.method,
      r.reference ?? "",
      r.amount,
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `phieu-chi_${from}_${to}.csv`;
    a.click();
  };

  return (
    <div className="space-y-3">
      {/* Method KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MiniPayCard
          label="Tổng chi kỳ"
          value={fmt(stats?.total ?? 0)}
          sub={`${stats?.count ?? 0} phiếu`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MiniPayCard
          label="Tiền mặt (111)"
          value={fmt(stats?.cash ?? 0)}
          icon={<Banknote className="h-4 w-4" />}
        />
        <MiniPayCard
          label="Ngân hàng (112)"
          value={fmt(stats?.bank ?? 0)}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <MiniPayCard
          label="Phải trả (331)"
          value={fmt(stats?.outstanding ?? 0)}
          tone="warning"
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full lg:w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full lg:w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hình thức</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="cash">Tiền mặt</SelectItem>
                <SelectItem value="bank">Chuyển khoản</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2 sm:col-span-1 lg:flex-1 lg:min-w-[200px]">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input
              placeholder="NCC, số HĐ, tham chiếu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex gap-2 justify-end lg:justify-start">
            <Button variant="outline" onClick={exportCsv} className="flex-1 sm:flex-none">
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={() => setOpenNew(true)} className="flex-1 sm:flex-none">
              <Plus className="mr-2 h-4 w-4" /> Tạo phiếu chi
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-2 sm:px-4 py-2 text-left">Ngày</th>
              <th className="px-2 sm:px-4 py-2 text-left">Nhà cung cấp</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden md:table-cell">Hoá đơn</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden lg:table-cell">Hình thức</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden lg:table-cell">Tham chiếu</th>
              <th className="px-2 sm:px-4 py-2 text-right">Số tiền</th>
              <th className="px-2 sm:px-4 py-2 text-center hidden sm:table-cell">Đối soát</th>
              <th className="px-2 sm:px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: any) => {
              const inv = r.invoices;
              const status = inv?.payment_status ?? "—";
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 sm:px-4 py-2 whitespace-nowrap">{r.pay_date}</td>
                  <td className="px-2 sm:px-4 py-2">
                    <div className="truncate max-w-[140px] sm:max-w-none">
                      {r.supplier_name ?? "—"}
                    </div>
                    <div className="md:hidden text-[11px] text-muted-foreground font-mono mt-0.5">
                      {inv?.invoice_no ?? ""} · {METHOD_LABEL[r.method] ?? r.method}
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-2 hidden md:table-cell">
                    {inv?.invoice_no ? (
                      <Link
                        to="/invoices/$id"
                        params={{ id: r.invoice_id }}
                        className="text-primary hover:underline"
                      >
                        {inv.invoice_no}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 sm:px-4 py-2 hidden lg:table-cell">
                    {METHOD_LABEL[r.method] ?? r.method}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-xs text-muted-foreground hidden lg:table-cell">
                    {r.reference ?? "—"}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right font-mono font-semibold whitespace-nowrap">
                    {fmt(r.amount)}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-center hidden sm:table-cell">
                    <PayBadge status={status} />
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Xoá phiếu chi?</AlertDialogTitle>
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
                  Không có phiếu chi trong kỳ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NewPaymentDialog
        open={openNew}
        onOpenChange={(v) => {
          setOpenNew(v);
          if (!v) {
            setPreInv(undefined);
            clearPreselect();
          }
        }}
        outstanding={
          preselectSupplier
            ? outstanding.filter((i: any) => i.supplier_id === preselectSupplier)
            : outstanding
        }
        preselectInvoiceId={preInv}
        onSubmit={async (payload) => {
          try {
            await recordFn({ data: payload });
            toast.success("Đã ghi nhận phiếu chi");
            setOpenNew(false);
            setPreInv(undefined);
            clearPreselect();
            qc.invalidateQueries({ queryKey: ["supplier-payments"] });
            qc.invalidateQueries({ queryKey: ["purchase-invoices-hub"] });
            invalidateLedgers(qc);
          } catch (e: any) {
            toast.error(e?.message || "Lỗi khi ghi nhận");
          }
        }}
      />
    </div>
  );
}

// ============================================================
// NEW PAYMENT — inline trigger (header) + dialog
// ============================================================
function NewPaymentInline({
  preselectInvoiceId,
  preselectSupplierId,
}: {
  preselectInvoiceId?: string;
  preselectSupplierId?: string;
}) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordPayment);
  const outFn = useServerFn(listOutstandingPurchaseInvoices);
  const [open, setOpen] = useState(false);

  const { data: outstanding = [] } = useQuery({
    queryKey: ["outstanding-purchase-invoices"],
    queryFn: () => outFn(),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const filteredOut = preselectSupplierId
    ? outstanding.filter((i: any) => i.supplier_id === preselectSupplierId)
    : outstanding;

  return (
    <>
      <Button variant="payment" onClick={() => setOpen(true)}>
        <Banknote className="mr-2 h-4 w-4" /> Phiếu chi
      </Button>
      <NewPaymentDialog
        open={open}
        onOpenChange={setOpen}
        outstanding={filteredOut}
        preselectInvoiceId={preselectInvoiceId}
        onSubmit={async (payload) => {
          try {
            await recordFn({ data: payload });
            toast.success("Đã ghi nhận phiếu chi");
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["supplier-payments"] });
            qc.invalidateQueries({ queryKey: ["purchase-invoices-hub"] });
            invalidateLedgers(qc);
          } catch (e: any) {
            toast.error(e?.message || "Lỗi khi ghi nhận");
          }
        }}
      />
    </>
  );
}

function NewPaymentDialog({
  open,
  onOpenChange,
  outstanding,
  preselectInvoiceId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  outstanding: any[];
  preselectInvoiceId?: string;
  onSubmit: (p: any) => Promise<void>;
}) {
  const [invoiceId, setInvoiceId] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [method, setMethod] = useState<"cash" | "bank">("bank");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = outstanding.find((i) => i.id === invoiceId);
  const remaining = selected
    ? Number(selected.total) - Number(selected.paid_amount)
    : 0;

  useEffect(() => {
    if (open && preselectInvoiceId) {
      const inv = outstanding.find((i) => i.id === preselectInvoiceId);
      if (inv) {
        setInvoiceId(preselectInvoiceId);
        setAmount(String(Number(inv.total) - Number(inv.paid_amount)));
      }
    }
  }, [open, preselectInvoiceId, outstanding]);

  const reset = () => {
    setInvoiceId("");
    setAmount("");
    setReference("");
    setMethod("bank");
    setPayDate(today());
  };

  const submit = async () => {
    if (!invoiceId) {
      toast.error("Chọn hoá đơn cần thanh toán");
      return;
    }
    const n = Number(amount);
    if (!n || n <= 0) {
      toast.error("Số tiền không hợp lệ");
      return;
    }
    if (n > remaining + 0.5) {
      toast.error(`Vượt công nợ còn lại (${fmt(remaining)})`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        invoice_id: invoiceId,
        amount: n,
        pay_date: payDate,
        method,
        reference: reference || undefined,
      });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  const creditAcc = method === "cash" ? "111" : "112";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo phiếu chi</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Hoá đơn cần thanh toán</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn hoá đơn…" />
              </SelectTrigger>
              <SelectContent>
                {outstanding.map((i: any) => {
                  const rem = Number(i.total) - Number(i.paid_amount);
                  return (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoice_no || "(nháp)"} — {i.supplier_name ?? "—"} ·{" "}
                      {fmt(rem)}
                    </SelectItem>
                  );
                })}
                {outstanding.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    Không có hoá đơn nào còn dư
                  </div>
                )}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground">
                Còn nợ: <strong>{fmt(remaining)}</strong>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ngày chi</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Hình thức</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Chuyển khoản (112)</SelectItem>
                  <SelectItem value="cash">Tiền mặt (111)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Số tiền</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label>Tham chiếu (UNC, séc…)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: UNC-2026-001"
            />
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <div className="font-medium text-muted-foreground">Bút toán đối ứng</div>
            <div className="flex justify-between font-mono">
              <span>Nợ 331 — Phải trả NCC</span>
              <span>{fmt(amount || 0)}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span>Có {creditAcc} — {method === "cash" ? "Tiền mặt" : "Tiền gửi NH"}</span>
              <span>{fmt(amount || 0)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Đang lưu…" : "Ghi nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

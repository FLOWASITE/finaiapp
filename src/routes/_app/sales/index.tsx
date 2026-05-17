import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
  ArrowRight,
  Clock,
  TrendingUp,
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
import {
  listSalesInvoices,
  upsertSalesInvoice,
} from "@/lib/sales.functions";
import { salesDashboard } from "@/lib/sales-dashboard.functions";
import {
  listReceipts,
  listOutstandingInvoices,
  receiptsStats,
  recordReceipt,
  deleteReceipt,
} from "@/lib/receipts.functions";
import { listProducts } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { CustomerCombobox, type CustomerLite } from "@/components/customer-combobox";
import { VAT_CODES, type VatCode, calcLineTax } from "@/lib/vat-codes";

type SalesTab = "invoices" | "receipts" | "overdue" | "customers";
type SalesSearch = {
  tab?: SalesTab;
  status?: string;
  invoice?: string;
  customer?: string;
};

export const Route = createFileRoute("/_app/sales/")({
  component: SalesHubPage,
  validateSearch: (s: Record<string, unknown>): SalesSearch => {
    const tab = s.tab;
    return {
      tab:
        tab === "receipts" || tab === "overdue" || tab === "customers"
          ? tab
          : "invoices",
      status: typeof s.status === "string" ? s.status : undefined,
      invoice: typeof s.invoice === "string" ? s.invoice : undefined,
      customer: typeof s.customer === "string" ? s.customer : undefined,
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
const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank: "Chuyển khoản",
  card: "Thẻ",
  other: "Khác",
};
const AGING_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#f97316", "#ef4444"];

// ============================================================
// MAIN HUB PAGE
// ============================================================
function SalesHubPage() {
  const navigate = Route.useNavigate();
  const { tab = "invoices", status, invoice, customer } = Route.useSearch();

  const dashFn = useServerFn(salesDashboard);
  const { data: dash } = useQuery({
    queryKey: ["sales-dashboard"],
    queryFn: () => dashFn(),
  });

  const setTab = (t: SalesTab, extra: Partial<SalesSearch> = {}) =>
    navigate({
      search: (prev: SalesSearch) => ({ ...prev, tab: t, ...extra }),
      replace: true,
    });

  // money-strip click handlers — bring user to invoice tab with status filter
  const clickStatus = (s: string | undefined) =>
    setTab("invoices", { status: s });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Bán hàng</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tổng quan doanh thu, hoá đơn và phiếu thu — đối ứng công nợ TK 131
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewReceiptInline preselectInvoiceId={invoice} preselectCustomerId={customer} />
          <NewInvoiceDialog />
        </div>
      </div>

      {/* Money strip — Xero-style click-to-filter cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MoneyCard
          tone="primary"
          icon={<TrendingUp className="h-4 w-4" />}
          label="Doanh thu tháng"
          value={fmt(dash?.kpi.revenue_month ?? 0)}
          sub={`${dash?.kpi.invoices_month ?? 0} hoá đơn`}
          onClick={() => clickStatus(undefined)}
          active={tab === "invoices" && !status}
        />
        <MoneyCard
          tone="success"
          icon={<Wallet className="h-4 w-4" />}
          label="Đã thu tháng"
          value={fmt(dash?.kpi.collected_month ?? 0)}
          sub={
            dash && dash.kpi.revenue_month > 0
              ? `${Math.round((dash.kpi.collected_month / dash.kpi.revenue_month) * 100)}% doanh thu`
              : "—"
          }
          onClick={() => setTab("receipts")}
          active={tab === "receipts"}
        />
        <MoneyCard
          tone="warning"
          icon={<Receipt className="h-4 w-4" />}
          label="Phải thu"
          value={fmt(dash?.kpi.outstanding_total ?? 0)}
          sub={`${dash?.kpi.open_invoices ?? 0} HĐ chưa thanh toán`}
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

      {/* Collected windows */}
      <div className="grid gap-3 grid-cols-3">
        <MiniKpi label="Đã thu 30 ngày" value={fmt(dash?.kpi.collected_30 ?? 0)} />
        <MiniKpi label="Đã thu 60 ngày" value={fmt(dash?.kpi.collected_60 ?? 0)} />
        <MiniKpi label="Đã thu 90 ngày" value={fmt(dash?.kpi.collected_90 ?? 0)} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Doanh thu vs Đã thu — 6 tháng</CardTitle>
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
                  dataKey="revenue"
                  name="Doanh thu"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Đã thu"
                  stroke="#10b981"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tuổi nợ phải thu</CardTitle>
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
      <Tabs value={tab} onValueChange={(v) => setTab(v as SalesTab, { status: undefined })}>
        <TabsList className="flex w-full overflow-x-auto sm:w-auto sm:inline-flex">
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Hoá đơn</span>
          </TabsTrigger>
          <TabsTrigger value="receipts">
            <Banknote className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Phiếu thu</span>
          </TabsTrigger>
          <TabsTrigger value="overdue">
            <AlertTriangle className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Quá hạn</span>
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Top khách nợ</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab statusFilter={status} />
        </TabsContent>
        <TabsContent value="receipts" className="mt-4">
          <ReceiptsTab preselectInvoice={invoice} preselectCustomer={customer} />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <OverdueTab overdue={dash?.overdue ?? []} />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <TopCustomersTab top={dash?.top_customers ?? []} onPick={(cid) => setTab("receipts", { customer: cid })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// MONEY STRIP CARDS
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

// ============================================================
// TAB: INVOICES
// ============================================================
function InvoicesTab({ statusFilter }: { statusFilter?: string }) {
  const list = useServerFn(listSalesInvoices);
  const { data: invoices } = useQuery({
    queryKey: ["sales-invoices"],
    queryFn: () => list({}),
  });
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>(statusFilter ?? "all");

  useEffect(() => {
    if (statusFilter) setFilterStatus(statusFilter);
  }, [statusFilter]);

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
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm khách, số HĐ, mã CQT, MST…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
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
              <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">Ngày</th>
              <th className="px-2 sm:px-4 py-2 text-left">Số HĐ</th>
              <th className="px-2 sm:px-4 py-2 text-left">Khách hàng</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden lg:table-cell">Hạn TT</th>
              <th className="px-2 sm:px-4 py-2 text-right hidden md:table-cell">Tổng</th>
              <th className="px-2 sm:px-4 py-2 text-right hidden lg:table-cell">Đã thu</th>
              <th className="px-2 sm:px-4 py-2 text-right">Còn lại</th>
              <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">Trạng thái</th>
              <th className="px-2 sm:px-4 py-2"></th>
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
                  <td className="px-4 py-2 text-right">
                    {remaining > 0 && inv.status !== "void" && (
                      <Button size="sm" variant="outline" asChild className="h-7">
                        <Link to="/sales" search={{ tab: "receipts", invoice: inv.id }}>
                          <Banknote className="mr-1 h-3 w-3" /> Thu
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
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

// ============================================================
// TAB: OVERDUE
// ============================================================
function OverdueTab({ overdue }: { overdue: any[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Số HĐ</th>
            <th className="px-4 py-2 text-left">Khách hàng</th>
            <th className="px-4 py-2 text-right">Trễ</th>
            <th className="px-4 py-2 text-right">Còn nợ</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {overdue.map((o: any) => (
            <tr key={o.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-4 py-2">
                <Link
                  to="/sales/$id"
                  params={{ id: o.id }}
                  className="text-primary hover:underline"
                >
                  {o.invoice_no ?? "—"}
                </Link>
              </td>
              <td className="px-4 py-2">{o.customer_name ?? "—"}</td>
              <td className="px-4 py-2 text-right">
                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                  {o.days_late} ngày
                </Badge>
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold text-rose-600">
                {fmt(o.remaining)}
              </td>
              <td className="px-4 py-2 text-right">
                <Button size="sm" variant="outline" asChild className="h-7">
                  <Link to="/sales" search={{ tab: "receipts", invoice: o.id }}>
                    <Banknote className="mr-1 h-3 w-3" /> Thu
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
// TAB: TOP CUSTOMERS
// ============================================================
function TopCustomersTab({
  top,
  onPick,
}: {
  top: any[];
  onPick: (customerId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Khách hàng</th>
            <th className="px-4 py-2 text-right">HĐ</th>
            <th className="px-4 py-2 text-right">Quá hạn</th>
            <th className="px-4 py-2 text-right">Tổng nợ</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {top.map((c: any, i: number) => (
            <tr key={i} className="border-t border-border hover:bg-muted/30">
              <td className="px-4 py-2">{c.customer_name}</td>
              <td className="px-4 py-2 text-right">{c.invoices}</td>
              <td className="px-4 py-2 text-right font-mono text-rose-600">
                {c.overdue > 0 ? fmt(c.overdue) : "—"}
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {fmt(c.outstanding)}
              </td>
              <td className="px-4 py-2 text-right">
                {c.customer_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => onPick(c.customer_id)}
                  >
                    <Banknote className="mr-1 h-3 w-3" /> Thu
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
// TAB: RECEIPTS
// ============================================================
function ReceiptsTab({
  preselectInvoice,
  preselectCustomer,
}: {
  preselectInvoice?: string;
  preselectCustomer?: string;
}) {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
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
  const [preInv, setPreInv] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (preselectInvoice || preselectCustomer) {
      setPreInv(preselectInvoice);
      setOpenNew(true);
    }
  }, [preselectInvoice, preselectCustomer]);

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
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
    onError: (e: any) => toast.error(e?.message || "Không xoá được"),
  });

  const clearPreselect = () => {
    if (preselectInvoice || preselectCustomer) {
      navigate({
        search: (prev: SalesSearch) => ({ ...prev, invoice: undefined, customer: undefined }),
        replace: true,
      });
    }
  };

  const exportCsv = () => {
    const header = [
      "Ngày",
      "Khách hàng",
      "Hoá đơn",
      "PT thanh toán",
      "Tham chiếu",
      "Số tiền",
      "Ghi chú",
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
    <div className="space-y-3">
      {/* Method KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <MiniReceiptCard
          label="Tổng thu kỳ"
          value={fmt(stats?.total ?? 0)}
          sub={`${stats?.count ?? 0} phiếu`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MiniReceiptCard
          label="Tiền mặt (111)"
          value={fmt(stats?.cash ?? 0)}
          icon={<Banknote className="h-4 w-4" />}
        />
        <MiniReceiptCard
          label="Ngân hàng (112)"
          value={fmt(stats?.bank ?? 0)}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <MiniReceiptCard
          label="Công nợ còn lại (131)"
          value={fmt(stats?.outstanding ?? 0)}
          tone="warning"
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hình thức</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
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
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> Tạo phiếu thu
          </Button>
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
                      <Link
                        to="/sales/$id"
                        params={{ id: r.invoice_id }}
                        className="text-primary hover:underline"
                      >
                        {inv.invoice_no}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">{METHOD_LABEL[r.method] ?? r.method}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.reference ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {fmt(r.amount)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <PaymentBadge status={status} />
                  </td>
                  <td className="px-4 py-2 text-right">
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
        onOpenChange={(v) => {
          setOpenNew(v);
          if (!v) {
            setPreInv(undefined);
            clearPreselect();
          }
        }}
        outstanding={
          preselectCustomer
            ? outstanding.filter((i: any) => i.customer_id === preselectCustomer)
            : outstanding
        }
        preselectInvoiceId={preInv}
        onSubmit={async (payload) => {
          try {
            await recordFn({ data: payload });
            toast.success("Đã ghi nhận phiếu thu");
            setOpenNew(false);
            setPreInv(undefined);
            clearPreselect();
            qc.invalidateQueries({ queryKey: ["receipts"] });
            qc.invalidateQueries({ queryKey: ["receipts-stats"] });
            qc.invalidateQueries({ queryKey: ["outstanding-invoices"] });
            qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
            qc.invalidateQueries({ queryKey: ["sales-invoices"] });
          } catch (e: any) {
            toast.error(e?.message || "Lỗi khi ghi nhận");
          }
        }}
      />
    </div>
  );
}

function MiniReceiptCard({
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

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Đã thu đủ", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    partial: { label: "Thu một phần", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    unpaid: { label: "Chưa thu", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    overdue: { label: "Quá hạn", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  };
  const info = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={info.cls}>
      {info.label}
    </Badge>
  );
}

// ============================================================
// NEW RECEIPT — inline trigger (header) + dialog
// ============================================================
function NewReceiptInline({
  preselectInvoiceId,
  preselectCustomerId,
}: {
  preselectInvoiceId?: string;
  preselectCustomerId?: string;
}) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordReceipt);
  const outFn = useServerFn(listOutstandingInvoices);
  const [open, setOpen] = useState(false);

  const { data: outstanding = [] } = useQuery({
    queryKey: ["outstanding-invoices"],
    queryFn: () => outFn(),
  });

  const filteredOut = preselectCustomerId
    ? outstanding.filter((i: any) => i.customer_id === preselectCustomerId)
    : outstanding;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Banknote className="mr-2 h-4 w-4" /> Phiếu thu
      </Button>
      <NewReceiptDialog
        open={open}
        onOpenChange={setOpen}
        outstanding={filteredOut}
        preselectInvoiceId={preselectInvoiceId}
        onSubmit={async (payload) => {
          try {
            await recordFn({ data: payload });
            toast.success("Đã ghi nhận phiếu thu");
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["receipts"] });
            qc.invalidateQueries({ queryKey: ["receipts-stats"] });
            qc.invalidateQueries({ queryKey: ["outstanding-invoices"] });
            qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
            qc.invalidateQueries({ queryKey: ["sales-invoices"] });
          } catch (e: any) {
            toast.error(e?.message || "Lỗi khi ghi nhận");
          }
        }}
      />
    </>
  );
}

function NewReceiptDialog({
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
  const [method, setMethod] = useState<"cash" | "bank" | "card" | "other">("bank");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = outstanding.find((i) => i.id === invoiceId);
  const remaining = selected ? Number(selected.total) - Number(selected.paid_amount) : 0;

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
    setNotes("");
    setMethod("bank");
    setPayDate(today());
  };

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
          <DialogTitle>Tạo phiếu thu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Hoá đơn còn nợ *</Label>
            <Select
              value={invoiceId}
              onValueChange={(v) => {
                setInvoiceId(v);
                const inv = outstanding.find((i) => i.id === v);
                if (inv) setAmount(String(Number(inv.total) - Number(inv.paid_amount)));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn hoá đơn..." />
              </SelectTrigger>
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
                <span className="text-amber-600 font-medium">
                  còn lại {fmt(remaining)}
                </span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Ngày thu *</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Hình thức *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <span>
                  Nợ {method === "cash" ? "111" : "112"} —{" "}
                  {method === "cash" ? "Tiền mặt" : "Tiền gửi NH"}
                </span>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            disabled={
              !invoiceId ||
              !amount ||
              submitting ||
              Number(amount) <= 0 ||
              (selected && Number(amount) > remaining + 0.01)
            }
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

// ============================================================
// NEW INVOICE DIALOG (kept from previous file)
// ============================================================
type EditorLine = {
  product_id?: string | null;
  description: string;
  qty: number;
  unit_price: number;
  vat_code: VatCode;
  line_discount_percent: number;
  line_discount_amount: number;
};

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

  const todayStr = today();
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [head, setHead] = useState({
    issue_date: todayStr,
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

  const totals = useMemo(() => {
    let preVat = 0;
    let vat = 0;
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
    const total =
      subtotal + vatScaled + Number(head.shipping_fee) + Number(head.other_fees);
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
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
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
        issue_date: todayStr,
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
          <Plus className="mr-2 h-4 w-4" />
          Tạo HĐ bán
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
              <Select
                value={head.currency}
                onValueChange={(v) => setHead({ ...head, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                              vat_code: (p?.vat_rate ?? 10).toString() as VatCode,
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
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VAT_CODES.map((v) => (
                              <SelectItem key={v.code} value={v.code}>
                                {v.code === "0" ||
                                v.code === "5" ||
                                v.code === "8" ||
                                v.code === "10"
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
              <Plus className="mr-1 h-3 w-3" />
              Thêm dòng
            </Button>
          </div>

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
                  onChange={(e) =>
                    setHead({ ...head, shipping_fee: Number(e.target.value) })
                  }
                />
                <Label>Phí khác</Label>
                <Input
                  type="number"
                  className="h-8"
                  value={head.other_fees}
                  onChange={(e) =>
                    setHead({ ...head, other_fees: Number(e.target.value) })
                  }
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

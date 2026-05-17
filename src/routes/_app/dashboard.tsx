import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Banknote,
  Receipt,
  FileText,
  Upload,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardOverview } from "@/lib/dashboard-overview.functions";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";

const searchSchema = z.object({
  period: fallback(z.enum(["month", "quarter", "ytd"]), "month").default("month"),
});

export const Route = createFileRoute("/_app/dashboard")({
  validateSearch: zodValidator(searchSchema),
  component: Dashboard,
});

const fmtVND = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + " ₫";
const fmtShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "T";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "Tr";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(Math.round(n));
};
const monthLabel = (m: string) => {
  const [, mm] = m.split("-");
  return `T${parseInt(mm, 10)}`;
};
const periodLabel: Record<string, string> = {
  month: "Tháng này",
  quarter: "Quý này",
  ytd: "Từ đầu năm",
};

function Dashboard() {
  const { period } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard" });
  const fetchOverview = useServerFn(dashboardOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview", period],
    queryFn: () => fetchOverview({ data: { period } }),
    staleTime: 60_000,
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">
            {periodLabel[period]} · Cập nhật {data?.today ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => navigate({ search: { period: v as any } })}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Tháng này</SelectItem>
              <SelectItem value="quarter">Quý này</SelectItem>
              <SelectItem value="ytd">Từ đầu năm</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild size="sm">
            <Link to="/invoices">
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Doanh thu"
          value={data?.kpi.revenue ?? 0}
          prev={data?.kpi.revenue_prev ?? 0}
          loading={isLoading}
          tone="success"
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Chi phí"
          value={data?.kpi.expense ?? 0}
          prev={data?.kpi.expense_prev ?? 0}
          loading={isLoading}
          tone="danger"
          invertDelta
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Lợi nhuận"
          value={data?.kpi.profit ?? 0}
          prev={data?.kpi.profit_prev ?? 0}
          loading={isLoading}
        />
        <KpiCard
          icon={<Banknote className="h-4 w-4" />}
          label="Tiền NH + Mặt"
          value={(data?.kpi.total_bank ?? 0) + (data?.kpi.cash_on_hand ?? 0)}
          loading={isLoading}
          hint={data ? `NH: ${fmtShort(data.kpi.total_bank)} · TM: ${fmtShort(data.kpi.cash_on_hand)}` : ""}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Công nợ ròng"
          value={data?.kpi.net_receivable ?? 0}
          loading={isLoading}
          hint={data ? `Phải thu ${fmtShort(data.kpi.ar)} · Phải trả ${fmtShort(data.kpi.ap)}` : ""}
        />
      </div>

      {/* Row: Cashflow + Banks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dòng tiền 6 tháng</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data?.cashflow ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} className="text-xs" />
                    <YAxis tickFormatter={fmtShort} className="text-xs" width={50} />
                    <Tooltip
                      formatter={(v: number) => fmtVND(v)}
                      labelFormatter={(l) => `Tháng ${monthLabel(l as string).slice(1)}`}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="inflow" name="Thu" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" name="Chi" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="net" name="Ròng" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tài khoản tiền</CardTitle>
            {data && data.unreconciled_count > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                {data.unreconciled_count} chưa đối soát
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : data?.bank_accounts.length ? (
              <>
                {data.bank_accounts.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {b.bank_name} · {b.account_no}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">{fmtVND(b.balance)}</div>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                  <div className="font-medium">Tiền mặt</div>
                  <div className="font-semibold tabular-nums">{fmtVND(data.kpi.cash_on_hand)}</div>
                </div>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link to="/bank">Đối soát ngân hàng</Link>
                </Button>
              </>
            ) : (
              <EmptyState text="Chưa có tài khoản ngân hàng" cta={<Button size="sm" asChild><Link to="/bank">Thêm tài khoản</Link></Button>} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row: AR / AP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgingCard
          title="Phải thu khách hàng"
          aging={data?.ar_aging}
          tops={data?.top_customers}
          actionLabel="Thu"
          link="/receivables"
          loading={isLoading}
          color="hsl(217 91% 60%)"
        />
        <AgingCard
          title="Phải trả nhà cung cấp"
          aging={data?.ap_aging}
          tops={data?.top_suppliers}
          actionLabel="Chi"
          link="/payables"
          loading={isLoading}
          color="hsl(25 95% 53%)"
        />
      </div>

      {/* Row: Pending + PnL summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hoá đơn cần xử lý</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overdue">
              <TabsList className="w-full">
                <TabsTrigger value="overdue" className="flex-1">
                  Quá hạn {data?.overdue_sales.length ? `(${data.overdue_sales.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="due" className="flex-1">
                  Sắp đến hạn {data?.due_soon_sales.length ? `(${data.due_soon_sales.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="pending" className="flex-1">
                  Chờ duyệt {data?.pending_invoices.length ? `(${data.pending_invoices.length})` : ""}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overdue" className="mt-3">
                <InvoiceList
                  loading={isLoading}
                  items={data?.overdue_sales ?? []}
                  type="sale-overdue"
                  empty="Không có hoá đơn quá hạn"
                />
              </TabsContent>
              <TabsContent value="due" className="mt-3">
                <InvoiceList
                  loading={isLoading}
                  items={data?.due_soon_sales ?? []}
                  type="sale-due"
                  empty="Không có hoá đơn sắp đến hạn"
                />
              </TabsContent>
              <TabsContent value="pending" className="mt-3">
                <InvoiceList
                  loading={isLoading}
                  items={data?.pending_invoices ?? []}
                  type="purchase-pending"
                  empty="Không có hoá đơn chờ duyệt"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Kết quả kinh doanh</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reports">Báo cáo đầy đủ →</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <PnlRow label="Doanh thu" value={data?.kpi.revenue ?? 0} loading={isLoading} />
            <PnlRow label="Chi phí" value={data?.kpi.expense ?? 0} loading={isLoading} negative />
            <div className="border-t pt-3">
              <PnlRow label="Lợi nhuận ước tính" value={data?.kpi.profit ?? 0} loading={isLoading} bold />
            </div>
            <p className="text-xs text-muted-foreground">
              Ước tính nhanh từ hoá đơn & phiếu chi tiền mặt trong kỳ. Báo cáo P&L chi tiết hiển thị ở mục Báo cáo.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row: Recent Journal + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Bút toán gần đây</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/journal">Sổ nhật ký →</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : data?.recent_journal.length ? (
              <div className="space-y-1">
                {data.recent_journal.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{e.entry_date}</div>
                      <div className="truncate">{e.description ?? "—"}</div>
                    </div>
                    <div className="font-medium tabular-nums">{fmtVND(e.total)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Chưa có bút toán nào" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Thao tác nhanh</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <QuickAction icon={<Plus />} label="Hoá đơn bán" to="/sales" />
            <QuickAction icon={<ArrowDownToLine />} label="Ghi thu" to="/receipts" />
            <QuickAction icon={<ArrowUpFromLine />} label="Ghi chi" to="/cash" />
            <QuickAction icon={<Upload />} label="Upload mua" to="/invoices" />
            <QuickAction icon={<FileText />} label="Báo cáo" to="/reports" />
            <QuickAction icon={<Banknote />} label="Ngân hàng" to="/bank" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  prev,
  loading,
  tone,
  hint,
  invertDelta,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  prev?: number;
  loading?: boolean;
  tone?: "success" | "danger";
  hint?: string;
  invertDelta?: boolean;
}) {
  const delta = useMemo(() => {
    if (prev === undefined || prev === 0) return null;
    const pct = ((value - prev) / Math.abs(prev)) * 100;
    return pct;
  }, [value, prev]);
  const positive = delta !== null && (invertDelta ? delta < 0 : delta > 0);
  const negative = delta !== null && (invertDelta ? delta > 0 : delta < 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className={tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-rose-600" : ""}>{icon}</span>
          <span>{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-2" />
        ) : (
          <div className="mt-1.5 text-lg md:text-xl font-bold tabular-nums">{fmtVND(value)}</div>
        )}
        {hint && <div className="mt-1 text-[11px] text-muted-foreground truncate">{hint}</div>}
        {delta !== null && !loading && (
          <div
            className={`mt-1 text-xs inline-flex items-center gap-1 ${
              positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-muted-foreground"
            }`}
          >
            {positive ? <TrendingUp className="h-3 w-3" /> : negative ? <TrendingDown className="h-3 w-3" /> : null}
            {Math.abs(delta).toFixed(1)}% so kỳ trước
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgingCard({
  title,
  aging,
  tops,
  actionLabel,
  link,
  loading,
  color,
}: {
  title: string;
  aging?: { current: number; "1-30": number; "31-60": number; "61-90": number; "90+": number };
  tops?: { name: string; outstanding: number }[];
  actionLabel: string;
  link: string;
  loading?: boolean;
  color: string;
}) {
  const chartData = aging
    ? [
        { name: "Hiện hành", value: aging.current, fill: "hsl(142 71% 45%)" },
        { name: "1-30", value: aging["1-30"], fill: "hsl(48 96% 53%)" },
        { name: "31-60", value: aging["31-60"], fill: "hsl(25 95% 53%)" },
        { name: "61-90", value: aging["61-90"], fill: "hsl(0 72% 51%)" },
        { name: "90+", value: aging["90+"], fill: "hsl(0 72% 35%)" },
      ].filter((d) => d.value > 0.5)
    : [];
  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={link}>Xem →</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : total === 0 ? (
          <EmptyState text={`Không có công nợ`} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="h-[180px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtVND(v)}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[10px] text-muted-foreground">Tổng</div>
                <div className="text-sm font-bold tabular-nums">{fmtShort(total)}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              {chartData.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.fill }} />
                    {d.name}
                  </span>
                  <span className="tabular-nums font-medium">{fmtVND(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tops && tops.length > 0 && (
          <div className="mt-4 pt-3 border-t space-y-1">
            <div className="text-xs text-muted-foreground mb-1.5">Top {tops.length}</div>
            {tops.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate min-w-0">{t.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="tabular-nums">{fmtVND(t.outstanding)}</span>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs" asChild>
                    <Link to={link}>{actionLabel}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InvoiceList({
  items,
  type,
  empty,
  loading,
}: {
  items: any[];
  type: "sale-overdue" | "sale-due" | "purchase-pending";
  empty: string;
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-[180px] w-full" />;
  if (!items.length)
    return (
      <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        {empty}
      </div>
    );
  return (
    <div className="space-y-1 max-h-[260px] overflow-auto">
      {items.map((r) => {
        const isPurchase = type === "purchase-pending";
        const link = isPurchase ? `/invoices/${r.id}` : `/sales/${r.id}`;
        return (
          <Link
            key={r.id}
            to={link}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                {r.invoice_no ?? "—"} · {isPurchase ? r.supplier_name : r.customer_name}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                {type === "sale-overdue" && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {r.days_late} ngày
                  </Badge>
                )}
                {type === "sale-due" && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-amber-600 border-amber-300">
                    <Clock className="h-2.5 w-2.5 mr-0.5" /> {r.due_date}
                  </Badge>
                )}
                {type === "purchase-pending" && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {r.status}
                  </Badge>
                )}
              </div>
            </div>
            <div className="font-semibold tabular-nums text-sm">
              {fmtVND(isPurchase ? Number(r.total || 0) : Number(r.remaining || r.total || 0))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function PnlRow({
  label,
  value,
  loading,
  negative,
  bold,
}: {
  label: string;
  value: number;
  loading?: boolean;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base" : "text-sm"}`}>
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      {loading ? (
        <Skeleton className="h-5 w-24" />
      ) : (
        <span className={`tabular-nums ${bold ? "font-bold" : negative ? "text-rose-600" : "font-medium"}`}>
          {negative ? "−" : ""}
          {fmtVND(value)}
        </span>
      )}
    </div>
  );
}

function QuickAction({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Button variant="outline" className="h-auto flex-col py-3 gap-1.5" asChild>
      <Link to={to}>
        <span className="[&_svg]:h-5 [&_svg]:w-5">{icon}</span>
        <span className="text-xs">{label}</span>
      </Link>
    </Button>
  );
}

function EmptyState({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
      {text}
      {cta}
    </div>
  );
}

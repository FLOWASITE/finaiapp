import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { salesDashboard } from "@/lib/sales-dashboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  Receipt,
  ArrowRight,
  Users,
  Clock,
  Banknote,
} from "lucide-react";

export const Route = createFileRoute("/_app/sales-dashboard/")({ component: SalesDashboardPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const fmtShort = (n: number) => {
  const v = Math.abs(n);
  if (v >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
};

const AGING_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#f97316", "#ef4444"];
const STATUS_COLORS: Record<string, string> = {
  paid: "#10b981",
  partial: "#f59e0b",
  unpaid: "#94a3b8",
  overdue: "#ef4444",
};

function SalesDashboardPage() {
  const fn = useServerFn(salesDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["sales-dashboard"], queryFn: () => fn() });

  if (isLoading || !data) {
    return <div className="p-8 text-muted-foreground">Đang tải dashboard...</div>;
  }

  const { kpi, trend, aging, overdue, top_customers, status_mix } = data;

  const agingData = [
    { name: "Trong hạn", value: aging.current, color: AGING_COLORS[0] },
    { name: "1–30", value: aging["1-30"], color: AGING_COLORS[1] },
    { name: "31–60", value: aging["31-60"], color: AGING_COLORS[2] },
    { name: "61–90", value: aging["61-90"], color: AGING_COLORS[3] },
    { name: ">90", value: aging["90+"], color: AGING_COLORS[4] },
  ];
  const statusData = Object.entries(status_mix).map(([k, v]) => ({
    name: k === "paid" ? "Đã thu" : k === "partial" ? "Một phần" : k === "overdue" ? "Quá hạn" : "Chưa thu",
    value: v as number,
    key: k,
  }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard bán hàng & công nợ</h1>
          <p className="text-sm text-muted-foreground">Doanh thu, dòng tiền thu và tuổi nợ theo thời gian thực</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/sales">Hoá đơn</Link></Button>
          <Button variant="outline" asChild><Link to="/receipts">Phiếu thu</Link></Button>
        </div>
      </div>

      {/* KPI strip 1 */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Doanh thu tháng"
          value={fmt(kpi.revenue_month)}
          sub={`${kpi.invoices_month} hoá đơn`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="primary"
        />
        <KpiCard
          label="Đã thu tháng"
          value={fmt(kpi.collected_month)}
          sub={kpi.revenue_month > 0 ? `${Math.round((kpi.collected_month / kpi.revenue_month) * 100)}% doanh thu` : "—"}
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
        />
        <KpiCard
          label="Công nợ phải thu"
          value={fmt(kpi.outstanding_total)}
          sub={`${kpi.open_invoices} HĐ chưa thanh toán`}
          icon={<Receipt className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="Quá hạn"
          value={fmt(kpi.overdue_total)}
          sub={`${kpi.overdue_count} HĐ trễ hạn`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="danger"
        />
      </div>

      {/* KPI strip 2: collected windows */}
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Đã thu 30 ngày" value={fmt(kpi.collected_30)} icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Đã thu 60 ngày" value={fmt(kpi.collected_60)} icon={<Clock className="h-4 w-4" />} />
        <KpiCard label="Đã thu 90 ngày" value={fmt(kpi.collected_90)} icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Trend + Aging */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Doanh thu vs Đã thu — 6 tháng</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={fmtShort} className="text-xs" />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" name="Doanh thu" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="collected" name="Đã thu" stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tuổi nợ phải thu</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={agingData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {agingData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Overdue + Top customers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" /> Hoá đơn quá hạn
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/receivables">Xem tất cả <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
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
                      <Link to="/sales/$id" params={{ id: o.id }} className="text-primary hover:underline">
                        {o.invoice_no ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{o.customer_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                        {o.days_late} ngày
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-rose-600">{fmt(o.remaining)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" asChild className="h-7">
                        <Link to="/receipts" search={{ invoice: o.id }}>
                          <Banknote className="mr-1 h-3 w-3" /> Thu
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {overdue.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Không có hoá đơn quá hạn 🎉</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Top khách hàng đang nợ
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
                {top_customers.map((c: any, i: number) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2">{c.customer_name}</td>
                    <td className="px-4 py-2 text-right">{c.invoices}</td>
                    <td className="px-4 py-2 text-right font-mono text-rose-600">{c.overdue > 0 ? fmt(c.overdue) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(c.outstanding)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.customer_id && (
                        <Button size="sm" variant="outline" asChild className="h-7">
                          <Link to="/receipts" search={{ customer: c.customer_id }}>
                            <Banknote className="mr-1 h-3 w-3" /> Thu
                          </Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {top_customers.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Chưa có công nợ</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Status mix */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cơ cấu trạng thái thanh toán (180 ngày)</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis type="category" dataKey="name" className="text-xs" width={100} />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {statusData.map((e: any, i) => <Cell key={i} fill={STATUS_COLORS[e.key]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label, value, sub, icon, tone,
}: {
  label: string; value: string; sub?: string; icon?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success" ? "text-emerald-600" :
    tone === "warning" ? "text-amber-600" :
    tone === "danger" ? "text-rose-600" :
    tone === "primary" ? "text-primary" : "";
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

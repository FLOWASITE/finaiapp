import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { withLatency } from "@/lib/with-latency";

function dayStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const salesDashboard = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(withLatency("salesDashboard", async ({ context }) => {
    const { supabase, tenantId } = context;
    const today = new Date();
    const todayStr = dayStr(today);
    const d30 = dayStr(addDays(today, -30));
    const d60 = dayStr(addDays(today, -60));
    const d90 = dayStr(addDays(today, -90));
    const monthStart = dayStr(new Date(today.getFullYear(), today.getMonth(), 1));

    // Build last 6 month keys
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const firstMonth = monthKeys[0];

    // 1) Trend from monthly_summary (aggregation table, scoped via RLS)
    const { data: summaryRows = [] } = await supabase
      .from("monthly_summary")
      .select("year_month, sales_revenue, sales_count, collected")
      .eq("tenant_id", tenantId)
      .gte("year_month", firstMonth);
    const summaryMap = new Map<string, { revenue: number; collected: number; count: number }>();
    for (const r of summaryRows ?? []) {
      summaryMap.set(r.year_month as string, {
        revenue: Number(r.sales_revenue || 0),
        collected: Number(r.collected || 0),
        count: Number(r.sales_count || 0),
      });
    }
    const trend = monthKeys.map((m) => {
      const v = summaryMap.get(m) ?? { revenue: 0, collected: 0, count: 0 };
      return { month: m, revenue: v.revenue, collected: v.collected, count: v.count };
    });

    // 2) Receipts last 90 days for KPI windows (small dataset)
    const { data: receipts = [] } = await supabase
      .from("customer_receipts")
      .select("amount, method, pay_date")
      .gte("pay_date", d90);
    const collected30 = (receipts ?? []).filter((r: any) => r.pay_date >= d30).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const collected60 = (receipts ?? []).filter((r: any) => r.pay_date >= d60).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const collected90 = (receipts ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    // 3) Aging on outstanding (must scan open invoices for per-row remaining/due)
    const { data: openInvoices = [] } = await supabase
      .from("sales_invoices")
      .select("id, invoice_no, customer_id, customer_name, issue_date, due_date, total, paid_amount, payment_status")
      .eq("status", "issued")
      .in("payment_status", ["unpaid", "partial", "overdue"]);

    const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const overdueList: any[] = [];
    const byCustomer = new Map<string, { customer_id: string | null; customer_name: string; outstanding: number; overdue: number; invoices: number }>();

    for (const inv of openInvoices ?? []) {
      const remaining = Number(inv.total || 0) - Number(inv.paid_amount || 0);
      if (remaining <= 0.5) continue;
      const due = inv.due_date ?? inv.issue_date;
      const daysLate = Math.floor((today.getTime() - new Date(due).getTime()) / 86400000);
      if (daysLate <= 0) aging.current += remaining;
      else if (daysLate <= 30) aging["1-30"] += remaining;
      else if (daysLate <= 60) aging["31-60"] += remaining;
      else if (daysLate <= 90) aging["61-90"] += remaining;
      else aging["90+"] += remaining;

      if (daysLate > 0) {
        overdueList.push({
          id: inv.id,
          invoice_no: inv.invoice_no,
          customer_name: inv.customer_name,
          due_date: due,
          days_late: daysLate,
          remaining,
        });
      }

      const key = inv.customer_id ?? inv.customer_name ?? "?";
      const cur = byCustomer.get(key) ?? {
        customer_id: inv.customer_id,
        customer_name: inv.customer_name ?? "Không rõ",
        outstanding: 0,
        overdue: 0,
        invoices: 0,
      };
      cur.outstanding += remaining;
      if (daysLate > 0) cur.overdue += remaining;
      cur.invoices += 1;
      byCustomer.set(key, cur);
    }

    overdueList.sort((a, b) => b.days_late - a.days_late);
    const topCustomers = Array.from(byCustomer.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8);

    // 4) Current month KPI from monthly_summary
    const curYm = monthKeys[monthKeys.length - 1];
    const cur = summaryMap.get(curYm) ?? { revenue: 0, collected: 0, count: 0 };
    const revenueMonth = cur.revenue;
    const invoicesMonth = cur.count;
    const collectedMonth = (receipts ?? []).filter((r: any) => r.pay_date >= monthStart).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const outstandingTotal = (openInvoices ?? []).reduce(
      (s: number, r: any) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)),
      0,
    );
    const overdueTotal = overdueList.reduce((s, r) => s + r.remaining, 0);

    // Payment status mix on current open invoices (cheap, already loaded)
    const statusMix = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
    for (const inv of openInvoices ?? []) {
      const k = (inv.payment_status ?? "unpaid") as keyof typeof statusMix;
      if (k in statusMix) statusMix[k] += 1;
    }

    return {
      kpi: {
        revenue_month: revenueMonth,
        invoices_month: invoicesMonth,
        collected_month: collectedMonth,
        collected_30: collected30,
        collected_60: collected60,
        collected_90: collected90,
        outstanding_total: outstandingTotal,
        overdue_total: overdueTotal,
        open_invoices: (openInvoices ?? []).length,
        overdue_count: overdueList.length,
      },
      trend,
      aging,
      overdue: overdueList.slice(0, 20),
      top_customers: topCustomers,
      status_mix: statusMix,
      today: todayStr,
    };
  }));


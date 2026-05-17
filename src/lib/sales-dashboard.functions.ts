import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function dayStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function monthKey(d: string) {
  return d.slice(0, 7);
}

export const salesDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date();
    const todayStr = dayStr(today);
    const d30 = dayStr(addDays(today, -30));
    const d60 = dayStr(addDays(today, -60));
    const d90 = dayStr(addDays(today, -90));
    const monthFrom = dayStr(addDays(today, -180)); // ~6 months back

    // 1) Invoices in last 180 days for revenue trend + status mix
    const { data: invoices = [] } = await supabase
      .from("sales_invoices")
      .select("id, issue_date, due_date, total, paid_amount, status, payment_status, customer_id, customer_name")
      .gte("issue_date", monthFrom)
      .neq("status", "void");

    const issued = (invoices ?? []).filter((r: any) => r.status === "issued");

    // Revenue by month (last 6)
    const monthly = new Map<string, { month: string; revenue: number; collected: number; count: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.set(k, { month: k, revenue: 0, collected: 0, count: 0 });
    }
    for (const inv of issued) {
      const k = monthKey(inv.issue_date);
      const m = monthly.get(k);
      if (m) {
        m.revenue += Number(inv.total || 0);
        m.collected += Number(inv.paid_amount || 0);
        m.count += 1;
      }
    }

    // 2) Receipts last 90 days
    const { data: receipts = [] } = await supabase
      .from("customer_receipts")
      .select("amount, method, pay_date, customer_id, customer_name")
      .gte("pay_date", d90);

    const collected30 = (receipts ?? []).filter((r: any) => r.pay_date >= d30).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const collected60 = (receipts ?? []).filter((r: any) => r.pay_date >= d60).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const collected90 = (receipts ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    // Collected by month (merge into monthly)
    for (const r of receipts ?? []) {
      const k = monthKey(r.pay_date);
      const m = monthly.get(k);
      if (m) m.collected += Number(r.amount || 0); // additive to inv.paid_amount fallback ok
    }
    // Re-derive collected per month from receipts only (clean)
    const collectedByMonth = new Map<string, number>();
    for (const r of receipts ?? []) {
      const k = monthKey(r.pay_date);
      collectedByMonth.set(k, (collectedByMonth.get(k) ?? 0) + Number(r.amount || 0));
    }
    const trend = Array.from(monthly.values()).map((m) => ({
      month: m.month,
      revenue: m.revenue,
      collected: collectedByMonth.get(m.month) ?? 0,
      count: m.count,
    }));

    // 3) Aging on ALL outstanding (not just 180d window)
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

    // 4) Current month stats
    const monthStart = dayStr(new Date(today.getFullYear(), today.getMonth(), 1));
    const monthIssued = issued.filter((r: any) => r.issue_date >= monthStart);
    const revenueMonth = monthIssued.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const collectedMonth = (receipts ?? []).filter((r: any) => r.pay_date >= monthStart).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    const outstandingTotal = (openInvoices ?? []).reduce(
      (s: number, r: any) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)),
      0,
    );
    const overdueTotal = overdueList.reduce((s, r) => s + r.remaining, 0);

    // Payment status mix (180d window)
    const statusMix = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
    for (const inv of issued) {
      const k = (inv.payment_status ?? "unpaid") as keyof typeof statusMix;
      if (k in statusMix) statusMix[k] += 1;
    }

    return {
      kpi: {
        revenue_month: revenueMonth,
        invoices_month: monthIssued.length,
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
  });

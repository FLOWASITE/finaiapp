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

export const purchasesDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date();
    const todayStr = dayStr(today);
    const d30 = dayStr(addDays(today, -30));
    const d60 = dayStr(addDays(today, -60));
    const d90 = dayStr(addDays(today, -90));
    const monthFrom = dayStr(addDays(today, -180));

    // 1) Invoices 180d for trend
    const { data: invoices = [] } = await supabase
      .from("invoices")
      .select(
        "id, issue_date, total, status, supplier_id, supplier_name, invoice_no",
      )
      .gte("issue_date", monthFrom);

    // Build month buckets
    const monthly = new Map<
      string,
      { month: string; expense: number; paid: number; count: number }
    >();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.set(k, { month: k, expense: 0, paid: 0, count: 0 });
    }
    for (const inv of invoices ?? []) {
      if (!inv.issue_date) continue;
      const k = monthKey(inv.issue_date);
      const m = monthly.get(k);
      if (m) {
        m.expense += Number(inv.total || 0);
        m.count += 1;
      }
    }

    // 2) Payments 90d (KPI windows) + by month merge
    const { data: payments = [] } = await supabase
      .from("supplier_payments")
      .select("amount, method, pay_date, supplier_id, supplier_name")
      .gte("pay_date", d90);

    const paid30 = (payments ?? [])
      .filter((p: any) => p.pay_date >= d30)
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const paid60 = (payments ?? [])
      .filter((p: any) => p.pay_date >= d60)
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const paid90 = (payments ?? []).reduce(
      (s: number, p: any) => s + Number(p.amount || 0),
      0,
    );

    // Re-derive paid per month from payments (last 180d window of months)
    const { data: paymentsLong = [] } = await supabase
      .from("supplier_payments")
      .select("amount, pay_date")
      .gte("pay_date", monthFrom);
    for (const p of paymentsLong ?? []) {
      const k = monthKey(p.pay_date as string);
      const m = monthly.get(k);
      if (m) m.paid += Number(p.amount || 0);
    }
    const trend = Array.from(monthly.values());

    // 3) Aging on all outstanding
    const { data: allInvs = [] } = await supabase
      .from("invoices")
      .select("id, invoice_no, supplier_id, supplier_name, issue_date, total");
    const { data: allPays = [] } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount");
    const paidMap = new Map<string, number>();
    for (const p of allPays ?? []) {
      if (p.invoice_id)
        paidMap.set(
          p.invoice_id,
          (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0),
        );
    }

    const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const overdueList: any[] = [];
    const bySupplier = new Map<
      string,
      {
        supplier_id: string | null;
        supplier_name: string;
        outstanding: number;
        overdue: number;
        invoices: number;
      }
    >();

    for (const inv of allInvs ?? []) {
      const remaining = Number(inv.total || 0) - (paidMap.get(inv.id) ?? 0);
      if (remaining <= 0.5) continue;
      const issued = inv.issue_date ?? todayStr;
      // No due_date column → assume 30-day terms
      const due = dayStr(addDays(new Date(issued), 30));
      const daysLate = Math.floor(
        (today.getTime() - new Date(due).getTime()) / 86400000,
      );
      if (daysLate <= 0) aging.current += remaining;
      else if (daysLate <= 30) aging["1-30"] += remaining;
      else if (daysLate <= 60) aging["31-60"] += remaining;
      else if (daysLate <= 90) aging["61-90"] += remaining;
      else aging["90+"] += remaining;

      if (daysLate > 0) {
        overdueList.push({
          id: inv.id,
          invoice_no: inv.invoice_no,
          supplier_name: inv.supplier_name,
          due_date: due,
          days_late: daysLate,
          remaining,
        });
      }

      const key = inv.supplier_id ?? inv.supplier_name ?? "?";
      const cur = bySupplier.get(key) ?? {
        supplier_id: inv.supplier_id,
        supplier_name: inv.supplier_name ?? "Không rõ",
        outstanding: 0,
        overdue: 0,
        invoices: 0,
      };
      cur.outstanding += remaining;
      if (daysLate > 0) cur.overdue += remaining;
      cur.invoices += 1;
      bySupplier.set(key, cur);
    }

    overdueList.sort((a, b) => b.days_late - a.days_late);
    const topSuppliers = Array.from(bySupplier.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8);

    // 4) Current month stats
    const monthStart = dayStr(new Date(today.getFullYear(), today.getMonth(), 1));
    const monthExpense = (invoices ?? [])
      .filter((r: any) => r.issue_date >= monthStart)
      .reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const monthInvoiceCount = (invoices ?? []).filter(
      (r: any) => r.issue_date >= monthStart,
    ).length;
    const paidMonth = (payments ?? [])
      .filter((p: any) => p.pay_date >= monthStart)
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    const outstandingTotal = (allInvs ?? []).reduce(
      (s: number, r: any) =>
        s + Math.max(0, Number(r.total || 0) - (paidMap.get(r.id) ?? 0)),
      0,
    );
    const overdueTotal = overdueList.reduce((s, r) => s + r.remaining, 0);
    const openInvoiceCount = (allInvs ?? []).filter(
      (r: any) => Number(r.total || 0) - (paidMap.get(r.id) ?? 0) > 0.5,
    ).length;

    return {
      kpi: {
        expense_month: monthExpense,
        invoices_month: monthInvoiceCount,
        paid_month: paidMonth,
        paid_30: paid30,
        paid_60: paid60,
        paid_90: paid90,
        outstanding_total: outstandingTotal,
        overdue_total: overdueTotal,
        open_invoices: openInvoiceCount,
        overdue_count: overdueList.length,
      },
      trend,
      aging,
      overdue: overdueList.slice(0, 20),
      top_suppliers: topSuppliers,
      today: todayStr,
    };
  });

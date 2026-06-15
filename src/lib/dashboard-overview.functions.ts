import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { withLatency } from "@/lib/with-latency";
import { z } from "zod";

const PeriodSchema = z.object({
  period: z.enum(["month", "quarter", "ytd"]).default("month"),
});

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

function periodRange(period: "month" | "quarter" | "ytd") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let from: Date;
  let prevFrom: Date;
  let prevTo: Date;
  if (period === "month") {
    from = new Date(y, m, 1);
    prevFrom = new Date(y, m - 1, 1);
    prevTo = new Date(y, m, 0);
  } else if (period === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    from = new Date(y, qStart, 1);
    prevFrom = new Date(y, qStart - 3, 1);
    prevTo = new Date(y, qStart, 0);
  } else {
    from = new Date(y, 0, 1);
    prevFrom = new Date(y - 1, 0, 1);
    prevTo = new Date(y - 1, 11, 31);
  }
  return {
    from: dayStr(from),
    to: dayStr(now),
    prevFrom: dayStr(prevFrom),
    prevTo: dayStr(prevTo),
  };
}

export const dashboardOverview = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => PeriodSchema.parse(i ?? {}))
  .handler(withLatency("dashboardOverview", async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const today = new Date();
    const todayStr = dayStr(today);
    const { from, to, prevFrom, prevTo } = periodRange(data.period);
    const monthFrom = dayStr(addDays(today, -180));

    const [
      salesInvRes,
      purchInvRes,
      recRes,
      payRes,
      cashRes,
      bankAccRes,
      bankTxRes,
      openSalesRes,
      openPurchRes,
      allPaysRes,
      pendingInvRes,
      jeRes,
    ] = await Promise.all([
      supabase
        .from("sales_invoices")
        .select("id, issue_date, due_date, total, paid_amount, status, payment_status, customer_name")
        .gte("issue_date", prevFrom)
        .neq("status", "void"),
      supabase
        .from("invoices")
        .select("id, issue_date, total, supplier_name")
        .gte("issue_date", prevFrom),
      supabase
        .from("customer_receipts")
        .select("amount, pay_date, method")
        .gte("pay_date", monthFrom),
      supabase
        .from("supplier_payments")
        .select("amount, pay_date, method, invoice_id")
        .gte("pay_date", monthFrom),
      supabase
        .from("cash_vouchers")
        .select("amount, voucher_date, voucher_type")
        .gte("voucher_date", monthFrom),
      supabase
        .from("bank_accounts")
        .select("id, name, bank_name, account_no, opening_balance, currency"),
      supabase
        .from("bank_transactions")
        .select("bank_account_id, amount, status"),
      supabase
        .from("sales_invoices")
        .select("id, invoice_no, customer_name, issue_date, due_date, total, paid_amount, payment_status")
        .eq("status", "issued")
        .in("payment_status", ["unpaid", "partial", "overdue"]),
      supabase
        .from("invoices")
        .select("id, invoice_no, supplier_name, issue_date, total")
        .neq("status", "void"),
      supabase.from("supplier_payments").select("invoice_id, amount"),
      supabase
        .from("invoices")
        .select("id, invoice_no, supplier_name, total, status, created_at")
        .in("status", ["pending", "extracted", "reviewed"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("journal_entries")
        .select("id, entry_date, description, journal_lines(debit, credit)")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const salesInv = salesInvRes.data ?? [];
    const purchInv = purchInvRes.data ?? [];
    const receipts = recRes.data ?? [];
    const payments = payRes.data ?? [];
    const cash = cashRes.data ?? [];
    const banks = bankAccRes.data ?? [];
    const bankTx = bankTxRes.data ?? [];
    const openSales = openSalesRes.data ?? [];
    const openPurch = openPurchRes.data ?? [];
    const allPays = allPaysRes.data ?? [];
    const pendingInv = pendingInvRes.data ?? [];
    const recentJE = jeRes.data ?? [];

    // ---- KPI: current vs previous period
    const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
    const sumIf = <T,>(arr: T[], pick: (x: T) => number, ok: (x: T) => boolean) =>
      arr.reduce((s, x) => (ok(x) ? s + pick(x) : s), 0);

    const revenue = sumIf(
      salesInv,
      (r: any) => Number(r.total || 0),
      (r: any) => r.status === "issued" && inRange(r.issue_date, from, to),
    );
    const revenuePrev = sumIf(
      salesInv,
      (r: any) => Number(r.total || 0),
      (r: any) => r.status === "issued" && inRange(r.issue_date, prevFrom, prevTo),
    );
    const expense =
      sumIf(purchInv, (r: any) => Number(r.total || 0), (r: any) => inRange(r.issue_date, from, to)) +
      sumIf(cash, (r: any) => Number(r.amount || 0), (r: any) => r.voucher_type === "payment" && inRange(r.voucher_date, from, to));
    const expensePrev =
      sumIf(purchInv, (r: any) => Number(r.total || 0), (r: any) => inRange(r.issue_date, prevFrom, prevTo)) +
      sumIf(cash, (r: any) => Number(r.amount || 0), (r: any) => r.voucher_type === "payment" && inRange(r.voucher_date, prevFrom, prevTo));

    const profit = revenue - expense;
    const profitPrev = revenuePrev - expensePrev;

    // ---- Bank balances
    const bankSum = new Map<string, number>();
    for (const b of banks) bankSum.set(b.id, Number(b.opening_balance || 0));
    let unreconciled = 0;
    for (const t of bankTx) {
      bankSum.set(t.bank_account_id, (bankSum.get(t.bank_account_id) ?? 0) + Number(t.amount || 0));
      if (t.status === "unmatched") unreconciled += 1;
    }
    const bankAccounts = banks.map((b) => ({
      id: b.id,
      name: b.name,
      bank_name: b.bank_name,
      account_no: b.account_no,
      currency: b.currency,
      balance: bankSum.get(b.id) ?? 0,
    }));
    const totalBank = bankAccounts.reduce((s, b) => s + b.balance, 0);

    // Cash on hand from cash_vouchers (receipt - payment, all time within window)
    const cashOnHand = cash.reduce(
      (s: number, v: any) =>
        s + (v.voucher_type === "receipt" ? 1 : -1) * Number(v.amount || 0),
      0,
    );

    // ---- AR / AP aging
    const aging = (kind: "ar" | "ap") => ({
      kind,
      current: 0,
      "1-30": 0,
      "31-60": 0,
      "61-90": 0,
      "90+": 0,
    });
    const ar = aging("ar");
    const ap = aging("ap");
    const byCustomer = new Map<string, { name: string; outstanding: number }>();
    const bySupplier = new Map<string, { name: string; outstanding: number }>();

    for (const inv of openSales as any[]) {
      const rem = Number(inv.total || 0) - Number(inv.paid_amount || 0);
      if (rem <= 0.5) continue;
      const due = inv.due_date ?? inv.issue_date;
      const late = Math.floor((today.getTime() - new Date(due).getTime()) / 86400000);
      if (late <= 0) ar.current += rem;
      else if (late <= 30) ar["1-30"] += rem;
      else if (late <= 60) ar["31-60"] += rem;
      else if (late <= 90) ar["61-90"] += rem;
      else ar["90+"] += rem;
      const k = inv.customer_name ?? "Không rõ";
      const cur = byCustomer.get(k) ?? { name: k, outstanding: 0 };
      cur.outstanding += rem;
      byCustomer.set(k, cur);
    }

    const paidMap = new Map<string, number>();
    for (const p of allPays) {
      if (p.invoice_id) paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    }
    for (const inv of openPurch as any[]) {
      const rem = Number(inv.total || 0) - (paidMap.get(inv.id) ?? 0);
      if (rem <= 0.5) continue;
      const due = dayStr(addDays(new Date(inv.issue_date ?? todayStr), 30));
      const late = Math.floor((today.getTime() - new Date(due).getTime()) / 86400000);
      if (late <= 0) ap.current += rem;
      else if (late <= 30) ap["1-30"] += rem;
      else if (late <= 60) ap["31-60"] += rem;
      else if (late <= 90) ap["61-90"] += rem;
      else ap["90+"] += rem;
      const k = inv.supplier_name ?? "Không rõ";
      const cur = bySupplier.get(k) ?? { name: k, outstanding: 0 };
      cur.outstanding += rem;
      bySupplier.set(k, cur);
    }

    const totalAR = ar.current + ar["1-30"] + ar["31-60"] + ar["61-90"] + ar["90+"];
    const totalAP = ap.current + ap["1-30"] + ap["31-60"] + ap["61-90"] + ap["90+"];

    const topCustomers = Array.from(byCustomer.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5);
    const topSuppliers = Array.from(bySupplier.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5);

    // ---- Cash flow trend (6 months)
    const monthly = new Map<string, { month: string; inflow: number; outflow: number; net: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.set(k, { month: k, inflow: 0, outflow: 0, net: 0 });
    }
    for (const r of receipts as any[]) {
      const m = monthly.get(monthKey(r.pay_date));
      if (m) m.inflow += Number(r.amount || 0);
    }
    for (const v of cash as any[]) {
      const m = monthly.get(monthKey(v.voucher_date));
      if (!m) continue;
      if (v.voucher_type === "receipt") m.inflow += Number(v.amount || 0);
      else m.outflow += Number(v.amount || 0);
    }
    for (const p of payments as any[]) {
      const m = monthly.get(monthKey(p.pay_date));
      if (m) m.outflow += Number(p.amount || 0);
    }
    const cashflow = Array.from(monthly.values()).map((m) => ({
      ...m,
      net: m.inflow - m.outflow,
    }));

    // ---- Overdue & due soon
    const due7 = dayStr(addDays(today, 7));
    const overdueSales = (openSales as any[])
      .map((inv) => {
        const due = inv.due_date ?? inv.issue_date;
        const late = Math.floor((today.getTime() - new Date(due).getTime()) / 86400000);
        const rem = Number(inv.total || 0) - Number(inv.paid_amount || 0);
        return { ...inv, due_date: due, days_late: late, remaining: rem };
      })
      .filter((r) => r.remaining > 0.5 && r.days_late > 0)
      .sort((a, b) => b.days_late - a.days_late)
      .slice(0, 8);
    const dueSoonSales = (openSales as any[])
      .map((inv) => {
        const due = inv.due_date ?? inv.issue_date;
        const rem = Number(inv.total || 0) - Number(inv.paid_amount || 0);
        const late = Math.floor((today.getTime() - new Date(due).getTime()) / 86400000);
        return { ...inv, due_date: due, days_late: late, remaining: rem };
      })
      .filter((r) => r.remaining > 0.5 && r.days_late <= 0 && r.due_date <= due7)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8);

    // ---- Recent journal entries
    const recent = (recentJE as any[]).map((e) => {
      const total = (e.journal_lines ?? []).reduce(
        (s: number, l: any) => s + Number(l.debit || 0),
        0,
      );
      return {
        id: e.id,
        entry_date: e.entry_date,
        description: e.description,
        total,
      };
    });

    return {
      period: data.period,
      range: { from, to, prevFrom, prevTo },
      kpi: {
        revenue,
        revenue_prev: revenuePrev,
        expense,
        expense_prev: expensePrev,
        profit,
        profit_prev: profitPrev,
        total_bank: totalBank,
        cash_on_hand: cashOnHand,
        ar: totalAR,
        ap: totalAP,
        net_receivable: totalAR - totalAP,
      },
      cashflow,
      bank_accounts: bankAccounts,
      unreconciled_count: unreconciled,
      ar_aging: ar,
      ap_aging: ap,
      top_customers: topCustomers,
      top_suppliers: topSuppliers,
      overdue_sales: overdueSales,
      due_soon_sales: dueSoonSales,
      pending_invoices: pendingInv,
      recent_journal: recent,
      today: todayStr,
    };
  }));


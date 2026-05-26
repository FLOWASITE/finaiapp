import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";

async function currentTenant(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("active_tenant_id").eq("id", userId).single();
  const t = data?.active_tenant_id;
    if (t) await assertTenantMember(supabase, userId, t);
  if (!t) throw new Error("Chưa chọn doanh nghiệp hoạt động");
  return t;
}

// ---------------- Advances ----------------
const AdvanceSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  period_month: z.string(), // YYYY-MM-01
  amount: z.number().min(0),
  reason: z.string().max(500).optional().nullable(),
  status: z.enum(["pending", "applied", "cancelled"]).default("pending"),
});

export const listAdvances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ period_month: z.string().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("payroll_advances")
      .select("*, employees(code, full_name)")
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.period_month) q = q.eq("period_month", data.period_month);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const upsertAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AdvanceSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id, user_id: userId };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("payroll_advances").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("payroll_advances").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteAdvance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payroll_advances").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Apply advances to a payroll run — subtracts pending advances from payroll_lines.net
// and marks them as applied. Idempotent: only acts on pending advances.
export const applyAdvancesToRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ run_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", data.run_id).single();
    if (!run) throw new Error("Không tìm thấy kỳ lương");
    if (run.status === "posted") throw new Error("Kỳ đã ghi sổ — không thể áp tạm ứng");
    const period = run.period_month;

    const { data: advs } = await supabase
      .from("payroll_advances").select("*")
      .eq("period_month", period).eq("status", "pending");
    if (!advs?.length) return { applied: 0 };

    const { data: lines } = await supabase
      .from("payroll_lines").select("id, employee_id, net, advance").eq("run_id", data.run_id);
    const byEmp = new Map<string, any>((lines ?? []).map((l: any) => [l.employee_id, l]));

    let count = 0;
    for (const a of advs) {
      const l = byEmp.get(a.employee_id);
      if (!l) continue;
      const newAdv = Number(l.advance || 0) + Number(a.amount);
      const newNet = Number(l.net) - Number(a.amount);
      await supabase.from("payroll_lines").update({ advance: newAdv, net: newNet }).eq("id", l.id);
      await supabase.from("payroll_advances").update({ status: "applied" }).eq("id", a.id);
      count += 1;
    }

    // Recompute run total_net
    const { data: nl } = await supabase.from("payroll_lines").select("net").eq("run_id", data.run_id);
    const total = (nl ?? []).reduce((s: number, x: any) => s + Number(x.net), 0);
    await supabase.from("payroll_runs").update({ total_net: total }).eq("id", data.run_id);

    return { applied: count };
  });

// Mark run as paid
export const markRunPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), reference: z.string().max(200).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payroll_runs")
      .update({ payment_status: "paid", paid_at: new Date().toISOString(), paid_reference: data.reference ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Export bank CSV (Vietcombank-style generic format)
export const exportBankCSV = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", data.id).single();
    if (!run) throw new Error("Không tìm thấy kỳ lương");
    const { data: lines } = await supabase
      .from("payroll_lines")
      .select("net, employees(code, full_name, bank_name, bank_branch, bank_account, payment_method, citizen_id)")
      .eq("run_id", data.id);

    const period = String(run.period_month).slice(0, 7);
    const header = ["STT", "Mã NV", "Họ và tên", "Số CCCD", "Ngân hàng", "Chi nhánh", "Số tài khoản", "Số tiền (VND)", "Nội dung"];
    const rows: string[][] = [header];
    let stt = 0;
    let total = 0;
    for (const l of (lines ?? []) as any[]) {
      const e = l.employees;
      if (!e || e.payment_method !== "bank") continue;
      if (!e.bank_account) continue;
      const amt = Math.max(0, Math.round(Number(l.net)));
      stt += 1; total += amt;
      rows.push([
        String(stt),
        e.code ?? "",
        e.full_name ?? "",
        e.citizen_id ?? "",
        e.bank_name ?? "",
        e.bank_branch ?? "",
        e.bank_account ?? "",
        String(amt),
        `Thanh toan luong ky ${period}`,
      ]);
    }
    const escape = (v: string) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\n");
    return { filename: `bank-payroll-${period}.csv`, content: csv, count: stt, total };
  });

// Payslip data (enriched)
export const getPayslipData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ run_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const [runRes, linesRes, detailsRes, tenantRes] = await Promise.all([
      supabase.from("payroll_runs").select("*").eq("id", data.run_id).single(),
      supabase.from("payroll_lines")
        .select("*, employees(code, full_name, position, bank_name, bank_account, dependents, departments(name))")
        .eq("run_id", data.run_id).order("id"),
      supabase.from("payroll_run_lines").select("*").eq("run_id", data.run_id),
      supabase.from("tenants").select("name, tax_id, address").eq("id", tenant_id).maybeSingle(),
    ]);
    return {
      run: runRes.data,
      lines: linesRes.data ?? [],
      details: detailsRes.data ?? [],
      tenant: tenantRes.data ?? null,
    };
  });

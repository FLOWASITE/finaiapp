import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// VN PIT progressive 2024 (monthly, after personal+dependent deduction)
// 11M personal, 4.4M / dependent
const PERSONAL_DEDUCTION = 11_000_000;
const DEPENDENT_DEDUCTION = 4_400_000;
const PIT_BRACKETS: [number, number][] = [
  [5_000_000, 0.05],
  [10_000_000, 0.10],
  [18_000_000, 0.15],
  [32_000_000, 0.20],
  [52_000_000, 0.25],
  [80_000_000, 0.30],
  [Infinity, 0.35],
];

function calcPit(taxable: number): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const [cap, rate] of PIT_BRACKETS) {
    if (taxable <= cap) {
      tax += (taxable - prev) * rate;
      return Math.round(tax);
    }
    tax += (cap - prev) * rate;
    prev = cap;
  }
  return Math.round(tax);
}

const EmployeeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  full_name: z.string().min(1).max(255),
  position: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  tax_id: z.string().max(20).optional(),
  citizen_id: z.string().max(20).optional(),
  bank_account: z.string().max(50).optional(),
  base_salary: z.number().min(0),
  insurance_salary: z.number().min(0),
  dependents: z.number().int().min(0).default(0),
  start_date: z.string().optional(),
  status: z.string().default("active"),
});

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("employees").select("*").order("code");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EmployeeSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = { ...data, user_id: userId };
    if (data.id) {
      const { error } = await supabase.from("employees").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("employees").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payroll_runs").select("*").order("period_month", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

const RunSchema = z.object({
  period_month: z.string(), // YYYY-MM-01
  allowance_default: z.number().min(0).default(0),
});

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emps, error: eErr } = await supabase
      .from("employees").select("*").eq("status", "active");
    if (eErr) throw new Error(eErr.message);
    if (!emps?.length) throw new Error("Chưa có nhân viên đang hoạt động");

    const { data: run, error: rErr } = await supabase
      .from("payroll_runs")
      .insert({ user_id: userId, period_month: data.period_month, status: "draft" })
      .select("id").single();
    if (rErr) throw new Error(rErr.message);

    let totalGross = 0, totalNet = 0, totalIE = 0, totalIC = 0, totalPit = 0;
    const lines = emps.map((e) => {
      const base = Number(e.base_salary);
      const insBase = Number(e.insurance_salary || e.base_salary);
      const allowance = data.allowance_default;
      const gross = base + allowance;
      const bhxh_emp = insBase * 0.08;
      const bhyt_emp = insBase * 0.015;
      const bhtn_emp = insBase * 0.01;
      const bhxh_co = insBase * 0.175;
      const bhyt_co = insBase * 0.03;
      const bhtn_co = insBase * 0.01;
      const insEmp = bhxh_emp + bhyt_emp + bhtn_emp;
      const deduction = PERSONAL_DEDUCTION + DEPENDENT_DEDUCTION * (e.dependents ?? 0);
      const taxable = Math.max(0, gross - insEmp - deduction);
      const pit = calcPit(taxable);
      const net = gross - insEmp - pit;
      totalGross += gross; totalNet += net;
      totalIE += insEmp; totalIC += bhxh_co + bhyt_co + bhtn_co; totalPit += pit;
      return {
        run_id: run!.id, employee_id: e.id,
        base_salary: base, allowance, gross,
        bhxh_emp, bhyt_emp, bhtn_emp, bhxh_co, bhyt_co, bhtn_co,
        taxable, pit, net, dependents: e.dependents ?? 0,
      };
    });

    const { error: lErr } = await supabase.from("payroll_lines").insert(lines);
    if (lErr) throw new Error(lErr.message);

    await supabase.from("payroll_runs").update({
      total_gross: totalGross, total_net: totalNet,
      total_insurance_emp: totalIE, total_insurance_co: totalIC,
      total_pit: totalPit,
    }).eq("id", run!.id);

    return { id: run!.id };
  });

export const getPayrollRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", data.id).single();
    const { data: lines } = await supabase
      .from("payroll_lines")
      .select("*, employees(code, full_name, position)")
      .eq("run_id", data.id);
    return { run, lines: lines ?? [] };
  });

export const postPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", data.id).single();
    if (!run) throw new Error("Không tìm thấy kỳ lương");
    if (run.status === "posted") throw new Error("Kỳ lương đã ghi sổ");

    const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
      user_id: userId,
      entry_date: run.period_month,
      description: `Lương kỳ ${run.period_month}`,
    }).select("id").single();
    if (eErr) throw new Error(eErr.message);

    const gross = Number(run.total_gross);
    const insEmp = Number(run.total_insurance_emp);
    const insCo = Number(run.total_insurance_co);
    const pit = Number(run.total_pit);
    const net = Number(run.total_net);

    const lines = [
      { entry_id: entry!.id, line_order: 1, account_code: "6421", debit: gross, credit: 0 },
      { entry_id: entry!.id, line_order: 2, account_code: "6421", debit: insCo, credit: 0 },
      { entry_id: entry!.id, line_order: 3, account_code: "334", debit: 0, credit: net },
      { entry_id: entry!.id, line_order: 4, account_code: "3383", debit: 0, credit: insEmp * 0.8 + insCo * 0.8 },
      { entry_id: entry!.id, line_order: 5, account_code: "3384", debit: 0, credit: insEmp * 0.14 + insCo * 0.14 },
      { entry_id: entry!.id, line_order: 6, account_code: "3389", debit: 0, credit: insEmp * 0.06 + insCo * 0.06 },
      { entry_id: entry!.id, line_order: 7, account_code: "3335", debit: 0, credit: pit },
    ];
    await supabase.from("journal_lines").insert(lines);
    await supabase.from("payroll_runs").update({ status: "posted", journal_entry_id: entry!.id }).eq("id", data.id);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// VN PIT progressive 2024 (monthly, after personal+dependent deduction)
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

async function currentTenant(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .single();
  const t = data?.active_tenant_id;
  if (!t) throw new Error("Chưa chọn doanh nghiệp hoạt động");
  return t;
}

// ---------------- Employees ----------------
const EmployeeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  full_name: z.string().min(1).max(255),
  position: z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  tax_id: z.string().max(20).optional().nullable(),
  citizen_id: z.string().max(20).optional().nullable(),
  citizen_id_date: z.string().optional().nullable(),
  citizen_id_place: z.string().max(200).optional().nullable(),
  tax_id_date: z.string().optional().nullable(),
  social_insurance_no: z.string().max(20).optional().nullable(),
  health_insurance_no: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  dob: z.string().optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  ethnicity: z.string().max(50).optional().nullable(),
  nationality: z.string().max(50).optional().nullable(),
  contract_type: z.string().max(30).optional().nullable(),
  contract_no: z.string().max(50).optional().nullable(),
  hire_date: z.string().optional().nullable(),
  probation_end: z.string().optional().nullable(),
  termination_date: z.string().optional().nullable(),
  payment_method: z.enum(["cash", "bank"]).default("bank"),
  bank_name: z.string().max(100).optional().nullable(),
  bank_branch: z.string().max(100).optional().nullable(),
  bank_account: z.string().max(50).optional().nullable(),
  region: z.number().int().min(1).max(4).default(1),
  is_resident: z.boolean().default(true),
  base_salary: z.number().min(0),
  insurance_salary: z.number().min(0),
  dependents: z.number().int().min(0).default(0),
  start_date: z.string().optional().nullable(),
  status: z.string().default("active"),
});

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("employees")
      .select("*, departments(name), branches(name), projects(name)")
      .order("code");
    if (error) throw new Error(error.message);
    return data;
  });

export const getEmployee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [emp, contracts, deps] = await Promise.all([
      supabase.from("employees").select("*, departments(name), branches(name), projects(name)").eq("id", data.id).single(),
      supabase.from("employee_contracts").select("*").eq("employee_id", data.id).order("start_date", { ascending: false }),
      supabase.from("employee_dependents").select("*").eq("employee_id", data.id).order("deduction_start", { ascending: false }),
    ]);
    if (emp.error) throw new Error(emp.error.message);
    return { employee: emp.data, contracts: contracts.data ?? [], dependents: deps.data ?? [] };
  });

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EmployeeSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, user_id: userId, tenant_id };
    if (payload.email === "") payload.email = null;
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("employees").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("employees").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employees").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Contracts ----------------
const ContractSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  contract_no: z.string().min(1).max(50),
  contract_type: z.enum(["probation", "definite", "indefinite", "seasonal", "service"]).default("definite"),
  start_date: z.string(),
  end_date: z.string().optional().nullable(),
  base_salary: z.number().min(0).default(0),
  insurance_salary: z.number().min(0).default(0),
  fixed_allowance: z.number().min(0).default(0),
  attachment_url: z.string().optional().nullable(),
  status: z.enum(["active", "expired", "terminated"]).default("active"),
  notes: z.string().optional().nullable(),
});

export const upsertContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ContractSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("employee_contracts").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("employee_contracts").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employee_contracts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Dependents ----------------
const DependentSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  full_name: z.string().min(1).max(255),
  relationship: z.string().min(1).max(50),
  dob: z.string().optional().nullable(),
  tax_id: z.string().max(20).optional().nullable(),
  citizen_id: z.string().max(20).optional().nullable(),
  deduction_start: z.string(),
  deduction_end: z.string().optional().nullable(),
  registration_status: z.enum(["registered", "pending", "cancelled"]).default("registered"),
  notes: z.string().optional().nullable(),
});

export const upsertDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DependentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("employee_dependents").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("employee_dependents").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employee_dependents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Payroll Policies ----------------
const PolicySchema = z.object({
  id: z.string().uuid().optional(),
  year: z.number().int().min(2000).max(2100),
  bhxh_emp_rate: z.number().min(0).max(1).default(0.08),
  bhyt_emp_rate: z.number().min(0).max(1).default(0.015),
  bhtn_emp_rate: z.number().min(0).max(1).default(0.01),
  bhxh_co_rate: z.number().min(0).max(1).default(0.175),
  bhyt_co_rate: z.number().min(0).max(1).default(0.03),
  bhtn_co_rate: z.number().min(0).max(1).default(0.01),
  union_co_rate: z.number().min(0).max(1).default(0.02),
  personal_deduction: z.number().min(0).default(11_000_000),
  dependent_deduction: z.number().min(0).default(4_400_000),
  bh_cap_salary: z.number().min(0).default(46_800_000),
  unemployment_cap_region1: z.number().min(0).default(99_200_000),
  notes: z.string().optional().nullable(),
});

export const listPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payroll_policies").select("*").order("year", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PolicySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("payroll_policies").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("payroll_policies")
      .upsert(payload, { onConflict: "tenant_id,year" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

// ---------------- Dimension helpers ----------------
export const listDimensions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [branches, depts, projects] = await Promise.all([
      context.supabase.from("branches").select("id, name").order("name"),
      context.supabase.from("departments").select("id, name").order("name"),
      context.supabase.from("projects").select("id, name").order("name"),
    ]);
    return {
      branches: branches.data ?? [],
      departments: depts.data ?? [],
      projects: projects.data ?? [],
    };
  });

// ---------------- Payroll runs (unchanged behavior, kept for Phase A compat) ----------------
export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payroll_runs").select("*").order("period_month", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

const RunSchema = z.object({
  period_month: z.string(),
  allowance_default: z.number().min(0).default(0),
});

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);

    // Load policy for the year
    const year = parseInt(data.period_month.slice(0, 4), 10);
    const { data: policy } = await supabase
      .from("payroll_policies").select("*").eq("year", year).maybeSingle();
    const P = policy ?? {
      bhxh_emp_rate: 0.08, bhyt_emp_rate: 0.015, bhtn_emp_rate: 0.01,
      bhxh_co_rate: 0.175, bhyt_co_rate: 0.03, bhtn_co_rate: 0.01,
      personal_deduction: 11_000_000, dependent_deduction: 4_400_000,
      bh_cap_salary: 46_800_000, unemployment_cap_region1: 99_200_000,
    };

    const { data: emps, error: eErr } = await supabase
      .from("employees").select("*").eq("status", "active");
    if (eErr) throw new Error(eErr.message);
    if (!emps?.length) throw new Error("Chưa có nhân viên đang hoạt động");

    const { data: run, error: rErr } = await supabase
      .from("payroll_runs")
      .insert({ user_id: userId, tenant_id, period_month: data.period_month, status: "draft" })
      .select("id").single();
    if (rErr) throw new Error(rErr.message);

    let totalGross = 0, totalNet = 0, totalIE = 0, totalIC = 0, totalPit = 0;
    const lines = emps.map((e: any) => {
      const base = Number(e.base_salary);
      const insBaseRaw = Number(e.insurance_salary || e.base_salary);
      const insBase = Math.min(insBaseRaw, Number(P.bh_cap_salary));
      const insBaseUnemp = Math.min(insBaseRaw, Number(P.unemployment_cap_region1));
      const allowance = data.allowance_default;
      const gross = base + allowance;
      const bhxh_emp = insBase * Number(P.bhxh_emp_rate);
      const bhyt_emp = insBase * Number(P.bhyt_emp_rate);
      const bhtn_emp = insBaseUnemp * Number(P.bhtn_emp_rate);
      const bhxh_co  = insBase * Number(P.bhxh_co_rate);
      const bhyt_co  = insBase * Number(P.bhyt_co_rate);
      const bhtn_co  = insBaseUnemp * Number(P.bhtn_co_rate);
      const insEmp = bhxh_emp + bhyt_emp + bhtn_emp;
      const deduction = Number(P.personal_deduction) + Number(P.dependent_deduction) * (e.dependents ?? 0);
      let pit = 0;
      if (e.is_resident === false) {
        pit = Math.round(gross * 0.20);
      } else {
        const taxable = Math.max(0, gross - insEmp - deduction);
        pit = calcPit(taxable);
      }
      const taxable = Math.max(0, gross - insEmp - deduction);
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
    const tenant_id = await currentTenant(supabase, userId);
    const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", data.id).single();
    if (!run) throw new Error("Không tìm thấy kỳ lương");
    if (run.status === "posted") throw new Error("Kỳ lương đã ghi sổ");

    const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
      user_id: userId,
      tenant_id,
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

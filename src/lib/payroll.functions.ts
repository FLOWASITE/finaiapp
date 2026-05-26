import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";

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
    if (t) await assertTenantMember(supabase, userId, t);
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

// Phase C engine: salary structure + timesheet driven
export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);

    const period = data.period_month.slice(0, 7); // YYYY-MM
    const periodDate = `${period}-01`;
    const year = parseInt(period.slice(0, 4), 10);

    // Policy
    const { data: policy } = await supabase
      .from("payroll_policies").select("*").eq("year", year).maybeSingle();
    const P = policy ?? {
      bhxh_emp_rate: 0.08, bhyt_emp_rate: 0.015, bhtn_emp_rate: 0.01,
      bhxh_co_rate: 0.175, bhyt_co_rate: 0.03, bhtn_co_rate: 0.01,
      union_co_rate: 0.02,
      personal_deduction: 11_000_000, dependent_deduction: 4_400_000,
      bh_cap_salary: 46_800_000, unemployment_cap_region1: 99_200_000,
    };

    // Employees
    const { data: emps, error: eErr } = await supabase
      .from("employees").select("*").eq("status", "active");
    if (eErr) throw new Error(eErr.message);
    if (!emps?.length) throw new Error("Chưa có nhân viên đang hoạt động");

    const empIds = emps.map((e: any) => e.id);

    // Salary components (catalog)
    const { data: comps } = await supabase
      .from("salary_components").select("*").eq("active", true);
    const compById = new Map<string, any>((comps ?? []).map((c: any) => [c.id, c]));

    // Salary structures (filtered by effectivity)
    const { data: structs } = await supabase
      .from("employee_salary_structures").select("*")
      .in("employee_id", empIds)
      .lte("effective_from", periodDate);
    const structByEmp = new Map<string, any[]>();
    (structs ?? []).forEach((s: any) => {
      if (s.effective_to && s.effective_to < periodDate) return;
      const arr = structByEmp.get(s.employee_id) ?? [];
      arr.push(s);
      structByEmp.set(s.employee_id, arr);
    });

    // Timesheets
    const { data: ts } = await supabase
      .from("timesheets").select("*").eq("period_month", period).in("employee_id", empIds);
    const tsByEmp = new Map<string, any>((ts ?? []).map((t: any) => [t.employee_id, t]));

    // Check for existing run
    const { data: existing } = await supabase
      .from("payroll_runs").select("id").eq("period_month", periodDate).maybeSingle();
    if (existing) throw new Error(`Đã tồn tại bảng lương kỳ ${period}`);

    // Create run
    const { data: run, error: rErr } = await supabase
      .from("payroll_runs")
      .insert({ user_id: userId, tenant_id, period_month: periodDate, status: "draft" })
      .select("id").single();
    if (rErr) throw new Error(rErr.message);

    let totalGross = 0, totalNet = 0, totalIE = 0, totalIC = 0, totalPit = 0;
    const summaryLines: any[] = [];
    const detailLines: any[] = [];

    for (const e of emps) {
      const t = tsByEmp.get(e.id);
      const stdDays = Number(t?.standard_days ?? 22);
      const actDays = Number(t?.actual_days ?? stdDays);
      const paidLeave = Number(t?.paid_leave_days ?? 0);
      const ot150h = Number(t?.ot_150_hours ?? 0);
      const ot200h = Number(t?.ot_200_hours ?? 0);
      const ot300h = Number(t?.ot_300_hours ?? 0);
      const workRatio = stdDays > 0 ? (actDays + paidLeave) / stdDays : 1;

      const rows = structByEmp.get(e.id) ?? [];
      // Fallback: build a single BASIC row from employees.base_salary if no structure
      const effective: Array<{ component: any; amount: number }> = [];
      if (rows.length > 0) {
        for (const r of rows) {
          const c = compById.get(r.component_id);
          if (!c) continue;
          effective.push({ component: c, amount: Number(r.amount) });
        }
      } else {
        effective.push({
          component: { code: "BASIC", name: "Lương cơ bản", kind: "earning",
            is_taxable: true, taxable_threshold: 0, is_insurable: true,
            ot_multiplier: 1, expense_account: "6421", is_fixed: true },
          amount: Number(e.base_salary || 0),
        });
      }

      // Determine base hourly rate (from BASIC component if present, else employees.base_salary)
      const basicRow = effective.find((x) => x.component.code === "BASIC");
      const monthlyBase = basicRow?.amount ?? Number(e.base_salary || 0);
      const hourlyRate = stdDays > 0 ? monthlyBase / (stdDays * 8) : 0;

      let gross = 0, taxableGross = 0, insurableGross = 0, deductionGross = 0;
      const empDetail: any[] = [];

      for (const { component: c, amount } of effective) {
        let amt = 0;
        if (c.kind === "overtime") {
          // ignore stored amount, derive from timesheet
          continue;
        } else if (c.is_fixed) {
          amt = c.kind === "earning" ? amount * workRatio : amount;
        } else {
          amt = amount * actDays;
        }
        if (c.kind === "deduction") {
          deductionGross += amt;
        } else {
          gross += amt;
        }
        const taxable = c.is_taxable
          ? Math.max(0, amt - Number(c.taxable_threshold || 0))
          : 0;
        const insurable = c.is_insurable ? amt : 0;
        taxableGross += taxable;
        insurableGross += insurable;
        empDetail.push({
          component_id: rows.find((r: any) => r.component_id === (compById.get(c.id)?.id ?? null))?.component_id ?? null,
          component_code: c.code, component_name: c.name, kind: c.kind,
          amount: amt, taxable_amount: taxable, insurable_amount: insurable,
        });
      }

      // Overtime from timesheet — use catalog OT150/OT200/OT300 if exists
      const otSpecs: Array<[string, number, number]> = [
        ["OT150", ot150h, 1.5], ["OT200", ot200h, 2.0], ["OT300", ot300h, 3.0],
      ];
      for (const [code, hours, mult] of otSpecs) {
        if (hours <= 0) continue;
        const c: any = (comps ?? []).find((x: any) => x.code === code) ?? {
          code, name: `Tăng ca ${Math.round(mult * 100)}%`, kind: "overtime",
          is_taxable: true, taxable_threshold: 0, is_insurable: false,
          expense_account: "6421",
        };
        const amt = Math.round(hours * hourlyRate * mult);
        gross += amt;
        const taxable = c.is_taxable ? amt : 0;
        taxableGross += taxable;
        empDetail.push({
          component_id: c.id ?? null, component_code: c.code, component_name: c.name,
          kind: "overtime", amount: amt, taxable_amount: taxable, insurable_amount: 0,
        });
      }

      // Insurance
      const insBaseRaw = Math.max(insurableGross, 0);
      const insBase = Math.min(insBaseRaw, Number(P.bh_cap_salary));
      const insBaseUnemp = Math.min(insBaseRaw, Number(P.unemployment_cap_region1));
      const bhxh_emp = Math.round(insBase * Number(P.bhxh_emp_rate));
      const bhyt_emp = Math.round(insBase * Number(P.bhyt_emp_rate));
      const bhtn_emp = Math.round(insBaseUnemp * Number(P.bhtn_emp_rate));
      const bhxh_co = Math.round(insBase * Number(P.bhxh_co_rate));
      const bhyt_co = Math.round(insBase * Number(P.bhyt_co_rate));
      const bhtn_co = Math.round(insBaseUnemp * Number(P.bhtn_co_rate));
      const union_co = Math.round(insBase * Number(P.union_co_rate ?? 0.02));
      const insEmp = bhxh_emp + bhyt_emp + bhtn_emp;
      const insCo = bhxh_co + bhyt_co + bhtn_co;

      // PIT
      const ctype = (e.contract_type ?? "").toLowerCase();
      const isSeasonal = ctype === "seasonal" || ctype === "service";
      let pit = 0;
      if (e.is_resident === false) {
        pit = Math.round(gross * 0.20);
      } else if (isSeasonal && gross >= 2_000_000) {
        pit = Math.round(gross * 0.10);
      } else {
        const ded = Number(P.personal_deduction) + Number(P.dependent_deduction) * (e.dependents ?? 0);
        const taxable = Math.max(0, taxableGross - insEmp - ded);
        pit = calcPit(taxable);
      }

      const net = gross - deductionGross - insEmp - pit;
      totalGross += gross; totalNet += net;
      totalIE += insEmp; totalIC += insCo; totalPit += pit;

      summaryLines.push({
        run_id: run!.id, employee_id: e.id,
        base_salary: monthlyBase, allowance: gross - monthlyBase,
        gross, bhxh_emp, bhyt_emp, bhtn_emp, bhxh_co, bhyt_co, bhtn_co,
        taxable: Math.max(0, taxableGross - insEmp), pit, net,
        dependents: e.dependents ?? 0,
      });
      for (const d of empDetail) {
        detailLines.push({
          tenant_id, run_id: run!.id, employee_id: e.id,
          component_id: d.component_id ?? null,
          component_code: d.component_code, component_name: d.component_name,
          kind: d.kind, amount: d.amount,
          taxable_amount: d.taxable_amount, insurable_amount: d.insurable_amount,
        });
      }
    }

    const { error: lErr } = await supabase.from("payroll_lines").insert(summaryLines);
    if (lErr) throw new Error(lErr.message);
    if (detailLines.length) {
      const { error: dErr } = await supabase.from("payroll_run_lines").insert(detailLines);
      if (dErr) throw new Error(dErr.message);
    }

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
      .select("*, employees(code, full_name, position, department_id, departments(name))")
      .eq("run_id", data.id);
    const { data: details } = await supabase
      .from("payroll_run_lines").select("*").eq("run_id", data.id);
    return { run, lines: lines ?? [], details: details ?? [] };
  });

export const approvePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("payroll_runs")
      .update({ status: "approved" }).eq("id", data.id).eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase.from("payroll_runs").select("status").eq("id", data.id).single();
    if (run?.status === "posted") throw new Error("Đã ghi sổ — không thể xoá");
    const { error } = await context.supabase.from("payroll_runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Map department type → expense account (Nợ 622/627/641/642/154)
function expenseAccountForEmployee(deptName: string | null | undefined, fallback: string): string {
  if (!deptName) return fallback;
  const n = deptName.toLowerCase();
  if (n.includes("sản xuất") || n.includes("xưởng") || n.includes("công nhân")) return "622";
  if (n.includes("phân xưởng") || n.includes("sxc") || n.includes("quản lý xưởng")) return "627";
  if (n.includes("bán hàng") || n.includes("kinh doanh") || n.includes("sales")) return "641";
  if (n.includes("quản lý") || n.includes("hành chính") || n.includes("kế toán") || n.includes("admin")) return "642";
  return fallback;
}

export const postPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", data.id).single();
    if (!run) throw new Error("Không tìm thấy kỳ lương");
    if (run.status === "posted") throw new Error("Kỳ lương đã ghi sổ");

    const year = parseInt(String(run.period_month).slice(0, 4), 10);
    const { data: policy } = await supabase
      .from("payroll_policies").select("*").eq("year", year).maybeSingle();
    const P = policy ?? { bhxh_emp_rate: 0.08, bhyt_emp_rate: 0.015, bhtn_emp_rate: 0.01,
      bhxh_co_rate: 0.175, bhyt_co_rate: 0.03, bhtn_co_rate: 0.01, union_co_rate: 0.02 };

    const { data: details } = await supabase
      .from("payroll_run_lines").select("*").eq("run_id", data.id);
    const { data: lines } = await supabase
      .from("payroll_lines").select("*").eq("run_id", data.id);
    const empIds = Array.from(new Set((lines ?? []).map((l: any) => l.employee_id)));
    const { data: empRows } = await supabase
      .from("employees")
      .select("id, department_id, branch_id, project_id, departments(name)")
      .in("id", empIds.length ? empIds : ["00000000-0000-0000-0000-000000000000"]);
    const empMap = new Map<string, any>((empRows ?? []).map((e: any) => [e.id, e]));

    // Create entry
    const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
      user_id: userId, tenant_id,
      entry_date: run.period_month,
      description: `Lương kỳ ${String(run.period_month).slice(0, 7)}`,
    }).select("id").single();
    if (eErr) throw new Error(eErr.message);

    // Group debits by (account, branch, dept, project)
    type Key = string;
    const debitMap = new Map<Key, { account_code: string; branch_id: string | null; department_id: string | null; project_id: string | null; debit: number }>();
    const addDebit = (account: string, branch: string | null, dept: string | null, project: string | null, amt: number) => {
      if (!amt) return;
      const k = `${account}|${branch ?? ""}|${dept ?? ""}|${project ?? ""}`;
      const cur = debitMap.get(k) ?? { account_code: account, branch_id: branch, department_id: dept, project_id: project, debit: 0 };
      cur.debit += amt;
      debitMap.set(k, cur);
    };

    // Index details by employee
    const detByEmp = new Map<string, any[]>();
    (details ?? []).forEach((d: any) => {
      const arr = detByEmp.get(d.employee_id) ?? [];
      arr.push(d); detByEmp.set(d.employee_id, arr);
    });

    let totalGross = 0, totalDeduction = 0, totalNet = 0, totalInsEmp = 0, totalInsCo = 0, totalUnion = 0, totalPit = 0;

    for (const l of (lines ?? []) as any[]) {
      const emp = empMap.get(l.employee_id);
      const deptName = emp?.departments?.name ?? null;
      const branch = emp?.branch_id ?? null;
      const dept = emp?.department_id ?? null;
      const project = emp?.project_id ?? null;

      const empDetails = detByEmp.get(l.employee_id) ?? [];
      let empGross = 0, empDeduction = 0;
      for (const d of empDetails) {
        const amt = Number(d.amount);
        if (d.kind === "deduction") { empDeduction += amt; continue; }
        empGross += amt;
        // Debit employee earnings to expense account
        const fallbackAcc = "6421";
        const acc = expenseAccountForEmployee(deptName, fallbackAcc);
        addDebit(acc, branch, dept, project, amt);
      }

      // Employer insurance on the same expense account
      const insCoEmp = Number(l.bhxh_co) + Number(l.bhyt_co) + Number(l.bhtn_co);
      const insBase = (Number(P.bhxh_co_rate) > 0)
        ? Math.round(Number(l.bhxh_co) / Number(P.bhxh_co_rate))
        : 0;
      const unionCo = Math.round(insBase * Number(P.union_co_rate ?? 0.02));
      const acc = expenseAccountForEmployee(deptName, "6421");
      addDebit(acc, branch, dept, project, insCoEmp + unionCo);

      const insEmp = Number(l.bhxh_emp) + Number(l.bhyt_emp) + Number(l.bhtn_emp);
      totalGross += empGross;
      totalDeduction += empDeduction;
      totalNet += Number(l.net);
      totalInsEmp += insEmp;
      totalInsCo += insCoEmp;
      totalUnion += unionCo;
      totalPit += Number(l.pit);
    }

    // Build JE lines
    let order = 0;
    const jeLines: any[] = [];
    for (const v of debitMap.values()) {
      order += 1;
      jeLines.push({
        entry_id: entry!.id, line_order: order,
        account_code: v.account_code, debit: v.debit, credit: 0,
        branch_id: v.branch_id, department_id: v.department_id, project_id: v.project_id,
      });
    }
    // Credit lines (aggregate)
    const grossLessDeduct = totalGross; // earnings already exclude deductions
    const net = totalNet;
    const insEmp = totalInsEmp, insCo = totalInsCo;
    const credits: Array<[string, number]> = [
      ["334", net + totalDeduction], // payable to staff before withholdings (net + other deductions tracked separately)
      // We posted gross to expense above; offset is: 334 (gross-insEmp-pit-deduction) actually =net
      // Simplify: use the canonical pattern
    ];
    // Reset to canonical pattern: Debit expenses = gross+insCo+union; Credit 334=net, 3383/4/6=ins, 3382=union, 3335=pit, 334 (deduction back to 334? no - deductions reduce 334)
    // Cleaner:
    credits.length = 0;
    credits.push(["334", grossLessDeduct - insEmp - totalPit - totalDeduction]); // = net
    credits.push(["3383", Math.round((insEmp * Number(P.bhxh_emp_rate)) / (Number(P.bhxh_emp_rate) + Number(P.bhyt_emp_rate) + Number(P.bhtn_emp_rate))) + Math.round((insCo * Number(P.bhxh_co_rate)) / (Number(P.bhxh_co_rate) + Number(P.bhyt_co_rate) + Number(P.bhtn_co_rate)))]);
    credits.push(["3384", Math.round((insEmp * Number(P.bhyt_emp_rate)) / (Number(P.bhxh_emp_rate) + Number(P.bhyt_emp_rate) + Number(P.bhtn_emp_rate))) + Math.round((insCo * Number(P.bhyt_co_rate)) / (Number(P.bhxh_co_rate) + Number(P.bhyt_co_rate) + Number(P.bhtn_co_rate)))]);
    credits.push(["3386", Math.round((insEmp * Number(P.bhtn_emp_rate)) / (Number(P.bhxh_emp_rate) + Number(P.bhyt_emp_rate) + Number(P.bhtn_emp_rate))) + Math.round((insCo * Number(P.bhtn_co_rate)) / (Number(P.bhxh_co_rate) + Number(P.bhyt_co_rate) + Number(P.bhtn_co_rate)))]);
    credits.push(["3382", totalUnion]);
    credits.push(["3335", totalPit]);

    for (const [acc, amt] of credits) {
      if (!amt || amt <= 0) continue;
      order += 1;
      jeLines.push({ entry_id: entry!.id, line_order: order, account_code: acc, debit: 0, credit: amt });
    }

    const { error: jErr } = await supabase.from("journal_lines").insert(jeLines);
    if (jErr) throw new Error(jErr.message);

    await supabase.from("payroll_runs").update({
      status: "posted", journal_entry_id: entry!.id,
    }).eq("id", data.id);

    return { ok: true, entry_id: entry!.id };
  });


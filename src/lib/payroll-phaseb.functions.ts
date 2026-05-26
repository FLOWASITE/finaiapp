import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";

async function currentTenant(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles").select("active_tenant_id").eq("id", userId).single();
  const t = data?.active_tenant_id;
    if (t) await assertTenantMember(supabase, userId, t);
  if (!t) throw new Error("Chưa chọn doanh nghiệp hoạt động");
  return t;
}

// ---------------- Salary Components ----------------
const ComponentSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(255),
  kind: z.enum(["earning", "allowance", "overtime", "bonus", "deduction"]).default("earning"),
  is_taxable: z.boolean().default(true),
  taxable_threshold: z.number().min(0).default(0),
  is_insurable: z.boolean().default(false),
  ot_multiplier: z.number().min(0).max(10).default(1),
  expense_account: z.string().max(20).optional().nullable(),
  is_fixed: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  active: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

export const listSalaryComponents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("salary_components").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertSalaryComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ComponentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("salary_components").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("salary_components").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteSalaryComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("salary_components").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Employee Salary Structures ----------------
const StructureSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  component_id: z.string().uuid(),
  amount: z.number().min(0).default(0),
  effective_from: z.string(),
  effective_to: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const listEmployeeStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ employee_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("employee_salary_structures")
      .select("*, salary_components(code, name, kind)")
      .eq("employee_id", data.employee_id)
      .order("effective_from", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertEmployeeStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => StructureSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id };
    if (data.id) {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("employee_salary_structures").update(rest).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("employee_salary_structures").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteEmployeeStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employee_salary_structures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Timesheets ----------------
const TimesheetSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  period_month: z.string().regex(/^\d{4}-\d{2}$/),
  standard_days: z.number().min(0).max(31).default(22),
  actual_days: z.number().min(0).max(31).default(22),
  paid_leave_days: z.number().min(0).max(31).default(0),
  unpaid_leave_days: z.number().min(0).max(31).default(0),
  ot_150_hours: z.number().min(0).default(0),
  ot_200_hours: z.number().min(0).default(0),
  ot_300_hours: z.number().min(0).default(0),
  night_hours: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

export const listTimesheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ period_month: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const [emps, ts] = await Promise.all([
      context.supabase.from("employees").select("id, code, full_name, position").eq("status", "active").order("code"),
      context.supabase.from("timesheets").select("*").eq("period_month", data.period_month),
    ]);
    if (emps.error) throw new Error(emps.error.message);
    if (ts.error) throw new Error(ts.error.message);
    const byEmp = new Map<string, any>();
    (ts.data ?? []).forEach((t: any) => byEmp.set(t.employee_id, t));
    return (emps.data ?? []).map((e: any) => ({
      employee: e,
      timesheet: byEmp.get(e.id) ?? null,
    }));
  });

export const upsertTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TimesheetSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const payload: any = { ...data, tenant_id };
    const { data: row, error } = await supabase
      .from("timesheets")
      .upsert(payload, { onConflict: "tenant_id,employee_id,period_month" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

const BulkSchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}$/),
  standard_days: z.number().min(0).max(31).default(22),
});

export const bulkInitTimesheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BulkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await currentTenant(supabase, userId);
    const { data: emps, error } = await supabase
      .from("employees").select("id").eq("status", "active");
    if (error) throw new Error(error.message);
    if (!emps?.length) return { inserted: 0 };
    const rows = emps.map((e: any) => ({
      tenant_id, employee_id: e.id, period_month: data.period_month,
      standard_days: data.standard_days, actual_days: data.standard_days,
    }));
    const { error: insErr } = await supabase
      .from("timesheets").upsert(rows, { onConflict: "tenant_id,employee_id,period_month", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);
    return { inserted: rows.length };
  });

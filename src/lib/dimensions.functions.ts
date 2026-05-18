import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

// ===================== BRANCHES =====================
const BranchSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  tax_id: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  manager: z.string().max(255).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listBranches = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertBranch = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => BranchSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const payload: any = { ...data, user_id: userId, tenant_id: tenantId };
    if (data.id) {
      const { error } = await supabase
        .from("branches")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("branches").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { count } = await supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", data.id)
      .eq("tenant_id", tenantId);
    if ((count ?? 0) > 0)
      throw new Error(`Chi nhánh đang được dùng ở ${count} bút toán — hãy ngưng hoạt động thay vì xoá.`);
    const { error } = await supabase
      .from("branches")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== DEPARTMENTS =====================
const DepartmentSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  manager: z.string().max(255).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("departments")
      .select("*, branches(name)")
      .eq("tenant_id", context.tenantId)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => DepartmentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const payload: any = { ...data, user_id: userId, tenant_id: tenantId };
    if (data.id) {
      if (data.parent_id === data.id) throw new Error("Phòng ban không thể là cha của chính nó");
      const { error } = await supabase
        .from("departments")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("departments").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const [{ count: empCount }, { count: childCount }] = await Promise.all([
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("department_id", data.id)
        .eq("tenant_id", tenantId),
      supabase
        .from("departments")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", data.id)
        .eq("tenant_id", tenantId),
    ]);
    if ((empCount ?? 0) > 0) throw new Error(`Phòng ban còn ${empCount} nhân viên.`);
    if ((childCount ?? 0) > 0) throw new Error(`Phòng ban còn ${childCount} phòng ban con.`);
    const { error } = await supabase
      .from("departments")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== PROJECTS =====================
const ProjectSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  manager_employee_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).default("active"),
  is_active: z.boolean().default(true),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*, customers(name), employees:manager_employee_id(full_name)")
      .eq("tenant_id", context.tenantId)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listProjectRefs = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const [c, e] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("status", "active")
        .eq("tenant_id", tenantId)
        .order("full_name"),
    ]);
    return { customers: c.data ?? [], employees: e.data ?? [] };
  });

export const upsertProject = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ProjectSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const payload: any = { ...data, user_id: userId, tenant_id: tenantId };
    if (!payload.start_date) payload.start_date = null;
    if (!payload.end_date) payload.end_date = null;
    if (data.id) {
      const { error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("projects").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { count } = await supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.id)
      .eq("tenant_id", tenantId);
    if ((count ?? 0) > 0) throw new Error(`Dự án đang được dùng ở ${count} bút toán.`);
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== COST CENTERS =====================
const CostCenterSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listCostCenters = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cost_centers")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertCostCenter = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => CostCenterSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const payload: any = { ...data, user_id: userId, tenant_id: tenantId };
    if (data.id) {
      if (data.parent_id === data.id) throw new Error("Bộ phận không thể là cha của chính nó");
      const { error } = await supabase
        .from("cost_centers")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("cost_centers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteCostCenter = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const [{ count: jl }, { count: child }] = await Promise.all([
      // journal_lines không có tenant_id — join entries trước
      supabase
        .from("journal_lines")
        .select("id, journal_entries!inner(tenant_id)", { count: "exact", head: true })
        .eq("cost_center_id", data.id)
        .eq("journal_entries.tenant_id", tenantId),
      supabase
        .from("cost_centers")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", data.id)
        .eq("tenant_id", tenantId),
    ]);
    if ((jl ?? 0) > 0) throw new Error(`Bộ phận đang được dùng ở ${jl} dòng bút toán.`);
    if ((child ?? 0) > 0) throw new Error(`Bộ phận còn ${child} bộ phận con.`);
    const { error } = await supabase
      .from("cost_centers")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

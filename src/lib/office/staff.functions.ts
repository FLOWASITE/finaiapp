import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const StaffSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional().nullable(),
  employee_code: z.string().trim().max(50).optional().nullable(),
  full_name: z.string().trim().min(1).max(255),
  position: z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  join_date: z.string().optional().nullable(),
  leave_date: z.string().optional().nullable(),
  status: z.enum(["active", "on_leave", "terminated"]).default("active"),
  skills: z.array(z.string()).default([]),
  notes: z.string().max(2000).optional().nullable(),
});

export const listStaff = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_staff")
      .select("*")
      .eq("agency_tenant_id", tenantId)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertStaff = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => StaffSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabase
        .from("office_staff")
        .update(rest)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_staff")
      .insert({ ...rest, agency_tenant_id: tenantId })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Mã NV hoặc người dùng đã tồn tại");
      throw new Error(error.message);
    }
    return { id: row!.id };
  });

export const listAssignments = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_staff_assignments")
      .select(
        `*, staff:office_staff!office_staff_assignments_staff_id_fkey(id, full_name, agency_tenant_id),
        link:office_client_links!office_staff_assignments_link_id_fkey(
          id, display_name, agency_tenant_id,
          tenant:tenants!office_client_links_client_tenant_id_fkey(name)
        )`,
      )
      .eq("staff.agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAssignment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator(
    (i: {
      staff_id: string;
      link_id: string;
      role: "lead" | "assistant" | "reviewer";
      from_date?: string;
      to_date?: string;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("office_staff_assignments").upsert(data, {
      onConflict: "staff_id,link_id,role",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("office_staff_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

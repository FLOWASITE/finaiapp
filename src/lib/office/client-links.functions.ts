import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const LinkSchema = z.object({
  id: z.string().uuid().optional(),
  client_tenant_id: z.string().uuid(),
  display_name: z.string().trim().max(255).optional().nullable(),
  account_manager_id: z.string().uuid().optional().nullable(),
  service_start_date: z.string().optional().nullable(),
  service_end_date: z.string().optional().nullable(),
  fee_per_month: z.number().min(0).default(0),
  status: z.enum(["active", "paused", "terminated"]).default("active"),
  notes: z.string().max(2000).optional().nullable(),
});

export const listClientLinks = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_client_links")
      .select(
        `id, client_tenant_id, display_name, account_manager_id, service_start_date,
         service_end_date, fee_per_month, status, notes, created_at,
         tenant:tenants!office_client_links_client_tenant_id_fkey(id, name, tax_id, address),
         manager:profiles!office_client_links_account_manager_id_fkey(id, display_name, email)`,
      )
      .eq("agency_tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertClientLink = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => LinkSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabase
        .from("office_client_links")
        .update(rest)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_client_links")
      .insert({ ...rest, agency_tenant_id: tenantId, created_by: userId })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Khách hàng này đã được liên kết");
      throw new Error(error.message);
    }
    return { id: row!.id };
  });

export const archiveClientLink = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; status: "active" | "paused" | "terminated" }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("office_client_links")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mời nhân viên vào tenant của khách với vai trò accountant. */
export const inviteStaffToClientTenant = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { link_id: string; user_id: string; role?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: link, error: e1 } = await supabase
      .from("office_client_links")
      .select("client_tenant_id, agency_tenant_id")
      .eq("id", data.link_id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (e1 || !link) throw new Error("Không tìm thấy liên kết khách hàng");

    const { error } = await supabase.from("tenant_members").upsert(
      {
        tenant_id: link.client_tenant_id,
        user_id: data.user_id,
        role: (data.role ?? "accountant") as "accountant" | "admin" | "owner" | "viewer",
        status: "active",
      },
      { onConflict: "tenant_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

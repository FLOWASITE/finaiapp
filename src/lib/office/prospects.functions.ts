import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null));

const ProspectSchema = z.object({
  id: z.string().uuid().optional(),
  code: optStr(50),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  tax_id: optStr(20),
  contact_person: optStr(255),
  phone: optStr(50),
  email: optStr(255),
  address: optStr(500),
  industry: optStr(255),
  source: optStr(100),
  status: z.enum(["new", "contacted", "negotiating", "won", "lost"]).default("new"),
  estimated_fee: z.number().min(0).default(0),
  account_manager_id: z.string().uuid().optional().nullable(),
  notes: optStr(2000),
});

export const listProspects = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_prospects")
      .select("*")
      .eq("agency_tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertProspect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ProspectSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabase
        .from("office_prospects")
        .update(rest)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_prospects")
      .insert({ ...rest, agency_tenant_id: tenantId, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteProspect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("office_prospects")
      .delete()
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Chuyển prospect thành khách hàng: tạo office_client_links từ tenant FinAI đã có,
 *  cập nhật prospect status=won và converted_tenant_id. */
export const convertProspect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator(
    (i: {
      prospect_id: string;
      client_tenant_id: string;
      fee_per_month?: number;
      display_name?: string | null;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: p, error: e1 } = await supabase
      .from("office_prospects")
      .select("name")
      .eq("id", data.prospect_id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (e1 || !p) throw new Error("Không tìm thấy khách tiềm năng");

    const { data: link, error: e2 } = await supabase
      .from("office_client_links")
      .insert({
        agency_tenant_id: tenantId,
        client_tenant_id: data.client_tenant_id,
        display_name: data.display_name ?? p.name,
        fee_per_month: data.fee_per_month ?? 0,
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single();
    if (e2) {
      if (e2.code === "23505") throw new Error("Khách hàng này đã được liên kết");
      throw new Error(e2.message);
    }

    const { error: e3 } = await supabase
      .from("office_prospects")
      .update({ status: "won", converted_tenant_id: data.client_tenant_id })
      .eq("id", data.prospect_id)
      .eq("agency_tenant_id", tenantId);
    if (e3) throw new Error(e3.message);

    return { link_id: link!.id };
  });

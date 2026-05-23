import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const ContractSchema = z.object({
  id: z.string().uuid().optional(),
  link_id: z.string().uuid(),
  contract_no: z.string().trim().min(1).max(50),
  sign_date: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  fee_amount: z.number().min(0).default(0),
  billing_cycle: z.enum(["monthly", "quarterly", "yearly", "one_off"]).default("monthly"),
  services: z.array(z.string()).default([]),
  status: z.enum(["draft", "active", "expired", "terminated"]).default("draft"),
  file_url: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const listContracts = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_contracts")
      .select(
        `*, link:office_client_links!office_contracts_link_id_fkey(
          id, display_name, client_tenant_id,
          tenant:tenants!office_client_links_client_tenant_id_fkey(name)
        )`,
      )
      .eq("agency_tenant_id", tenantId)
      .order("end_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listRenewals = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { contract_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: c } = await supabase
      .from("office_contracts")
      .select("id")
      .eq("id", data.contract_id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (!c) throw new Error("Không tìm thấy hợp đồng");
    const { data: rows, error } = await supabase
      .from("office_contract_renewals")
      .select("*")
      .eq("contract_id", data.contract_id)
      .order("renewed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertContract = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ContractSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { id, ...rest } = data;
    const payload = { ...rest, services: rest.services as never };
    if (id) {
      const { error } = await supabase
        .from("office_contracts")
        .update(payload)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_contracts")
      .insert({ ...payload, agency_tenant_id: tenantId, created_by: userId } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Số hợp đồng đã tồn tại");
      throw new Error(error.message);
    }
    return { id: row!.id };
  });

export const renewContract = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator(
    (i: { id: string; new_end_date: string; new_fee_amount?: number; notes?: string }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: c, error: e1 } = await supabase
      .from("office_contracts")
      .select("end_date, fee_amount")
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (e1 || !c) throw new Error("Không tìm thấy hợp đồng");

    await supabase.from("office_contract_renewals").insert({
      contract_id: data.id,
      prev_end_date: c.end_date,
      new_end_date: data.new_end_date,
      new_fee_amount: data.new_fee_amount ?? c.fee_amount,
      notes: data.notes,
      created_by: userId,
    });

    const { error } = await supabase
      .from("office_contracts")
      .update({
        end_date: data.new_end_date,
        fee_amount: data.new_fee_amount ?? c.fee_amount,
        status: "active",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

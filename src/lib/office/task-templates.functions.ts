import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const TemplateSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(255),
  category: z
    .enum([
      "vat_filing", "pit", "cit", "social_insurance",
      "bookkeeping", "financial_report", "internal", "other",
    ])
    .default("other"),
  rule_type: z.enum(["monthly_day", "quarterly", "yearly"]).default("monthly_day"),
  rule_day: z.number().int().min(1).max(31).optional().nullable(),
  rule_month: z.number().int().min(1).max(12).optional().nullable(),
  lead_days: z.number().int().min(0).max(60).default(0),
  default_assignee_id: z.string().uuid().optional().nullable(),
  scope: z.enum(["all_clients", "selected", "internal"]).default("all_clients"),
  scope_link_ids: z.array(z.string().uuid()).default([]),
  active: z.boolean().default(true),
});

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_task_templates")
      .select("*")
      .eq("agency_tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => TemplateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { id, ...rest } = data;
    const payload = { ...rest, checklist: [] as never };
    if (id) {
      const { error } = await supabase
        .from("office_task_templates")
        .update(payload)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_task_templates")
      .insert({ ...payload, agency_tenant_id: tenantId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("office_task_templates")
      .delete()
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runGenerateNow = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase.rpc("office_generate_recurring_tasks" as never, {
      p_agency: tenantId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

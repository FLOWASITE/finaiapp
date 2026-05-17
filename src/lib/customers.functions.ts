import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_\-./]+$/, "Mã chỉ chứa chữ/số/_-./"),
  name: z.string().trim().min(1).max(255),
  tax_id: z.string().trim().max(50).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  email_cc: z.string().trim().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  contact_person: z.string().trim().max(255).optional().or(z.literal("")),
  payment_terms_days: z.number().int().min(0).max(365).default(30),
  currency: z.string().trim().min(3).max(8).default("VND"),
  opening_balance: z.number().default(0),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CustomerSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Lấy tenant hiện hành để gắn vào row mới
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .single();
    const tenant_id = profile?.active_tenant_id ?? null;

    const payload = {
      ...data,
      email: data.email || null,
      email_cc: data.email_cc || null,
      phone: data.phone || null,
      address: data.address || null,
      tax_id: data.tax_id || null,
      contact_person: data.contact_person || null,
      notes: data.notes || null,
    };

    if (data.id) {
      const { error } = await supabase.from("customers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("customers")
      .insert({ ...payload, user_id: userId, tenant_id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const archiveCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; archived: boolean }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("customers")
      .update({ is_active: !data.archived })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

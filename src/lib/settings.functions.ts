import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const { data: locks } = await supabase
      .from("period_locks").select("*").order("year", { ascending: false }).order("month", { ascending: false });
    return { profile, roles: (roles ?? []).map((r) => r.role), locks: locks ?? [] };
  });

const ProfileSchema = z.object({
  company_name: z.string().max(255).optional(),
  tax_id: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  bank_account: z.string().max(50).optional(),
  signer_name: z.string().max(100).optional(),
  legal_rep_name: z.string().max(100).optional().nullable(),
  chief_accountant_name: z.string().max(100).optional().nullable(),
  preparer_name: z.string().max(100).optional().nullable(),
  signature_url: z.string().max(500).optional().nullable(),
  stamp_url: z.string().max(500).optional().nullable(),
  accounting_standard: z.enum(["TT133", "TT200"]).default("TT133"),
  fiscal_year_start: z.number().int().min(1).max(12).default(1),
  base_currency: z.string().max(10).default("VND"),
  display_name: z.string().max(100).optional().nullable(),
  avatar_url: z.string().max(500).optional().nullable(),
  job_title: z.string().max(100).optional().nullable(),
  language: z.enum(["vi", "en"]).optional(),
  timezone: z.string().max(64).optional(),
  date_format: z.string().max(32).optional(),
  number_format: z.string().max(16).optional(),
}).partial();

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProfileSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LockSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  action: z.enum(["lock", "unlock"]),
});

export const togglePeriodLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LockSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.action === "lock") {
      const { error } = await supabase.from("period_locks")
        .insert({ user_id: userId, year: data.year, month: data.month });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("period_locks").delete()
        .eq("user_id", userId).eq("year", data.year).eq("month", data.month);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const FxSchema = z.object({
  rate_date: z.string(),
  currency: z.string().min(1).max(10),
  rate: z.number().positive(),
  source: z.string().max(50).optional(),
});

export const listFxRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exchange_rates").select("*")
      .order("rate_date", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertFxRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FxSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("exchange_rates").upsert(
      { ...data, user_id: userId },
      { onConflict: "user_id,rate_date,currency" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

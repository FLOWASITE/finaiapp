import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export const listSealStatus = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data: periods } = await supabase
      .from("fiscal_periods")
      .select("id, year, period_no, status, is_sealed, sealed_at, sealed_by, seal_reason")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: false })
      .order("period_no", { ascending: true });
    const { data: requests } = await supabase
      .from("fiscal_period_unseal_requests")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { periods: periods ?? [], requests: requests ?? [] };
  });

export const sealPeriod = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ period_id: z.string().uuid(), reason: z.string().min(3).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("seal_fiscal_period", {
      p_period_id: data.period_id,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestUnseal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ period_id: z.string().uuid(), reason: z.string().min(10).max(1000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_unseal_period", {
      p_period_id: data.period_id,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { request_id: id as string };
  });

export const approveUnseal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ request_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_unseal_period", {
      p_request_id: data.request_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectUnseal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ request_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reject_unseal_period", {
      p_request_id: data.request_id,
      p_reason: data.reason ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
    return { ok: true };
  });

export const rebuildYearlyBalances = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ year: z.number().int().min(1900).max(2200).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("rebuild_account_balance_yearly", {
      p_tenant: context.tenantId,
      p_year: data.year ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

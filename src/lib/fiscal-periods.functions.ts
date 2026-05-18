import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listFiscalYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: years, error } = await supabase
      .from("fiscal_years")
      .select("*")
      .order("year", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: periods } = await supabase
      .from("fiscal_periods")
      .select("*")
      .order("year", { ascending: false })
      .order("period_no", { ascending: true });
    return { years: years ?? [], periods: periods ?? [] };
  });

export const generateFiscalYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ year: z.number().int().min(1900).max(2200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("generate_fiscal_year", { p_year: data.year });
    if (error) throw new Error(error.message);
    return { id };
  });

export const setPeriodStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "soft_closed", "closed"]),
      note: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      status: "open" | "soft_closed" | "closed";
      closed_at: string | null;
      closed_by: string | null;
      note?: string;
    } = {
      status: data.status,
      closed_at: data.status === "open" ? null : new Date().toISOString(),
      closed_by: data.status === "open" ? null : userId,
    };
    if (data.note !== undefined) patch.note = data.note;
    const { error } = await supabase.from("fiscal_periods").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeFiscalYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ fiscal_year_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { error: e1 } = await supabase
      .from("fiscal_periods")
      .update({ status: "closed", closed_at: now, closed_by: userId })
      .eq("fiscal_year_id", data.fiscal_year_id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabase
      .from("fiscal_years")
      .update({ status: "closed", closed_at: now, closed_by: userId })
      .eq("id", data.fiscal_year_id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

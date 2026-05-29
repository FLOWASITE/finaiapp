import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SearchInput = z.object({
  tenantId: z.string().uuid(),
  query: z.string().min(2).max(100),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchHit = {
  kind: "supplier" | "invoice";
  id: string;
  title: string;
  meta: Record<string, string | number | null>;
  meta: Record<string, unknown>;
  score: number;
};

export const searchGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("search_global", {
      p_tenant_id: data.tenantId,
      p_query: data.query,
      p_limit: data.limit ?? 20,
    });
    if (error) throw new Error(error.message);
    return { hits: (rows ?? []) as SearchHit[] };
  });

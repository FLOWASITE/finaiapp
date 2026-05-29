import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const SearchInput = z.object({
  query: z.string().min(2).max(100),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchHit = {
  kind: "supplier" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  meta: Record<string, string | number | null>;
  score: number;
};

export const searchGlobal = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: rows, error } = await supabase.rpc("search_global", {
      p_tenant_id: tenantId,
      p_query: data.query,
      p_limit: data.limit ?? 20,
    });
    if (error) throw new Error(error.message);
    return { hits: (rows ?? []) as SearchHit[] };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CatalogName = z.enum(["coa", "tpc"]);

export type CatalogDiffRow = {
  kind: "added" | "removed" | "changed";
  code: string | null;
  name: string | null;
  status: string | null;
  version: number | null;
  pinned_version: number;
  current_version: number;
};

export type CatalogDiffResult = {
  catalog: "coa" | "tpc";
  pinned_version: number;
  current_version: number;
  has_updates: boolean;
  rows: CatalogDiffRow[];
};

export const getCatalogDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ catalog: CatalogName }).parse(input))
  .handler(async ({ data, context }): Promise<CatalogDiffResult> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("current_tenant_catalog_diff", {
      p_catalog: data.catalog,
    });
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as CatalogDiffRow[];
    const pinned = list[0]?.pinned_version ?? 0;
    const current = list[0]?.current_version ?? 0;
    // If no rows came back, still fetch current_version
    let resolvedCurrent = current;
    let resolvedPinned = pinned;
    if (list.length === 0) {
      const { data: mc } = await supabase
        .from("master_catalogs")
        .select("current_version")
        .eq("name", data.catalog)
        .maybeSingle();
      resolvedCurrent = mc?.current_version ?? 0;
      const { data: pin } = await supabase
        .from("tenant_catalog_pins")
        .select("pinned_version")
        .eq("catalog_name", data.catalog)
        .maybeSingle();
      resolvedPinned = pin?.pinned_version ?? 0;
    }
    return {
      catalog: data.catalog,
      pinned_version: resolvedPinned,
      current_version: resolvedCurrent,
      has_updates: resolvedCurrent > resolvedPinned,
      rows: list,
    };
  });

export const acknowledgeCatalogVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ catalog: CatalogName }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: v, error } = await supabase.rpc("acknowledge_catalog_version", {
      p_catalog: data.catalog,
    });
    if (error) throw new Error(error.message);
    return { ok: true, pinned_version: v as number };
  });

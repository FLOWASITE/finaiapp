import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  kind: z.enum(["customer", "supplier"]),
  primaryId: z.string().uuid(),
  secondaryId: z.string().uuid(),
});

export const mergeParties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Schema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.primaryId === data.secondaryId) {
      throw new Error("Phải chọn 2 đối tượng khác nhau");
    }
    const { data: res, error } = await supabase.rpc("merge_parties", {
      p_kind: data.kind,
      p_primary: data.primaryId,
      p_secondary: data.secondaryId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; moved: Record<string, number> };
  });

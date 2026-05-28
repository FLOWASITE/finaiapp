/**
 * Server functions cho việc KTV ghi đè loại dòng hoá đơn (user_override_kind)
 * và đọc lại danh sách dòng kèm thông tin resolve để hiển thị trên UI review.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  resolveLineKind,
  type LineKind,
} from "./resolve-line-kind.server";

const KindSchema = z.enum(["goods", "ccdc", "asset", "service"]);

export const setLineOverrideKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        line_id: z.string().uuid(),
        kind: KindSchema.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("invoice_lines")
      .update({ user_override_kind: data.kind })
      .eq("id", data.line_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ResolvedLine = {
  id: string;
  description: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
  product_id: string | null;
  line_type: string | null;
  user_override_kind: LineKind | null;
  resolved_kind: LineKind;
  resolved_account: string;
  resolution_source: string;
  resolution_confidence: number;
  resolution_reason: string;
};

export const getResolvedInvoiceLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ invoice_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ResolvedLine[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("invoice_lines")
      .select(
        "id, description, quantity, unit_price, amount, product_id, line_type, user_override_kind",
      )
      .eq("invoice_id", data.invoice_id)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);

    const out: ResolvedLine[] = [];
    for (const r of rows ?? []) {
      const res = await resolveLineKind(supabase as any, {
        description: r.description ?? "",
        unit_price: r.unit_price ?? null,
        quantity: r.quantity ?? null,
        amount: r.amount ?? null,
        product_id: r.product_id,
        user_override_kind: (r.user_override_kind ?? null) as LineKind | null,
      } as any);
      out.push({
        id: r.id,
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
        amount: r.amount,
        product_id: r.product_id,
        line_type: r.line_type,
        user_override_kind: (r.user_override_kind ?? null) as LineKind | null,
        resolved_kind: res.kind,
        resolved_account: res.account,
        resolution_source: res.source,
        resolution_confidence: res.confidence,
        resolution_reason: res.reason,
      });
    }
    return out;
  });

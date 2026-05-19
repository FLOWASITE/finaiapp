import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type ContextCategory =
  | "org"
  | "accounting"
  | "tax"
  | "revenue"
  | "banking"
  | "departments"
  | "business_model"
  | "einvoice"
  | "other";

export type MemoryContext = {
  id: string;
  category: ContextCategory;
  key: string;
  label: string;
  value_text: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

const COLS = "id,category,key,label,value_text,order_index,created_at,updated_at";

export const CATEGORY_LABEL: Record<ContextCategory, string> = {
  org: "Tổ chức",
  accounting: "Kế toán",
  tax: "Thuế",
  revenue: "Doanh thu",
  banking: "Ngân hàng",
  departments: "Phòng ban",
  business_model: "Mô hình KD",
  einvoice: "HĐ điện tử",
  other: "Khác",
};

export const listContext = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<MemoryContext[]> => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("ai_memory_context")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .order("category", { ascending: true })
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MemoryContext[];
  });

const contextInput = z.object({
  category: z.enum([
    "org",
    "accounting",
    "tax",
    "revenue",
    "banking",
    "departments",
    "business_model",
    "einvoice",
    "other",
  ]),
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  label: z.string().trim().min(1).max(120),
  value_text: z.string().trim().min(1).max(2000),
  order_index: z.number().int().min(0).max(9999).optional(),
});

export const createContext = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => contextInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_memory_context")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        category: data.category,
        key: data.key,
        label: data.label,
        value_text: data.value_text,
        order_index: data.order_index ?? 999,
      })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as MemoryContext;
  });

export const updateContext = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(120).optional(),
        value_text: z.string().trim().min(1).max(2000).optional(),
        order_index: z.number().int().min(0).max(9999).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("ai_memory_context")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContext = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_context")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

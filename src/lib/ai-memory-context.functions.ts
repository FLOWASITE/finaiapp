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
  source: "manual" | "tenant";
  source_field: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id,category,key,label,value_text,order_index,source,source_field,created_at,updated_at";

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

// Trường tenant cho phép sửa trực tiếp từ tab Bối cảnh (text đơn giản).
// Các trường phức hợp (contact, legal_rep, industries, accounting_standard)
// phải sửa tại trang Cài đặt → Tổ chức.
const TENANT_WRITABLE_FIELDS: Record<string, string> = {
  company_name: "company_name",
  tax_id: "tax_id",
  address: "address",
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

    // Đọc row hiện tại để biết source
    const { data: cur, error: e1 } = await supabase
      .from("ai_memory_context")
      .select("source,source_field")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("Không tìm thấy mục bối cảnh");

    // Mục đồng bộ từ Tổ chức → ghi ngược vào tenants
    if (cur.source === "tenant") {
      if (patch.value_text === undefined) {
        // Chỉ đổi label/order_index của mục managed: cho phép
        const safe: Record<string, any> = {};
        if (patch.label !== undefined) safe.label = patch.label;
        if (patch.order_index !== undefined) safe.order_index = patch.order_index;
        if (Object.keys(safe).length > 0) {
          const { error } = await supabase
            .from("ai_memory_context")
            .update(safe as any)
            .eq("id", id)
            .eq("tenant_id", tenantId);

          if (error) throw new Error(error.message);
        }
        return { ok: true };
      }

      const field = cur.source_field ?? "";
      const tenantCol = TENANT_WRITABLE_FIELDS[field];
      if (!tenantCol) {
        throw new Error(
          "Mục này được quản lý ở Cài đặt → Tổ chức. Vui lòng sửa tại đó để đồng bộ chính xác.",
        );
      }
      const newVal = patch.value_text.trim();
      const { error: e2 } = await supabase
        .from("tenants")
        .update({ [tenantCol]: newVal } as any)
        .eq("id", tenantId);

      if (e2) throw new Error(e2.message);
      // Trigger DB sẽ đồng bộ lại ai_memory_context với format chuẩn.
      return { ok: true };
    }

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
    const { data: cur } = await supabase
      .from("ai_memory_context")
      .select("source")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (cur?.source === "tenant") {
      throw new Error(
        "Không thể xoá mục đồng bộ từ Tổ chức. Hãy sửa tại Cài đặt → Tổ chức.",
      );
    }
    const { error } = await supabase
      .from("ai_memory_context")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

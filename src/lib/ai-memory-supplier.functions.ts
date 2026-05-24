import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const Input = z.object({
  supplier_id: z.string().uuid(),
  industry_code: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, "Mã ngành phải gồm 4-6 chữ số")
    .nullable(),
});

/**
 * Cập nhật industry_code của NCC ngay từ giao diện Trí Nhớ AI.
 * Cho phép truyền null để xoá ngành.
 */
export const updateSupplierIndustry = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("suppliers")
      .update({ industry_code: data.industry_code })
      .eq("id", data.supplier_id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { lookupGlobalSupplier } from "./global-supplier.server";

const Input = z.object({
  tax_id: z
    .string()
    .trim()
    .regex(/^\d{10}(-\d{3})?$/, "Mã số thuế không hợp lệ"),
});

/**
 * Tra cứu nhanh danh tính NCC trong registry liên-tenant (chỉ tên + ngành).
 * Trả null nếu chưa có ≥ 2 tenant đóng góp.
 */
export const lookupSupplierIdentity = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    return await lookupGlobalSupplier(context.supabase, data.tax_id);
  });

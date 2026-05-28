import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

/**
 * Đọc cấu hình tự động duyệt cấp doanh nghiệp (Phase 5).
 * - enabled: bật/tắt auto-post
 * - min_confidence: ngưỡng độ tin cậy (0..1) tối thiểu
 * - max_amount: trần giá trị hoá đơn (VND) cho phép auto
 */
export const getAutoPostSettings = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("tenants")
      .select("auto_post_enabled, auto_post_min_confidence, auto_post_max_amount")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      enabled: Boolean(data?.auto_post_enabled ?? false),
      min_confidence: Number(data?.auto_post_min_confidence ?? 0.95),
      max_amount: Number(data?.auto_post_max_amount ?? 5_000_000),
    };
  });

const UpdateInput = z.object({
  enabled: z.boolean(),
  min_confidence: z.number().min(0.5).max(1),
  max_amount: z.number().min(0).max(1_000_000_000_000),
});

export const updateAutoPostSettings = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("tenants")
      .update({
        auto_post_enabled: data.enabled,
        auto_post_min_confidence: data.min_confidence,
        auto_post_max_amount: data.max_amount,
      })
      .eq("id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

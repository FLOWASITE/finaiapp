/**
 * Server functions cho calibration loop — UI gọi.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";
import { scanAndCalibrateTenant } from "./calibrate.server";
import { DEFAULT_WEIGHTS } from "@/lib/categorize/calibration.server";

const activeTenant = (supabase: any, userId: string) =>
  resolveActiveTenantId(supabase, userId);

export const runCalibrationForTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    return scanAndCalibrateTenant(supabase, tenantId);
  });

export const getCalibrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({}).optional().parse(i))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return null;
    const [{ data: cal }, { data: runs }, { data: agent }] = await Promise.all([
      supabase
        .from("confidence_calibration")
        .select(
          "auto_threshold, review_threshold, signal_weights, sample_size, accuracy_auto, accuracy_review, last_calibrated_at",
        )
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("calibration_runs")
        .select("id, ran_at, sample_size, old_threshold, new_threshold, metrics, note")
        .eq("tenant_id", tenantId)
        .order("ran_at", { ascending: false })
        .limit(10),
      supabase
        .from("ai_agents")
        .select("confidence_threshold, mode, enabled")
        .eq("tenant_id", tenantId)
        .eq("agent_id", "categorize")
        .maybeSingle(),
    ]);
    return {
      tenant_id: tenantId,
      calibration: cal
        ? {
            auto_threshold: Number(cal.auto_threshold),
            review_threshold: Number(cal.review_threshold),
            signal_weights: { ...DEFAULT_WEIGHTS, ...((cal.signal_weights as any) ?? {}) },
            sample_size: Number(cal.sample_size ?? 0),
            accuracy_auto: cal.accuracy_auto != null ? Number(cal.accuracy_auto) : null,
            accuracy_review: cal.accuracy_review != null ? Number(cal.accuracy_review) : null,
            last_calibrated_at: cal.last_calibrated_at,
          }
        : {
            auto_threshold: 0.85,
            review_threshold: 0.6,
            signal_weights: { ...DEFAULT_WEIGHTS },
            sample_size: 0,
            accuracy_auto: null,
            accuracy_review: null,
            last_calibrated_at: null,
          },
      agent: {
        confidence_floor: Number(agent?.confidence_threshold ?? 0.85),
        mode: (agent?.mode as string) ?? "suggest",
        enabled: !!agent?.enabled,
      },
      runs: (runs ?? []) as any[],
      defaults: { signal_weights: DEFAULT_WEIGHTS },
    };
  });

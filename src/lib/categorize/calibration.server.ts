/**
 * Confidence calibration — server-only.
 *
 * Cung cấp:
 *  - getCalibration(tenantId): đọc state hiện tại (có cache 60s)
 *  - applyCalibratedConfidence(base, features, weights): chỉnh confidence theo signals
 *  - effectiveAutoThreshold(userFloor, calibratedThreshold): max(user, calibrated)
 *  - decideBand(confidence, cal): "auto" | "review" | "manual"
 *  - invalidateCalibration(tenantId): job gọi sau khi ghi mới
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SignalKey =
  | "vendor_template"
  | "learned_memory"
  | "classify_rule"
  | "ai_fallback"
  | "partner_history"
  | "vat_match"
  | "has_warning"
  | "missing_partner";

export type SignalFeatures = Partial<Record<SignalKey, number>>;
export type SignalWeights = Partial<Record<SignalKey, number>>;

export const DEFAULT_WEIGHTS: Required<SignalWeights> = {
  vendor_template: 0.10,
  learned_memory: 0.08,
  classify_rule: 0.0,
  ai_fallback: -0.15,
  partner_history: 0.05,
  vat_match: 0.03,
  has_warning: -0.05,
  missing_partner: -0.05,
};

export type CalibrationState = {
  tenant_id: string;
  auto_threshold: number;
  review_threshold: number;
  signal_weights: Required<SignalWeights>;
  sample_size: number;
  accuracy_auto: number | null;
  accuracy_review: number | null;
  last_calibrated_at: string | null;
};

const DEFAULT_STATE = (tenantId: string): CalibrationState => ({
  tenant_id: tenantId,
  auto_threshold: 0.85,
  review_threshold: 0.60,
  signal_weights: { ...DEFAULT_WEIGHTS },
  sample_size: 0,
  accuracy_auto: null,
  accuracy_review: null,
  last_calibrated_at: null,
});

const TTL_MS = 60_000;
const cache = new Map<string, { value: CalibrationState; expiresAt: number }>();

export async function getCalibration(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CalibrationState> {
  const c = cache.get(tenantId);
  if (c && c.expiresAt > Date.now()) return c.value;
  const { data } = await supabase
    .from("confidence_calibration")
    .select(
      "tenant_id, auto_threshold, review_threshold, signal_weights, sample_size, accuracy_auto, accuracy_review, last_calibrated_at",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const state: CalibrationState = data
    ? {
        tenant_id: tenantId,
        auto_threshold: Number(data.auto_threshold ?? 0.85),
        review_threshold: Number(data.review_threshold ?? 0.6),
        signal_weights: { ...DEFAULT_WEIGHTS, ...((data.signal_weights as any) ?? {}) },
        sample_size: Number(data.sample_size ?? 0),
        accuracy_auto: data.accuracy_auto != null ? Number(data.accuracy_auto) : null,
        accuracy_review: data.accuracy_review != null ? Number(data.accuracy_review) : null,
        last_calibrated_at: (data.last_calibrated_at as string | null) ?? null,
      }
    : DEFAULT_STATE(tenantId);
  cache.set(tenantId, { value: state, expiresAt: Date.now() + TTL_MS });
  return state;
}

export function invalidateCalibration(tenantId: string): void {
  cache.delete(tenantId);
}

/** Cộng/trừ delta theo từng signal kích hoạt, clamp [0, 0.99]. */
export function applyCalibratedConfidence(
  base: number,
  features: SignalFeatures,
  weights: SignalWeights = DEFAULT_WEIGHTS,
): number {
  let c = base;
  for (const k of Object.keys(features) as SignalKey[]) {
    const v = Number(features[k] ?? 0);
    if (!v) continue;
    const w = Number(weights[k] ?? DEFAULT_WEIGHTS[k] ?? 0);
    c += w * v;
  }
  if (c < 0) c = 0;
  if (c > 0.99) c = 0.99;
  return Math.round(c * 1000) / 1000;
}

export function effectiveAutoThreshold(userFloor: number, calibrated: number): number {
  return Math.max(Number(userFloor ?? 0.85), Number(calibrated ?? 0.85));
}

export function decideBand(
  confidence: number,
  cal: CalibrationState,
): "auto" | "review" | "manual" {
  if (confidence >= cal.auto_threshold) return "auto";
  if (confidence >= cal.review_threshold) return "review";
  return "manual";
}

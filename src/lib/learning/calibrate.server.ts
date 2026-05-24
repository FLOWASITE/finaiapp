/**
 * Calibration job — server-only.
 *
 * Đọc `inbox_decisions` 30 ngày của 1 tenant, join với `ai_journal_proposals.signals`
 * theo (item_external_id = invoice_id), tính metrics theo band hiện hành, đề xuất
 * threshold mới + cập nhật signal_weights bằng logit-delta nhỏ tay.
 *
 * KHÔNG cập nhật nếu sample_size < 30.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WEIGHTS,
  invalidateCalibration,
  type CalibrationState,
  type SignalKey,
  type SignalWeights,
} from "@/lib/categorize/calibration.server";

const WINDOW_DAYS = 30;
const MIN_SAMPLE = 30;
const MIN_SIGNAL_SAMPLE = 20;
const WEIGHT_CLAMP = 0.2;

type DecisionRow = {
  action: string;
  confidence_at_decision: number | null;
  item_external_id: string;
  decided_at: string;
};

type ProposalRow = {
  invoice_id: string;
  signals: Record<string, number> | null;
};

type Metrics = {
  sample_size: number;
  precision_auto: number | null;
  edit_rate_review: number | null;
  total_auto: number;
  total_review: number;
  total_manual: number;
  approve_total: number;
  edit_total: number;
};

function logit(p: number): number {
  const e = 1e-3;
  const x = Math.min(1 - e, Math.max(e, p));
  return Math.log(x / (1 - x));
}

function computeMetrics(
  decisions: DecisionRow[],
  cal: CalibrationState,
): Metrics {
  let totalAuto = 0,
    totalReview = 0,
    totalManual = 0;
  let approveAuto = 0;
  let editReview = 0;
  let approveAll = 0,
    editAll = 0;
  for (const d of decisions) {
    const conf = Number(d.confidence_at_decision ?? 0);
    const band =
      conf >= cal.auto_threshold ? "auto" : conf >= cal.review_threshold ? "review" : "manual";
    if (band === "auto") totalAuto++;
    else if (band === "review") totalReview++;
    else totalManual++;
    if (d.action === "approve" || d.action === "bulk_approve") {
      approveAll++;
      if (band === "auto") approveAuto++;
    } else if (d.action === "edit") {
      editAll++;
      if (band === "review") editReview++;
    }
  }
  return {
    sample_size: decisions.length,
    precision_auto: totalAuto > 0 ? approveAuto / totalAuto : null,
    edit_rate_review: totalReview > 0 ? editReview / totalReview : null,
    total_auto: totalAuto,
    total_review: totalReview,
    total_manual: totalManual,
    approve_total: approveAll,
    edit_total: editAll,
  };
}

function tuneThreshold(current: number, metrics: Metrics): number {
  if (metrics.precision_auto == null) return current;
  if (metrics.precision_auto < 0.92) return Math.min(0.95, current + 0.03);
  if (metrics.precision_auto >= 0.97 && (metrics.edit_rate_review ?? 1) < 0.15)
    return Math.max(0.75, current - 0.02);
  return current;
}

function tuneReviewThreshold(current: number, metrics: Metrics): number {
  if (metrics.total_manual + metrics.total_review < 20) return current;
  // Nếu manual band rỗng/ít edit-needed → có thể hạ; nếu review nhiều edit → nâng
  if ((metrics.edit_rate_review ?? 0) > 0.5) return Math.min(0.75, current + 0.02);
  if ((metrics.edit_rate_review ?? 1) < 0.1 && metrics.total_review > 30)
    return Math.max(0.4, current - 0.02);
  return current;
}

function tuneWeights(
  decisions: DecisionRow[],
  proposalsByInvoice: Map<string, ProposalRow>,
  current: Required<SignalWeights>,
): Required<SignalWeights> {
  const next: Required<SignalWeights> = { ...current };
  const signalKeys = Object.keys(DEFAULT_WEIGHTS) as SignalKey[];
  for (const k of signalKeys) {
    let posTrue = 0,
      negTrue = 0,
      posFalse = 0,
      negFalse = 0;
    for (const d of decisions) {
      const p = proposalsByInvoice.get(d.item_external_id);
      if (!p?.signals) continue;
      const v = Number(p.signals[k] ?? 0);
      const fired = v > 0;
      const approved = d.action === "approve" || d.action === "bulk_approve";
      if (fired) {
        if (approved) posTrue++;
        else negTrue++;
      } else {
        if (approved) posFalse++;
        else negFalse++;
      }
    }
    const sampleTrue = posTrue + negTrue;
    const sampleFalse = posFalse + negFalse;
    if (sampleTrue < MIN_SIGNAL_SAMPLE || sampleFalse < MIN_SIGNAL_SAMPLE) continue;
    const pTrue = posTrue / sampleTrue;
    const pFalse = posFalse / sampleFalse;
    const delta = (logit(pTrue) - logit(pFalse)) / 4;
    const target = current[k] + delta;
    next[k] = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, target));
    next[k] = Math.round(next[k] * 1000) / 1000;
  }
  return next;
}

/** Chạy calibration cho 1 tenant; trả về metrics + thay đổi (nếu có). */
export async function scanAndCalibrateTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{
  tenant_id: string;
  sample_size: number;
  metrics: Metrics;
  old_threshold: number;
  new_threshold: number;
  changed: boolean;
  note: string | null;
}> {
  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

  const { data: decisionsRaw } = await supabase
    .from("inbox_decisions")
    .select("action, confidence_at_decision, item_external_id, decided_at")
    .eq("tenant_id", tenantId)
    .gte("decided_at", sinceISO)
    .in("item_source", ["tct_einvoice", "email_forward", "document"])
    .limit(5000);

  const decisions: DecisionRow[] = (decisionsRaw ?? []) as DecisionRow[];
  const invoiceIds = Array.from(new Set(decisions.map((d) => d.item_external_id).filter(Boolean)));

  // Load current calibration
  const { data: calRow } = await supabase
    .from("confidence_calibration")
    .select("auto_threshold, review_threshold, signal_weights")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const oldThreshold = Number(calRow?.auto_threshold ?? 0.85);
  const oldReview = Number(calRow?.review_threshold ?? 0.6);
  const oldWeights: Required<SignalWeights> = {
    ...DEFAULT_WEIGHTS,
    ...(((calRow?.signal_weights as any) ?? {}) as SignalWeights),
  };
  const calCurrent: CalibrationState = {
    tenant_id: tenantId,
    auto_threshold: oldThreshold,
    review_threshold: oldReview,
    signal_weights: oldWeights,
    sample_size: 0,
    accuracy_auto: null,
    accuracy_review: null,
    last_calibrated_at: null,
  };

  const metrics = computeMetrics(decisions, calCurrent);

  if (decisions.length < MIN_SAMPLE) {
    await supabase.from("calibration_runs").insert({
      tenant_id: tenantId,
      window_days: WINDOW_DAYS,
      sample_size: decisions.length,
      old_threshold: oldThreshold,
      new_threshold: oldThreshold,
      old_weights: oldWeights as any,
      new_weights: oldWeights as any,
      metrics: metrics as any,
      note: `Mẫu chưa đủ (${decisions.length}/${MIN_SAMPLE})`,
    });
    return {
      tenant_id: tenantId,
      sample_size: decisions.length,
      metrics,
      old_threshold: oldThreshold,
      new_threshold: oldThreshold,
      changed: false,
      note: "insufficient_sample",
    };
  }

  // Load proposals.signals cho các invoice trong window
  const proposalMap = new Map<string, ProposalRow>();
  for (let i = 0; i < invoiceIds.length; i += 500) {
    const chunk = invoiceIds.slice(i, i + 500);
    const { data } = await supabase
      .from("ai_journal_proposals")
      .select("invoice_id, signals")
      .eq("tenant_id", tenantId)
      .in("invoice_id", chunk);
    for (const r of (data ?? []) as ProposalRow[]) {
      proposalMap.set(r.invoice_id, r);
    }
  }

  const newThreshold = tuneThreshold(oldThreshold, metrics);
  const newReview = tuneReviewThreshold(oldReview, metrics);
  const newWeights = tuneWeights(decisions, proposalMap, oldWeights);

  const changed =
    newThreshold !== oldThreshold ||
    newReview !== oldReview ||
    JSON.stringify(newWeights) !== JSON.stringify(oldWeights);

  await supabase.from("confidence_calibration").upsert(
    {
      tenant_id: tenantId,
      auto_threshold: newThreshold,
      review_threshold: newReview,
      signal_weights: newWeights as any,
      sample_size: decisions.length,
      accuracy_auto: metrics.precision_auto,
      accuracy_review: metrics.edit_rate_review,
      last_calibrated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );

  await supabase.from("calibration_runs").insert({
    tenant_id: tenantId,
    window_days: WINDOW_DAYS,
    sample_size: decisions.length,
    old_threshold: oldThreshold,
    new_threshold: newThreshold,
    old_weights: oldWeights as any,
    new_weights: newWeights as any,
    metrics: metrics as any,
    note: changed ? "calibrated" : "no_change",
  });

  invalidateCalibration(tenantId);

  return {
    tenant_id: tenantId,
    sample_size: decisions.length,
    metrics,
    old_threshold: oldThreshold,
    new_threshold: newThreshold,
    changed,
    note: changed ? "calibrated" : "no_change",
  };
}

/** Quét tất cả tenant có ≥MIN_SAMPLE decisions trong window. */
export async function scanAndCalibrateAll(
  supabase: SupabaseClient,
): Promise<Array<{ tenant_id: string; changed: boolean; sample_size: number; note: string | null }>> {
  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const { data } = await supabase
    .from("inbox_decisions")
    .select("tenant_id")
    .gte("decided_at", sinceISO)
    .limit(10000);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { tenant_id: string }[]) {
    counts.set(r.tenant_id, (counts.get(r.tenant_id) ?? 0) + 1);
  }
  const tenants = Array.from(counts.entries())
    .filter(([, n]) => n >= MIN_SAMPLE)
    .map(([t]) => t);

  const out: Array<{ tenant_id: string; changed: boolean; sample_size: number; note: string | null }> = [];
  for (const t of tenants) {
    try {
      const res = await scanAndCalibrateTenant(supabase, t);
      out.push({ tenant_id: t, changed: res.changed, sample_size: res.sample_size, note: res.note });
    } catch (e) {
      out.push({ tenant_id: t, changed: false, sample_size: 0, note: `error:${(e as Error).message}` });
    }
  }
  return out;
}

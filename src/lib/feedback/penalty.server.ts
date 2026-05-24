/**
 * Penalty engine: nhận feedback event, cộng dồn điểm phạt
 * lên rule/memory/partner_history. Tự động demote khi vượt ngưỡng.
 */

export type FeedbackEventType =
  | "wrong_account"
  | "wrong_amount"
  | "wrong_partner"
  | "wrong_vat"
  | "duplicate"
  | "missed_entry";

export type PenaltyTargetKind = "rule" | "memory" | "partner_history";

// severity base theo loại event
const EVENT_BASE_SEVERITY: Record<FeedbackEventType, number> = {
  wrong_account: 0.5,
  wrong_amount: 0.6,
  wrong_partner: 0.4,
  wrong_vat: 0.3,
  duplicate: 0.7,
  missed_entry: 0.4,
};

// Mapping: event_type → các target_kind bị phạt
const EVENT_TARGETS: Record<FeedbackEventType, PenaltyTargetKind[]> = {
  wrong_account: ["rule", "memory"],
  wrong_amount: ["rule"],
  wrong_partner: ["memory", "partner_history"],
  wrong_vat: ["rule"],
  duplicate: ["rule"],
  missed_entry: ["rule"],
};

export interface PenaltyInput {
  tenantId: string;
  eventId: string;
  eventType: FeedbackEventType;
  severity?: number; // override base
  signals: {
    rule_id?: string | null;
    memory_id?: string | null;
    partner_history_id?: string | null;
  };
}

const DEMOTE_TO_SUGGEST_SCORE = 1.5;
const DEMOTE_TO_DISABLED_SCORE = 3.0;
const DEMOTE_WRONG_COUNT_SUGGEST = 3;
const DEMOTE_WRONG_COUNT_DISABLED = 5;

export async function applyPenalty(supabase: any, input: PenaltyInput) {
  const base = EVENT_BASE_SEVERITY[input.eventType] ?? 0.4;
  const severity = input.severity ?? base;
  const targets = EVENT_TARGETS[input.eventType] ?? ["rule"];

  for (const kind of targets) {
    const targetId =
      kind === "rule"
        ? input.signals.rule_id
        : kind === "memory"
        ? input.signals.memory_id
        : input.signals.partner_history_id;
    if (!targetId) continue;

    // Upsert penalty score
    const { data: existing } = await supabase
      .from("ai_rule_penalties")
      .select("id, penalty_score, wrong_count, auto_demoted_at")
      .eq("tenant_id", input.tenantId)
      .eq("target_kind", kind)
      .eq("target_id", targetId)
      .maybeSingle();

    const newScore = Number(existing?.penalty_score ?? 0) + severity;
    const newCount = Number(existing?.wrong_count ?? 0) + 1;

    let demoteReason: string | null = null;
    if (
      !existing?.auto_demoted_at &&
      newScore >= DEMOTE_TO_DISABLED_SCORE &&
      newCount >= DEMOTE_WRONG_COUNT_DISABLED
    ) {
      demoteReason = `auto: cross-agent feedback (score ${newScore.toFixed(2)}, ${newCount} sai)`;
      await demoteTarget(supabase, kind, targetId, "disabled", demoteReason);
    } else if (
      !existing?.auto_demoted_at &&
      newScore >= DEMOTE_TO_SUGGEST_SCORE &&
      newCount >= DEMOTE_WRONG_COUNT_SUGGEST
    ) {
      demoteReason = `auto: cross-agent feedback (score ${newScore.toFixed(2)}, ${newCount} sai)`;
      await demoteTarget(supabase, kind, targetId, "suggest", demoteReason);
    }

    if (existing) {
      await supabase
        .from("ai_rule_penalties")
        .update({
          penalty_score: newScore,
          wrong_count: newCount,
          last_penalty_at: new Date().toISOString(),
          last_event_id: input.eventId,
          ...(demoteReason
            ? { auto_demoted_at: new Date().toISOString(), auto_demoted_reason: demoteReason }
            : {}),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("ai_rule_penalties").insert({
        tenant_id: input.tenantId,
        target_kind: kind,
        target_id: targetId,
        penalty_score: newScore,
        wrong_count: newCount,
        last_penalty_at: new Date().toISOString(),
        last_event_id: input.eventId,
        ...(demoteReason
          ? { auto_demoted_at: new Date().toISOString(), auto_demoted_reason: demoteReason }
          : {}),
      });
    }

    // Cập nhật bảng nguồn (tăng accuracy_total nhưng không tăng correct → giảm accuracy)
    if (kind === "rule") {
      const { data: r } = await supabase
        .from("ai_memory_rules")
        .select("accuracy_correct, accuracy_total")
        .eq("id", targetId)
        .maybeSingle();
      if (r) {
        await supabase
          .from("ai_memory_rules")
          .update({
            accuracy_correct: Math.max(0, Number(r.accuracy_correct ?? 0) - 1),
          })
          .eq("id", targetId);
      }
    } else if (kind === "memory" || kind === "partner_history") {
      // ai_memory_partners có hit_count/confidence_score (nếu schema khác bỏ qua bằng try)
      try {
        const { data: m } = await supabase
          .from("ai_memory_partners")
          .select("hit_count, confidence_score")
          .eq("id", targetId)
          .maybeSingle();
        if (m) {
          await supabase
            .from("ai_memory_partners")
            .update({
              hit_count: Math.max(0, Number(m.hit_count ?? 0) - 1),
              confidence_score: Math.max(0, Number(m.confidence_score ?? 0.5) - 0.05),
            })
            .eq("id", targetId);
        }
      } catch {}
    }
  }
}

async function demoteTarget(
  supabase: any,
  kind: PenaltyTargetKind,
  targetId: string,
  to: "suggest" | "disabled",
  reason: string,
) {
  if (kind === "rule") {
    await supabase
      .from("ai_memory_rules")
      .update({
        mode: to,
        ...(to === "disabled" ? { status: "disabled", enabled: false } : {}),
        disable_reason: reason,
      })
      .eq("id", targetId);
  }
  // memory/partner_history không có mode → đã giảm confidence ở applyPenalty
}

/**
 * Decay: mỗi đêm giảm penalty_score 10%.
 * Khi score < 0.1 thì reset về 0 (clear demote nếu cần).
 */
export async function decayPenalties(supabase: any, tenantId?: string) {
  let q = supabase
    .from("ai_rule_penalties")
    .select("id, penalty_score")
    .gt("penalty_score", 0);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data: rows } = await q.limit(5000);
  let updated = 0;
  for (const r of (rows ?? []) as any[]) {
    const newScore = Number(r.penalty_score) * 0.9;
    await supabase
      .from("ai_rule_penalties")
      .update({ penalty_score: newScore < 0.1 ? 0 : newScore })
      .eq("id", r.id);
    updated++;
  }
  return { updated };
}

/**
 * Tra penalty_factor cho engine: dùng khi tính effective confidence.
 * factor = min(0.5, score / 6)  → trừ tối đa 50%.
 */
export async function getPenaltyFactorMap(
  supabase: any,
  tenantId: string,
  targetIds: { rule?: string[]; memory?: string[]; partner_history?: string[] },
): Promise<Record<string, number>> {
  const all: { kind: string; id: string }[] = [];
  for (const k of ["rule", "memory", "partner_history"] as const) {
    for (const id of targetIds[k] ?? []) all.push({ kind: k, id });
  }
  if (all.length === 0) return {};
  const { data } = await supabase
    .from("ai_rule_penalties")
    .select("target_kind, target_id, penalty_score")
    .eq("tenant_id", tenantId)
    .in("target_id", all.map((a) => a.id));
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) {
    const factor = Math.min(0.5, Number(row.penalty_score) / 6);
    map[`${row.target_kind}:${row.target_id}`] = factor;
  }
  return map;
}

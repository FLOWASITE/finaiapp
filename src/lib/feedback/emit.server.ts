/**
 * Emit feedback event từ một agent (vd reconcile) tới categorize engine.
 * Tự động tra signals từ ai_journal_proposals theo journal_entry_id rồi
 * gọi applyPenalty().
 */
import { applyPenalty, type FeedbackEventType } from "./penalty.server";

export interface EmitFeedbackInput {
  tenantId: string;
  sourceAgent: "reconcile" | "review" | "manual";
  eventType: FeedbackEventType;
  severity?: number;
  journalEntryId?: string | null;
  bankTransactionId?: string | null;
  proposalId?: string | null;
  note?: string;
  createdBy?: string | null;
}

export async function emitFeedback(supabase: any, input: EmitFeedbackInput) {
  // Tra signals từ proposal nếu có
  let signals: any = {};
  let proposalId = input.proposalId ?? null;

  if (!proposalId && input.journalEntryId) {
    const { data: p } = await supabase
      .from("ai_journal_proposals")
      .select("id, signals")
      .eq("journal_entry_id", input.journalEntryId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (p) {
      proposalId = p.id;
      signals = p.signals ?? {};
    }
  } else if (proposalId) {
    const { data: p } = await supabase
      .from("ai_journal_proposals")
      .select("signals")
      .eq("id", proposalId)
      .maybeSingle();
    signals = p?.signals ?? {};
  }

  // Insert event log
  const { data: evt, error } = await supabase
    .from("agent_feedback_events")
    .insert({
      tenant_id: input.tenantId,
      source_agent: input.sourceAgent,
      target_agent: "categorize",
      event_type: input.eventType,
      severity: input.severity ?? 0.5,
      journal_entry_id: input.journalEntryId ?? null,
      bank_transaction_id: input.bankTransactionId ?? null,
      proposal_id: proposalId,
      signals_snapshot: signals,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // Không throw — feedback không được làm hỏng flow chính
    console.error("[emitFeedback] insert failed", error);
    return { ok: false, error: error.message };
  }

  // Áp penalty ngay
  try {
    await applyPenalty(supabase, {
      tenantId: input.tenantId,
      eventId: evt.id,
      eventType: input.eventType,
      severity: input.severity,
      signals: {
        rule_id: signals?.rule_id ?? signals?.classify_rule_id ?? null,
        memory_id: signals?.memory_id ?? signals?.learned_memory_id ?? null,
        partner_history_id: signals?.partner_history_id ?? null,
      },
    });
  } catch (e: any) {
    console.error("[emitFeedback] applyPenalty failed", e);
  }

  return { ok: true, eventId: evt.id };
}

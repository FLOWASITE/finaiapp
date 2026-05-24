/**
 * Auto-promote learning rules from inbox_decisions.
 *
 * Scans the last 30 days of approve/edit/bulk_approve decisions WITHOUT an
 * associated rule_id, groups them by (partner_tax_id, primary_debit_account)
 * derived from the final journal entry, and inserts an `inbox_rules` row of
 * source='auto' when count >= threshold (default 3).
 *
 * Demote: if a partner has >=2 recent 'edit' decisions overriding the same
 * existing auto rule's account, the rule is soft-disabled (disabled_at set).
 *
 * Server-only. Called from cron route. Uses admin client to bypass RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const LOOKBACK_DAYS = 30;
const PROMOTE_THRESHOLD = 3;
const DEMOTE_THRESHOLD = 2;

type Decision = {
  id: string;
  tenant_id: string;
  user_id: string;
  item_source: string;
  item_external_id: string;
  action: string;
  final_entry: any;
  rule_id: string | null;
  decided_at: string;
};

/** Pull primary debit account from a final_entry blob. */
function primaryDebit(final: any): string | null {
  if (!final?.lines || !Array.isArray(final.lines)) return null;
  const debits = final.lines.filter((l: any) => Number(l.debit || 0) > 0);
  if (debits.length === 0) return null;
  debits.sort((a: any, b: any) => Number(b.debit || 0) - Number(a.debit || 0));
  const acc = String(debits[0].account_code ?? debits[0].account ?? "");
  return acc || null;
}

/** Resolve partner_tax_id for a decision by looking up the source row. */
async function resolvePartnerTaxId(
  supabase: SupabaseClient,
  d: Decision,
): Promise<{ tax_id: string | null; partner_name: string | null }> {
  // doc/email → documents.ocr_extracted.supplier_tax_id
  if (d.item_source === "document" || d.item_source === "email_forward" || d.item_source === "tct_einvoice") {
    const { data: doc } = await supabase
      .from("documents")
      .select("ocr_extracted, invoice_id")
      .eq("id", d.item_external_id)
      .maybeSingle();
    if (doc?.invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("supplier_tax_id, supplier_name")
        .eq("id", doc.invoice_id)
        .maybeSingle();
      if (inv) return { tax_id: inv.supplier_tax_id ?? null, partner_name: inv.supplier_name ?? null };
    }
    const ext = (doc?.ocr_extracted ?? {}) as any;
    return {
      tax_id: ext.supplier_tax_id ?? ext.vendor_tax_id ?? ext.seller_tax_code ?? null,
      partner_name: ext.supplier_name ?? ext.vendor_name ?? null,
    };
  }
  if (d.item_source === "bank_statement") {
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("counterparty")
      .eq("id", d.item_external_id)
      .maybeSingle();
    return { tax_id: null, partner_name: txn?.counterparty ?? null };
  }
  return { tax_id: null, partner_name: null };
}

export type PromoteResult = {
  tenant_id: string;
  scanned: number;
  promoted: number;
  demoted: number;
  details: { partner: string; account: string; count: number; action: "promote" | "demote" }[];
};

export async function scanAndPromoteRules(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PromoteResult> {
  const sinceISO = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data: rows } = await supabase
    .from("inbox_decisions")
    .select("id, tenant_id, user_id, item_source, item_external_id, action, final_entry, rule_id, decided_at")
    .eq("tenant_id", tenantId)
    .in("action", ["approve", "edit", "bulk_approve"])
    .gte("decided_at", sinceISO)
    .order("decided_at", { ascending: false })
    .limit(1000);

  const decisions = (rows ?? []) as Decision[];
  const result: PromoteResult = {
    tenant_id: tenantId,
    scanned: decisions.length,
    promoted: 0,
    demoted: 0,
    details: [],
  };
  if (decisions.length === 0) return result;

  // Group ONLY decisions with no existing rule_id (candidates for promote)
  const promoteGroups = new Map<
    string,
    { partner: string; tax_id: string | null; account: string; count: number; user_id: string }
  >();
  // Group edits that have a rule_id (candidates for demote)
  const demoteGroups = new Map<string, { rule_id: string; count: number }>();

  for (const d of decisions) {
    const acc = primaryDebit(d.final_entry);
    if (!acc) continue;
    const { tax_id, partner_name } = await resolvePartnerTaxId(supabase, d);
    const partnerKey = tax_id ?? (partner_name ? `name:${partner_name.toLowerCase().slice(0, 40)}` : null);
    if (!partnerKey) continue;

    if (!d.rule_id && (d.action === "approve" || d.action === "bulk_approve" || d.action === "edit")) {
      const key = `${partnerKey}|${acc}`;
      const g = promoteGroups.get(key) ?? {
        partner: partner_name ?? tax_id ?? "?",
        tax_id,
        account: acc,
        count: 0,
        user_id: d.user_id,
      };
      g.count += 1;
      promoteGroups.set(key, g);
    }

    if (d.rule_id && d.action === "edit") {
      const g = demoteGroups.get(d.rule_id) ?? { rule_id: d.rule_id, count: 0 };
      g.count += 1;
      demoteGroups.set(d.rule_id, g);
    }
  }

  // --- DEMOTE first (so promote can replace a stale rule)
  for (const g of demoteGroups.values()) {
    if (g.count < DEMOTE_THRESHOLD) continue;
    const { data: rule } = await supabase
      .from("inbox_rules")
      .select("id, source, disabled_at")
      .eq("id", g.rule_id)
      .maybeSingle();
    if (!rule || rule.source !== "auto" || rule.disabled_at) continue;
    await supabase
      .from("inbox_rules")
      .update({ disabled_at: new Date().toISOString(), enabled: false })
      .eq("id", g.rule_id);
    result.demoted += 1;
    result.details.push({ partner: g.rule_id.slice(0, 8), account: "-", count: g.count, action: "demote" });
  }

  // --- PROMOTE
  for (const g of promoteGroups.values()) {
    if (g.count < PROMOTE_THRESHOLD) continue;
    const patternValue = g.tax_id ?? g.partner;
    // Skip if a matching active rule (manual or auto) already exists
    const { data: existing } = await supabase
      .from("inbox_rules")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("pattern_kind", "partner")
      .eq("pattern_value", patternValue)
      .eq("apply_account", g.account)
      .is("disabled_at", null)
      .eq("enabled", true)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from("inbox_rules").insert({
      tenant_id: tenantId,
      user_id: g.user_id,
      pattern_kind: "partner",
      pattern_value: patternValue,
      apply_account: g.account,
      apply_dimension: {},
      confidence_boost: 30,
      enabled: true,
      source: "auto",
      note: `Tự học từ ${g.count} lần duyệt (30 ngày gần nhất)`,
    });
    if (!error) {
      result.promoted += 1;
      result.details.push({ partner: g.partner, account: g.account, count: g.count, action: "promote" });
    }
  }

  return result;
}

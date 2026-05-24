/**
 * Học vendor template sau khi user duyệt bút toán.
 * - Lấy 3 bút toán gần nhất cùng vendor
 * - Nếu fingerprint + ratios giống nhau ≥3/3 → upsert template vào ai_memory_partners
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProposalEntry, ProposalLine } from "./types";
import { entryMatchesTemplate } from "./rules";

/** Chuyển journal_entries DB row sang ProposalEntry để so sánh. */
function rowToEntry(row: any): ProposalEntry {
  return {
    description: row.description ?? "",
    entry_date: row.entry_date,
    lines: ((row.journal_lines ?? []) as any[])
      .sort((a, b) => (a.line_order ?? 0) - (b.line_order ?? 0))
      .map((l) => ({
        account_code: l.account_code,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
      })),
  };
}

export async function learnVendorTemplate(
  supabase: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<{ learned: boolean; sample_count?: number }> {
  // Lấy hoá đơn vừa duyệt + 4 hoá đơn gần nhất cùng vendor để check pattern
  const { data: inv } = await supabase
    .from("invoices")
    .select("supplier_name, supplier_tax_id, supplier_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv?.supplier_name && !inv?.supplier_tax_id) return { learned: false };

  // Bút toán vừa duyệt
  const { data: latestEntry } = await supabase
    .from("journal_entries")
    .select("id, description, entry_date, journal_lines(account_code, debit, credit, line_order)")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestEntry) return { learned: false };
  const justApproved = rowToEntry(latestEntry);

  // Lấy 4 bút toán gần nhất cùng vendor (qua invoice.supplier_tax_id)
  const filter = inv.supplier_tax_id
    ? supabase
        .from("invoices")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("supplier_tax_id", inv.supplier_tax_id)
        .neq("id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(10)
    : supabase
        .from("invoices")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("supplier_name", `%${(inv.supplier_name ?? "").slice(0, 30)}%`)
        .neq("id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(10);
  const { data: priorInvs } = await filter;
  const priorIds = ((priorInvs ?? []) as any[]).map((r) => r.id);
  if (priorIds.length < 2) {
    // Cần ít nhất 2 hoá đơn cũ + 1 vừa duyệt = 3
    return { learned: false, sample_count: priorIds.length + 1 };
  }

  const { data: priorEntries } = await supabase
    .from("journal_entries")
    .select("id, description, entry_date, invoice_id, journal_lines(account_code, debit, credit, line_order)")
    .in("invoice_id", priorIds.slice(0, 4));

  const priorPropEntries = (priorEntries ?? []).map(rowToEntry);
  const matches = priorPropEntries.filter((e) => entryMatchesTemplate(justApproved, e));

  // Cần ≥2 entry cũ khớp pattern (cùng với entry vừa duyệt = 3)
  if (matches.length < 2) {
    return { learned: false, sample_count: matches.length + 1 };
  }

  // Tạo template từ justApproved (normalize amount → ratio rồi lưu)
  const templateLines: ProposalLine[] = justApproved.lines.map((l) => ({
    account_code: l.account_code,
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    memo: l.memo,
  }));

  // Upsert ai_memory_partners
  const { data: existing } = await supabase
    .from("ai_memory_partners")
    .select("id, sample_count, template_version")
    .eq("tenant_id", tenantId)
    .eq("party_kind", "supplier")
    .ilike("display_name", inv.supplier_name ?? "")
    .maybeSingle();

  const newSampleCount = (existing?.sample_count ?? 0) + 1;
  if (existing?.id) {
    await supabase
      .from("ai_memory_partners")
      .update({
        template_lines: templateLines as any,
        template_version: (existing.template_version ?? 0) + 1,
        sample_count: Math.max(newSampleCount, 3),
        last_seen_at: new Date().toISOString(),
        confidence: 0.95,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("ai_memory_partners").insert({
      tenant_id: tenantId,
      party_kind: "supplier",
      display_name: inv.supplier_name ?? "",
      behavior_text: `Bút toán mẫu học từ ${matches.length + 1} hoá đơn`,
      template_lines: templateLines as any,
      template_version: 1,
      sample_count: matches.length + 1,
      confidence: 0.95,
      last_seen_at: new Date().toISOString(),
    });
  }

  return { learned: true, sample_count: matches.length + 1 };
}

/** Suy ra kind_v2 từ account_code đã duyệt. */
export function accountToKindV2(acc: string): string | null {
  const a = String(acc || "");
  if (a.startsWith("156")) return "goods_for_resale";
  if (a.startsWith("152")) return "raw_material";
  if (a.startsWith("153")) return "tools";
  if (a.startsWith("242")) return "prepaid";
  if (a.startsWith("213")) return "fixed_asset_intangible";
  if (a.startsWith("211") || a.startsWith("212")) return "fixed_asset_tangible";
  if (/^(627|641|642|154|632|635|811|621|622|623)/.test(a)) return "service";
  return null;
}

export function kindV2ToLegacy(k: string): "goods" | "fixed_asset" | "ccdc" | "service" {
  if (k === "goods_for_resale" || k === "raw_material") return "goods";
  if (k === "fixed_asset_tangible" || k === "fixed_asset_intangible") return "fixed_asset";
  if (k === "tools") return "ccdc";
  return "service";
}

/**
 * Sau khi KTT duyệt bút toán mua, ghi nhớ phân loại cho từng invoice_line
 * vào ai_line_classifications để lần sau gặp item tương tự sẽ tự gán đúng.
 */
export async function learnLineClassificationsFromApproval(
  supabase: any,
  args: {
    tenantId: string;
    userId: string;
    invoiceId: string;
    lines: Array<{ account_code: string; debit: number; credit: number; memo?: string }>;
  },
): Promise<void> {
  const { tenantId, userId, invoiceId, lines } = args;

  const { data: inv } = await supabase
    .from("invoices")
    .select("supplier_id, suppliers(tax_id), invoice_lines(id, description, amount)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return;
  const supplierId: string | null = inv.supplier_id ?? null;
  const taxId: string | null = (inv as any).suppliers?.tax_id ?? null;
  const invoiceLines: Array<{ id: string; description: string | null; amount: number | null }> =
    (inv as any).invoice_lines ?? [];
  if (!invoiceLines.length) return;

  const skip = /^(133|111|112|331)/;
  const candidates = lines
    .filter((l) => Number(l.debit) > 0 && !skip.test(String(l.account_code)))
    .sort((a, b) => Number(b.debit) - Number(a.debit));
  if (!candidates.length) return;
  const dominantAcc = candidates[0].account_code;
  const kindV2 = accountToKindV2(dominantAcc);
  if (!kindV2) return;
  const legacyKind = kindV2ToLegacy(kindV2);

  const { normalizeLineName } = await import("@/lib/ai/classify-line");

  for (const il of invoiceLines) {
    const desc = (il.description ?? "").trim();
    if (!desc || desc.length < 3) continue;
    const norm = normalizeLineName(desc);
    if (!norm) continue;

    const { data: existing } = await supabase
      .from("ai_line_classifications")
      .select("id, hit_count")
      .eq("tenant_id", tenantId)
      .eq("line_name_norm", norm)
      .or(taxId ? `supplier_tax_id.eq.${taxId}` : "supplier_tax_id.is.null")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("ai_line_classifications")
        .update({
          kind: legacyKind,
          kind_v2: kindV2,
          account: dominantAcc,
          source: "user_override",
          hit_count: (existing.hit_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("ai_line_classifications").insert({
        tenant_id: tenantId,
        supplier_id: supplierId,
        supplier_tax_id: taxId,
        line_name: desc.slice(0, 500),
        line_name_norm: norm,
        kind: legacyKind,
        kind_v2: kindV2,
        account: dominantAcc,
        source: "user_override",
        created_by: userId,
      });
    }
  }
}

/**
 * Học từ phiếu mua đã ghi sổ qua Inbox AI.
 * Mỗi dòng phiếu (purchase_voucher_lines) đã có debit_account riêng nên có thể
 * phân loại trực tiếp theo từng dòng (không cần dồn về 1 dominant account).
 * Upsert vào ai_line_classifications giống luồng duyệt proposal cũ.
 */
export async function learnFromPurchaseVoucher(
  supabase: any,
  args: {
    tenantId: string;
    userId: string;
    voucherId: string;
  },
): Promise<{ learned: number }> {
  const { tenantId, userId, voucherId } = args;

  const { data: voucher } = await supabase
    .from("purchase_vouchers")
    .select("supplier_id, supplier_tax_id, suppliers(tax_id)")
    .eq("id", voucherId)
    .maybeSingle();
  if (!voucher) return { learned: 0 };
  const supplierId: string | null = voucher.supplier_id ?? null;
  const taxId: string | null =
    (voucher.supplier_tax_id as string | null) ??
    ((voucher as any).suppliers?.tax_id ?? null);

  const { data: lines } = await supabase
    .from("purchase_voucher_lines")
    .select("description, debit_account, line_type")
    .eq("voucher_id", voucherId);
  const rows = ((lines ?? []) as Array<{
    description: string | null;
    debit_account: string | null;
    line_type: string | null;
  }>).filter((l) => (l.description ?? "").trim().length >= 3 && l.debit_account);
  if (!rows.length) return { learned: 0 };

  const { normalizeLineName } = await import("@/lib/ai/classify-line");
  let learned = 0;

  for (const l of rows) {
    const desc = (l.description ?? "").trim();
    const norm = normalizeLineName(desc);
    if (!norm) continue;
    const acc = String(l.debit_account);
    const kindV2 = accountToKindV2(acc);
    if (!kindV2) continue;
    const legacyKind = kindV2ToLegacy(kindV2);

    const { data: existing } = await supabase
      .from("ai_line_classifications")
      .select("id, hit_count")
      .eq("tenant_id", tenantId)
      .eq("line_name_norm", norm)
      .or(taxId ? `supplier_tax_id.eq.${taxId}` : "supplier_tax_id.is.null")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("ai_line_classifications")
        .update({
          kind: legacyKind,
          kind_v2: kindV2,
          account: acc,
          source: "user_override",
          hit_count: (existing.hit_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("ai_line_classifications").insert({
        tenant_id: tenantId,
        supplier_id: supplierId,
        supplier_tax_id: taxId,
        line_name: desc.slice(0, 500),
        line_name_norm: norm,
        kind: legacyKind,
        kind_v2: kindV2,
        account: acc,
        source: "user_override",
        created_by: userId,
      });
    }
    learned += 1;
  }
  return { learned };
}

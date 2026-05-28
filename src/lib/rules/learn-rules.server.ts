// Tự động học quy tắc hạch toán từ các phiếu mua đã ghi sổ.
// Khi một (vendor.tax_id, debit_account) lặp lại ≥ N lần trong 90 ngày
// và chưa có rule active tương ứng, insert một suggestion vào ai_memory_rules.

import { accountLabel } from "./account-presets";

const LEARN_WINDOW_DAYS = 90;
const MIN_REPEAT = 3;

export async function learnRulesFromPurchaseVouchers(
  supabase: any,
  opts: { tenantId: string; userId: string },
): Promise<{ created: number }> {
  const { tenantId } = opts;
  const sinceIso = new Date(Date.now() - LEARN_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

  const { data: vouchers, error: vErr } = await supabase
    .from("purchase_vouchers")
    .select("id, supplier_tax_id, supplier_name")
    .eq("tenant_id", tenantId)
    .eq("status", "posted")
    .gte("voucher_date", sinceIso)
    .not("supplier_tax_id", "is", null)
    .limit(2000);
  if (vErr) {
    console.error("[learnRules] load vouchers failed", vErr.message);
    return { created: 0 };
  }
  if (!vouchers || vouchers.length === 0) return { created: 0 };

  const voucherById = new Map<string, { tax_id: string; name: string }>();
  for (const v of vouchers) {
    if (v.supplier_tax_id) {
      voucherById.set(v.id, { tax_id: v.supplier_tax_id, name: v.supplier_name ?? "" });
    }
  }
  if (voucherById.size === 0) return { created: 0 };

  const { data: lines, error: lErr } = await supabase
    .from("purchase_voucher_lines")
    .select("voucher_id, debit_account")
    .in("voucher_id", Array.from(voucherById.keys()))
    .not("debit_account", "is", null);
  if (lErr) {
    console.error("[learnRules] load lines failed", lErr.message);
    return { created: 0 };
  }

  // Group by (tax_id, debit_account)
  const groups = new Map<string, { tax_id: string; supplier_name: string; account: string; count: number }>();
  for (const l of lines ?? []) {
    const v = voucherById.get(l.voucher_id);
    if (!v) continue;
    const acc = String(l.debit_account).trim();
    if (!acc) continue;
    const key = `${v.tax_id}::${acc}`;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { tax_id: v.tax_id, supplier_name: v.name, account: acc, count: 1 });
  }

  const eligible = Array.from(groups.values()).filter((g) => g.count >= MIN_REPEAT);
  if (eligible.length === 0) return { created: 0 };

  // Load existing rules để dedupe theo (vendor.tax_id, action.book.account_debit)
  const { data: existingRules } = await supabase
    .from("ai_memory_rules")
    .select("conditions, actions, type")
    .eq("tenant_id", tenantId)
    .in("type", ["active", "suggestion"]);

  const existingKeys = new Set<string>();
  for (const r of existingRules ?? []) {
    const taxCond = (r.conditions ?? []).find(
      (c: any) => c.field === "vendor.tax_id" && c.operator === "equals",
    );
    const bookAct = (r.actions ?? []).find((a: any) => a.type === "book");
    if (taxCond && bookAct?.params?.account_debit) {
      existingKeys.add(`${String(taxCond.value).trim()}::${String(bookAct.params.account_debit).trim()}`);
    }
  }

  let created = 0;
  for (const g of eligible) {
    const key = `${g.tax_id}::${g.account}`;
    if (existingKeys.has(key)) continue;
    const supplierLabel = g.supplier_name || `MST ${g.tax_id}`;
    const accLabel = accountLabel(g.account);
    const condId = `c${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const actId = `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const { error: insErr } = await supabase.from("ai_memory_rules").insert({
      tenant_id: tenantId,
      type: "suggestion",
      source: "ai-learned",
      title: `Hạch toán ${accLabel} cho ${supplierLabel}`,
      when_text: `Nhà cung cấp MST ${g.tax_id} (${supplierLabel})`,
      then_text: `Hạch toán Nợ ${accLabel}`,
      origin: `Học từ ${g.count} phiếu đã ghi sổ trong ${LEARN_WINDOW_DAYS} ngày`,
      conditions: [{ id: condId, field: "vendor.tax_id", operator: "equals", value: g.tax_id }],
      actions: [
        {
          id: actId,
          type: "book",
          params: { account_debit: g.account, note: `Học từ ${g.count} phiếu của ${supplierLabel}` },
        },
      ],
      mode: "suggest",
      confidence_threshold: 0.8,
      applies_to: "future",
      enabled: true,
      status: "active",
      schema_version: 2,
    });
    if (insErr) {
      console.error("[learnRules] insert failed", insErr.message);
      continue;
    }
    existingKeys.add(key);
    created += 1;
  }
  return { created };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember } from "@/lib/auth/active-tenant.server";

const normalizeTaxId = (s: string) => (s || "").replace(/\D+/g, "");

// ============ Lookup supplier by tax_id + history-based account suggestion ============
const LookupInput = z.object({ tax_id: z.string().min(1).max(20) });

export const lookupSupplierByTaxId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LookupInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const tax = normalizeTaxId(data.tax_id);
    if (!tax) return { supplier: null, suggestedExpenseAccount: null, suggestedVatRate: null, suggestedPayableAccount: null, duplicates: 0 };

    const { data: matches } = await supabase
      .from("suppliers")
      .select("id, code, name, tax_id, payable_account, default_expense_account, default_vat_rate")
      .eq("tax_id", tax)
      .eq("is_active", true)
      .limit(5);

    const supplier = matches?.[0] ?? null;
    if (!supplier) {
      return { supplier: null, suggestedExpenseAccount: null, suggestedVatRate: null, suggestedPayableAccount: "331", duplicates: 0 };
    }

    // Recent purchase history -> top expense_account
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const { data: history } = await supabase
      .from("invoices")
      .select("expense_account")
      .eq("supplier_id", supplier.id)
      .gte("issue_date", since.toISOString().slice(0, 10))
      .not("expense_account", "is", null)
      .limit(200);

    let topExpense: string | null = supplier.default_expense_account ?? null;
    if (history && history.length) {
      const counts = new Map<string, number>();
      for (const r of history) {
        const k = String((r as any).expense_account || "").trim();
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted.length) topExpense = sorted[0][0];
    }

    return {
      supplier,
      suggestedExpenseAccount: topExpense,
      suggestedVatRate: supplier.default_vat_rate != null ? Number(supplier.default_vat_rate) : null,
      suggestedPayableAccount: supplier.payable_account || "331",
      duplicates: (matches?.length ?? 1) - 1,
    };
  });

// ============ Quick create supplier from invoice header ============
const QuickCreateInput = z.object({
  name: z.string().min(1).max(255),
  tax_id: z.string().min(1).max(20),
  default_expense_account: z.string().max(20).optional().nullable(),
  payable_account: z.string().max(20).optional().nullable(),
});

export const quickCreateSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => QuickCreateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tax = normalizeTaxId(data.tax_id);

    // Tenant
    const { data: prof } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenant_id = prof?.active_tenant_id ?? null;
    if (tenant_id) await assertTenantMember(supabase, userId, tenant_id);

    // Avoid duplicate by tax_id within tenant
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id, code, name, tax_id, payable_account, default_expense_account, default_vat_rate")
      .eq("tax_id", tax)
      .maybeSingle();
    if (existing) return { supplier: existing, created: false };

    const { data: ins, error } = await supabase
      .from("suppliers")
      .insert({
        user_id: userId,
        tenant_id,
        name: data.name.trim(),
        tax_id: tax,
        default_expense_account: data.default_expense_account || null,
        payable_account: data.payable_account || "331",
        is_active: true,
      })
      .select("id, code, name, tax_id, payable_account, default_expense_account, default_vat_rate")
      .single();
    if (error || !ins) throw new Error(error?.message || "Không tạo được nhà cung cấp");
    return { supplier: ins, created: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import type { RuleAction, RuleCondition } from "@/types/rule";
import { accountToKind, type LineKind } from "@/lib/ai/classify-line";

export type GraphRuleRow = {
  id: string;
  type: "suggestion" | "active" | "disabled";
  source: string | null;
  title: string;
  when_text: string;
  then_text: string;
  applied_count: number;
  accuracy_correct: number;
  accuracy_total: number;
  last_used_at: string | null;
  conditions: RuleCondition[] | null;
  actions: RuleAction[] | null;
  schema_version: number | null;
};

export type GraphSupplierRow = {
  id: string;
  name: string;
  tax_id: string | null;
  industry_code: string | null;
  default_expense_account: string | null;
};

export type GraphPartnerRow = {
  id: string;
  party_id: string | null;
  display_name: string;
  default_account: string | null;
  sample_count: number | null;
  confidence: number | null;
};

export type GraphClassificationRow = {
  supplier_id: string | null;
  line_name: string;
  kind: string | null;
  account: string;
  hit_count: number | null;
};

export type GraphItemMappingRow = {
  id: string;
  supplier_id: string;
  product_id: string;
  raw_name: string;
  match_count: number | null;
  product_code: string;
  product_name: string;
  product_unit: string | null;
  item_type: string | null;
  stock_account: string | null;
};

export type SupplierHistoryDist = Partial<Record<LineKind, number>>;

export type GraphDbData = {
  rules: GraphRuleRow[];
  suppliers: GraphSupplierRow[];
  partners: GraphPartnerRow[];
  classifications: GraphClassificationRow[];
  itemMappings: GraphItemMappingRow[];
  supplierHistory: Record<string, SupplierHistoryDist>;
  positions: Record<string, { x: number; y: number }>;
};

export const getMemoryGraphData = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<GraphDbData> => {
    const { supabase, tenantId, userId } = context;
    const [rulesRes, suppliersRes, partnersRes, classRes, mapRes, layoutRes] =
      await Promise.all([
        supabase
          .from("ai_memory_rules")
          .select(
            "id,type,source,title,when_text,then_text,applied_count,accuracy_correct,accuracy_total,last_used_at,conditions,actions,schema_version",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id,name,tax_id,industry_code,default_expense_account")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .limit(200),
        supabase
          .from("ai_memory_partners")
          .select("id,party_id,display_name,default_account,sample_count,confidence")
          .eq("tenant_id", tenantId)
          .limit(200),
        supabase
          .from("ai_line_classifications")
          .select("supplier_id,line_name,kind,account,hit_count")
          .eq("tenant_id", tenantId)
          .order("hit_count", { ascending: false })
          .limit(300),
        supabase
          .from("supplier_item_mappings")
          .select(
            "id, supplier_id, product_id, raw_name, match_count, products!inner(code, name, unit, item_type, stock_account)",
          )
          .eq("tenant_id", tenantId)
          .order("match_count", { ascending: false })
          .limit(500),
        supabase
          .from("ai_memory_graph_layout")
          .select("positions")
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .maybeSingle(),
      ]);

    if (rulesRes.error) throw new Error(rulesRes.error.message);
    if (suppliersRes.error) throw new Error(suppliersRes.error.message);
    if (partnersRes.error) throw new Error(partnersRes.error.message);
    if (classRes.error) throw new Error(classRes.error.message);
    // layoutRes can have null data; ignore not-found
    // mapRes: missing table errors swallowed below

    const itemMappings: GraphItemMappingRow[] = ((mapRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      supplier_id: r.supplier_id,
      product_id: r.product_id,
      raw_name: r.raw_name,
      match_count: r.match_count ?? 1,
      product_code: r.products?.code ?? "",
      product_name: r.products?.name ?? "",
      product_unit: r.products?.unit ?? null,
      item_type: r.products?.item_type ?? null,
      stock_account: r.products?.stock_account ?? null,
    }));

    const suppliers = (suppliersRes.data ?? []) as GraphSupplierRow[];

    // Compute 12-month kind distribution per supplier from invoices.
    // Limit work: only top ~80 suppliers by id presence in invoices.
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const sinceDate = since.toISOString().slice(0, 10);
    const supplierIds = suppliers.map((s) => s.id);
    const supplierHistory: Record<string, SupplierHistoryDist> = {};
    if (supplierIds.length > 0) {
      const [invRes, pvRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("supplier_id, expense_account, total")
          .eq("tenant_id", tenantId)
          .in("supplier_id", supplierIds)
          .gte("issue_date", sinceDate)
          .neq("status", "void")
          .not("expense_account", "is", null)
          .limit(2000),
        supabase
          .from("purchase_voucher_lines")
          .select(
            "amount, debit_account, purchase_vouchers!inner(supplier_id, tenant_id, voucher_date, status)",
          )
          .eq("purchase_vouchers.tenant_id", tenantId)
          .in("purchase_vouchers.supplier_id", supplierIds)
          .eq("purchase_vouchers.status", "posted")
          .gte("purchase_vouchers.voucher_date", sinceDate)
          .not("debit_account", "is", null)
          .limit(5000),
      ]);
      for (const r of (invRes.data ?? []) as Array<{
        supplier_id: string | null;
        expense_account: string | null;
        total: number | null;
      }>) {
        if (!r.supplier_id) continue;
        const kind = accountToKind(r.expense_account);
        if (!kind) continue;
        const w = Math.max(1, Math.round(Number(r.total) || 0));
        const dist = supplierHistory[r.supplier_id] ?? {};
        dist[kind] = (dist[kind] ?? 0) + w;
        supplierHistory[r.supplier_id] = dist;
      }
      for (const r of (pvRes.data ?? []) as Array<{
        amount: number | null;
        debit_account: string | null;
        purchase_vouchers: { supplier_id: string | null } | null;
      }>) {
        const sid = r.purchase_vouchers?.supplier_id;
        if (!sid) continue;
        const kind = accountToKind(r.debit_account);
        if (!kind) continue;
        const w = Math.max(1, Math.round(Number(r.amount) || 0));
        const dist = supplierHistory[sid] ?? {};
        dist[kind] = (dist[kind] ?? 0) + w;
        supplierHistory[sid] = dist;
      }
    }

    return {
      rules: (rulesRes.data ?? []) as GraphRuleRow[],
      suppliers,
      partners: (partnersRes.data ?? []) as GraphPartnerRow[],
      classifications: (classRes.data ?? []) as GraphClassificationRow[],
      itemMappings,
      supplierHistory,
      positions:
        (layoutRes.data?.positions as Record<string, { x: number; y: number }>) ??
        {},
    };
  });

const positionSchema = z.record(
  z.string().min(1).max(120),
  z.object({ x: z.number(), y: z.number() }),
);

export const saveGraphLayout = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ positions: positionSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { error } = await supabase
      .from("ai_memory_graph_layout")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          positions: data.positions,
        },
        { onConflict: "user_id,tenant_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

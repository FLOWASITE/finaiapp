import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

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

export type GraphDbData = {
  rules: GraphRuleRow[];
  suppliers: GraphSupplierRow[];
  partners: GraphPartnerRow[];
  classifications: GraphClassificationRow[];
  positions: Record<string, { x: number; y: number }>;
};

export const getMemoryGraphData = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<GraphDbData> => {
    const { supabase, tenantId, userId } = context;
    const [rulesRes, suppliersRes, partnersRes, classRes, layoutRes] =
      await Promise.all([
        supabase
          .from("ai_memory_rules")
          .select(
            "id,type,source,title,when_text,then_text,applied_count,accuracy_correct,accuracy_total,last_used_at",
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

    return {
      rules: (rulesRes.data ?? []) as GraphRuleRow[],
      suppliers: (suppliersRes.data ?? []) as GraphSupplierRow[],
      partners: (partnersRes.data ?? []) as GraphPartnerRow[],
      classifications: (classRes.data ?? []) as GraphClassificationRow[],
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

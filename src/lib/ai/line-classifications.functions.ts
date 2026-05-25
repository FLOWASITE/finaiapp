import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeLineName } from "@/lib/ai/classify-line";

async function activeTenant(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.active_tenant_id ?? null;
}

const KindEnum = z.enum(["goods", "fixed_asset", "ccdc", "service"]);
const KindV2Enum = z.enum([
  "goods_for_resale",
  "raw_material",
  "tools",
  "prepaid",
  "fixed_asset_tangible",
  "fixed_asset_intangible",
  "service",
]);

const SaveInput = z.object({
  supplier_tax_id: z.string().min(1).max(20).nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  line_name: z.string().min(1).max(500),
  kind: KindEnum,
  kind_v2: KindV2Enum.nullable().optional(),
  account: z.string().min(2).max(16),
});

/** User xác nhận / sửa phân loại — ghi nhớ để dùng lại lần sau. */
export const saveLineClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const norm = normalizeLineName(data.line_name);
    if (!norm) throw new Error("Tên mặt hàng không hợp lệ");
    const taxId = data.supplier_tax_id ?? null;

    // Derive kind_v2 if not provided — dùng business_types để chọn nhánh hợp lý
    let kindV2: string | null = data.kind_v2 ?? null;
    if (!kindV2) {
      const { data: t } = await supabase
        .from("tenants")
        .select("business_types")
        .eq("id", tenantId)
        .maybeSingle();
      const { legacyKindToV2 } = await import("@/lib/ai/classify-line-v2");
      kindV2 = legacyKindToV2(data.kind, (t?.business_types as any) ?? []);
    }

    // Upsert: tìm bản ghi đã có theo (tenant, tax_id, name_norm)
    const { data: existing } = await supabase
      .from("ai_line_classifications")
      .select("id, hit_count")
      .eq("tenant_id", tenantId)
      .eq("line_name_norm", norm)
      .or(taxId ? `supplier_tax_id.eq.${taxId}` : "supplier_tax_id.is.null")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("ai_line_classifications")
        .update({
          kind: data.kind,
          kind_v2: kindV2,
          account: data.account,
          source: "user_override",
          hit_count: (existing.hit_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, updated: true };
    }

    const { data: row, error } = await supabase
      .from("ai_line_classifications")
      .insert({
        tenant_id: tenantId,
        supplier_id: data.supplier_id ?? null,
        supplier_tax_id: taxId,
        line_name: data.line_name,
        line_name_norm: norm,
        kind: data.kind,
        account: data.account,
        source: "user_override",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Học phân loại "${data.line_name.slice(0, 80)}" → ${data.account}`,
        result: "success",
        metadata: { kind: data.kind, account: data.account },
      });
    } catch {}
    return { id: row!.id, updated: false };
  });

const LookupInput = z.object({
  supplier_tax_id: z.string().max(20).nullable().optional(),
  line_names: z.array(z.string().min(1).max(500)).min(1).max(50),
});

/** Tra cứu phân loại đã ghi nhớ cho 1 lô dòng — trả map theo tên đã chuẩn hóa. */
export const lookupLineClassifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LookupInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { matches: {} as Record<string, { kind: string; account: string; hit_count: number }> };

    const norms = Array.from(new Set(data.line_names.map((n) => normalizeLineName(n)).filter(Boolean)));
    if (norms.length === 0) return { matches: {} };

    let q = supabase
      .from("ai_line_classifications")
      .select("line_name_norm, kind, account, hit_count, supplier_tax_id")
      .eq("tenant_id", tenantId)
      .in("line_name_norm", norms);

    const { data: rows } = await q;
    const map: Record<string, { kind: string; account: string; hit_count: number }> = {};
    const taxId = data.supplier_tax_id ?? null;
    for (const r of (rows ?? []) as any[]) {
      // Ưu tiên record cùng NCC, sau đó record không phân biệt NCC
      const existing = map[r.line_name_norm];
      const sameVendor = taxId && r.supplier_tax_id === taxId;
      if (!existing || sameVendor) {
        map[r.line_name_norm] = { kind: r.kind, account: r.account, hit_count: r.hit_count };
      }
    }
    return { matches: map };
  });

// ============ Management: list / update / delete ============

export type LineClassificationRow = {
  id: string;
  supplier_id: string | null;
  supplier_tax_id: string | null;
  supplier_name: string | null;
  line_name: string;
  line_name_norm: string;
  kind: "goods" | "fixed_asset" | "ccdc" | "service";
  account: string;
  source: "rule" | "user_override" | "ai";
  hit_count: number;
  last_used_at: string;
  created_at: string;
  updated_at: string;
};

const ListInput = z.object({
  search: z.string().trim().max(200).optional(),
  kind: KindEnum.optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const listLineClassifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i ?? {}))
  .handler(async ({ data, context }): Promise<LineClassificationRow[]> => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return [];

    let q = supabase
      .from("ai_line_classifications")
      .select(
        "id, supplier_id, supplier_tax_id, line_name, line_name_norm, kind, account, source, hit_count, last_used_at, created_at, updated_at",
      )
      .eq("tenant_id", tenantId)
      .order("last_used_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.kind) q = q.eq("kind", data.kind);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.ilike("line_name", `%${s}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Tra cứu tên NCC (không có FK nên query riêng)
    const supplierIds = Array.from(
      new Set(((rows ?? []) as any[]).map((r) => r.supplier_id).filter(Boolean)),
    );
    const supplierMap: Record<string, string> = {};
    if (supplierIds.length > 0) {
      const { data: sups } = await supabase
        .from("suppliers")
        .select("id, name")
        .in("id", supplierIds);
      for (const s of (sups ?? []) as any[]) supplierMap[s.id] = s.name;
    }

    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_tax_id: r.supplier_tax_id,
      supplier_name: r.supplier_id ? supplierMap[r.supplier_id] ?? null : null,
      line_name: r.line_name,
      line_name_norm: r.line_name_norm,
      kind: r.kind,
      account: r.account,
      source: r.source,
      hit_count: r.hit_count,
      last_used_at: r.last_used_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  kind: KindEnum.optional(),
  account: z.string().min(2).max(16).optional(),
});

export const updateLineClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const patch: Record<string, any> = { source: "user_override" };
    if (data.kind) patch.kind = data.kind;
    if (data.account) patch.account = data.account;
    const { error } = await supabase
      .from("ai_line_classifications")
      .update(patch)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLineClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const { error } = await supabase
      .from("ai_line_classifications")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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

const SaveInput = z.object({
  supplier_tax_id: z.string().min(1).max(20).nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  line_name: z.string().min(1).max(500),
  kind: KindEnum,
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

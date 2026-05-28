/**
 * Global supplier registry — chia sẻ DANH TÍNH NCC giữa các tenant.
 * KHÔNG share cách hạch toán, default account, hay bất kỳ dữ liệu tài chính nào.
 * Chỉ chia sẻ: tax_id → display_name + industry_code/name.
 *
 * Pseudonymity: registry SELECT cho authenticated, contributions chỉ
 * service_role đọc — không tenant nào biết tenant khác đã contribute gì.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const TAX_ID_RE = /^\d{10}(-\d{3})?$/;

export type GlobalSupplierIdentity = {
  tax_id: string;
  display_name: string | null;
  industry_code: string | null;
  industry_name: string | null;
  confidence: number;
  contributor_count: number;
};

export async function lookupGlobalSupplier(
  supabase: SupabaseClient,
  taxId: string,
): Promise<GlobalSupplierIdentity | null> {
  const tid = (taxId ?? "").trim();
  if (!TAX_ID_RE.test(tid)) return null;
  const { data, error } = await supabase
    .from("global_supplier_registry")
    .select(
      "tax_id, display_name, industry_code, industry_name, confidence, contributor_count",
    )
    .eq("tax_id", tid)
    .maybeSingle();
  if (error || !data) return null;
  return data as GlobalSupplierIdentity;
}

/**
 * Ghi nhận đóng góp (1 hàng / tax_id / tenant). Idempotent.
 * Sau đó cập nhật registry bằng mode (giá trị phổ biến nhất).
 *
 * Chỉ kích hoạt khi `taxId` hợp lệ và `displayName` không rỗng.
 */
export async function contributeGlobalSupplier(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    taxId: string;
    displayName: string | null;
    industryCode: string | null;
  },
): Promise<void> {
  const tid = (args.taxId ?? "").trim();
  if (!TAX_ID_RE.test(tid)) return;
  if (!args.displayName?.trim()) return;

  try {
    // 1) Upsert contribution (UNIQUE (tax_id, tenant_id) → no duplicates)
    await supabase
      .from("global_supplier_contributions")
      .upsert(
        {
          tax_id: tid,
          tenant_id: args.tenantId,
          display_name: args.displayName.trim().slice(0, 200),
          industry_code: args.industryCode?.trim() || null,
        },
        { onConflict: "tax_id,tenant_id" },
      );

    // 2) Recompute mode across contributions for this tax_id.
    //    Chỉ aggregate khi có ≥ 2 contributor để đảm bảo ẩn danh.
    const { data: rows } = await supabase
      .from("global_supplier_contributions")
      .select("display_name, industry_code, tenant_id")
      .eq("tax_id", tid);
    const list = (rows ?? []) as Array<{
      display_name: string | null;
      industry_code: string | null;
      tenant_id: string;
    }>;
    const uniqueContributors = new Set(list.map((r) => r.tenant_id)).size;
    if (uniqueContributors < 2) return;

    const mode = <T,>(items: (T | null | undefined)[]): T | null => {
      const counts = new Map<T, number>();
      for (const it of items) {
        if (it === null || it === undefined) continue;
        counts.set(it, (counts.get(it) ?? 0) + 1);
      }
      let bestKey: T | null = null;
      let bestN = 0;
      for (const [k, n] of counts) if (n > bestN) ((bestKey = k), (bestN = n));
      return bestKey;
    };

    const bestName = mode(list.map((r) => r.display_name));
    const bestIndustry = mode(list.map((r) => r.industry_code));
    const total = list.length;
    const dominantCount = bestName
      ? list.filter((r) => r.display_name === bestName).length
      : 0;
    const confidence = total > 0 ? dominantCount / total : 0;

    await supabase
      .from("global_supplier_registry")
      .upsert(
        {
          tax_id: tid,
          display_name: bestName,
          industry_code: bestIndustry,
          industry_name: null, // Tên ngành tra cứu riêng (VSIC) — không bắt buộc
          confidence,
          contributor_count: uniqueContributors,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "tax_id" },
      );
  } catch (e) {
    // Registry là enhancement, không được block luồng tạo NCC.
    console.warn("global_supplier contribute failed", e);
  }
}

/**
 * Shared helpers for resolving (and authorizing) the caller's active tenant.
 *
 * Pattern dùng chung cho mọi server function:
 *  - đọc `profiles.active_tenant_id` của user
 *  - XÁC THỰC user là thành viên `active` của tenant đó (tenant_members)
 *
 * RLS là backstop; đây là gate chính ở tầng app — chặn trường hợp
 * `profile.active_tenant_id` bị set sang tenant khác mà user không có quyền.
 */

export type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Trả về tenantId nếu user có quyền; trả về `null` nếu chưa chọn tenant
 * hoặc user không phải thành viên active.
 *
 * Dùng cho code path muốn xử lý "no tenant" mà không throw.
 */
export async function resolveActiveTenantId(
  supabase: SupabaseLike,
  userId: string,
): Promise<string | null> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = (prof?.active_tenant_id as string | null) ?? null;
  if (!tenantId) return null;

  const { data: member, error } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) return null;
  return tenantId;
}

/**
 * Giống `resolveActiveTenantId` nhưng throw nếu chưa chọn tenant
 * hoặc user không có quyền.
 */
export async function requireActiveTenantId(
  supabase: SupabaseLike,
  userId: string,
): Promise<string> {
  const tenantId = await resolveActiveTenantId(supabase, userId);
  if (!tenantId) {
    throw new Error("Không có quyền truy cập doanh nghiệp này");
  }
  return tenantId;
}

/**
 * Khi tenantId đã có sẵn (vd: từ input của client), assert user là
 * thành viên active. Throw nếu không.
 */
export async function assertTenantMember(
  supabase: SupabaseLike,
  userId: string,
  tenantId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Không có quyền truy cập doanh nghiệp này");
}

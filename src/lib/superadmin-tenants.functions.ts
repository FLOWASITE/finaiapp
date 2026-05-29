import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =========================================================================
// Helpers
// =========================================================================

async function assertSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "superadmin");
  if (!ok) throw new Error("Cần quyền Super-admin để thực hiện thao tác này.");
}

async function logAction(
  actorId: string,
  action: string,
  target?: { table?: string; id?: string | null; tenant_id?: string | null; before?: any; after?: any },
) {
  try {
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("email").eq("id", actorId).maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      actor_email: prof?.email ?? null,
      action,
      table_name: target?.table ?? null,
      record_id: target?.id ?? null,
      tenant_id: target?.tenant_id ?? null,
      before: target?.before ?? null,
      after: target?.after ?? null,
    } as any);
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

const TENANT_ROLE = z.enum(["owner", "admin", "accountant", "viewer"]);
/**
 * Quét toàn bộ auth.users theo từng trang để tìm user bằng email (case-insensitive).
 * supabase-js auth.admin.listUsers không hỗ trợ filter email trực tiếp, nên phải duyệt.
 * Giới hạn 50 trang × 200 = 10,000 user — đủ cho hầu hết instance.
 */
async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string | null } | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const found = users.find((u: any) => (u.email ?? "").toLowerCase() === target);
    if (found) return { id: found.id, email: found.email ?? null };
    if (users.length < 200) break;
  }
  return null;
}


async function getUserEmailsMap(userIds: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return m;
  // Try profiles first (cheap, no auth admin call).
  const { data: profs } = await supabaseAdmin
    .from("profiles").select("id, email").in("id", unique);
  for (const p of profs ?? []) m.set(p.id, (p as any).email ?? null);
  const missing = unique.filter((id) => !m.has(id) || !m.get(id));
  for (const id of missing) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      m.set(id, data?.user?.email ?? null);
    } catch {
      m.set(id, null);
    }
  }
  return m;
}

// =========================================================================
// LIST
// =========================================================================

export const listTenantsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      q: z.string().max(120).optional(),
      status: z.enum(["all", "active", "suspended", "archived"]).optional(),
      plan: z.string().max(40).optional(),
      accounting_standard: z.enum(["all", "TT133", "TT99"]).optional(),
      idle_only: z.boolean().optional(),
      page: z.number().int().min(1).max(10000).optional(),
      page_size: z.number().int().min(10).max(200).optional(),
      sort_by: z.enum(["name", "company_name", "created_at", "members_count", "last_activity_at"]).optional(),
      sort_dir: z.enum(["asc", "desc"]).optional(),
    }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const page = data.page ?? 1;
    const pageSize = data.page_size ?? 50;
    const sortBy = data.sort_by ?? "created_at";
    const sortDir = data.sort_dir ?? "desc";

    // Bước 1: lọc tenants theo status / accounting_standard / search ở SQL.
    let q = supabaseAdmin
      .from("tenants")
      .select(
        "id, name, company_name, tax_id, accounting_standard, status, suspended_at, suspended_reason, owner_user_id, created_at",
        { count: "exact" },
      );
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.accounting_standard && data.accounting_standard !== "all") {
      q = q.eq("accounting_standard", data.accounting_standard);
    }
    if (data.q?.trim()) {
      const term = data.q.trim().replace(/[%]/g, "");
      q = q.or(`name.ilike.%${term}%,company_name.ilike.%${term}%,tax_id.ilike.%${term}%`);
    }

    const { data: allTenants, error, count } = await q.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tids = (allTenants ?? []).map((t: any) => t.id);
    const ownerIds = (allTenants ?? []).map((t: any) => t.owner_user_id).filter(Boolean);

    const [plansRes, membersRes, lastAuditRes, emails] = await Promise.all([
      supabaseAdmin.from("tenant_plans").select("tenant_id, plan, seats_limit").in("tenant_id", tids),
      supabaseAdmin.from("tenant_members").select("tenant_id, status").in("tenant_id", tids),
      supabaseAdmin
        .from("audit_logs")
        .select("tenant_id, created_at")
        .in("tenant_id", tids)
        .order("created_at", { ascending: false })
        .limit(5000),
      getUserEmailsMap(ownerIds),
    ]);

    const planMap = new Map<string, { plan: string; seats_limit: number | null }>();
    for (const r of plansRes.data ?? []) {
      planMap.set((r as any).tenant_id, { plan: (r as any).plan, seats_limit: (r as any).seats_limit });
    }
    const memberCount = new Map<string, number>();
    for (const m of membersRes.data ?? []) {
      const tid = (m as any).tenant_id;
      memberCount.set(tid, (memberCount.get(tid) ?? 0) + 1);
    }
    const lastActivity = new Map<string, string>();
    for (const a of lastAuditRes.data ?? []) {
      const tid = (a as any).tenant_id;
      if (!lastActivity.has(tid)) lastActivity.set(tid, (a as any).created_at);
    }

    let enriched = (allTenants ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      company_name: t.company_name,
      tax_id: t.tax_id,
      accounting_standard: t.accounting_standard,
      status: t.status ?? "active",
      suspended_at: t.suspended_at,
      suspended_reason: t.suspended_reason,
      owner_user_id: t.owner_user_id,
      owner_email: emails.get(t.owner_user_id) ?? null,
      plan: planMap.get(t.id)?.plan ?? "free",
      seats_limit: planMap.get(t.id)?.seats_limit ?? null,
      members_count: memberCount.get(t.id) ?? 0,
      last_activity_at: lastActivity.get(t.id) ?? null,
      created_at: t.created_at,
    }));

    // Lọc owner_email & idle ở RAM (do dữ liệu enrich đến từ nhiều nguồn).
    if (data.q?.trim()) {
      const term = data.q.trim().toLowerCase();
      enriched = enriched.filter((t) => {
        const hay = `${t.name ?? ""} ${t.company_name ?? ""} ${t.tax_id ?? ""} ${t.owner_email ?? ""}`.toLowerCase();
        return hay.includes(term);
      });
    }
    if (data.plan) enriched = enriched.filter((t) => t.plan === data.plan);
    if (data.idle_only) {
      enriched = enriched.filter((t) => {
        const days = t.last_activity_at
          ? Math.floor((Date.now() - new Date(t.last_activity_at).getTime()) / 86400000)
          : 999;
        return days > 90;
      });
    }

    // Sort
    enriched.sort((a: any, b: any) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const dir = sortDir === "asc" ? 1 : -1;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    const totalFiltered = enriched.length;
    const from = (page - 1) * pageSize;
    const tenants = enriched.slice(from, from + pageSize);

    return {
      tenants,
      page,
      page_size: pageSize,
      total: totalFiltered,
      total_unfiltered: count ?? allTenants?.length ?? 0,
    };
  });

// =========================================================================
// DETAIL
// =========================================================================

export const getTenantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const ym = new Date().toISOString().slice(0, 7);

    const [tenantRes, membersRes, planRes, usageRes, auditRes, locksRes] = await Promise.all([
      supabaseAdmin.from("tenants").select("*").eq("id", data.tenant_id).maybeSingle(),
      supabaseAdmin.from("tenant_members")
        .select("id, user_id, role, status, created_at")
        .eq("tenant_id", data.tenant_id)
        .order("created_at"),
      supabaseAdmin.from("tenant_plans").select("*").eq("tenant_id", data.tenant_id).maybeSingle(),
      supabaseAdmin.from("tenant_usage").select("*").eq("tenant_id", data.tenant_id).eq("period_ym", ym).maybeSingle(),
      supabaseAdmin.from("audit_logs")
        .select("id, action, table_name, record_id, actor_email, created_at, before, after")
        .eq("tenant_id", data.tenant_id)
        .order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("fiscal_periods")
        .select("id, year, period_no, status, closed_at, note")
        .eq("tenant_id", data.tenant_id)
        .in("status", ["soft_closed", "closed"])
        .order("year", { ascending: false }).order("period_no", { ascending: false }),
    ]);

    if (!tenantRes.data) throw new Error("Không tìm thấy tenant.");

    const userIds = [
      tenantRes.data.owner_user_id,
      ...((membersRes.data ?? []).map((m: any) => m.user_id) as string[]),
    ].filter(Boolean) as string[];
    const emails = await getUserEmailsMap(userIds);

    return {
      tenant: tenantRes.data,
      owner_email: emails.get(tenantRes.data.owner_user_id) ?? null,
      members: (membersRes.data ?? []).map((m: any) => ({
        ...m, email: emails.get(m.user_id) ?? null,
      })),
      plan: planRes.data ?? null,
      usage: usageRes.data ?? null,
      recent_audit: auditRes.data ?? [],
      locks: locksRes.data ?? [],
    };
  });

// =========================================================================
// UPDATE METADATA
// =========================================================================

export const updateTenantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      patch: z.object({
        name: z.string().min(1).max(255).optional(),
        company_name: z.string().max(255).nullable().optional(),
        tax_id: z.string().max(50).nullable().optional(),
        address: z.string().max(500).nullable().optional(),
        phone: z.string().max(50).nullable().optional(),
        email: z.string().max(255).nullable().optional(),
        website: z.string().max(255).nullable().optional(),
        accounting_standard: z.enum(["TT133", "TT99"]).optional(),
        base_currency: z.string().min(3).max(10).optional(),
        fiscal_year_start: z.number().int().min(1).max(12).optional(),
        legal_rep_name: z.string().max(255).nullable().optional(),
        legal_rep_title: z.string().max(120).nullable().optional(),
        chief_accountant_name: z.string().max(255).nullable().optional(),
        preparer_name: z.string().max(255).nullable().optional(),
        logo_url: z.string().max(500).nullable().optional(),
        tax_method: z.string().max(40).nullable().optional(),
        vat_period: z.string().max(40).nullable().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: before } = await supabaseAdmin
      .from("tenants").select("*").eq("id", data.tenant_id).maybeSingle();
    const { error } = await supabaseAdmin
      .from("tenants").update(data.patch).eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "superadmin.tenant.update", {
      table: "tenants", id: data.tenant_id, tenant_id: data.tenant_id,
      before, after: data.patch,
    });
    return { ok: true };
  });

// =========================================================================
// MEMBERS
// =========================================================================

export const addTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      email: z.string().email(),
      role: TENANT_ROLE,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    // Find existing auth user by email across ALL pages (not just first 200).
    let userId: string | null = null;
    const existing = await findAuthUserByEmail(data.email);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (error) throw new Error(error.message);
      userId = invited?.user?.id ?? null;
    }
    if (!userId) throw new Error("Không xác định được người dùng.");

    // Quota guard: tenant_plans.seats_limit
    const { data: plan } = await supabaseAdmin
      .from("tenant_plans").select("seats_limit").eq("tenant_id", data.tenant_id).maybeSingle();
    const limit = (plan as any)?.seats_limit as number | null | undefined;
    if (limit != null && limit > 0) {
      const { data: existingMember } = await supabaseAdmin
        .from("tenant_members")
        .select("id").eq("tenant_id", data.tenant_id).eq("user_id", userId).maybeSingle();
      if (!existingMember) {
        const { count } = await supabaseAdmin
          .from("tenant_members")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", data.tenant_id)
          .in("status", ["active", "invited"] as any);
        if ((count ?? 0) >= limit) {
          throw new Error(`Đã chạm giới hạn ${limit} thành viên của gói. Hãy nâng cấp trước khi thêm.`);
        }
      }
    }

    const { error: insErr } = await supabaseAdmin.from("tenant_members").insert({
      tenant_id: data.tenant_id,
      user_id: userId,
      role: data.role as any,
      status: "active" as any,
    } as any);
    if (insErr && !insErr.message.includes("duplicate")) throw new Error(insErr.message);

    await logAction(context.userId, "superadmin.tenant.member_add", {
      table: "tenant_members", tenant_id: data.tenant_id,
      after: { user_id: userId, email: data.email, role: data.role },
    });
    return { ok: true, user_id: userId };
  });

export const removeTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ member_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: m } = await supabaseAdmin
      .from("tenant_members").select("*").eq("id", data.member_id).maybeSingle();
    if (!m) throw new Error("Không tìm thấy thành viên.");

    if ((m as any).role === "owner") {
      const { count } = await supabaseAdmin
        .from("tenant_members")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", (m as any).tenant_id)
        .eq("role", "owner" as any);
      if ((count ?? 0) <= 1) throw new Error("Không thể xóa chủ sở hữu cuối cùng.");
    }

    const { error } = await supabaseAdmin.from("tenant_members").delete().eq("id", data.member_id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "superadmin.tenant.member_remove", {
      table: "tenant_members", id: data.member_id, tenant_id: (m as any).tenant_id, before: m,
    });
    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ member_id: z.string().uuid(), role: TENANT_ROLE }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: m } = await supabaseAdmin
      .from("tenant_members").select("*").eq("id", data.member_id).maybeSingle();
    if (!m) throw new Error("Không tìm thấy thành viên.");

    if ((m as any).role === "owner" && data.role !== "owner") {
      const { count } = await supabaseAdmin
        .from("tenant_members")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", (m as any).tenant_id)
        .eq("role", "owner" as any);
      if ((count ?? 0) <= 1) throw new Error("Không thể hạ cấp chủ sở hữu cuối cùng.");
    }

    const { error } = await supabaseAdmin
      .from("tenant_members").update({ role: data.role as any }).eq("id", data.member_id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "superadmin.tenant.member_role", {
      table: "tenant_members", id: data.member_id, tenant_id: (m as any).tenant_id,
      before: { role: (m as any).role }, after: { role: data.role },
    });
    return { ok: true };
  });

export const transferTenantOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      new_owner_user_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const { data: tenant } = await supabaseAdmin
      .from("tenants").select("owner_user_id").eq("id", data.tenant_id).maybeSingle();
    if (!tenant) throw new Error("Không tìm thấy tenant.");
    const oldOwner = (tenant as any).owner_user_id as string | null;

    // Ensure target is already a member; if not, add as owner.
    const { data: existing } = await supabaseAdmin
      .from("tenant_members")
      .select("id, role")
      .eq("tenant_id", data.tenant_id)
      .eq("user_id", data.new_owner_user_id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from("tenant_members")
        .update({ role: "owner" as any, status: "active" as any })
        .eq("id", (existing as any).id);
    } else {
      const { error } = await supabaseAdmin.from("tenant_members").insert({
        tenant_id: data.tenant_id,
        user_id: data.new_owner_user_id,
        role: "owner" as any,
        status: "active" as any,
      } as any);
      if (error) throw new Error(error.message);
    }

    // Update tenants.owner_user_id
    const { error: uErr } = await supabaseAdmin
      .from("tenants").update({ owner_user_id: data.new_owner_user_id }).eq("id", data.tenant_id);
    if (uErr) throw new Error(uErr.message);

    // Demote old owner to admin (if still a member and not the same person)
    if (oldOwner && oldOwner !== data.new_owner_user_id) {
      await supabaseAdmin.from("tenant_members")
        .update({ role: "admin" as any })
        .eq("tenant_id", data.tenant_id)
        .eq("user_id", oldOwner);
    }

    await logAction(context.userId, "superadmin.tenant.transfer_ownership", {
      table: "tenants", id: data.tenant_id, tenant_id: data.tenant_id,
      before: { owner_user_id: oldOwner },
      after: { owner_user_id: data.new_owner_user_id },
    });
    return { ok: true };
  });

// =========================================================================
// =========================================================================
// BULK ACTIONS
// =========================================================================

export const bulkSetTenantsSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_ids: z.array(z.string().uuid()).min(1).max(500),
      suspended: z.boolean(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const patch = data.suspended
      ? {
          status: "suspended",
          suspended_at: new Date().toISOString(),
          suspended_reason: data.reason ?? null,
        }
      : { status: "active", suspended_at: null, suspended_reason: null };

    const { error } = await supabaseAdmin
      .from("tenants")
      .update(patch as any)
      .in("id", data.tenant_ids);
    if (error) throw new Error(error.message);

    // Ghi audit theo từng tenant để dễ truy vết về sau.
    const action = data.suspended
      ? "superadmin.tenant.bulk_suspend"
      : "superadmin.tenant.bulk_unsuspend";
    await Promise.all(
      data.tenant_ids.map((tid) =>
        logAction(context.userId, action, {
          table: "tenants",
          id: tid,
          tenant_id: tid,
          after: { reason: data.reason ?? null },
        }),
      ),
    );

    return { ok: true, count: data.tenant_ids.length };
  });

// =========================================================================
// AUDIT (lazy tab)
// =========================================================================

export const getTenantAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      limit: z.number().int().min(1).max(500).optional(),
      before: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const limit = data.limit ?? 100;

    let q = supabaseAdmin
      .from("audit_logs")
      .select("id, action, table_name, record_id, actor_email, created_at, before, after")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.before) q = q.lt("created_at", data.before);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const next = rows && rows.length === limit ? rows[rows.length - 1].created_at : null;
    return { items: rows ?? [], next_before: next };
  });

// =========================================================================
// IMPERSONATION
// =========================================================================
//
// Cho phép Super-admin đăng nhập tạm thời với tư cách user khác (thường là
// owner của tenant) để debug hoặc hỗ trợ. Cách triển khai:
//   1. Validate target user tồn tại và có liên kết với tenant (nếu có truyền tenant_id).
//   2. Sinh magic link 1 lần qua `auth.admin.generateLink`.
//   3. Audit log đầy đủ `actor → target → tenant`.
// Trên client, super-admin click link sẽ được đăng nhập trong tab mới với
// session của target user. Phiên cũ của super-admin không bị mất nếu mở tab
// riêng (incognito/profile khác).

export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      user_id: z.string().uuid(),
      tenant_id: z.string().uuid().optional(),
      reason: z.string().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    if (data.user_id === context.userId) {
      throw new Error("Không cần giả mạo chính mình.");
    }

    const { data: u, error: ue } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (ue) throw new Error(ue.message);
    if (!u?.user?.email) throw new Error("User không có email — không thể tạo magic link.");
    if ((u.user as any).banned_until && new Date((u.user as any).banned_until).getTime() > Date.now()) {
      throw new Error("Tài khoản đang bị khóa, không thể giả mạo.");
    }

    if (data.tenant_id) {
      const { data: m } = await supabaseAdmin
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", data.tenant_id)
        .eq("user_id", data.user_id)
        .maybeSingle();
      if (!m) throw new Error("User không thuộc tenant này.");
    }

    const { data: link, error: le } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: u.user.email,
    } as any);
    if (le) throw new Error(le.message);
    const actionLink: string | undefined = (link as any)?.properties?.action_link;
    if (!actionLink) throw new Error("Không tạo được liên kết đăng nhập.");

    await logAction(context.userId, "superadmin.impersonate", {
      table: "auth.users",
      id: data.user_id,
      tenant_id: data.tenant_id ?? null,
      after: {
        target_email: u.user.email,
        reason: data.reason,
        // Lưu prefix link (bỏ token) để truy vết mà không leak token.
        link_prefix: actionLink.split("?")[0],
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    return {
      ok: true,
      target_user_id: data.user_id,
      target_email: u.user.email,
      action_link: actionLink,
      expires_in_minutes: 60,
    };
  });

export const impersonateTenantOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: t } = await supabaseAdmin
      .from("tenants").select("owner_user_id, name").eq("id", data.tenant_id).maybeSingle();
    if (!t) throw new Error("Không tìm thấy tenant.");
    if (!(t as any).owner_user_id) throw new Error("Tenant không có owner.");

    const { data: u, error: ue } = await supabaseAdmin.auth.admin.getUserById(
      (t as any).owner_user_id,
    );
    if (ue) throw new Error(ue.message);
    const email = u?.user?.email;
    if (!email) throw new Error("Owner không có email.");

    const { data: link, error: le } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    } as any);
    if (le) throw new Error(le.message);
    const actionLink: string | undefined = (link as any)?.properties?.action_link;
    if (!actionLink) throw new Error("Không tạo được liên kết đăng nhập.");

    await logAction(context.userId, "superadmin.impersonate_owner", {
      table: "tenants",
      id: data.tenant_id,
      tenant_id: data.tenant_id,
      after: {
        target_user_id: (t as any).owner_user_id,
        target_email: email,
        tenant_name: (t as any).name,
        reason: data.reason,
        link_prefix: actionLink.split("?")[0],
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    return {
      ok: true,
      target_user_id: (t as any).owner_user_id,
      target_email: email,
      tenant_name: (t as any).name,
      action_link: actionLink,
      expires_in_minutes: 60,
    };
  });

// =========================================================================
// INVITATIONS (resend / cancel)
// =========================================================================

/** Gửi lại email mời cho thành viên đang ở status `invited`. */
export const resendTenantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ member_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: m } = await supabaseAdmin
      .from("tenant_members").select("*").eq("id", data.member_id).maybeSingle();
    if (!m) throw new Error("Không tìm thấy thành viên.");
    if ((m as any).status !== "invited") {
      throw new Error("Chỉ gửi lại được lời mời chưa kích hoạt.");
    }
    const { data: u } = await supabaseAdmin.auth.admin.getUserById((m as any).user_id);
    const email = u?.user?.email;
    if (!email) throw new Error("Không tìm thấy email user.");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "superadmin.tenant.invite_resend", {
      table: "tenant_members", id: data.member_id, tenant_id: (m as any).tenant_id,
      after: { email },
    });
    return { ok: true };
  });

/** Hủy lời mời (xóa membership đang invited). */
export const cancelTenantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ member_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: m } = await supabaseAdmin
      .from("tenant_members").select("*").eq("id", data.member_id).maybeSingle();
    if (!m) throw new Error("Không tìm thấy thành viên.");
    if ((m as any).status !== "invited") {
      throw new Error("Chỉ hủy được lời mời chưa kích hoạt.");
    }
    const { error } = await supabaseAdmin
      .from("tenant_members").delete().eq("id", data.member_id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "superadmin.tenant.invite_cancel", {
      table: "tenant_members", id: data.member_id, tenant_id: (m as any).tenant_id, before: m,
    });
    return { ok: true };
  });

// =========================================================================
// PLAN HISTORY
// =========================================================================

export const listTenantPlanHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const limit = data.limit ?? 50;
    const { data: rows, error } = await (supabaseAdmin
      .from("tenant_plan_history" as any) as any)
      .select("id, plan, seats_limit, ai_tokens_quota, storage_quota_mb, period_start, period_end, notes, changed_by, changed_at")
      .eq("tenant_id", data.tenant_id)
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    const emails = await getUserEmailsMap(actorIds as string[]);
    return {
      items: (rows ?? []).map((r: any) => ({
        ...r,
        changed_by_email: r.changed_by ? emails.get(r.changed_by) ?? null : null,
      })),
    };
  });

// =========================================================================
// FISCAL PERIOD — emergency reopen
// =========================================================================

export const reopenFiscalPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      period_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.rpc(
      "fn_superadmin_reopen_fiscal_period" as any,
      { _period_id: data.period_id, _reason: data.reason } as any,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================================
// ARCHIVE TENANT (soft delete alternative)
// =========================================================================

export const archiveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      archived: z.boolean(),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: before } = await supabaseAdmin
      .from("tenants").select("status, suspended_reason").eq("id", data.tenant_id).maybeSingle();
    const patch = data.archived
      ? {
          status: "archived",
          suspended_at: new Date().toISOString(),
          suspended_reason: data.reason ?? "Archived by superadmin",
        }
      : { status: "active", suspended_at: null, suspended_reason: null };
    const { error } = await supabaseAdmin
      .from("tenants").update(patch as any).eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAction(
      context.userId,
      data.archived ? "superadmin.tenant.archive" : "superadmin.tenant.unarchive",
      { table: "tenants", id: data.tenant_id, tenant_id: data.tenant_id, before, after: patch },
    );
    return { ok: true };
  });

// =========================================================================
// BULK PLAN CHANGE
// =========================================================================

export const bulkChangePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_ids: z.array(z.string().uuid()).min(1).max(500),
      plan: z.string().min(1).max(40),
      seats_limit: z.number().int().nullable().optional(),
      ai_tokens_quota: z.number().int().nullable().optional(),
      storage_quota_mb: z.number().int().nullable().optional(),
      period_start: z.string().nullable().optional(),
      period_end: z.string().nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const rows = data.tenant_ids.map((tid) => ({
      tenant_id: tid,
      plan: data.plan,
      seats_limit: data.seats_limit ?? null,
      ai_tokens_quota: data.ai_tokens_quota ?? null,
      storage_quota_mb: data.storage_quota_mb ?? null,
      period_start: data.period_start ?? null,
      period_end: data.period_end ?? null,
      notes: data.notes ?? null,
      status: "active",
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from("tenant_plans")
      .upsert(rows as any, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);

    await Promise.all(
      data.tenant_ids.map((tid) =>
        logAction(context.userId, "superadmin.tenant.bulk_plan_change", {
          table: "tenant_plans",
          id: tid,
          tenant_id: tid,
          after: { plan: data.plan, seats_limit: data.seats_limit ?? null },
        }),
      ),
    );

    return { ok: true, count: data.tenant_ids.length };
  });

// =========================================================================
// IMPERSONATION HISTORY (view-only, filter audit_logs)
// =========================================================================

export const listImpersonationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid().optional(),
      actor_email: z.string().max(255).optional(),
      target_user_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      before: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const limit = data.limit ?? 50;

    let q = supabaseAdmin
      .from("audit_logs")
      .select("id, action, table_name, record_id, actor_email, tenant_id, before, after, created_at")
      .in("action", ["superadmin.impersonate", "superadmin.impersonate_owner"] as any)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.tenant_id) q = q.eq("tenant_id", data.tenant_id);
    if (data.actor_email) q = q.eq("actor_email", data.actor_email);
    if (data.target_user_id) q = q.eq("record_id", data.target_user_id);
    if (data.before) q = q.lt("created_at", data.before);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Đính kèm tenant name (nếu có)
    const tenantIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.tenant_id).filter(Boolean)),
    ) as string[];
    const tenantMap = new Map<string, string>();
    if (tenantIds.length) {
      const { data: tt } = await supabaseAdmin
        .from("tenants").select("id, name").in("id", tenantIds);
      for (const t of tt ?? []) tenantMap.set((t as any).id, (t as any).name);
    }

    return {
      items: (rows ?? []).map((r: any) => ({
        ...r,
        tenant_name: r.tenant_id ? tenantMap.get(r.tenant_id) ?? null : null,
        target_email: (r.after as any)?.target_email ?? null,
        reason: (r.after as any)?.reason ?? null,
        expires_at: (r.after as any)?.expires_at ?? null,
      })),
      next_before: rows && rows.length === limit ? rows[rows.length - 1].created_at : null,
    };
  });

// CASCADE DELETE
// =========================================================================

export const deleteTenantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      confirm_name: z.string().min(1).max(255),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const { data: t } = await supabaseAdmin
      .from("tenants").select("id, name, company_name, owner_user_id, status")
      .eq("id", data.tenant_id).maybeSingle();
    if (!t) throw new Error("Không tìm thấy tenant.");
    if ((t as any).name?.trim() !== data.confirm_name.trim()) {
      throw new Error("Tên xác nhận không khớp.");
    }

    // Audit before delete (cascade also wipes audit_logs for this tenant).
    await logAction(context.userId, "superadmin.tenant.delete", {
      table: "tenants", id: data.tenant_id, tenant_id: data.tenant_id, before: t,
    });

    const { error } = await supabaseAdmin.rpc(
      "fn_superadmin_delete_tenant_cascade" as any,
      { _tenant_id: data.tenant_id } as any,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

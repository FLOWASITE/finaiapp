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
      accounting_standard: z.enum(["all", "TT133", "TT200"]).optional(),
      idle_only: z.boolean().optional(),
    }).partial().parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const { data: tenants, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, company_name, tax_id, accounting_standard, status, suspended_at, suspended_reason, owner_user_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tids = (tenants ?? []).map((t: any) => t.id);
    const ownerIds = (tenants ?? []).map((t: any) => t.owner_user_id).filter(Boolean);

    const [plans, members, lastAudit, emails] = await Promise.all([
      supabaseAdmin.from("tenant_plans").select("tenant_id, plan").in("tenant_id", tids),
      supabaseAdmin.from("tenant_members").select("tenant_id").in("tenant_id", tids),
      supabaseAdmin.from("audit_logs")
        .select("tenant_id, created_at")
        .in("tenant_id", tids)
        .order("created_at", { ascending: false })
        .limit(2000),
      getUserEmailsMap(ownerIds),
    ]);

    const planMap = new Map<string, string>();
    for (const p of plans.data ?? []) planMap.set((p as any).tenant_id, (p as any).plan);

    const memberCount = new Map<string, number>();
    for (const m of members.data ?? []) {
      const tid = (m as any).tenant_id;
      memberCount.set(tid, (memberCount.get(tid) ?? 0) + 1);
    }

    const lastActivity = new Map<string, string>();
    for (const a of lastAudit.data ?? []) {
      const tid = (a as any).tenant_id;
      if (!lastActivity.has(tid)) lastActivity.set(tid, (a as any).created_at);
    }

    const enriched = (tenants ?? []).map((t: any) => ({
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
      plan: planMap.get(t.id) ?? "free",
      members_count: memberCount.get(t.id) ?? 0,
      last_activity_at: lastActivity.get(t.id) ?? null,
      created_at: t.created_at,
    }));

    // Apply filters
    const q = (data.q ?? "").trim().toLowerCase();
    const filtered = enriched.filter((t) => {
      if (q) {
        const hay = `${t.name ?? ""} ${t.company_name ?? ""} ${t.tax_id ?? ""} ${t.owner_email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (data.status && data.status !== "all" && t.status !== data.status) return false;
      if (data.plan && t.plan !== data.plan) return false;
      if (data.accounting_standard && data.accounting_standard !== "all" &&
          t.accounting_standard !== data.accounting_standard) return false;
      if (data.idle_only) {
        const days = t.last_activity_at
          ? Math.floor((Date.now() - new Date(t.last_activity_at).getTime()) / 86400000)
          : 999;
        if (days <= 90) return false;
      }
      return true;
    });

    return { tenants: filtered, total: enriched.length };
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
        accounting_standard: z.enum(["TT133", "TT200"]).optional(),
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

    // Find existing auth user by email; if none, invite.
    let userId: string | null = null;
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = (list?.users ?? []).find(
      (u: any) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
    );
    if (found) {
      userId = found.id;
    } else {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (error) throw new Error(error.message);
      userId = invited?.user?.id ?? null;
    }
    if (!userId) throw new Error("Không xác định được người dùng.");

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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "superadmin");
  if (!ok) throw new Error("Cần quyền Super-admin để thực hiện thao tác này.");
}

async function logSuperadminAction(params: {
  actorId: string;
  action: string;
  targetTable?: string;
  targetId?: string | null;
  before?: any;
  after?: any;
}) {
  try {
    let actorEmail: string | null = null;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", params.actorId)
      .maybeSingle();
    actorEmail = prof?.email ?? null;
    if (!actorEmail) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(params.actorId);
      actorEmail = u?.user?.email ?? null;
    }
    await supabaseAdmin.from("audit_logs").insert({
      user_id: params.actorId,
      actor_email: actorEmail,
      action: params.action,
      table_name: params.targetTable ?? null,
      record_id: params.targetId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
    } as any);
  } catch (e) {
    // Never block the primary operation due to audit failure
    console.error("[audit] failed to log superadmin action", e);
  }
}

const ROLE_ENUM = z.enum(["owner", "accountant", "viewer", "superadmin"]);

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, company_name, tax_id, created_at")
      .order("created_at", { ascending: false });

    const ids = (profiles ?? []).map((p) => p.id);
    const [invCounts, salesCounts, jeCounts, roles] = await Promise.all([
      supabaseAdmin.from("invoices").select("user_id"),
      supabaseAdmin.from("sales_invoices").select("user_id"),
      supabaseAdmin.from("journal_entries").select("user_id"),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);

    const tally = (rows: any[] | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
      return m;
    };
    const invMap = tally(invCounts.data);
    const salesMap = tally(salesCounts.data);
    const jeMap = tally(jeCounts.data);
    const roleMap = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role as string);
      roleMap.set(r.user_id, list);
    }

    return {
      tenants: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        company_name: p.company_name,
        tax_id: p.tax_id,
        created_at: p.created_at,
        roles: roleMap.get(p.id) ?? [],
        counts: {
          invoices: invMap.get(p.id) ?? 0,
          sales: salesMap.get(p.id) ?? 0,
          journal_entries: jeMap.get(p.id) ?? 0,
        },
      })),
    };
  });

// Deprecated: getTenantDetail (profile-based) removed.
// Use getTenantAdmin from src/lib/superadmin-tenants.functions.ts.


export const setSuperadminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), enable: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (data.enable) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: "superadmin" as any });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      if (data.user_id === userId) throw new Error("Không thể tự xóa quyền của mình.");
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", "superadmin" as any);
    }
    await logSuperadminAction({
      actorId: userId,
      action: data.enable ? "superadmin.role.grant" : "superadmin.role.revoke",
      targetTable: "user_roles",
      targetId: data.user_id,
      after: { role: "superadmin", enable: data.enable },
    });
    return { ok: true };
  });

// ============================================================
// ACCOUNT MANAGEMENT
// ============================================================

export const listAllAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const accounts: any[] = [];
    let page = 1;
    // Paginate up to 10 pages of 200 = 2000 users
    while (page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      accounts.push(...(data?.users ?? []));
      if (!data?.users?.length || data.users.length < 200) break;
      page++;
    }

    const ids = accounts.map((u) => u.id);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, company_name").in("id", ids),
    ]);

    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as string);
      roleMap.set(r.user_id, arr);
    }
    const compMap = new Map<string, string | null>();
    for (const p of profiles ?? []) compMap.set(p.id, p.company_name);

    return {
      accounts: accounts.map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        banned_until: u.banned_until ?? null,
        company_name: compMap.get(u.id) ?? null,
        roles: roleMap.get(u.id) ?? [],
      })),
    };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      role: ROLE_ENUM,
      enable: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (!data.enable && data.user_id === userId && data.role === "superadmin") {
      throw new Error("Không thể tự thu hồi quyền Super-admin.");
    }
    if (data.enable) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role as any });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role as any);
    }
    await logSuperadminAction({
      actorId: userId,
      action: data.enable ? "superadmin.role.grant" : "superadmin.role.revoke",
      targetTable: "user_roles",
      targetId: data.user_id,
      after: { role: data.role, enable: data.enable },
    });
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ email: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.account.reset_password",
      targetTable: "auth.users",
      after: { email: data.email },
    });
    return { ok: true };
  });

export const setAccountBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      banned: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (data.user_id === userId) throw new Error("Không thể tự khóa tài khoản.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.banned ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: data.banned ? "superadmin.account.ban" : "superadmin.account.unban",
      targetTable: "auth.users",
      targetId: data.user_id,
      after: { banned: data.banned },
    });
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), confirm_email: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (data.user_id === userId) throw new Error("Không thể tự xóa tài khoản.");
    const { data: u, error: ge } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (ge) throw new Error(ge.message);
    if (u?.user?.email?.toLowerCase() !== data.confirm_email.toLowerCase()) {
      throw new Error("Email xác nhận không khớp.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.account.delete",
      targetTable: "auth.users",
      targetId: data.user_id,
      before: { email: u?.user?.email ?? null },
    });
    return { ok: true };
  });

// ============================================================
// ORGANIZATION MANAGEMENT
// ============================================================

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, company_name, tax_id, address, phone, accounting_standard, base_currency, fiscal_year_start, created_at")
      .order("created_at", { ascending: false });

    return { organizations: profiles ?? [] };
  });

// Deprecated: listOrganizationsWithStats / updateOrganization / deleteOrganization
// removed. Use src/lib/superadmin-tenants.functions.ts (listTenantsAdmin,
// updateTenantAdmin, deleteTenantAdmin) which operates on the real tenants table.


// ============================================================
// AUDIT LOG VIEWER (Super-admin actions)
// ============================================================

export const listSuperadminAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).max(100000).optional(),
      action_prefix: z.string().max(64).optional(),
      actor_email: z.string().max(255).optional(),
      target_id: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      with_total: z.boolean().optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const withTotal = data.with_total === true;
    // Chỉ yêu cầu Postgres đếm `count: "exact"` khi client thật sự cần tổng
    // (toggle "Hiển thị tổng" hoặc khi bộ lọc đã ổn định) — tránh full scan mỗi keystroke.
    let q = supabaseAdmin
      .from("audit_logs")
      .select("*", withTotal ? { count: "exact" } : undefined)
      .like("action", `${data.action_prefix ?? "superadmin."}%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data.actor_email) q = q.ilike("actor_email", `%${data.actor_email}%`);
    if (data.target_id) q = q.eq("record_id", data.target_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: logs, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      logs: logs ?? [],
      total: withTotal ? count ?? 0 : null,
      limit,
      offset,
      has_more: (logs?.length ?? 0) === limit,
    };
  });

// ============================================================
// ACCOUNT MANAGEMENT — EXTENDED (detail / paged / invite / bulk / export / security)
// ============================================================

const TENANT_ROLE_ENUM = z.enum(["owner", "admin", "accountant", "viewer"]);
const PLATFORM_ROLE_ENUM = z.enum(["owner", "accountant", "viewer", "superadmin"]);

const ACCOUNT_FILTERS = z.object({
  q: z.string().max(255).optional(),
  roles: z.array(PLATFORM_ROLE_ENUM).optional(),
  status: z
    .enum(["active", "unconfirmed", "banned", "with_mfa"])
    .optional(),
  created_from: z.string().optional(),
  created_to: z.string().optional(),
  last_login_bucket: z
    .enum(["never", "7d", "30d", "90d_plus"])
    .optional(),
  sort_by: z
    .enum(["created_at", "last_sign_in_at", "email", "company_name"])
    .optional(),
  sort_dir: z.enum(["asc", "desc"]).optional(),
});

type AccountRow = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  has_mfa: boolean;
  company_name: string | null;
  display_name: string | null;
  roles: string[];
};

async function fetchAllAccounts(): Promise<AccountRow[]> {
  const accounts: any[] = [];
  let page = 1;
  while (page <= 25) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    accounts.push(...(data?.users ?? []));
    if (!data?.users?.length || data.users.length < 200) break;
    page++;
  }
  const ids = accounts.map((u) => u.id);
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    supabaseAdmin
      .from("profiles")
      .select("id, company_name, display_name")
      .in("id", ids),
  ]);
  const roleMap = new Map<string, string[]>();
  for (const r of roles ?? []) {
    const arr = roleMap.get(r.user_id) ?? [];
    arr.push(r.role as string);
    roleMap.set(r.user_id, arr);
  }
  const profMap = new Map<string, { company_name: string | null; display_name: string | null }>();
  for (const p of profiles ?? []) {
    profMap.set(p.id, { company_name: p.company_name ?? null, display_name: p.display_name ?? null });
  }
  return accounts.map((u: any) => ({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
    banned_until: u.banned_until ?? null,
    has_mfa: Array.isArray(u.factors) && u.factors.length > 0,
    company_name: profMap.get(u.id)?.company_name ?? null,
    display_name: profMap.get(u.id)?.display_name ?? null,
    roles: roleMap.get(u.id) ?? [],
  }));
}

function applyAccountFilters(
  rows: AccountRow[],
  filters: z.infer<typeof ACCOUNT_FILTERS>,
): AccountRow[] {
  const now = Date.now();
  let out = rows;
  if (filters.q) {
    const s = filters.q.trim().toLowerCase();
    out = out.filter(
      (a) =>
        (a.email ?? "").toLowerCase().includes(s) ||
        (a.company_name ?? "").toLowerCase().includes(s) ||
        (a.display_name ?? "").toLowerCase().includes(s),
    );
  }
  if (filters.roles?.length) {
    const wanted = new Set(filters.roles);
    out = out.filter((a) => a.roles.some((r) => wanted.has(r as any)));
  }
  if (filters.status) {
    out = out.filter((a) => {
      const banned = a.banned_until && new Date(a.banned_until).getTime() > now;
      if (filters.status === "banned") return !!banned;
      if (filters.status === "unconfirmed") return !a.email_confirmed_at && !banned;
      if (filters.status === "active") return !!a.email_confirmed_at && !banned;
      if (filters.status === "with_mfa") return a.has_mfa;
      return true;
    });
  }
  if (filters.created_from) {
    out = out.filter((a) => (a.created_at ?? "") >= filters.created_from!);
  }
  if (filters.created_to) {
    out = out.filter((a) => (a.created_at ?? "") <= filters.created_to!);
  }
  if (filters.last_login_bucket) {
    out = out.filter((a) => {
      if (filters.last_login_bucket === "never") return !a.last_sign_in_at;
      if (!a.last_sign_in_at) return false;
      const ageDays = (now - new Date(a.last_sign_in_at).getTime()) / 86_400_000;
      if (filters.last_login_bucket === "7d") return ageDays <= 7;
      if (filters.last_login_bucket === "30d") return ageDays <= 30;
      if (filters.last_login_bucket === "90d_plus") return ageDays > 90;
      return true;
    });
  }
  const sortBy = filters.sort_by ?? "created_at";
  const dir = filters.sort_dir === "asc" ? 1 : -1;
  out = [...out].sort((a, b) => {
    const va = (a[sortBy] ?? "") as string;
    const vb = (b[sortBy] ?? "") as string;
    if (va === vb) return 0;
    return va > vb ? dir : -dir;
  });
  return out;
}

export const listAccountsPaged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(1).max(500).optional(),
        page_size: z.number().int().min(10).max(200).optional(),
        filters: ACCOUNT_FILTERS.optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const page = data.page ?? 1;
    const pageSize = data.page_size ?? 50;
    const all = await fetchAllAccounts();
    const filtered = applyAccountFilters(all, data.filters ?? {});
    const start = (page - 1) * pageSize;
    return {
      accounts: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      page_size: pageSize,
    };
  });

export const getAccountDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const [{ data: userRes, error: uErr }, profileRes, rolesRes, membersRes, auditRes] =
      await Promise.all([
        supabaseAdmin.auth.admin.getUserById(data.user_id),
        supabaseAdmin.from("profiles").select("*").eq("id", data.user_id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role, created_at").eq("user_id", data.user_id),
        supabaseAdmin
          .from("tenant_members")
          .select("id, tenant_id, role, status, created_at, tenants:tenants!inner(id, name, company_name, tax_id)")
          .eq("user_id", data.user_id),
        supabaseAdmin
          .from("audit_logs")
          .select("id, action, table_name, record_id, created_at, before, after")
          .eq("user_id", data.user_id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
    if (uErr) throw new Error(uErr.message);
    const user: any = userRes?.user ?? null;
    const factors = Array.isArray(user?.factors) ? user.factors : [];
    return {
      user: user
        ? {
            id: user.id,
            email: user.email ?? null,
            phone: user.phone ?? null,
            created_at: user.created_at ?? null,
            last_sign_in_at: user.last_sign_in_at ?? null,
            email_confirmed_at: user.email_confirmed_at ?? null,
            banned_until: user.banned_until ?? null,
            app_metadata: user.app_metadata ?? {},
            user_metadata: user.user_metadata ?? {},
          }
        : null,
      profile: profileRes.data ?? null,
      platform_roles: rolesRes.data ?? [],
      tenant_memberships: membersRes.data ?? [],
      mfa_factors: factors.map((f: any) => ({
        id: f.id,
        factor_type: f.factor_type,
        friendly_name: f.friendly_name ?? null,
        status: f.status,
        created_at: f.created_at,
      })),
      recent_audits: auditRes.data ?? [],
    };
  });

export const inviteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(255),
        display_name: z.string().trim().max(120).optional(),
        tenant_id: z.string().uuid().optional(),
        tenant_role: TENANT_ROLE_ENUM.optional(),
        grant_superadmin: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: data.display_name ? { display_name: data.display_name } : undefined,
    });
    if (error) throw new Error(error.message);
    const newUserId = invited?.user?.id;
    if (newUserId) {
      await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: newUserId,
            email: data.email,
            display_name: data.display_name ?? null,
          } as any,
          { onConflict: "id" },
        );
      if (data.tenant_id && data.tenant_role) {
        await supabaseAdmin.from("tenant_members").upsert(
          {
            tenant_id: data.tenant_id,
            user_id: newUserId,
            role: data.tenant_role as any,
            status: "invited" as any,
          },
          { onConflict: "tenant_id,user_id" },
        );
      }
      if (data.grant_superadmin) {
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: newUserId, role: "superadmin" as any });
      }
    }
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.account.invite",
      targetTable: "auth.users",
      targetId: newUserId ?? null,
      after: { email: data.email, tenant_id: data.tenant_id, tenant_role: data.tenant_role, grant_superadmin: !!data.grant_superadmin },
    });
    return { ok: true, user_id: newUserId ?? null };
  });

export const bulkAccountAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_ids: z.array(z.string().uuid()).min(1).max(200),
        action: z.enum(["ban", "unban", "delete", "reset_password"]),
        confirm_phrase: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const targets = data.user_ids.filter((id) => id !== userId);
    if (data.action === "delete") {
      const expected = `DELETE ${targets.length} accounts`;
      if ((data.confirm_phrase ?? "") !== expected) {
        throw new Error(`Vui lòng nhập đúng cụm xác nhận: "${expected}"`);
      }
    }
    let ok = 0;
    const errors: { user_id: string; message: string }[] = [];
    for (const id of targets) {
      try {
        if (data.action === "ban") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "876000h" } as any);
          if (error) throw new Error(error.message);
        } else if (data.action === "unban") {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "none" } as any);
          if (error) throw new Error(error.message);
        } else if (data.action === "delete") {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
          if (error) throw new Error(error.message);
        } else if (data.action === "reset_password") {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
          if (u?.user?.email) {
            const { error } = await supabaseAdmin.auth.admin.generateLink({
              type: "recovery",
              email: u.user.email,
            });
            if (error) throw new Error(error.message);
          }
        }
        ok++;
      } catch (e: any) {
        errors.push({ user_id: id, message: e?.message ?? "Lỗi không rõ" });
      }
    }
    await logSuperadminAction({
      actorId: userId,
      action: `superadmin.account.bulk.${data.action}`,
      targetTable: "auth.users",
      after: { count: targets.length, ok, errors: errors.length },
    });
    return { ok, failed: errors.length, errors, skipped_self: data.user_ids.length - targets.length };
  });

export const exportAccountsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ filters: ACCOUNT_FILTERS.optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const rows = applyAccountFilters(await fetchAllAccounts(), data.filters ?? {});
    const header = [
      "id",
      "email",
      "display_name",
      "company_name",
      "roles",
      "status",
      "has_mfa",
      "last_sign_in_at",
      "created_at",
    ];
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const now = Date.now();
    const lines = [header.join(",")];
    for (const a of rows) {
      const banned = a.banned_until && new Date(a.banned_until).getTime() > now;
      const status = banned ? "banned" : a.email_confirmed_at ? "active" : "unconfirmed";
      lines.push(
        [
          a.id,
          esc(a.email),
          esc(a.display_name),
          esc(a.company_name),
          esc(a.roles.join("|")),
          status,
          a.has_mfa ? "yes" : "no",
          esc(a.last_sign_in_at),
          esc(a.created_at),
        ].join(","),
      );
    }
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.account.export_csv",
      after: { rows: rows.length },
    });
    return { csv: "\uFEFF" + lines.join("\n"), rows: rows.length };
  });

export const forceLogoutAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (data.user_id === userId) throw new Error("Không thể tự đăng xuất chính mình ở đây.");
    const { error } = await (supabaseAdmin.auth.admin as any).signOut(data.user_id, "global");
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.account.force_logout",
      targetTable: "auth.users",
      targetId: data.user_id,
    });
    return { ok: true };
  });

export const resetMfaFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), factor_id: z.string().min(1).max(128) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { error } = await (supabaseAdmin.auth.admin.mfa as any).deleteFactor({
      userId: data.user_id,
      id: data.factor_id,
    });
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.account.mfa_reset",
      targetTable: "auth.users",
      targetId: data.user_id,
      after: { factor_id: data.factor_id },
    });
    return { ok: true };
  });

export const setTenantMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        tenant_id: z.string().uuid(),
        role: TENANT_ROLE_ENUM.optional(),
        remove: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (data.remove) {
      const { error } = await supabaseAdmin
        .from("tenant_members")
        .delete()
        .eq("user_id", data.user_id)
        .eq("tenant_id", data.tenant_id);
      if (error) throw new Error(error.message);
    } else {
      if (!data.role) throw new Error("Thiếu vai trò.");
      const { error } = await supabaseAdmin
        .from("tenant_members")
        .upsert(
          {
            user_id: data.user_id,
            tenant_id: data.tenant_id,
            role: data.role as any,
            status: "active" as any,
          },
          { onConflict: "tenant_id,user_id" },
        );
      if (error) throw new Error(error.message);
    }
    await logSuperadminAction({
      actorId: userId,
      action: data.remove ? "superadmin.tenant_member.remove" : "superadmin.tenant_member.upsert",
      targetTable: "tenant_members",
      targetId: data.user_id,
      after: { tenant_id: data.tenant_id, role: data.role ?? null },
    });
    return { ok: true };
  });


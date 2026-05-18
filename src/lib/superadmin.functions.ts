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

export const getTenantDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tenant_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const [profile, roles, recentAudit, locks] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.tenant_id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("*").eq("user_id", data.tenant_id),
      supabaseAdmin
        .from("audit_logs")
        .select("*")
        .eq("user_id", data.tenant_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("fiscal_periods")
        .select("id,year,period_no,status,closed_at,note,user_id")
        .eq("user_id", data.tenant_id)
        .in("status", ["soft_closed", "closed"])
        .order("year", { ascending: false }),
    ]);

    return {
      profile: profile.data,
      roles: roles.data ?? [],
      recent_audit: recentAudit.data ?? [],
      locks: locks.data ?? [],
    };
  });

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

export const listOrganizationsWithStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, company_name, tax_id, address, phone, accounting_standard, base_currency, fiscal_year_start, created_at")
      .order("created_at", { ascending: false });

    const orgs = profiles ?? [];
    const ids = orgs.map((o) => o.id);
    if (ids.length === 0) return { organizations: [] };

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const twelveIso = twelveMonthsAgo.toISOString().slice(0, 10);

    const [invRes, salesRes, rolesRes, salesActRes, invActRes, jeActRes] = await Promise.all([
      supabaseAdmin.from("invoices").select("user_id").in("user_id", ids),
      supabaseAdmin.from("sales_invoices").select("user_id, total, issue_date").in("user_id", ids).gte("issue_date", twelveIso),
      supabaseAdmin.from("user_roles").select("user_id").in("user_id", ids),
      supabaseAdmin.from("sales_invoices").select("user_id, updated_at").in("user_id", ids),
      supabaseAdmin.from("invoices").select("user_id, updated_at").in("user_id", ids),
      supabaseAdmin.from("journal_entries").select("user_id, created_at").in("user_id", ids),
    ]);

    const invCount = new Map<string, number>();
    (invRes.data ?? []).forEach((r: any) => invCount.set(r.user_id, (invCount.get(r.user_id) ?? 0) + 1));

    const salesTotal = new Map<string, number>();
    (salesRes.data ?? []).forEach((r: any) =>
      salesTotal.set(r.user_id, (salesTotal.get(r.user_id) ?? 0) + Number(r.total ?? 0)),
    );

    const members = new Map<string, number>();
    (rolesRes.data ?? []).forEach((r: any) => members.set(r.user_id, (members.get(r.user_id) ?? 0) + 1));

    const lastActivity = new Map<string, string>();
    const bump = (uid: string, ts: string | null | undefined) => {
      if (!ts) return;
      const prev = lastActivity.get(uid);
      if (!prev || ts > prev) lastActivity.set(uid, ts);
    };
    (salesActRes.data ?? []).forEach((r: any) => bump(r.user_id, r.updated_at));
    (invActRes.data ?? []).forEach((r: any) => bump(r.user_id, r.updated_at));
    (jeActRes.data ?? []).forEach((r: any) => bump(r.user_id, r.created_at));

    const organizations = orgs.map((o) => ({
      ...o,
      invoice_count: invCount.get(o.id) ?? 0,
      sales_total_12m: salesTotal.get(o.id) ?? 0,
      members_count: Math.max(1, members.get(o.id) ?? 1),
      last_activity_at: lastActivity.get(o.id) ?? null,
    }));

    return { organizations };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      tenant_id: z.string().uuid(),
      company_name: z.string().max(255).nullable().optional(),
      tax_id: z.string().max(50).nullable().optional(),
      address: z.string().max(500).nullable().optional(),
      phone: z.string().max(50).nullable().optional(),
      accounting_standard: z.enum(["TT133", "TT200"]).optional(),
      base_currency: z.string().min(3).max(10).optional(),
      fiscal_year_start: z.number().int().min(1).max(12).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    const { tenant_id, ...patch } = data;
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("company_name, tax_id, address, phone, accounting_standard, base_currency, fiscal_year_start")
      .eq("id", tenant_id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", tenant_id);
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.org.update",
      targetTable: "profiles",
      targetId: tenant_id,
      before,
      after: patch,
    });
    return { ok: true };
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ tenant_id: z.string().uuid(), confirm_email: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);
    if (data.tenant_id === userId) throw new Error("Không thể tự xóa tổ chức của mình.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email, company_name, tax_id")
      .eq("id", data.tenant_id)
      .maybeSingle();
    if (!prof) throw new Error("Không tìm thấy tổ chức.");
    if ((prof.email ?? "").toLowerCase() !== data.confirm_email.toLowerCase()) {
      throw new Error("Email xác nhận không khớp.");
    }

    // Delete user-scoped data (best-effort across known tables)
    const tables = [
      "ai_suggestions", "bank_transactions", "bank_accounts", "cash_vouchers",
      "customers", "exchange_rates", "fixed_assets", "invoices",
      "journal_entries", "payroll_runs", "period_locks", "products",
      "report_notes", "report_snapshots", "sales_invoices", "stock_movements",
      "supplier_payments", "suppliers", "employees", "user_roles",
    ];
    for (const t of tables) {
      await (supabaseAdmin.from(t as any) as any).delete().eq("user_id", data.tenant_id);
    }
    await supabaseAdmin.from("profiles").delete().eq("id", data.tenant_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.tenant_id);
    if (error) throw new Error(error.message);
    await logSuperadminAction({
      actorId: userId,
      action: "superadmin.org.delete",
      targetTable: "profiles",
      targetId: data.tenant_id,
      before: prof,
    });
    return { ok: true };
  });

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

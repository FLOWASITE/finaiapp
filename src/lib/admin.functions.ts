import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE_OPTIONS = ["owner", "accountant", "approver", "viewer"] as const;
type RoleOption = (typeof ROLE_OPTIONS)[number];

async function assertOwner(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("owner") && !roles.includes("superadmin")) {
    throw new Error("Chỉ chủ tài khoản (owner) mới có quyền thực hiện thao tác này.");
  }
}

// ===== Members =====
export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);

    // List all user_roles visible (only superadmin sees all; owner sees own row + invitations)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role, created_at");

    // Pull profiles for those user_ids
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, email, company_name").in("id", ids)
      : { data: [] as any[] };
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const members = (roles ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role,
      created_at: r.created_at,
      email: map.get(r.user_id)?.email ?? null,
      company_name: map.get(r.user_id)?.company_name ?? null,
    }));

    const { data: invites } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("tenant_owner_id", userId)
      .order("created_at", { ascending: false });

    return { members, invites: invites ?? [] };
  });

const InviteSchema = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(ROLE_OPTIONS),
});
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);

    const { data: inv, error } = await supabase
      .from("user_invitations")
      .insert({
        tenant_owner_id: userId,
        invited_by: userId,
        email: data.email,
        role: data.role,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { invitation: inv };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { error } = await supabase
      .from("user_invitations")
      .delete()
      .eq("id", data.id)
      .eq("tenant_owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ROLE_OPTIONS),
});
export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    // Replace existing roles for that user
    await supabase.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    if (data.user_id === userId) throw new Error("Không thể xóa chính bạn.");
    const { error } = await supabase.from("user_roles").delete().eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Audit logs =====
const AuditFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  action: z.string().max(50).optional(),
  table_name: z.string().max(100).optional(),
  user_id: z.string().uuid().optional(),
  record_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});
export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AuditFilterSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const applyFilters = (q: any) => {
      if (data.from) q = q.gte("created_at", data.from);
      if (data.to) q = q.lte("created_at", data.to);
      if (data.action) q = q.eq("action", data.action);
      if (data.table_name) q = q.eq("table_name", data.table_name);
      if (data.user_id) q = q.eq("user_id", data.user_id);
      if (data.record_id) q = q.eq("record_id", data.record_id);
      if (data.search) q = q.ilike("actor_email", `%${data.search}%`);
      return q;
    };
    const rowsQuery = applyFilters(
      supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(data.offset, data.offset + data.limit - 1)
    );
    const countQuery = applyFilters(
      supabase.from("audit_logs").select("id", { count: "exact", head: true })
    );
    const [{ data: rows, error }, { count, error: cErr }] = await Promise.all([rowsQuery, countQuery]);
    if (error) throw new Error(error.message);
    if (cErr) throw new Error(cErr.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const RecordHistorySchema = z.object({
  table_name: z.string().min(1).max(100),
  record_id: z.string().uuid(),
});
export const getRecordHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecordHistorySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("table_name", data.table_name)
      .eq("record_id", data.record_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getAuditFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("audit_logs")
      .select("table_name, action")
      .limit(5000);
    if (error) throw new Error(error.message);
    const tableSet = new Set<string>();
    const actionSet = new Set<string>();
    (data ?? []).forEach((r: any) => {
      if (r.table_name) tableSet.add(r.table_name);
      if (r.action) actionSet.add(r.action);
    });
    return {
      tables: Array.from(tableSet).sort(),
      actions: Array.from(actionSet).sort(),
    };
  });

// ===== Period locks (now backed by fiscal_periods) =====
export const listPeriodLocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("fiscal_periods")
      .select("id,year,period_no,status,closed_at,note")
      .in("status", ["soft_closed", "closed"])
      .order("year", { ascending: false })
      .order("period_no", { ascending: false });
    return { locks: data ?? [] };
  });

const LockSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  note: z.string().max(500).optional(),
});
export const lockPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LockSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { error } = await supabase
      .from("fiscal_periods")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: userId,
        note: data.note ?? null,
      })
      .eq("year", data.year)
      .eq("period_no", data.month);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unlockPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ year: z.number().int(), month: z.number().int() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const { error } = await supabase
      .from("fiscal_periods")
      .update({ status: "open", closed_at: null, closed_by: null })
      .eq("year", data.year)
      .eq("period_no", data.month);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== System stats =====
export const getSystemStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      invCount,
      salesCount,
      jeCount,
      activity,
      auditCount,
      members,
    ] = await Promise.all([
      supabase.from("invoices").select("id", { count: "exact", head: true }),
      supabase.from("sales_invoices").select("id", { count: "exact", head: true }),
      supabase.from("journal_entries").select("id", { count: "exact", head: true }),
      supabase
        .from("audit_logs")
        .select("created_at, action")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }),
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }),
    ]);

    // bucket by day
    const buckets = new Map<string, number>();
    for (const row of activity.data ?? []) {
      const d = (row as any).created_at?.slice(0, 10);
      if (d) buckets.set(d, (buckets.get(d) ?? 0) + 1);
    }
    const activitySeries = Array.from(buckets.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return {
      counts: {
        invoices: invCount.count ?? 0,
        sales: salesCount.count ?? 0,
        journal_entries: jeCount.count ?? 0,
        audit_logs: auditCount.count ?? 0,
        members: members.count ?? 0,
      },
      activitySeries,
      currentUserId: userId,
    };
  });

// ===== Backup export =====
export const exportTenantBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);
    const tables = [
      "profiles",
      "customers",
      "suppliers",
      "products",
      "invoices",
      "invoice_lines",
      "sales_invoices",
      "sales_invoice_lines",
      "journal_entries",
      "journal_lines",
      "cash_vouchers",
      "bank_accounts",
      "bank_transactions",
      "employees",
      "payroll_runs",
      "payroll_lines",
      "fixed_assets",
      "depreciation_entries",
      "fiscal_periods",
      "fiscal_years",
      "user_roles",
    ];
    const dump: Record<string, any[]> = {};
    for (const t of tables) {
      const { data } = await (supabase as any).from(t).select("*");
      dump[t] = data ?? [];
    }
    return {
      exported_at: new Date().toISOString(),
      user_id: userId,
      tables: dump,
    };
  });

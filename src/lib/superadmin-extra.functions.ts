import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperadmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "superadmin");
  if (!ok) throw new Error("Cần quyền Super-admin để thực hiện thao tác này.");
}

async function logAction(actorId: string, action: string, target?: { table?: string; id?: string | null; before?: any; after?: any }) {
  try {
    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("id", actorId).maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      user_id: actorId,
      actor_email: prof?.email ?? null,
      action,
      table_name: target?.table ?? null,
      record_id: target?.id ?? null,
      before: target?.before ?? null,
      after: target?.after ?? null,
    } as any);
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

// =========================================================================
// A. ACCOUNTS — extras
// =========================================================================

export const forceSignOutUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    if (error) throw new Error(error.message);
    await logAction(context.userId, "force_signout", { table: "auth.users", id: data.userId });
    return { ok: true };
  });

export const getAccountDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const [u, profile, roles, memberships, recentAudit] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin.from("tenant_members").select("tenant_id, role, status").eq("user_id", data.userId),
      supabaseAdmin.from("audit_logs").select("id, action, table_name, record_id, created_at").eq("user_id", data.userId).order("created_at", { ascending: false }).limit(10),
    ]);
    return {
      auth: u.data?.user ?? null,
      profile: profile.data ?? null,
      roles: (roles.data ?? []).map((r: any) => r.role),
      memberships: memberships.data ?? [],
      recentAudit: recentAudit.data ?? [],
    };
  });

// =========================================================================
// A2. SECURITY
// =========================================================================

export const getSecurityPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin.from("security_policies").select("*").eq("id", 1).maybeSingle();
    return data ?? { id: 1, require_2fa_for_roles: [], ip_allowlist_enabled: false, session_timeout_minutes: 0 };
  });

export const updateSecurityPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      require_2fa_for_roles: z.array(z.string()).max(20),
      ip_allowlist_enabled: z.boolean(),
      session_timeout_minutes: z.number().int().min(0).max(43200),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("security_policies")
      .update({ ...data, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "update_security_policies", { table: "security_policies", id: "1", after: data });
    return { ok: true };
  });

export const listIpAllowlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin.from("ip_allowlist").select("*").order("created_at", { ascending: false });
    return data ?? [];
  });

export const upsertIpAllowlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      id: z.string().uuid().optional(),
      scope: z.enum(["global", "tenant"]),
      tenant_id: z.string().uuid().nullable().optional(),
      cidr: z.string().min(7).max(64).regex(/^[0-9a-fA-F:.\/]+$/),
      label: z.string().max(100).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin.from("ip_allowlist").update({
        scope: data.scope, tenant_id: data.tenant_id ?? null, cidr: data.cidr, label: data.label ?? null,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("ip_allowlist").insert({
        scope: data.scope, tenant_id: data.tenant_id ?? null, cidr: data.cidr, label: data.label ?? null, created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    await logAction(context.userId, "upsert_ip_allowlist", { table: "ip_allowlist", after: data });
    return { ok: true };
  });

export const deleteIpAllowlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("ip_allowlist").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "delete_ip_allowlist", { table: "ip_allowlist", id: data.id });
    return { ok: true };
  });

// =========================================================================
// B1. AUDIT — stats + export
// =========================================================================

export const getAuditStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const week = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const month = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

    const [c24, c7, c30, byActor, byTable] = await Promise.all([
      supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", day),
      supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", week),
      supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", month),
      supabaseAdmin.from("audit_logs").select("actor_email").gte("created_at", week).limit(1000),
      supabaseAdmin.from("audit_logs").select("table_name").gte("created_at", week).limit(1000),
    ]);

    const tally = (rows: any[] | null, key: string) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) {
        const v = r[key] ?? "(none)";
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return Array.from(m.entries()).map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count).slice(0, 5);
    };

    return {
      counts: { last24h: c24.count ?? 0, last7d: c7.count ?? 0, last30d: c30.count ?? 0 },
      topActors: tally(byActor.data, "actor_email"),
      topTables: tally(byTable.data, "table_name"),
    };
  });

export const exportAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      action: z.string().max(50).optional(),
      table_name: z.string().max(80).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    let q = supabaseAdmin.from("audit_logs").select("created_at, actor_email, action, table_name, record_id").order("created_at", { ascending: false }).limit(5000);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.action) q = q.eq("action", data.action);
    if (data.table_name) q = q.eq("table_name", data.table_name);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const header = "created_at,actor_email,action,table_name,record_id";
    const body = (rows ?? []).map((r: any) =>
      [r.created_at, r.actor_email, r.action, r.table_name, r.record_id]
        .map((v) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`))
        .join(",")
    ).join("\n");
    return { csv: header + "\n" + body, rowCount: rows?.length ?? 0 };
  });

// =========================================================================
// B2. BACKUPS
// =========================================================================

const BACKUP_TABLES = [
  "invoices", "sales_invoices", "journal_entries", "journal_lines",
  "bank_vouchers", "cash_vouchers", "customer_receipts", "supplier_payments",
  "customers", "suppliers", "products", "fiscal_years", "fiscal_periods",
];

export const createTenantBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);

    const { data: backup, error: insErr } = await supabaseAdmin.from("system_backups").insert({
      tenant_id: data.tenant_id, kind: "tenant_export", status: "running",
      created_by: context.userId, started_at: new Date().toISOString(),
    } as any).select("id").single();
    if (insErr) throw new Error(insErr.message);
    const backupId = (backup as any).id;

    try {
      const counts: Record<string, number> = {};
      const parts: string[] = [];
      for (const t of BACKUP_TABLES) {
        const { data: rows, error } = await supabaseAdmin.from(t as any).select("*").eq("tenant_id", data.tenant_id).limit(50000);
        if (error) { counts[t] = -1; continue; }
        counts[t] = rows?.length ?? 0;
        if (rows && rows.length) {
          const cols = Object.keys(rows[0]);
          const csv = [cols.join(",")].concat(
            rows.map((r: any) => cols.map((c) => {
              const v = r[c];
              if (v == null) return "";
              if (typeof v === "object") return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
              return `"${String(v).replace(/"/g, '""')}"`;
            }).join(","))
          ).join("\n");
          parts.push(`### TABLE: ${t}\n${csv}\n`);
        }
      }
      const blob = parts.join("\n");
      const filePath = `${data.tenant_id}/${backupId}.txt`;
      const { error: upErr } = await supabaseAdmin.storage.from("backups").upload(filePath, new Blob([blob], { type: "text/plain" }), { upsert: true });
      if (upErr) throw new Error(upErr.message);

      await supabaseAdmin.from("system_backups").update({
        status: "done", file_path: filePath, row_counts: counts, finished_at: new Date().toISOString(),
      }).eq("id", backupId);
      await logAction(context.userId, "create_backup", { table: "system_backups", id: backupId, after: { tenant_id: data.tenant_id, counts } });
      return { ok: true, id: backupId, counts };
    } catch (e: any) {
      await supabaseAdmin.from("system_backups").update({ status: "error", error: e.message, finished_at: new Date().toISOString() }).eq("id", backupId);
      throw e;
    }
  });

export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("system_backups")
      .select("id, tenant_id, kind, file_path, row_counts, status, error, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const signBackupUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin.from("system_backups").select("file_path").eq("id", data.id).maybeSingle();
    if (!row?.file_path) throw new Error("Không có file");
    const { data: signed, error } = await supabaseAdmin.storage.from("backups").createSignedUrl(row.file_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin.from("system_backups").select("file_path").eq("id", data.id).maybeSingle();
    if (row?.file_path) await supabaseAdmin.storage.from("backups").remove([row.file_path]);
    await supabaseAdmin.from("system_backups").delete().eq("id", data.id);
    await logAction(context.userId, "delete_backup", { table: "system_backups", id: data.id });
    return { ok: true };
  });

// =========================================================================
// B3. JOBS
// =========================================================================

const ALLOWED_JOBS = ["rebuild_monthly_summary", "rebuild_account_period_balances", "refresh_report_mvs", "collect_tenant_usage"] as const;

export const listJobRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin.from("system_job_runs").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

export const runSystemJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      job: z.enum(ALLOWED_JOBS),
      tenant_id: z.string().uuid().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data: run, error: insErr } = await supabaseAdmin.from("system_job_runs").insert({
      job: data.job, params: { tenant_id: data.tenant_id ?? null }, status: "running",
      started_at: new Date().toISOString(), created_by: context.userId,
    } as any).select("id").single();
    if (insErr) throw new Error(insErr.message);
    const runId = (run as any).id;
    try {
      let output: any = {};
      if (data.job === "rebuild_monthly_summary") {
        const { error } = await supabaseAdmin.rpc("rebuild_monthly_summary", { p_tenant: data.tenant_id ?? null } as any);
        if (error) throw new Error(error.message);
      } else if (data.job === "rebuild_account_period_balances") {
        const { error } = await supabaseAdmin.rpc("rebuild_account_period_balances", { p_tenant: data.tenant_id ?? null } as any);
        if (error) throw new Error(error.message);
      } else if (data.job === "refresh_report_mvs") {
        const { error } = await supabaseAdmin.rpc("refresh_report_mvs", { p_tenant: data.tenant_id ?? null } as any);
        if (error) throw new Error(error.message);
      } else if (data.job === "collect_tenant_usage") {
        output = await collectUsageInternal(data.tenant_id ?? null);
      }
      await supabaseAdmin.from("system_job_runs").update({
        status: "done", output, finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return { ok: true, id: runId, output };
    } catch (e: any) {
      await supabaseAdmin.from("system_job_runs").update({ status: "error", error: e.message, finished_at: new Date().toISOString() }).eq("id", runId);
      throw e;
    }
  });

async function collectUsageInternal(tenantId: string | null) {
  const ym = new Date().toISOString().slice(0, 7);
  let tenantIds: string[] = [];
  if (tenantId) tenantIds = [tenantId];
  else {
    const { data } = await supabaseAdmin.from("tenants").select("id");
    tenantIds = (data ?? []).map((t: any) => t.id);
  }
  const result: any[] = [];
  for (const tid of tenantIds) {
    const [inv, si, je] = await Promise.all([
      supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
      supabaseAdmin.from("sales_invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
      supabaseAdmin.from("journal_entries").select("id", { count: "exact", head: true }).eq("tenant_id", tid),
    ]);
    const docs = (inv.count ?? 0) + (si.count ?? 0) + (je.count ?? 0);
    await supabaseAdmin.from("tenant_usage").upsert({
      tenant_id: tid, period_ym: ym, documents_count: docs,
    } as any, { onConflict: "tenant_id,period_ym" });
    result.push({ tenant_id: tid, documents_count: docs });
  }
  return { processed: result.length, tenants: result };
}

// =========================================================================
// C1. SETTINGS
// =========================================================================

export const getSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin.from("system_settings").select("*").eq("id", 1).maybeSingle();
    return data ?? { id: 1, value: {} };
  });

export const updateSystemSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ value: z.record(z.string(), z.any()) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("system_settings")
      .update({ value: data.value, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await logAction(context.userId, "update_system_settings", { table: "system_settings", id: "1", after: data.value });
    return { ok: true };
  });

// =========================================================================
// C2. BILLING
// =========================================================================

export const listTenantBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const ym = new Date().toISOString().slice(0, 7);
    const [tenants, plans, usage] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name, status, suspended_at, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("tenant_plans").select("*"),
      supabaseAdmin.from("tenant_usage").select("*").eq("period_ym", ym),
    ]);
    const planMap = new Map((plans.data ?? []).map((p: any) => [p.tenant_id, p]));
    const usageMap = new Map((usage.data ?? []).map((u: any) => [u.tenant_id, u]));
    return (tenants.data ?? []).map((t: any) => ({
      ...t, plan: planMap.get(t.id) ?? null, usage: usageMap.get(t.id) ?? null,
    }));
  });

export const updateTenantPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tenant_id: z.string().uuid(),
      plan: z.string().min(1).max(40),
      seats_limit: z.number().int().nullable().optional(),
      ai_tokens_quota: z.number().int().nullable().optional(),
      storage_quota_mb: z.number().int().nullable().optional(),
      period_start: z.string().nullable().optional(),
      period_end: z.string().nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("tenant_plans").upsert({
      tenant_id: data.tenant_id, plan: data.plan,
      seats_limit: data.seats_limit ?? null, ai_tokens_quota: data.ai_tokens_quota ?? null,
      storage_quota_mb: data.storage_quota_mb ?? null,
      period_start: data.period_start ?? null, period_end: data.period_end ?? null,
      notes: data.notes ?? null, status: "active",
      updated_by: context.userId, updated_at: new Date().toISOString(),
    } as any, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAction(context.userId, "update_tenant_plan", { table: "tenant_plans", id: data.tenant_id, after: data });
    return { ok: true };
  });

export const setTenantSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ tenant_id: z.string().uuid(), suspended: z.boolean(), reason: z.string().max(500).optional() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("tenants").update({
      status: data.suspended ? "suspended" : "active",
      suspended_at: data.suspended ? new Date().toISOString() : null,
      suspended_reason: data.suspended ? (data.reason ?? null) : null,
    } as any).eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    await logAction(context.userId, data.suspended ? "suspend_tenant" : "unsuspend_tenant",
      { table: "tenants", id: data.tenant_id, after: { reason: data.reason } });
    return { ok: true };
  });

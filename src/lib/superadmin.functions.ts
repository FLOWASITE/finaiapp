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

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuperadmin(supabase, userId);

    // Use admin client to bypass RLS for cross-tenant aggregation
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
        .from("period_locks")
        .select("*")
        .eq("user_id", data.tenant_id)
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
    return { ok: true };
  });

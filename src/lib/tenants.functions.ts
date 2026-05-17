import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Liệt kê tất cả tổ chức user là thành viên + role + flag active
export const listMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: memberships, error } = await supabase
      .from("tenant_members")
      .select("id, role, status, tenant_id, tenants(id, name, company_name, tax_id)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .single();

    const activeId = profile?.active_tenant_id ?? null;
    const tenants = (memberships ?? []).map((m: any) => ({
      id: m.tenant_id,
      role: m.role,
      name: m.tenants?.name ?? "(không tên)",
      company_name: m.tenants?.company_name ?? null,
      tax_id: m.tenants?.tax_id ?? null,
      is_active: m.tenant_id === activeId,
    }));
    return { tenants, activeId };
  });

// Đổi tổ chức đang làm việc
export const switchTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify membership
    const { data: m } = await supabase
      .from("tenant_members")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", data.tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (!m) throw new Error("Bạn không thuộc tổ chức này");

    const { error } = await supabase
      .from("profiles")
      .update({ active_tenant_id: data.tenantId })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  company_name: z.string().max(255).optional(),
  tax_id: z.string().max(50).optional(),
  accounting_standard: z.enum(["TT133", "TT200"]).default("TT133"),
  base_currency: z.string().max(10).default("VND"),
});

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateTenantSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = supabaseAdmin;

    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .insert({
        name: data.name,
        company_name: data.company_name ?? data.name,
        tax_id: data.tax_id ?? null,
        accounting_standard: data.accounting_standard,
        base_currency: data.base_currency,
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (tErr || !tenant) throw new Error(tErr?.message || "Không tạo được tổ chức");

    const { error: mErr } = await admin.from("tenant_members").insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: "owner",
      status: "active",
    });
    if (mErr) throw new Error(mErr.message);

    await admin.from("profiles").update({ active_tenant_id: tenant.id }).eq("id", userId);
    return { id: tenant.id };
  });

const UpdateTenantSchema = z.object({
  name: z.string().max(255).nullish(),
  company_name: z.string().max(255).nullish(),
  tax_id: z.string().max(50).nullish(),
  address: z.string().max(500).nullish(),
  phone: z.string().max(50).nullish(),
  accounting_standard: z.enum(["TT133", "TT200"]).nullish(),
  base_currency: z.string().max(10).nullish(),
  fiscal_year_start: z.number().int().min(1).max(12).nullish(),
  logo_url: z.string().nullish(),
  signature_url: z.string().nullish(),
  stamp_url: z.string().nullish(),
  legal_rep_name: z.string().max(255).nullish(),
  chief_accountant_name: z.string().max(255).nullish(),
  preparer_name: z.string().max(255).nullish(),
});

export const updateActiveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateTenantSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .single();
    const tid = profile?.active_tenant_id;
    if (!tid) throw new Error("Chưa chọn tổ chức");

    // Loại bỏ null cho các cột NOT NULL; giữ null cho cột nullable (logo_url, signature_url, stamp_url).
    const NULLABLE = new Set(["logo_url", "signature_url", "stamp_url", "address", "tax_id", "phone", "company_name", "legal_rep_name", "chief_accountant_name", "preparer_name"]);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v === null && !NULLABLE.has(k)) continue;
      patch[k] = v;
    }
    const { error } = await supabase.from("tenants").update(patch as any).eq("id", tid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getActiveTenant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .single();
    const tid = profile?.active_tenant_id;
    if (!tid) return { tenant: null, myRole: null };
    const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tid).single();
    const { data: m } = await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tid)
      .eq("user_id", userId)
      .maybeSingle();
    return { tenant, myRole: m?.role ?? null };
  });

// ===== Members =====
export const listTenantMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).single();
    const tid = profile?.active_tenant_id;
    if (!tid) return { members: [], myRole: null };

    const { data: members } = await supabase
      .from("tenant_members")
      .select("id, user_id, role, status, created_at")
      .eq("tenant_id", tid)
      .order("created_at");

    // Lấy email từ profiles (admin để lấy được)
    const ids = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email").in("id", ids)
      : { data: [] as { id: string; email: string }[] };
    const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

    const { data: me } = await supabase
      .from("tenant_members").select("role").eq("tenant_id", tid).eq("user_id", userId).maybeSingle();

    return {
      members: (members ?? []).map((m) => ({ ...m, email: emailById.get(m.user_id) ?? null })),
      myRole: me?.role ?? null,
    };
  });

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "accountant", "viewer"]),
});

export const inviteTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InviteSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).single();
    const tid = profile?.active_tenant_id;
    if (!tid) throw new Error("Chưa chọn tổ chức");

    // Check role
    const { data: me } = await supabase
      .from("tenant_members").select("role").eq("tenant_id", tid).eq("user_id", userId).maybeSingle();
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new Error("Chỉ Owner/Admin được mời thành viên");
    }

    // Tìm user theo email
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("id").eq("email", data.email).maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin.from("tenant_members").insert({
        tenant_id: tid, user_id: existing.id, role: data.role, status: "active",
      });
      if (error) throw new Error(error.message);
      return { ok: true, added: true };
    }

    // Chưa có account → tạo invitation
    const { error: invErr } = await supabaseAdmin.from("user_invitations").insert({
      email: data.email,
      role: data.role,
      invited_by: userId,
      tenant_owner_id: userId,
      tenant_id: tid,
    } as any);
    if (invErr) throw new Error(invErr.message);
    return { ok: true, invited: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { memberId: string; role: "owner" | "admin" | "accountant" | "viewer" }) =>
    z.object({
      memberId: z.string().uuid(),
      role: z.enum(["owner", "admin", "accountant", "viewer"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("tenant_members").update({ role: data.role }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { memberId: string }) =>
    z.object({ memberId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("tenant_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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

// Common reusable validators
const optionalDate = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const optionalEmail = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().email().max(255).nullable());
const optionalUrl = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().max(500).nullable());
const optionalIdNo = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{9}$|^\d{12}$/).nullable());
const optionalIndustry = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4,6}$/).nullable());

const UpdateTenantSchema = z.object({
  name: z.string().max(255).nullish(),
  company_name: z.string().max(255).nullish(),
  trade_name: z.string().max(255).nullish(),
  tax_id: z.string().max(50).nullish(),
  legal_form: z.enum(["llc","jsc","partnership","sole_prop","household","branch","other"]).nullish(),
  business_reg_no: z.string().max(100).nullish(),
  business_reg_date: optionalDate.optional(),
  business_reg_place: z.string().max(255).nullish(),
  established_date: optionalDate.optional(),
  industry_code: optionalIndustry.optional(),
  industry_name: z.string().max(255).nullish(),
  tax_authority: z.string().max(255).nullish(),
  tax_method: z.enum(["deduction","direct_revenue","direct_gtgt"]).nullish(),
  vat_period: z.enum(["monthly","quarterly"]).nullish(),
  pit_period: z.enum(["monthly","quarterly"]).nullish(),
  address: z.string().max(500).nullish(),
  billing_address: z.string().max(500).nullish(),
  shipping_address: z.string().max(500).nullish(),
  phone: z.string().max(50).nullish(),
  email: optionalEmail.optional(),
  website: optionalUrl.optional(),
  fax: z.string().max(50).nullish(),
  accounting_standard: z.enum(["TT133", "TT200"]).nullish(),
  base_currency: z.string().max(10).nullish(),
  fiscal_year_start: z.number().int().min(1).max(12).nullish(),
  logo_url: z.string().nullish(),
  signature_url: z.string().nullish(),
  stamp_url: z.string().nullish(),
  legal_rep_name: z.string().max(255).nullish(),
  legal_rep_title: z.string().max(255).nullish(),
  legal_rep_id_no: optionalIdNo.optional(),
  legal_rep_id_date: optionalDate.optional(),
  legal_rep_phone: z.string().max(50).nullish(),
  chief_accountant_name: z.string().max(255).nullish(),
  chief_accountant_cert_no: z.string().max(100).nullish(),
  preparer_name: z.string().max(255).nullish(),
});

const NULLABLE_COLS = new Set([
  "logo_url","signature_url","stamp_url","address","tax_id","phone","company_name",
  "trade_name","legal_form","business_reg_no","business_reg_date","business_reg_place",
  "established_date","industry_code","industry_name","tax_authority","tax_method",
  "vat_period","pit_period","billing_address","shipping_address","email","website","fax",
  "legal_rep_name","legal_rep_title","legal_rep_id_no","legal_rep_id_date","legal_rep_phone",
  "chief_accountant_name","chief_accountant_cert_no","preparer_name",
]);

export const updateActiveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateTenantSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).single();
    const tid = profile?.active_tenant_id;
    if (!tid) throw new Error("Chưa chọn tổ chức");

    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v === null && !NULLABLE_COLS.has(k)) continue;
      patch[k] = v;
    }
    const { error } = await supabase.from("tenants").update(patch as any).eq("id", tid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "tax_id", label: "Mã số thuế" },
  { key: "company_name", label: "Tên pháp nhân" },
  { key: "legal_form", label: "Loại hình doanh nghiệp" },
  { key: "business_reg_no", label: "Số GPKD" },
  { key: "business_reg_date", label: "Ngày cấp GPKD" },
  { key: "address", label: "Địa chỉ trụ sở" },
  { key: "accounting_standard", label: "Chuẩn kế toán" },
  { key: "base_currency", label: "Đồng tiền hạch toán" },
  { key: "fiscal_year_start", label: "Tháng bắt đầu năm tài chính" },
  { key: "tax_method", label: "Phương pháp tính thuế GTGT" },
  { key: "vat_period", label: "Kỳ kê khai GTGT" },
  { key: "legal_rep_name", label: "Đại diện pháp luật" },
  { key: "legal_rep_title", label: "Chức danh đại diện" },
];

export const getSetupProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).single();
    const tid = profile?.active_tenant_id;
    if (!tid) return { percent: 0, missing: REQUIRED_FIELDS, completed: false };
    const { data: t } = await supabase.from("tenants").select("*").eq("id", tid).single();
    if (!t) return { percent: 0, missing: REQUIRED_FIELDS, completed: false };
    const missing = REQUIRED_FIELDS.filter((f) => {
      const v = (t as any)[f.key];
      return v === null || v === undefined || v === "";
    });
    const percent = Math.round(((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100);
    return { percent, missing, completed: !!(t as any).setup_completed };
  });

export const completeTenantSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).single();
    const tid = profile?.active_tenant_id;
    if (!tid) throw new Error("Chưa chọn tổ chức");
    const { data: t } = await supabase.from("tenants").select("*").eq("id", tid).single();
    if (!t) throw new Error("Không tìm thấy tổ chức");
    const missing = REQUIRED_FIELDS.filter((f) => {
      const v = (t as any)[f.key];
      return v === null || v === undefined || v === "";
    });
    if (missing.length > 0) {
      throw new Error("Thiếu trường bắt buộc: " + missing.map((m) => m.label).join(", "));
    }
    const { error } = await supabase.from("tenants").update({
      setup_completed: true,
      setup_completed_at: new Date().toISOString(),
    } as any).eq("id", tid);
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
    // Fetch tenant + membership role in parallel (was sequential).
    const [tenantRes, memberRes] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tid).single(),
      supabase
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", tid)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    return { tenant: tenantRes.data, myRole: memberRes.data?.role ?? null };
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null));

const ProspectSchema = z.object({
  id: z.string().uuid().optional(),
  code: optStr(50),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  tax_id: optStr(20),
  contact_person: optStr(255),
  phone: optStr(50),
  email: optStr(255),
  address: optStr(500),
  industry: optStr(255),
  source: optStr(100),
  status: z.enum(["new", "contacted", "negotiating", "won", "lost"]).default("new"),
  estimated_fee: z.number().min(0).default(0),
  account_manager_id: z.string().uuid().optional().nullable(),
  notes: optStr(2000),
});

export const listProspects = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("office_prospects")
      .select("*")
      .eq("agency_tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertProspect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ProspectSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabase
        .from("office_prospects")
        .update(rest)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_prospects")
      .insert({ ...rest, agency_tenant_id: tenantId, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteProspect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("office_prospects")
      .delete()
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Chuyển prospect thành khách hàng: TẠO MỚI tenant FinAI, gán văn phòng làm thành viên,
 *  tạo office_client_links, (tuỳ chọn) gửi lời mời cho contact của khách. */
export const convertProspect = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator(
    (i: {
      prospect_id: string;
      tenant_name?: string;
      tax_id?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
      fee_per_month?: number;
      display_name?: string | null;
      invite_contact_email?: string | null;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const admin = supabaseAdmin;

    const { data: p, error: e1 } = await supabase
      .from("office_prospects")
      .select("name, tax_id, address, phone, email, converted_tenant_id, estimated_fee")
      .eq("id", data.prospect_id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (e1 || !p) throw new Error("Không tìm thấy khách tiềm năng");
    if (p.converted_tenant_id) throw new Error("Khách hàng này đã được tạo trước đó");

    const tenantName = (data.tenant_name ?? p.name).trim();
    if (!tenantName) throw new Error("Thiếu tên khách hàng");

    // 1) Tạo tenant FinAI mới — văn phòng tạm là owner
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .insert({
        name: tenantName,
        company_name: tenantName,
        tax_id: data.tax_id ?? p.tax_id ?? null,
        address: data.address ?? p.address ?? null,
        phone: data.phone ?? p.phone ?? null,
        email: data.email ?? p.email ?? null,
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (tErr || !tenant) throw new Error(tErr?.message || "Không tạo được tenant mới");

    // 2) Văn phòng (user hiện tại) làm owner để quản lý
    const { error: mErr } = await admin.from("tenant_members").insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: "owner",
      status: "active",
    });
    if (mErr) throw new Error(mErr.message);

    // 3) Office client link
    const { data: link, error: e2 } = await admin
      .from("office_client_links")
      .insert({
        agency_tenant_id: tenantId,
        client_tenant_id: tenant.id,
        display_name: data.display_name ?? tenantName,
        fee_per_month: data.fee_per_month ?? Number(p.estimated_fee ?? 0),
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);

    // 4) (tuỳ chọn) gửi lời mời cho contact
    let inviteToken: string | null = null;
    const inviteEmail = (data.invite_contact_email ?? "").trim().toLowerCase();
    if (inviteEmail) {
      const { data: inv, error: iErr } = await admin
        .from("user_invitations")
        .insert({
          tenant_owner_id: userId,
          invited_by: userId,
          tenant_id: tenant.id,
          email: inviteEmail,
          role: "owner",
        })
        .select("token")
        .single();
      if (iErr) throw new Error(iErr.message);
      inviteToken = inv?.token ?? null;
    }

    // 5) Update prospect
    const { error: e3 } = await supabase
      .from("office_prospects")
      .update({ status: "won", converted_tenant_id: tenant.id })
      .eq("id", data.prospect_id)
      .eq("agency_tenant_id", tenantId);
    if (e3) throw new Error(e3.message);

    return { link_id: link!.id, tenant_id: tenant.id, invite_token: inviteToken };
  });


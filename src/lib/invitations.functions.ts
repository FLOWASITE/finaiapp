import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TokenSchema = z.object({ token: z.string().min(8).max(128).regex(/^[a-f0-9]+$/i) });

export const getInvitationByToken = createServerFn({ method: "POST" })
  .inputValidator((input) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: inv } = await supabaseAdmin
      .from("user_invitations")
      .select("id, email, role, tenant_owner_id, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { invitation: null as any, owner: null as any };
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("email, company_name")
      .eq("id", inv.tenant_owner_id)
      .maybeSingle();
    return { invitation: inv, owner };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as any;
    const email = (claims?.email as string | undefined)?.toLowerCase();

    const { data: inv, error: e1 } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!inv) throw new Error("Lời mời không tồn tại.");
    if (inv.accepted_at) throw new Error("Lời mời đã được sử dụng.");
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("Lời mời đã hết hạn.");
    if (email && inv.email.toLowerCase() !== email) {
      throw new Error(`Lời mời được gửi cho ${inv.email}. Vui lòng đăng nhập đúng email.`);
    }

    const { error: e2 } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: inv.role as any });
    if (e2 && !e2.message.includes("duplicate")) throw new Error(e2.message);

    await supabaseAdmin
      .from("user_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", inv.id);

    return { ok: true, role: inv.role };
  });

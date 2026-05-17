import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TokenSchema = z.object({ token: z.string().min(8).max(128).regex(/^[a-f0-9]+$/i) });

export type InvitationStatus =
  | "not_found"
  | "used"
  | "expired"
  | "revoked"
  | "ok";

function classify(inv: { accepted_at: string | null; expires_at: string } | null): InvitationStatus {
  if (!inv) return "not_found";
  if (inv.accepted_at) return "used";
  if (new Date(inv.expires_at).getTime() < Date.now()) return "expired";
  return "ok";
}

export const getInvitationByToken = createServerFn({ method: "POST" })
  .inputValidator((input) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: inv, error } = await supabaseAdmin
      .from("user_invitations")
      .select("id, email, role, tenant_owner_id, expires_at, accepted_at, accepted_by, created_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const status = classify(inv);
    if (!inv) {
      return { status, invitation: null, owner: null };
    }

    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("email, company_name")
      .eq("id", inv.tenant_owner_id)
      .maybeSingle();

    return {
      status,
      invitation: {
        id: inv.id,
        email: (inv.email ?? "").toLowerCase(),
        role: inv.role,
        tenant_owner_id: inv.tenant_owner_id,
        expires_at: inv.expires_at,
        accepted_at: inv.accepted_at,
        created_at: inv.created_at,
      },
      owner,
    };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as any;
    const claimsEmail = (claims?.email as string | undefined)?.toLowerCase() ?? null;

    // 1) Look up the invitation
    const { data: inv, error: e1 } = await supabaseAdmin
      .from("user_invitations")
      .select("id, email, role, tenant_owner_id, expires_at, accepted_at, accepted_by")
      .eq("token", data.token)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!inv) throw new Error("Lời mời không tồn tại hoặc đã bị thu hồi.");

    // 2) Lifecycle checks (used / expired)
    if (inv.accepted_at) {
      if (inv.accepted_by === userId) {
        // Already accepted by the same user → treat as idempotent success
        return { ok: true, role: inv.role, already: true };
      }
      throw new Error("Lời mời đã được sử dụng bởi người khác.");
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      throw new Error("Lời mời đã hết hạn. Hãy yêu cầu chủ tài khoản gửi lại.");
    }

    // 3) Cannot accept your own invitation (owner of the tenant)
    if (inv.tenant_owner_id === userId) {
      throw new Error("Không thể tự chấp nhận lời mời do chính bạn gửi.");
    }

    // 4) Verify the authenticated user against the invited email AND that the
    //    email has been confirmed (avoid impersonation via unverified sign-up).
    const invEmail = (inv.email ?? "").toLowerCase();
    const { data: u, error: ue } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (ue) throw new Error(ue.message);
    const authEmail = (u?.user?.email ?? claimsEmail ?? "").toLowerCase();
    const emailVerified = !!u?.user?.email_confirmed_at;

    if (!authEmail) {
      throw new Error("Không xác định được email của bạn. Vui lòng đăng nhập lại.");
    }
    if (authEmail !== invEmail) {
      throw new Error(`Lời mời được gửi cho ${inv.email}. Vui lòng đăng nhập đúng email đó.`);
    }
    if (!emailVerified) {
      throw new Error("Email của bạn chưa được xác thực. Vui lòng xác minh email rồi thử lại.");
    }

    // 5) Atomically claim the invitation — only succeed if still un-accepted.
    //    Prevents two simultaneous accepts from both granting the role.
    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("user_invitations")
      .update({ accepted_at: nowIso, accepted_by: userId })
      .eq("id", inv.id)
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) {
      throw new Error("Lời mời vừa được sử dụng bởi phiên khác.");
    }

    // 6) Grant the role (idempotent — ignore duplicates)
    const { error: e2 } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: inv.role as any });
    if (e2 && !e2.message.toLowerCase().includes("duplicate")) {
      // Roll back the claim so the user can retry
      await supabaseAdmin
        .from("user_invitations")
        .update({ accepted_at: null, accepted_by: null })
        .eq("id", inv.id);
      throw new Error(e2.message);
    }

    // 7) Audit
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        actor_email: authEmail,
        action: "invitation.accept",
        table_name: "user_invitations",
        record_id: inv.id,
        after: { role: inv.role, tenant_owner_id: inv.tenant_owner_id },
      } as any);
    } catch (err) {
      console.error("[audit] accept invitation log failed", err);
    }

    return { ok: true, role: inv.role, already: false };
  });

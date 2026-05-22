import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptAesGcm, verifyHmacSignature } from "@/lib/crypto.server";

/**
 * Worker calls this to fetch the list of MB Bank accounts that need syncing.
 * Returns decrypted credentials — protected by HMAC.
 */
export const Route = createFileRoute("/api/public/mbbank/accounts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.MBBANK_WORKER_SECRET;
        if (!secret) return new Response("worker not configured", { status: 500 });
        // For GET we sign the path
        const url = new URL(request.url);
        const sig = verifyHmacSignature(url.pathname, request.headers.get("x-mb-signature"), secret);
        if (!sig.ok) return new Response(sig.reason, { status: 401 });

        const { data, error } = await supabaseAdmin
          .from("bank_accounts")
          .select("id, tenant_id, name, account_no, mb_username, mb_password_enc, mb_password_iv, sync_interval_minutes, last_synced_at")
          .eq("sync_enabled", true)
          .not("mb_username", "is", null)
          .not("mb_password_enc", "is", null);
        if (error) return new Response(error.message, { status: 500 });

        const accounts = (data ?? []).map((a) => {
          let password: string | null = null;
          try {
            if (a.mb_password_enc && a.mb_password_iv) {
              password = decryptAesGcm(a.mb_password_enc, a.mb_password_iv);
            }
          } catch {
            password = null;
          }
          return {
            id: a.id,
            tenant_id: a.tenant_id,
            name: a.name,
            account_no: a.account_no,
            username: a.mb_username,
            password,
            sync_interval_minutes: a.sync_interval_minutes,
            last_synced_at: a.last_synced_at,
          };
        }).filter((a) => a.password);

        return Response.json({ accounts });
      },
    },
  },
});

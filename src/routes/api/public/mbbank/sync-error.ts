import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyHmacSignature } from "@/lib/crypto.server";

const BodySchema = z.object({
  bank_account_id: z.string().uuid(),
  error: z.string().max(2000),
  sync_log_id: z.string().uuid().optional().nullable(),
});

export const Route = createFileRoute("/api/public/mbbank/sync-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MBBANK_WORKER_SECRET;
        if (!secret) return new Response("worker not configured", { status: 500 });
        const raw = await request.text();
        const sig = verifyHmacSignature(raw, request.headers.get("x-mb-signature"), secret);
        if (!sig.ok) return new Response(sig.reason, { status: 401 });

        let payload: z.infer<typeof BodySchema>;
        try {
          payload = BodySchema.parse(JSON.parse(raw));
        } catch (e: any) {
          return new Response(`invalid body: ${e?.message || e}`, { status: 400 });
        }

        await supabaseAdmin
          .from("bank_accounts")
          .update({
            last_sync_status: "error",
            last_sync_error: payload.error,
            last_synced_at: new Date().toISOString(),
          } as any)
          .eq("id", payload.bank_account_id);

        if (payload.sync_log_id) {
          await supabaseAdmin
            .from("bank_sync_logs")
            .update({
              finished_at: new Date().toISOString(),
              status: "error",
              error_text: payload.error,
            })
            .eq("id", payload.sync_log_id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});

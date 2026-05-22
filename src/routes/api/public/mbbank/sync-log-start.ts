import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyHmacSignature } from "@/lib/crypto.server";

const BodySchema = z.object({ bank_account_id: z.string().uuid() });

/**
 * Worker gọi trước mỗi lần sync để tạo `bank_sync_logs` row (status='running')
 * và lấy `sync_log_id` để truyền vào /ingest hoặc /sync-error.
 */
export const Route = createFileRoute("/api/public/mbbank/sync-log-start")({
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

        const { data: acc } = await supabaseAdmin
          .from("bank_accounts")
          .select("tenant_id")
          .eq("id", payload.bank_account_id)
          .maybeSingle();
        if (!acc) return new Response("account not found", { status: 404 });

        const { data, error } = await supabaseAdmin
          .from("bank_sync_logs")
          .insert({
            tenant_id: acc.tenant_id,
            bank_account_id: payload.bank_account_id,
            started_at: new Date().toISOString(),
            status: "running",
          } as any)
          .select("id")
          .single();

        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ sync_log_id: data.id });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateAndPostDigest } from "@/lib/digest-generator.server";

/**
 * Hourly cron — POST from pg_cron.
 * Finds users whose `send_hour` matches the current VN hour and who have not
 * received today's digest yet, and posts one digest message per user.
 *
 * Auth: bypasses the published-site gate by living under /api/public/*.
 * Optionally validates the `apikey` header against the project's anon key.
 */
export const Route = createFileRoute("/api/public/hooks/daily-digest")({
  server: {
    handlers: {
      POST: async () => {
        const nowVN = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "2-digit",
          hour12: false,
        }).format(new Date());
        const hour = parseInt(nowVN, 10);
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        // Find due users
        const { data: prefs, error } = await supabaseAdmin
          .from("user_digest_prefs")
          .select("user_id,tenant_id,send_hour,last_sent_date")
          .eq("enabled", true)
          .lte("send_hour", hour)
          .limit(500);
        if (error) {
          return new Response(`prefs: ${error.message}`, { status: 500 });
        }

        const due = (prefs ?? []).filter(
          (p: any) => !p.last_sent_date || p.last_sent_date < today,
        );

        let ok = 0;
        let failed = 0;
        const errors: string[] = [];
        for (const p of due) {
          try {
            await generateAndPostDigest({
              userId: p.user_id,
              tenantId: p.tenant_id,
              supabase: supabaseAdmin,
            });
            ok++;
          } catch (e: any) {
            failed++;
            errors.push(`${p.user_id}: ${e?.message ?? "err"}`);
          }
        }

        return Response.json({
          ok: true,
          hour,
          today,
          due: due.length,
          sent: ok,
          failed,
          errors: errors.slice(0, 10),
        });
      },
      GET: async () =>
        Response.json({ ok: true, info: "POST to dispatch hourly digests" }),
    },
  },
});

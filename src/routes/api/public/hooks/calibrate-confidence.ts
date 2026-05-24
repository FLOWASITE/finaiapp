/**
 * Cron hook: chạy calibration loop trên mọi tenant có đủ mẫu.
 * Lịch: 02:30 UTC daily (sau promote-rules 02:00).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scanAndCalibrateAll } from "@/lib/learning/calibrate.server";

export const Route = createFileRoute("/api/public/hooks/calibrate-confidence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const results = await scanAndCalibrateAll(supabaseAdmin as any);
        return new Response(
          JSON.stringify({
            ok: true,
            tenants_scanned: results.length,
            changed: results.filter((r) => r.changed).length,
            results,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

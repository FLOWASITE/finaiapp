/**
 * Cron hook: scan inbox_decisions across active tenants and promote/demote
 * inbox_rules. Called daily by pg_cron via Supabase REST.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scanAndPromoteRules } from "@/lib/learning/promote-rules.server";

export const Route = createFileRoute("/api/public/hooks/promote-rules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        // Pull active tenants
        const { data: tenants } = await supabaseAdmin
          .from("tenants")
          .select("id")
          .limit(1000);
        const results: any[] = [];
        for (const t of (tenants ?? []) as any[]) {
          try {
            const r = await scanAndPromoteRules(supabaseAdmin as any, t.id);
            if (r.promoted > 0 || r.demoted > 0) results.push(r);
          } catch (e: any) {
            results.push({ tenant_id: t.id, error: e?.message ?? "unknown" });
          }
        }
        return new Response(
          JSON.stringify({ ok: true, tenants_scanned: tenants?.length ?? 0, changes: results }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/feedback-decay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const token = auth?.replace("Bearer ", "") ?? request.headers.get("apikey");
        if (!token) {
          return new Response(JSON.stringify({ error: "missing token" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const supabase = createClient(
          (import.meta as any).env.VITE_SUPABASE_URL!,
          token,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const { decayPenalties } = await import("@/lib/feedback/penalty.server");
        const result = await decayPenalties(supabase);

        // Phase 1: Decay confidence of mappings that haven't been seen for >180 days.
        // 10% reduction per call; mappings under 0.5 are flagged but kept for suggestion.
        let mappingDecayed = 0;
        try {
          const { data: stale } = await supabase
            .from("supplier_item_mappings")
            .select("id, confidence, last_seen_at")
            .lt("last_seen_at", new Date(Date.now() - 180 * 86400_000).toISOString())
            .is("archived_at", null)
            .gt("confidence", 0.3)
            .limit(500);
          for (const row of stale ?? []) {
            const next = Math.max(0.3, Number(row.confidence ?? 0.8) * 0.9);
            await supabase
              .from("supplier_item_mappings")
              .update({ confidence: next })
              .eq("id", row.id);
            mappingDecayed++;
          }
        } catch (e) {
          console.error("mapping decay failed", e);
        }

        // Phase 2: Aggregate supplier-level routing defaults (Layer 1.5).
        let supplierDefaultsUpserted = 0;
        try {
          const { data: tenants } = await supabase
            .from("tenants")
            .select("id")
            .limit(500);
          for (const t of tenants ?? []) {
            const { data: cnt } = await supabase.rpc(
              "fn_aggregate_supplier_defaults",
              { p_tenant_id: t.id },
            );
            supplierDefaultsUpserted += Number(cnt ?? 0);
          }
        } catch (e) {
          console.error("supplier defaults aggregate failed", e);
        }

        return new Response(
          JSON.stringify({
            ok: true,
            ...result,
            mappingDecayed,
            supplierDefaultsUpserted,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});

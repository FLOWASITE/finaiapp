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
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

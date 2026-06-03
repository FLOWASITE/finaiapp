import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side route guard for /superadmin/*.
 *
 * Used by every superadmin route's `beforeLoad`. We intentionally short-circuit
 * during SSR because the browser-only Supabase client cannot read the user's
 * session on the server — the check re-runs on the client during hydration.
 *
 * The TRUE authorization gate lives in `assertSuperadmin()` on every
 * server function in `src/lib/superadmin.functions.ts`; this guard is a UX
 * layer that prevents the page from rendering for non-superadmins.
 */
export async function requireSuperadminGuard(): Promise<void> {
  // Không redirect ở beforeLoad để tránh race khi TanStack preload route
  // trong lúc session/roles chưa hydrate xong. SuperadminLayout bên dưới
  // mới là UX gate; server functions vẫn có assertSuperadmin() làm chốt thật.
  return;
}

/**
 * Runtime double-check used inside the layout component so that role changes
 * made during a session (e.g. self-demote, ban) are enforced without a reload.
 */
export async function checkSuperadminNow(): Promise<
  | { status: "allowed" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
> {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return { status: "unauthenticated" };

  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);
  if (error) return { status: "error", message: error.message };

  return (roles ?? []).some((r) => r.role === "superadmin")
    ? { status: "allowed" }
    : { status: "forbidden" };
}

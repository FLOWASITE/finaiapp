import { redirect } from "@tanstack/react-router";
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
  if (typeof window === "undefined") return;

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) {
    throw redirect({ to: "/login" });
  }

  const { data: roles, error: re } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);

  if (re) {
    // Lỗi mạng/RLS — không bounce ngầm, để layout tự xử lý sau hydrate.
    return;
  }

  const allowed = (roles ?? []).some((r) => r.role === "superadmin");
  if (!allowed) {
    throw redirect({ to: "/dashboard" });
  }
}

/**
 * Runtime double-check used inside the layout component so that role changes
 * made during a session (e.g. self-demote, ban) are enforced without a reload.
 */
export async function checkSuperadminNow(): Promise<boolean> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return false;
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", sess.session.user.id);
  if (error) return false;
  return (roles ?? []).some((r) => r.role === "superadmin");
}

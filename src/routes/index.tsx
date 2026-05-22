import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/login" });
  },
  component: IndexRedirectFallback,
});

function IndexRedirectFallback() {
  useEffect(() => {
    let active = true;
    const fallback = window.setTimeout(() => {
      if (active) window.location.replace("/login");
    }, 800);

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      window.clearTimeout(fallback);
      window.location.replace(data.session ? "/dashboard" : "/login");
    }).catch(() => {
      if (!active) return;
      window.clearTimeout(fallback);
      window.location.replace("/login");
    });

    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
          F
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Đang mở FinAI</h1>
          <p className="text-sm text-muted-foreground">Vui lòng chờ trong giây lát…</p>
        </div>
      </div>
    </main>
  );
}

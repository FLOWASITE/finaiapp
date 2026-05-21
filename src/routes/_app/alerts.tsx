import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AlertTriangle, ArrowRight, Bell } from "lucide-react";

type AlertRow = {
  id: string;
  severity: string;
  title: string;
  body: string | null;
  action_url: string | null;
  created_at: string;
};

const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AlertRow[]> => {
    const { data, error } = await context.supabase
      .from("ai_insights")
      .select("id, severity, title, body, action_url, created_at")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []) as AlertRow[];
  });

export const Route = createFileRoute("/_app/alerts")({
  component: AlertsPage,
  head: () => ({ meta: [{ title: "Cảnh báo · FinAI" }] }),
});

function sevTone(s: string) {
  if (s === "critical") return "bg-rose-500/10 text-rose-600 border-rose-500/30";
  if (s === "warn") return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  return "bg-sky-500/10 text-sky-600 border-sky-500/30";
}

function AlertsPage() {
  const fn = useServerFn(listAlerts);
  const { data, isLoading } = useQuery({ queryKey: ["alerts"], queryFn: () => fn() });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cảnh báo</h1>
          <p className="text-sm text-muted-foreground">
            AI phát hiện các điểm bất thường cần kiểm tra
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Không có cảnh báo nào. Mọi thứ đang ổn.
          </p>
          <Link
            to="/inbox"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Mở hộp việc
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${sevTone(a.severity)}`}>
                  <AlertTriangle className="h-3 w-3" />
                  {a.severity}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{a.title}</div>
                  {a.body && (
                    <p className="text-sm text-muted-foreground mt-1">{a.body}</p>
                  )}
                  {a.action_url && (
                    <a
                      href={a.action_url}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-2"
                    >
                      Xem chi tiết
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

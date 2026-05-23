import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { FinMascot } from "@/components/fin-mascot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listAiInsights, dismissAiInsight } from "@/lib/ai-insights.functions";
import { openAskAi } from "@/lib/open-ask-ai";

const ICON: Record<string, any> = {
  critical: AlertCircle,
  warn: AlertTriangle,
  info: Info,
};
const TONE: Record<string, string> = {
  critical: "text-destructive border-destructive/30 bg-destructive/5",
  warn: "text-amber-600 border-amber-500/30 bg-amber-500/5 dark:text-amber-400",
  info: "text-primary border-primary/30 bg-primary/5",
};

export function InsightWidget() {
  const fetchFn = useServerFn(listAiInsights);
  const dismissFn = useServerFn(dismissAiInsight);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ai_insights"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_insights"] }),
  });

  const items = data?.insights ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Cảnh báo từ AI
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => openAskAi()}>
          Hỏi AI
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Mọi thứ đều ổn. AI sẽ cảnh báo khi có bất thường.
          </p>
        ) : (
          items.slice(0, 5).map((it: any) => {
            const Icon = ICON[it.severity] ?? Info;
            return (
              <div
                key={it.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${TONE[it.severity] ?? TONE.info}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{it.title}</div>
                  {it.body && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{it.body}</div>
                  )}
                  {it.action_url && (
                    <Link
                      to={it.action_url}
                      className="mt-1 inline-block text-xs font-medium underline-offset-2 hover:underline"
                    >
                      Xem chi tiết →
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => dismiss.mutate(it.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  aria-label="Bỏ qua"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

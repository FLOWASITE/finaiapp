import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RotateCcw, Save, Sparkles, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import {
  listAgentModels,
  saveAgentModel,
  resetAllAgentModels,
} from "@/lib/ai-agent-models.functions";

export const Route = createFileRoute("/_app/superadmin/ai-agents")({
  beforeLoad: requireSuperadminGuard,
  component: AiAgentsPage,
});

const PURPOSE_LABEL: Record<string, string> = {
  reasoning: "Reasoning",
  parse: "Parse",
  classify: "Classify",
  chat: "Chat",
  default: "Default",
};

function AiAgentsPage() {
  const listFn = useServerFn(listAgentModels);
  const saveFn = useServerFn(saveAgentModel);
  const resetFn = useServerFn(resetAllAgentModels);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent-models"],
    queryFn: () => listFn(),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const saveMut = useMutation({
    mutationFn: (vars: { agent_key: string; model_name: string | null }) =>
      saveFn({ data: vars }),
    onSuccess: (_r, v) => {
      toast.success(`Đã lưu model cho ${v.agent_key}`);
      setDrafts((d) => {
        const n = { ...d };
        delete n[v.agent_key];
        return n;
      });
      qc.invalidateQueries({ queryKey: ["ai-agent-models"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lưu thất bại"),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: () => {
      toast.success("Đã reset tất cả về mặc định");
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["ai-agent-models"] });
    },
    onError: (e: any) => toast.error(e?.message || "Reset thất bại"),
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/superadmin/ai-model"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Cấu hình Provider chung
          </Link>
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Model AI cho từng Agent
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gán model riêng cho mỗi AI Agent. Để trống = kế thừa cấu hình
            mặc định theo nhóm <i>purpose</i>.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Reset toàn bộ về kế thừa mặc định?")) resetMut.mutate();
          }}
          disabled={resetMut.isPending}
        >
          {resetMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Reset tất cả
        </Button>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Đang tải...
        </div>
      ) : (
        <div className="grid gap-4">
          {(data?.agents ?? []).map((a) => {
            const draft = drafts[a.agent_key];
            const currentValue = draft !== undefined ? draft : (a.model_name ?? "");
            const isDirty = draft !== undefined && draft !== (a.model_name ?? "");

            return (
              <Card key={a.agent_key} className="p-5">
                <div className="flex flex-wrap items-start gap-4 justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{a.label}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {PURPOSE_LABEL[a.purpose] ?? a.purpose}
                      </Badge>
                      <code className="text-[11px] text-muted-foreground">
                        {a.agent_key}
                      </code>
                    </div>
                    {a.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {a.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Đang dùng:{" "}
                      <span className="font-mono text-foreground">
                        {a.effective_model}
                      </span>
                      {!a.model_name && (
                        <span className="ml-2 italic">(kế thừa mặc định)</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 items-center">
                  <Input
                    placeholder="vd: google/gemini-3-flash-preview (để trống = kế thừa)"
                    value={currentValue}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [a.agent_key]: e.target.value }))
                    }
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      saveMut.mutate({
                        agent_key: a.agent_key,
                        model_name: currentValue.trim() || null,
                      })
                    }
                    disabled={!isDirty || saveMut.isPending}
                  >
                    {saveMut.isPending &&
                    saveMut.variables?.agent_key === a.agent_key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4 bg-muted/30 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Gợi ý model</p>
        <ul className="list-disc ml-4 space-y-0.5">
          <li><code>google/gemini-3-flash-preview</code> — mặc định, cân bằng.</li>
          <li><code>google/gemini-2.5-pro</code> — mạnh nhất Gemini, vision tốt.</li>
          <li><code>google/gemini-2.5-flash-lite</code> — rẻ &amp; nhanh.</li>
          <li><code>openai/gpt-5-mini</code> — reasoning tốt, giá vừa.</li>
          <li><code>openai/gpt-5</code> — chính xác cao, đắt &amp; chậm.</li>
        </ul>
      </Card>
    </div>
  );
}

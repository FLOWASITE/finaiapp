import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RotateCcw, Save, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  listAgentModels, saveAgentModel, resetAllAgentModels,
} from "@/lib/ai-agent-models.functions";

const PURPOSE_LABEL: Record<string, string> = {
  reasoning: "Reasoning", parse: "Parse", classify: "Classify", chat: "Chat", default: "Default",
};

type Draft = {
  model_name?: string;
  provider_id?: string | null;
  temperature?: string;
  max_tokens?: string;
};

export function AiAgentsPanel() {
  const listFn = useServerFn(listAgentModels);
  const saveFn = useServerFn(saveAgentModel);
  const resetFn = useServerFn(resetAllAgentModels);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent-models"],
    queryFn: () => listFn(),
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const saveMut = useMutation({
    mutationFn: (vars: any) => saveFn({ data: vars }),
    onSuccess: (_r, v: any) => {
      toast.success(`Đã lưu ${v.agent_key}`);
      setDrafts((d) => { const n = { ...d }; delete n[v.agent_key]; return n; });
      qc.invalidateQueries({ queryKey: ["ai-agent-models"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lưu thất bại"),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: () => {
      toast.success("Đã reset tất cả");
      setDrafts({});
      qc.invalidateQueries({ queryKey: ["ai-agent-models"] });
    },
    onError: (e: any) => toast.error(e?.message || "Reset thất bại"),
  });

  const providers = data?.providers ?? [];
  const defaultProviderLabel = data?.default_provider_label;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Mỗi Agent có thể chọn Provider + Model riêng. Để trống Provider = dùng Mặc định
            {defaultProviderLabel ? ` (${defaultProviderLabel})` : " (Lovable AI)"}.
          </p>
          <Button
            variant="outline" size="sm"
            onClick={() => { if (confirm("Reset toàn bộ?")) resetMut.mutate(); }}
            disabled={resetMut.isPending}
          >
            {resetMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Reset tất cả
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải...
          </div>
        ) : (
          <div className="grid gap-3">
            {(data?.agents ?? []).map((a: any) => {
              const draft = drafts[a.agent_key] || {};
              const model = draft.model_name !== undefined ? draft.model_name : (a.model_name ?? "");
              const providerId = draft.provider_id !== undefined ? draft.provider_id : (a.provider_id ?? "");
              const temperature = draft.temperature !== undefined ? draft.temperature : (a.temperature != null ? String(a.temperature) : "");
              const maxTokens = draft.max_tokens !== undefined ? draft.max_tokens : (a.max_tokens != null ? String(a.max_tokens) : "");
              const isDirty = Object.keys(draft).length > 0;
              const disabled = !a.is_active;

              return (
                <Card key={a.agent_key} className={`p-4 ${disabled ? "opacity-70" : ""}`}>
                  <div className="flex items-start gap-2 flex-wrap mb-3">
                    <h3 className="font-semibold text-sm">{a.label}</h3>
                    <Badge variant="secondary" className="text-[10px]">{PURPOSE_LABEL[a.purpose] ?? a.purpose}</Badge>
                    {disabled && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
                            <Lock className="h-2.5 w-2.5" /> Chưa dùng LLM
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Engine rule-based.</TooltipContent>
                      </Tooltip>
                    )}
                    <code className="text-[10px] text-muted-foreground">{a.agent_key}</code>
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground mb-3">{a.description}</p>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px]">Provider</Label>
                      <Select
                        value={providerId || "__default__"}
                        onValueChange={(v) => setDrafts((d) => ({ ...d, [a.agent_key]: { ...d[a.agent_key], provider_id: v === "__default__" ? null : v } }))}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">Mặc định {defaultProviderLabel ? `(${defaultProviderLabel})` : "(Lovable AI)"}</SelectItem>
                          {providers.filter((p: any) => p.enabled).map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.label}{p.is_default ? " ★" : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px]">Model</Label>
                      <Input
                        value={model}
                        onChange={(e) => setDrafts((d) => ({ ...d, [a.agent_key]: { ...d[a.agent_key], model_name: e.target.value } }))}
                        placeholder="vd: openai/gpt-4o-mini"
                        className="h-8 font-mono text-xs"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Temperature (0–2, trống = mặc định)</Label>
                      <Input
                        type="number" step="0.1" min="0" max="2"
                        value={temperature}
                        onChange={(e) => setDrafts((d) => ({ ...d, [a.agent_key]: { ...d[a.agent_key], temperature: e.target.value } }))}
                        className="h-8 text-xs"
                        disabled={disabled}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Max Tokens (trống = mặc định)</Label>
                      <Input
                        type="number" min="1"
                        value={maxTokens}
                        onChange={(e) => setDrafts((d) => ({ ...d, [a.agent_key]: { ...d[a.agent_key], max_tokens: e.target.value } }))}
                        className="h-8 text-xs"
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Đang dùng: <span className="font-mono">{a.model_name || "(kế thừa)"}</span>
                      {a.provider_label ? <span className="ml-2">qua <b>{a.provider_label}</b></span> : null}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => saveMut.mutate({
                        agent_key: a.agent_key,
                        model_name: model.trim() || null,
                        provider_id: providerId || null,
                        temperature: temperature === "" ? null : Number(temperature),
                        max_tokens: maxTokens === "" ? null : Number(maxTokens),
                      })}
                      disabled={!isDirty || saveMut.isPending || disabled}
                    >
                      {saveMut.isPending && (saveMut.variables as any)?.agent_key === a.agent_key
                        ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

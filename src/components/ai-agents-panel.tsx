import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Lock, Check, ChevronsUpDown, Zap, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  listAgentModels, saveAgentModel, resetAllAgentModels,
} from "@/lib/ai-agent-models.functions";
import { listProviderModels, testProvider } from "@/lib/ai-providers.functions";

const PURPOSE_LABEL: Record<string, string> = {
  reasoning: "Reasoning", parse: "Parse", classify: "Classify", chat: "Chat", default: "Default",
};

type Draft = {
  model_name?: string;
  provider_id?: string | null;
  temperature?: string;
  max_tokens?: string;
};

type ModelOption = { id: string; name: string; context_length: number | null };

function ModelCombobox({
  value, onChange, models, loading, onLoad, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  models: ModelOption[] | undefined;
  loading: boolean;
  onLoad: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !models && !loading) onLoad();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-8 w-full justify-between font-mono text-xs font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Chọn model…"}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Tìm hoặc nhập model ID…"
            value={typed}
            onValueChange={setTyped}
          />
          <CommandList className="max-h-[280px]">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Đang tải model…
              </div>
            ) : !models ? (
              <div className="p-3 text-xs text-muted-foreground">
                <Button type="button" size="sm" variant="secondary" className="w-full" onClick={onLoad}>
                  <Download className="h-3.5 w-3.5 mr-2" /> Tải danh sách model
                </Button>
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="p-2 text-xs space-y-2">
                    <p className="text-muted-foreground">Không có model khớp.</p>
                    {typed && (
                      <Button
                        type="button" size="sm" variant="outline" className="w-full"
                        onClick={() => { onChange(typed.trim()); setOpen(false); }}
                      >
                        Dùng tên tự nhập: <span className="font-mono ml-1">{typed.trim()}</span>
                      </Button>
                    )}
                  </div>
                </CommandEmpty>
                <CommandGroup heading={`${models.length} model`}>
                  {models.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => { onChange(m.id); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", value === m.id ? "opacity-100" : "opacity-0")} />
                      <span className="font-mono text-xs flex-1 truncate">{m.id}</span>
                      {m.context_length ? (
                        <span className="text-[10px] text-muted-foreground ml-2">{Math.round(m.context_length / 1000)}k</span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {typed && !models.some((m) => m.id === typed.trim()) && (
                  <CommandGroup heading="Nhập tay">
                    <CommandItem
                      value={`__custom__${typed}`}
                      onSelect={() => { onChange(typed.trim()); setOpen(false); }}
                    >
                      <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                      <span className="font-mono text-xs">Dùng "{typed.trim()}"</span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AiAgentsPanel() {
  const listFn = useServerFn(listAgentModels);
  const saveFn = useServerFn(saveAgentModel);
  const resetFn = useServerFn(resetAllAgentModels);
  const listModelsFn = useServerFn(listProviderModels);
  const testProviderFn = useServerFn(testProvider);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent-models"],
    queryFn: () => listFn(),
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelOption[]>>({});
  const [loadingProvider, setLoadingProvider] = useState<Record<string, boolean>>({});
  const [testingAgent, setTestingAgent] = useState<string | null>(null);

  const providers = data?.providers ?? [];
  const defaultProviderLabel = data?.default_provider_label;
  const defaultProviderId = useMemo(
    () => (providers.find((p: any) => p.is_default && p.enabled)?.id as string | undefined),
    [providers],
  );

  const loadModels = async (providerId: string) => {
    if (modelsByProvider[providerId] || loadingProvider[providerId]) return;
    setLoadingProvider((s) => ({ ...s, [providerId]: true }));
    try {
      const res = await listModelsFn({ data: { id: providerId } });
      setModelsByProvider((s) => ({ ...s, [providerId]: res.models }));
      toast.success(`Đã tải ${res.count} model`);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách model");
    } finally {
      setLoadingProvider((s) => ({ ...s, [providerId]: false }));
    }
  };

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

  const handleTest = async (agentKey: string, providerId: string | undefined, model: string) => {
    if (!providerId) {
      toast.error("Chưa có Provider mặc định khả dụng để test.");
      return;
    }
    if (!model.trim()) {
      toast.error("Nhập tên model trước khi test.");
      return;
    }
    setTestingAgent(agentKey);
    try {
      const res: any = await testProviderFn({ data: { id: providerId, model: model.trim() } });
      if (res.ok) {
        toast.success(`Test OK · ${res.latencyMs}ms`, {
          description: res.reply ? `Reply: ${res.reply}` : undefined,
        });
      } else {
        toast.error(`Test thất bại · HTTP ${res.status}`, {
          description: String(res.body || "").slice(0, 300),
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Test thất bại");
    } finally {
      setTestingAgent(null);
    }
  };

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
              const effectiveProviderId = providerId || defaultProviderId;
              const temperature = draft.temperature !== undefined ? draft.temperature : (a.temperature != null ? String(a.temperature) : "");
              const maxTokens = draft.max_tokens !== undefined ? draft.max_tokens : (a.max_tokens != null ? String(a.max_tokens) : "");
              const isDirty = Object.keys(draft).length > 0;
              const disabled = !a.is_active;
              const cachedModels = effectiveProviderId ? modelsByProvider[effectiveProviderId] : undefined;
              const isLoadingModels = effectiveProviderId ? !!loadingProvider[effectiveProviderId] : false;
              const isPreview = /-preview\b/i.test(model);

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
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Model</Label>
                        {effectiveProviderId && (
                          <button
                            type="button"
                            className="text-[10px] text-primary hover:underline disabled:opacity-50"
                            disabled={isLoadingModels || disabled}
                            onClick={() => loadModels(effectiveProviderId)}
                          >
                            {isLoadingModels ? "Đang tải…" : cachedModels ? `Tải lại (${cachedModels.length})` : "Tải danh sách model"}
                          </button>
                        )}
                      </div>
                      {effectiveProviderId ? (
                        <ModelCombobox
                          value={model}
                          onChange={(v) => setDrafts((d) => ({ ...d, [a.agent_key]: { ...d[a.agent_key], model_name: v } }))}
                          models={cachedModels}
                          loading={isLoadingModels}
                          onLoad={() => loadModels(effectiveProviderId)}
                          disabled={disabled}
                        />
                      ) : (
                        <Input
                          value={model}
                          onChange={(e) => setDrafts((d) => ({ ...d, [a.agent_key]: { ...d[a.agent_key], model_name: e.target.value } }))}
                          placeholder="vd: openai/gpt-4o-mini"
                          className="h-8 font-mono text-xs"
                          disabled={disabled}
                        />
                      )}
                      <p className={cn("text-[10px] mt-1", isPreview ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                        {isPreview
                          ? "⚠️ Model -preview thường bị giới hạn khu vực (VN có thể không gọi được)."
                          : "Tránh các model có hậu tố -preview nếu workspace ở VN — thường bị giới hạn khu vực."}
                      </p>
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

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Đang dùng: <span className="font-mono">{a.model_name || "(kế thừa)"}</span>
                      {a.provider_label ? <span className="ml-2">qua <b>{a.provider_label}</b></span> : null}
                    </p>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm" variant="outline"
                            onClick={() => handleTest(a.agent_key, effectiveProviderId, model)}
                            disabled={disabled || testingAgent === a.agent_key || !model.trim()}
                          >
                            {testingAgent === a.agent_key
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <><Zap className="h-3.5 w-3.5 mr-1" /> Test</>}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Gọi thử model để kiểm tra region/latency.</TooltipContent>
                      </Tooltip>
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

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Wand2,
  ChevronsUpDown,
  Check,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  Cpu,
  Settings2,
  Zap,
  MessageSquare,
  FileScan,
  Brain,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import {
  getAiModelConfig,
  saveAiModelConfig,
  testAiModelConfig,
  listAiModels,
} from "@/lib/ai-config.functions";

export const Route = createFileRoute("/_app/superadmin/ai-model")({
  beforeLoad: requireSuperadminGuard,
  component: AiModelPage,
});

type FormState = {
  enabled: boolean;
  provider_label: string;
  base_url: string;
  model_default: string;
  model_chat: string;
  model_parse: string;
  model_reasoning: string;
  extra_headers_json: string;
  notes: string;
  api_key: string;
  clearKey: boolean;
};

type ModelOption = {
  id: string;
  name: string;
  description: string | null;
  context_length: number | null;
  pricing: { prompt: string | null; completion: string | null } | null;
  isFree: boolean;
};

const OPENROUTER_PRESET = {
  provider_label: "OpenRouter",
  base_url: "https://openrouter.ai/api/v1",
  model_default: "openai/gpt-4o-mini",
  model_chat: "openai/gpt-4o-mini",
  model_parse: "google/gemini-2.5-flash",
  model_reasoning: "deepseek/deepseek-r1",
  extra_headers_json: JSON.stringify(
    {
      "HTTP-Referer": "https://app.finai.one",
      "X-Title": "FinAI",
    },
    null,
    2,
  ),
};

const ALIBABA_PRESETS = {
  intl: {
    provider_label: "Alibaba Qwen (Intl)",
    base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model_default: "qwen-plus",
    model_chat: "qwen-plus",
    model_parse: "qwen-vl-max",
    model_reasoning: "qwq-plus",
    extra_headers_json: "",
  },
  cn: {
    provider_label: "Alibaba Qwen (CN)",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model_default: "qwen-plus",
    model_chat: "qwen-plus",
    model_parse: "qwen-vl-max",
    model_reasoning: "qwq-plus",
    extra_headers_json: "",
  },
} as const;

function AiModelPage() {
  const getCfg = useServerFn(getAiModelConfig);
  const saveCfg = useServerFn(saveAiModelConfig);
  const testCfg = useServerFn(testAiModelConfig);
  const listModels = useServerFn(listAiModels);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ai-model-config"],
    queryFn: () => getCfg(),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);

  useEffect(() => {
    if (!data) return;
    const c = data.config;
    setForm({
      enabled: c.enabled,
      provider_label: c.provider_label,
      base_url: c.base_url,
      model_default: c.model_default,
      model_chat: c.model_chat ?? "",
      model_parse: c.model_parse ?? "",
      model_reasoning: c.model_reasoning ?? "",
      extra_headers_json:
        Object.keys(c.extra_headers ?? {}).length > 0
          ? JSON.stringify(c.extra_headers, null, 2)
          : "",
      notes: c.notes ?? "",
      api_key: "",
      clearKey: false,
    });
  }, [data]);

  const hasKey = !!data?.hasApiKey;
  const isOpenRouter = !!form && /openrouter\.ai/i.test(form.base_url);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const applyOpenRouterPreset = () => {
    if (!form) return;
    setForm({
      ...form,
      ...OPENROUTER_PRESET,
      enabled: true,
    });
    toast.success("Đã áp preset OpenRouter — nhớ nhập API key và lưu.");
  };

  const onLoadModels = async () => {
    if (!form) return;
    setLoadingModels(true);
    try {
      const r: any = await listModels({ data: { base_url: form.base_url } });
      setModels(r.models as ModelOption[]);
      toast.success(`Đã tải ${r.count} model.`);
    } catch (e: any) {
      toast.error("Không tải được danh sách model: " + e.message);
    } finally {
      setLoadingModels(false);
    }
  };

  const onSave = async () => {
    if (!form) return;
    let extra_headers: Record<string, string> = {};
    if (form.extra_headers_json.trim()) {
      try {
        const parsed = JSON.parse(form.extra_headers_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          extra_headers = parsed;
        } else throw new Error("Phải là object JSON");
      } catch (e: any) {
        toast.error("Extra headers JSON không hợp lệ: " + e.message);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: any = {
        enabled: form.enabled,
        provider_label: form.provider_label,
        base_url: form.base_url,
        model_default: form.model_default,
        model_chat: form.model_chat || null,
        model_parse: form.model_parse || null,
        model_reasoning: form.model_reasoning || null,
        extra_headers,
        notes: form.notes || null,
      };
      if (form.clearKey) payload.api_key = "";
      else if (form.api_key) payload.api_key = form.api_key;
      await saveCfg({ data: payload });
      toast.success("Đã lưu cấu hình AI Model");
      setForm((f) => (f ? { ...f, api_key: "", clearKey: false } : f));
      await refetch();
    } catch (e: any) {
      toast.error("Lưu thất bại: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r: any = await testCfg();
      if (r.ok) {
        setTestResult({
          ok: true,
          msg: `OK · ${r.latencyMs}ms · "${r.reply || "(rỗng)"}"`,
        });
      } else {
        setTestResult({ ok: false, msg: `HTTP ${r.status} (${r.latencyMs}ms) — ${r.body}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Đang tải cấu hình…
      </div>
    );
  }

  const isCustomActive = form.enabled && hasKey && !!form.base_url;
  const missingSetup = form.enabled && (!form.base_url || (!hasKey && !form.api_key));

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      {/* Hero status */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">AI Model</h2>
              {isCustomActive ? (
                <Badge className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {isOpenRouter ? "OpenRouter" : "Custom"} · {form.provider_label}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  Mặc định: Lovable AI
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nguồn AI dùng cho Chat, Parse hoá đơn/sao kê, đề xuất định khoản…
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2">
            <Label htmlFor="enabled-switch" className="text-sm cursor-pointer">
              Bật custom
            </Label>
            <Switch
              id="enabled-switch"
              checked={form.enabled}
              onCheckedChange={(v) => update("enabled", v)}
            />
          </div>
        </div>

        {missingSetup && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Đã bật nhưng còn thiếu base URL hoặc API key. Hệ thống sẽ fallback Lovable AI.
            </span>
          </div>
        )}
      </Card>

      {/* OpenRouter quick setup */}
      {!isOpenRouter && (
        <Card className="flex flex-wrap items-center gap-3 border-dashed p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wand2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-sm font-medium">Khuyến nghị: OpenRouter</div>
            <p className="text-xs text-muted-foreground">
              Gateway thống nhất 300+ model qua API tương thích OpenAI.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Tạo API key <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={applyOpenRouterPreset}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Áp preset
          </Button>
        </Card>
      )}

      <Tabs defaultValue="provider" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="provider" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Provider
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> Models
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Nâng cao
          </TabsTrigger>
        </TabsList>

        {/* PROVIDER */}
        <TabsContent value="provider" className="space-y-4 mt-0">
          <Card className="p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tên provider</Label>
                <Input
                  value={form.provider_label}
                  onChange={(e) => update("provider_label", e.target.value)}
                  placeholder="OpenRouter / OpenAI / Groq…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input
                  value={form.base_url}
                  onChange={(e) => update("base_url", e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> API Key
                </Label>
                {hasKey && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Đã lưu (AES-GCM)
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={form.api_key}
                  disabled={form.clearKey}
                  onChange={(e) => update("api_key", e.target.value)}
                  placeholder={
                    hasKey
                      ? "••••••••• (nhập mới để thay)"
                      : isOpenRouter
                        ? "sk-or-v1-..."
                        : "sk-..."
                  }
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {hasKey && (
                <label className="inline-flex items-center gap-1.5 text-xs text-destructive cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.clearKey}
                    onChange={(e) => update("clearKey", e.target.checked)}
                    className="accent-destructive"
                  />
                  Xoá API key khi lưu
                </label>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* MODELS */}
        <TabsContent value="models" className="space-y-4 mt-0">
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Phân bổ model theo tác vụ</div>
                <p className="text-xs text-muted-foreground">
                  Để trống = dùng model mặc định.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {models.length > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyFree}
                      onChange={(e) => setOnlyFree(e.target.checked)}
                    />
                    Chỉ miễn phí
                  </label>
                )}
                <Button size="sm" variant="outline" onClick={onLoadModels} disabled={loadingModels}>
                  {loadingModels ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {models.length > 0 ? `Tải lại (${models.length})` : "Tải danh sách"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ModelField
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Mặc định"
                required
                value={form.model_default}
                onChange={(v) => update("model_default", v)}
                models={models}
                onlyFree={onlyFree}
                placeholder="openai/gpt-4o-mini"
              />
              <ModelField
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Chat"
                value={form.model_chat}
                onChange={(v) => update("model_chat", v)}
                models={models}
                onlyFree={onlyFree}
                placeholder="(trống = mặc định)"
              />
              <ModelField
                icon={<FileScan className="h-3.5 w-3.5" />}
                label="Parse hoá đơn"
                value={form.model_parse}
                onChange={(v) => update("model_parse", v)}
                models={models}
                onlyFree={onlyFree}
                placeholder="google/gemini-2.5-flash"
              />
              <ModelField
                icon={<Brain className="h-3.5 w-3.5" />}
                label="Reasoning"
                value={form.model_reasoning}
                onChange={(v) => update("model_reasoning", v)}
                models={models}
                onlyFree={onlyFree}
                placeholder="deepseek/deepseek-r1"
              />
            </div>
          </Card>
        </TabsContent>

        {/* ADVANCED */}
        <TabsContent value="advanced" className="space-y-4 mt-0">
          <Card className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Extra headers (JSON)</Label>
              <Textarea
                rows={4}
                value={form.extra_headers_json}
                onChange={(e) => update("extra_headers_json", e.target.value)}
                placeholder={`{\n  "HTTP-Referer": "https://app.finai.one",\n  "X-Title": "FinAI"\n}`}
                className="font-mono text-xs"
              />
              {isOpenRouter && (
                <p className="text-[11px] text-muted-foreground">
                  OpenRouter khuyến nghị gửi <code className="rounded bg-muted px-1">HTTP-Referer</code>{" "}
                  và <code className="rounded bg-muted px-1">X-Title</code>.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>Ghi chú nội bộ</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Chỉ admin nhìn thấy"
              />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/85 backdrop-blur md:left-60">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center gap-3 px-4 py-3">
          {testResult && (
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs flex-1 min-w-0 truncate",
                testResult.ok ? "text-emerald-600" : "text-destructive",
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{testResult.msg}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={onTest} disabled={testing || !hasKey}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test kết nối
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu cấu hình
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelField({
  label,
  icon,
  required,
  value,
  onChange,
  models,
  onlyFree,
  placeholder,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  models: ModelOption[];
  onlyFree: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    return onlyFree ? models.filter((m) => m.isFree) : models;
  }, [models, onlyFree]);
  const selected = models.find((m) => m.id === value);

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 font-mono text-sm"
        />
        {models.length > 0 && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" type="button" title="Chọn từ danh sách">
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Tìm model…" />
                <CommandList>
                  <CommandEmpty>Không có model phù hợp.</CommandEmpty>
                  <CommandGroup>
                    {filtered.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={m.id + " " + m.name}
                        onSelect={() => {
                          onChange(m.id);
                          setOpen(false);
                        }}
                        className="flex items-start gap-2"
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 mt-0.5",
                            value === m.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs truncate">{m.id}</span>
                            {m.isFree && (
                              <Badge variant="secondary" className="text-[10px] h-4">
                                free
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {m.name}
                            {m.context_length
                              ? ` · ${(m.context_length / 1000).toFixed(0)}k ctx`
                              : ""}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {selected && (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {selected.context_length && (
            <Badge variant="outline" className="font-normal">
              {(selected.context_length / 1000).toFixed(0)}k ctx
            </Badge>
          )}
          {selected.isFree ? (
            <Badge variant="secondary" className="font-normal">free</Badge>
          ) : selected.pricing?.prompt ? (
            <Badge variant="outline" className="font-normal">
              in ${selected.pricing.prompt} · out ${selected.pricing.completion}
            </Badge>
          ) : null}
        </div>
      )}
    </div>
  );
}

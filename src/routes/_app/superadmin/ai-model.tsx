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
  Trash2,
  Code2,
  Search,
  Inbox,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

function hostFromUrl(u: string): string | null {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
}

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
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showTestDetail, setShowTestDetail] = useState(false);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  useEffect(() => {
    if (!data) return;
    const c = data.config;
    const f: FormState = {
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
    };
    setForm(f);
    setInitialForm(f);
  }, [data]);

  const hasKey = !!data?.hasApiKey;
  const isOpenRouter = !!form && /openrouter\.ai/i.test(form.base_url);
  const isAlibaba = !!form && /dashscope.*aliyuncs\.com/i.test(form.base_url);

  const dirty = useMemo(() => {
    if (!form || !initialForm) return false;
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  // Live JSON validation for extra headers
  const headersError = useMemo(() => {
    if (!form?.extra_headers_json.trim()) return null;
    try {
      const p = JSON.parse(form.extra_headers_json);
      if (!p || typeof p !== "object" || Array.isArray(p))
        return "Phải là một object JSON";
      return null;
    } catch (e: any) {
      return e.message as string;
    }
  }, [form?.extra_headers_json]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const applyOpenRouterPreset = () => {
    if (!form) return;
    setForm({ ...form, ...OPENROUTER_PRESET, enabled: true });
    toast.success("Đã áp preset OpenRouter — nhớ nhập API key và lưu.");
  };

  const applyAlibabaPreset = (region: "intl" | "cn") => {
    if (!form) return;
    setForm({ ...form, ...ALIBABA_PRESETS[region], enabled: true });
    toast.success(
      `Đã áp preset Alibaba Qwen (${region === "intl" ? "Intl" : "CN"}) — nhập DashScope API key rồi lưu.`,
    );
  };

  const onFormatHeaders = () => {
    if (!form) return;
    try {
      const p = JSON.parse(form.extra_headers_json || "{}");
      update("extra_headers_json", JSON.stringify(p, null, 2));
      toast.success("Đã format JSON.");
    } catch (e: any) {
      toast.error("JSON không hợp lệ: " + e.message);
    }
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
    if (headersError) {
      toast.error("Extra headers JSON không hợp lệ: " + headersError);
      return;
    }
    let extra_headers: Record<string, string> = {};
    if (form.extra_headers_json.trim()) {
      extra_headers = JSON.parse(form.extra_headers_json);
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
  const host = hostFromUrl(form.base_url);

  // status: active | warning | muted
  const status: "active" | "warning" | "muted" = missingSetup
    ? "warning"
    : isCustomActive
      ? "active"
      : "muted";

  const providerName = isOpenRouter
    ? "OpenRouter"
    : isAlibaba
      ? "Alibaba Qwen"
      : form.provider_label || "Custom";

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      {/* Hero */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl",
              status === "active" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
              status === "warning" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              status === "muted" && "bg-muted text-muted-foreground",
            )}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold">AI Model</h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  status === "active" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  status === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  status === "muted" && "bg-muted text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status === "active" && "bg-emerald-500",
                    status === "warning" && "bg-amber-500",
                    status === "muted" && "bg-muted-foreground/60",
                  )}
                />
                {status === "active" && `${providerName} đang hoạt động`}
                {status === "warning" && "Thiếu setup"}
                {status === "muted" && "Lovable AI (mặc định)"}
              </span>
            </div>
            {isCustomActive && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {host && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono">{host}</span>
                )}
                {form.model_default && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
                    {form.model_default}
                  </span>
                )}
              </div>
            )}
            {!isCustomActive && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Nguồn AI cho Chat, Parse hoá đơn/sao kê, đề xuất định khoản…
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="enabled-switch" className="text-sm cursor-pointer leading-tight">
                Custom provider
              </Label>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {form.enabled ? "Tắt → dùng Lovable AI" : "Đang dùng Lovable AI"}
              </span>
            </div>
            <Switch
              id="enabled-switch"
              checked={form.enabled}
              onCheckedChange={(v) => update("enabled", v)}
            />
          </div>
        </div>

        {missingSetup && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Đã bật nhưng còn thiếu base URL hoặc API key. Hệ thống sẽ fallback Lovable AI cho tới khi hoàn tất.
            </span>
          </div>
        )}
      </Card>

      {/* Presets */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">Preset nhanh</div>
          <span className="text-xs text-muted-foreground">
            — chọn provider, tự fill cấu hình
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <PresetCard
            active={isOpenRouter}
            logo="OR"
            logoBg="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
            title="OpenRouter"
            description="Gateway 300+ model OpenAI-compatible."
            meta={["Cần HTTP-Referer / X-Title", "openrouter.ai"]}
            keyHref="https://openrouter.ai/keys"
            action={
              <Button size="sm" variant="outline" onClick={applyOpenRouterPreset} className="w-full">
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Áp preset OpenRouter
              </Button>
            }
          />
          <PresetCard
            active={isAlibaba}
            logo="通义"
            logoBg="bg-orange-500/15 text-orange-600 dark:text-orange-400"
            title="Alibaba Qwen"
            description="Qwen-plus / max / vl / qwq · DashScope."
            meta={["Không cần extra headers", "Chọn region"]}
            keyHref="https://bailian.console.alibabacloud.com/?apiKey=1"
            action={
              <div className="inline-flex w-full overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={() => applyAlibabaPreset("intl")}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                    /dashscope-intl/.test(form.base_url)
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  Intl · Singapore
                </button>
                <div className="w-px bg-border" />
                <button
                  type="button"
                  onClick={() => applyAlibabaPreset("cn")}
                  className={cn(
                    "flex-1 px-3 py-1.5 text-xs font-medium transition-colors",
                    /^https:\/\/dashscope\.aliyuncs/.test(form.base_url)
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  China · Beijing
                </button>
              </div>
            }
          />
        </div>
      </Card>

      {/* Provider + Models (merged) */}
      <Card className="p-4 md:p-5 space-y-5">
        {/* Provider section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">Provider & API key</div>
          </div>

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
              {host && (
                <p className="text-[11px] text-muted-foreground">
                  → <span className="font-mono">{host}</span>
                </p>
              )}
            </div>
          </div>

          {/* API key block */}
          <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-sm">API Key</Label>
                {hasKey && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Đã lưu · AES-GCM
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.clearKey ? "destructive" : "ghost"}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => update("clearKey", !form.clearKey)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      {form.clearKey ? "Sẽ xoá khi lưu" : "Xoá key"}
                    </Button>
                  </div>
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
            </div>
          </div>
        </div>

        <Separator />

        {/* Models section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">Phân bổ model theo tác vụ</div>
            <span className="text-xs text-muted-foreground">— để trống = dùng mặc định</span>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder={
                  models.length > 0
                    ? `Tìm trong ${models.length} model…`
                    : "Tải danh sách trước khi tìm…"
                }
                disabled={models.length === 0}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer rounded-md border px-2.5 py-1.5">
              <input
                type="checkbox"
                checked={onlyFree}
                onChange={(e) => setOnlyFree(e.target.checked)}
                disabled={models.length === 0}
              />
              Chỉ miễn phí
            </label>
            <Button size="sm" variant="outline" onClick={onLoadModels} disabled={loadingModels}>
              {loadingModels ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {models.length > 0 ? "Tải lại" : "Tải danh sách"}
            </Button>
          </div>

          {models.length === 0 && !loadingModels && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" />
              Chưa tải danh sách. Bạn vẫn có thể gõ model ID thủ công bên dưới.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <ModelField
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Mặc định"
              required
              value={form.model_default}
              onChange={(v) => update("model_default", v)}
              models={models}
              onlyFree={onlyFree}
              search={modelSearch}
              placeholder="openai/gpt-4o-mini"
            />
            <ModelField
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Chat"
              value={form.model_chat}
              onChange={(v) => update("model_chat", v)}
              models={models}
              onlyFree={onlyFree}
              search={modelSearch}
              placeholder="(trống = mặc định)"
            />
            <ModelField
              icon={<FileScan className="h-3.5 w-3.5" />}
              label="Parse hoá đơn"
              value={form.model_parse}
              onChange={(v) => update("model_parse", v)}
              models={models}
              onlyFree={onlyFree}
              search={modelSearch}
              placeholder="google/gemini-2.5-flash"
            />
            <ModelField
              icon={<Brain className="h-3.5 w-3.5" />}
              label="Reasoning"
              value={form.model_reasoning}
              onChange={(v) => update("model_reasoning", v)}
              models={models}
              onlyFree={onlyFree}
              search={modelSearch}
              placeholder="deepseek/deepseek-r1"
            />
          </div>
        </div>

        {/* Advanced (collapsible) */}
        <details className="group rounded-lg border bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Tuỳ chọn nâng cao (headers, ghi chú)
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t bg-background/50 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Extra headers (JSON)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={onFormatHeaders}
                  disabled={!form.extra_headers_json.trim()}
                >
                  <Code2 className="mr-1 h-3 w-3" />
                  Format JSON
                </Button>
              </div>
              <Textarea
                rows={4}
                value={form.extra_headers_json}
                onChange={(e) => update("extra_headers_json", e.target.value)}
                placeholder={`{\n  "HTTP-Referer": "https://app.finai.one",\n  "X-Title": "FinAI"\n}`}
                className={cn(
                  "font-mono text-xs",
                  headersError && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {headersError ? (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  JSON lỗi: {headersError}
                </p>
              ) : isOpenRouter ? (
                <p className="text-[11px] text-muted-foreground">
                  OpenRouter khuyến nghị <code className="rounded bg-muted px-1">HTTP-Referer</code>{" "}
                  và <code className="rounded bg-muted px-1">X-Title</code>.
                </p>
              ) : isAlibaba ? (
                <p className="text-[11px] text-muted-foreground">
                  DashScope không cần extra headers — để trống là được.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ghi chú nội bộ</Label>
                <span className="text-[11px] text-muted-foreground">
                  {form.notes.length} ký tự
                </span>
              </div>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Chỉ admin nhìn thấy"
              />
            </div>
          </div>
        </details>
      </Card>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/85 backdrop-blur shadow-[0_-2px_12px_-4px_rgba(0,0,0,0.08)] md:left-60">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center gap-3 px-4 py-2.5">
          {testResult && (
            <Popover open={showTestDetail} onOpenChange={setShowTestDetail}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    testResult.ok
                      ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/15",
                  )}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  {testResult.ok ? "Kết nối OK" : "Kết nối lỗi"}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[420px] text-xs">
                <div className="font-mono whitespace-pre-wrap break-words">
                  {testResult.msg}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {dirty && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              Có thay đổi chưa lưu
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={onTest} disabled={testing || !hasKey}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test kết nối
            </Button>
            <Button onClick={onSave} disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu cấu hình
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PresetCard({
  active,
  logo,
  logoBg,
  title,
  description,
  meta,
  keyHref,
  action,
}: {
  active: boolean;
  logo: string;
  logoBg: string;
  title: string;
  description: string;
  meta: string[];
  keyHref: string;
  action: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border p-3 transition-colors",
        active ? "border-primary/60 bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      {active && (
        <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-semibold text-sm",
            logoBg,
          )}
        >
          {logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {meta.map((m) => (
          <span
            key={m}
            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            {m}
          </span>
        ))}
        <a
          href={keyHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-primary hover:underline"
        >
          Lấy API key <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      {action}
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
  search,
  placeholder,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  models: ModelOption[];
  onlyFree: boolean;
  search: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    let list = onlyFree ? models.filter((m) => m.isFree) : models;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [models, onlyFree, search]);
  const selected = models.find((m) => m.id === value);

  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
      <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 font-mono text-sm bg-background"
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

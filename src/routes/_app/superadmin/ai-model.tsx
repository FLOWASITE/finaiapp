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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
          msg: `OK (${r.latencyMs}ms) — phản hồi: "${r.reply || "(rỗng)"}"`,
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
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Đang tải cấu hình…
      </div>
    );
  }

  const isCustomActive = form.enabled && hasKey && !!form.base_url;

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="font-medium">Nhà cung cấp AI đang dùng</div>
            <div className="text-xs text-muted-foreground">
              Nguồn này phục vụ Chat, AI Parse hoá đơn/sao kê, đề xuất định khoản…
            </div>
          </div>
          {isCustomActive ? (
            <Badge variant="default">
              {isOpenRouter ? "OpenRouter" : "Custom"}: {form.provider_label}
            </Badge>
          ) : (
            <Badge variant="outline">Mặc định: Lovable AI</Badge>
          )}
        </div>
      </Card>

      {/* OpenRouter quick setup */}
      <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <Wand2 className="h-5 w-5 text-primary mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-medium">Thiết lập nhanh OpenRouter</div>
            <p className="text-xs text-muted-foreground">
              OpenRouter là một gateway thống nhất truy cập 300+ model (OpenAI, Anthropic, Google,
              Meta, DeepSeek…) qua API tương thích OpenAI. Tạo API key tại{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary underline"
              >
                openrouter.ai/keys <ExternalLink className="h-3 w-3" />
              </a>
              .
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={applyOpenRouterPreset}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Áp preset
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Bật custom AI model</Label>
            <p className="text-xs text-muted-foreground">
              Khi bật và đã có API key, hệ thống dùng endpoint bên dưới thay vì Lovable AI.
            </p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => update("enabled", v)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Tên provider (hiển thị)</Label>
            <Input
              value={form.provider_label}
              onChange={(e) => update("provider_label", e.target.value)}
              placeholder="OpenRouter / OpenAI / Groq…"
            />
          </div>
          <div className="space-y-1">
            <Label>Base URL (OpenAI-compatible)</Label>
            <Input
              value={form.base_url}
              onChange={(e) => update("base_url", e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>API Key</Label>
          <Input
            type="password"
            value={form.api_key}
            disabled={form.clearKey}
            onChange={(e) => update("api_key", e.target.value)}
            placeholder={hasKey ? "••••••••• (đã lưu — nhập mới để thay)" : isOpenRouter ? "sk-or-v1-..." : "sk-..."}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {hasKey ? "Đã có key trong DB (mã hoá AES-GCM)." : "Chưa có key."}
            </span>
            {hasKey && (
              <label className="inline-flex items-center gap-1 text-destructive">
                <input
                  type="checkbox"
                  checked={form.clearKey}
                  onChange={(e) => update("clearKey", e.target.checked)}
                />
                Xoá API key khi lưu
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div className="text-sm font-medium">Chọn model</div>
          <div className="flex items-center gap-2">
            {models.length > 0 && (
              <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyFree}
                  onChange={(e) => setOnlyFree(e.target.checked)}
                />
                Chỉ model miễn phí
              </label>
            )}
            <Button size="sm" variant="outline" onClick={onLoadModels} disabled={loadingModels}>
              {loadingModels ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {models.length > 0 ? `Tải lại (${models.length})` : "Tải danh sách model"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ModelField
            label="Model mặc định *"
            value={form.model_default}
            onChange={(v) => update("model_default", v)}
            models={models}
            onlyFree={onlyFree}
            placeholder="openai/gpt-4o-mini"
          />
          <ModelField
            label="Model cho Chat"
            value={form.model_chat}
            onChange={(v) => update("model_chat", v)}
            models={models}
            onlyFree={onlyFree}
            placeholder="(trống = dùng mặc định)"
          />
          <ModelField
            label="Model cho Parse hoá đơn"
            value={form.model_parse}
            onChange={(v) => update("model_parse", v)}
            models={models}
            onlyFree={onlyFree}
            placeholder="google/gemini-2.5-flash"
          />
          <ModelField
            label="Model cho Reasoning"
            value={form.model_reasoning}
            onChange={(v) => update("model_reasoning", v)}
            models={models}
            onlyFree={onlyFree}
            placeholder="deepseek/deepseek-r1"
          />
        </div>

        <div className="space-y-1">
          <Label>Extra headers (JSON)</Label>
          <Textarea
            rows={3}
            value={form.extra_headers_json}
            onChange={(e) => update("extra_headers_json", e.target.value)}
            placeholder={`{\n  "HTTP-Referer": "https://app.finai.one",\n  "X-Title": "FinAI"\n}`}
            className="font-mono text-xs"
          />
          {isOpenRouter && (
            <p className="text-[11px] text-muted-foreground">
              OpenRouter khuyến nghị gửi <code>HTTP-Referer</code> và <code>X-Title</code> để app
              được liệt kê trong bảng xếp hạng.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Ghi chú</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Nội bộ — phục vụ admin"
          />
        </div>

        {form.enabled && (!form.base_url || (!hasKey && !form.api_key)) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              Đã bật nhưng còn thiếu base URL / API key. Hệ thống sẽ fallback Lovable AI cho tới khi
              cấu hình đủ.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu cấu hình
          </Button>
          <Button variant="outline" onClick={onTest} disabled={testing || !hasKey}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test kết nối
          </Button>
          {testResult && (
            <div
              className={`flex items-center gap-1 text-xs ${
                testResult.ok ? "text-emerald-600" : "text-destructive"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {testResult.msg}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ModelField({
  label,
  value,
  onChange,
  models,
  onlyFree,
  placeholder,
}: {
  label: string;
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
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
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
        <div className="text-[11px] text-muted-foreground">
          {selected.context_length
            ? `${(selected.context_length / 1000).toFixed(0)}k context`
            : ""}
          {selected.pricing?.prompt
            ? ` · in $${selected.pricing.prompt} / out $${selected.pricing.completion}`
            : ""}
        </div>
      )}
    </div>
  );
}

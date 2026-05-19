import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import {
  getAiModelConfig,
  saveAiModelConfig,
  testAiModelConfig,
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
  api_key: string; // empty = keep, "__CLEAR__" sentinel handled below
  clearKey: boolean;
};

function AiModelPage() {
  const getCfg = useServerFn(getAiModelConfig);
  const saveCfg = useServerFn(saveAiModelConfig);
  const testCfg = useServerFn(testAiModelConfig);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ai-model-config"],
    queryFn: () => getCfg(),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

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

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

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
        setTestResult({
          ok: false,
          msg: `HTTP ${r.status} (${r.latencyMs}ms) — ${r.body}`,
        });
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
              Nguồn này sẽ phục vụ Chat, AI Parse hoá đơn/sao kê, đề xuất định khoản…
            </div>
          </div>
          {isCustomActive ? (
            <Badge variant="default">Custom: {form.provider_label}</Badge>
          ) : (
            <Badge variant="outline">Mặc định: Lovable AI</Badge>
          )}
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
              placeholder="OpenAI / Groq / OpenRouter…"
            />
          </div>
          <div className="space-y-1">
            <Label>Base URL (OpenAI-compatible)</Label>
            <Input
              value={form.base_url}
              onChange={(e) => update("base_url", e.target.value)}
              placeholder="https://api.openai.com/v1"
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
            placeholder={hasKey ? "••••••••• (đã lưu — nhập mới để thay)" : "sk-..."}
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

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Model mặc định *</Label>
            <Input
              value={form.model_default}
              onChange={(e) => update("model_default", e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </div>
          <div className="space-y-1">
            <Label>Model cho Chat</Label>
            <Input
              value={form.model_chat}
              onChange={(e) => update("model_chat", e.target.value)}
              placeholder="(để trống = dùng mặc định)"
            />
          </div>
          <div className="space-y-1">
            <Label>Model cho Parse hoá đơn</Label>
            <Input
              value={form.model_parse}
              onChange={(e) => update("model_parse", e.target.value)}
              placeholder="gpt-4o"
            />
          </div>
          <div className="space-y-1">
            <Label>Model cho Reasoning</Label>
            <Input
              value={form.model_reasoning}
              onChange={(e) => update("model_reasoning", e.target.value)}
              placeholder="o1-mini"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Extra headers (JSON)</Label>
          <Textarea
            rows={3}
            value={form.extra_headers_json}
            onChange={(e) => update("extra_headers_json", e.target.value)}
            placeholder={`{\n  "HTTP-Referer": "https://app.finai.one"\n}`}
            className="font-mono text-xs"
          />
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
              Đã bật nhưng còn thiếu base URL / API key. Hệ thống sẽ vẫn fallback Lovable AI cho tới khi cấu hình đủ.
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

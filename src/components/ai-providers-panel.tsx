import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Star, Zap, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listProviders,
  saveProvider,
  deleteProvider,
  testProvider,
} from "@/lib/ai-providers.functions";

type Provider = {
  id: string;
  code: string;
  label: string;
  base_url: string;
  extra_headers: Record<string, string>;
  enabled: boolean;
  is_default: boolean;
  notes: string;
  has_api_key: boolean;
};

const PRESETS: Record<string, { label: string; base_url: string; extra_headers?: Record<string, string> }> = {
  custom: { label: "Custom (OpenAI-compatible)", base_url: "https://api.openai.com/v1" },
  openai: { label: "OpenAI", base_url: "https://api.openai.com/v1" },
  openrouter: {
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    extra_headers: { "HTTP-Referer": "https://app.finai.one", "X-Title": "FinAI" },
  },
  anthropic: { label: "Anthropic (Claude)", base_url: "https://api.anthropic.com/v1" },
  together: { label: "Together AI", base_url: "https://api.together.xyz/v1" },
  groq: { label: "Groq", base_url: "https://api.groq.com/openai/v1" },
  deepseek: { label: "DeepSeek", base_url: "https://api.deepseek.com/v1" },
  alibaba_intl: { label: "Alibaba Qwen (Intl)", base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
};

export function AiProvidersPanel() {
  const listFn = useServerFn(listProviders);
  const saveFn = useServerFn(saveProvider);
  const delFn = useServerFn(deleteProvider);
  const testFn = useServerFn(testProvider);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<Partial<Provider> | null>(null);

  const saveMut = useMutation({
    mutationFn: (vars: any) => saveFn({ data: vars }),
    onSuccess: () => {
      toast.success("Đã lưu Provider");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
      qc.invalidateQueries({ queryKey: ["ai-agent-models"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lưu thất bại"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá");
      qc.invalidateQueries({ queryKey: ["ai-providers"] });
      qc.invalidateQueries({ queryKey: ["ai-agent-models"] });
    },
    onError: (e: any) => toast.error(e?.message || "Xoá thất bại"),
  });

  const testMut = useMutation({
    mutationFn: (vars: { id: string; model: string }) => testFn({ data: vars }),
    onSuccess: (r: any) => {
      if (r.ok) toast.success(`Test OK · ${r.latencyMs}ms · "${r.reply}"`);
      else toast.error(`HTTP ${r.status}: ${r.body?.slice(0, 200)}`);
    },
    onError: (e: any) => toast.error(e?.message || "Test thất bại"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Quản lý nhiều Provider OpenAI-compatible. Mỗi Agent có thể chọn 1 Provider riêng ở tab "Theo Agent".
        </p>
        <Button
          size="sm"
          onClick={() =>
            setEditing({
              code: "",
              label: "",
              base_url: "https://api.openai.com/v1",
              extra_headers: {},
              enabled: true,
              is_default: (data?.providers ?? []).length === 0,
              notes: "",
            })
          }
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Thêm Provider
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải...
        </div>
      ) : (data?.providers ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Chưa có Provider nào. Khi không có Provider enabled, hệ thống fallback sang Lovable AI.
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data?.providers ?? []).map((p: Provider) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{p.label}</h3>
                    {p.is_default && (
                      <Badge className="gap-1 text-[10px]">
                        <Star className="h-2.5 w-2.5" /> Mặc định
                      </Badge>
                    )}
                    {p.enabled ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Bật
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <XCircle className="h-2.5 w-2.5" /> Tắt
                      </Badge>
                    )}
                    <code className="text-[10px] text-muted-foreground">{p.code}</code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{p.base_url}</p>
                  <p className="text-[11px] mt-1">
                    {p.has_api_key ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ Đã có API key</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">⚠ Chưa có API key</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const m = prompt("Test với model nào? (vd: gpt-4o-mini)", "gpt-4o-mini");
                      if (m) testMut.mutate({ id: p.id, model: m });
                    }}
                    disabled={!p.has_api_key || testMut.isPending}
                  >
                    <Zap className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Xoá provider "${p.label}"?`)) delMut.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ProviderDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(payload) => saveMut.mutate(payload)}
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function ProviderDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: Partial<Provider>;
  onClose: () => void;
  onSave: (p: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    id: value.id ?? null,
    code: value.code ?? "",
    label: value.label ?? "",
    base_url: value.base_url ?? "",
    api_key: "",
    extra_headers_json: Object.keys(value.extra_headers ?? {}).length
      ? JSON.stringify(value.extra_headers, null, 2)
      : "",
    enabled: value.enabled ?? true,
    is_default: value.is_default ?? false,
    notes: value.notes ?? "",
  });
  const isNew = !value.id;

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    setForm((f) => ({
      ...f,
      label: f.label || p.label,
      base_url: p.base_url,
      extra_headers_json: p.extra_headers ? JSON.stringify(p.extra_headers, null, 2) : "",
      code: f.code || key,
    }));
  };

  const submit = () => {
    let extra_headers: Record<string, string> = {};
    if (form.extra_headers_json.trim()) {
      try {
        extra_headers = JSON.parse(form.extra_headers_json);
      } catch (e: any) {
        toast.error("Extra headers JSON không hợp lệ: " + e.message);
        return;
      }
    }
    const payload: any = {
      id: form.id,
      code: form.code,
      label: form.label,
      base_url: form.base_url,
      extra_headers,
      enabled: form.enabled,
      is_default: form.is_default,
      notes: form.notes,
    };
    if (form.api_key) payload.api_key = form.api_key;
    onSave(payload);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Thêm Provider" : "Sửa Provider"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isNew && (
            <div>
              <Label className="text-xs">Preset</Label>
              <Select onValueChange={applyPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn preset hoặc tự nhập" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRESETS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Code (slug)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="openrouter_main"
                disabled={!isNew}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="OpenRouter Prod"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Base URL</Label>
            <Input
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">
              API Key {!isNew && "(để trống = giữ key cũ)"}
            </Label>
            <Input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder={isNew ? "sk-..." : "••••••••"}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Extra Headers (JSON, tuỳ chọn)</Label>
            <Textarea
              value={form.extra_headers_json}
              onChange={(e) => setForm({ ...form, extra_headers_json: e.target.value })}
              className="font-mono text-xs min-h-[80px]"
              placeholder='{"HTTP-Referer": "https://..."}'
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              Bật
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_default}
                onCheckedChange={(v) => setForm({ ...form, is_default: v })}
              />
              Đặt làm Mặc định
            </label>
          </div>
          <div>
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="min-h-[60px] text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

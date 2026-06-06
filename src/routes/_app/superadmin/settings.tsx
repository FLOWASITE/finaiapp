import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSystemSettings, updateSystemSettings } from "@/lib/superadmin-extra.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/superadmin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSystemSettings);
  const updFn = useServerFn(updateSystemSettings);
  const { data } = useQuery({ queryKey: ["sys-settings"], queryFn: () => getFn() });
  const [value, setValue] = useState<any>(null);

  useEffect(() => { if (data) setValue(data.value ?? {}); }, [data]);

  if (!value) return <div className="text-sm text-muted-foreground">Đang tải cài đặt hệ thống…</div>;

  const setPath = (path: string[], v: any) => {
    setValue((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev ?? {}));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) { cur[path[i]] = cur[path[i]] ?? {}; cur = cur[path[i]]; }
      cur[path[path.length - 1]] = v;
      return next;
    });
  };

  const save = async () => {
    try {
      await updFn({ data: { value } });
      toast.success("Đã lưu cài đặt");
      qc.invalidateQueries({ queryKey: ["sys-settings"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const b = value.branding ?? {};
  const f = value.features ?? {};
  const fmt = value.format ?? {};
  const ai = value.ai_policy ?? {};

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Branding</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Tên ứng dụng</Label><Input value={b.app_name ?? ""} onChange={(e) => setPath(["branding","app_name"], e.target.value)} /></div>
          <div><Label>Email hỗ trợ</Label><Input value={b.support_email ?? ""} onChange={(e) => setPath(["branding","support_email"], e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Footer</Label><Input value={b.footer ?? ""} onChange={(e) => setPath(["branding","footer"], e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Feature flags</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {["einvoice","payroll","inventory","ai_parse","ai_chat"].map((k) => (
            <div key={k} className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm capitalize">{k.replace("_"," ")}</span>
              <Switch checked={!!f[k]} onCheckedChange={(v) => setPath(["features",k], v)} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Định dạng mặc định</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Timezone</Label><Input value={fmt.timezone ?? ""} onChange={(e) => setPath(["format","timezone"], e.target.value)} /></div>
          <div><Label>Tiền tệ</Label><Input value={fmt.currency ?? ""} onChange={(e) => setPath(["format","currency"], e.target.value)} /></div>
          <div><Label>Date format</Label><Input value={fmt.date_format ?? ""} onChange={(e) => setPath(["format","date_format"], e.target.value)} /></div>
          <div><Label>Locale</Label><Input value={fmt.locale ?? ""} onChange={(e) => setPath(["format","locale"], e.target.value)} /></div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Chính sách AI</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Tokens/ngày/tenant (0 = không giới hạn)</Label>
            <Input type="number" value={ai.tokens_per_day_per_tenant ?? 0} onChange={(e) => setPath(["ai_policy","tokens_per_day_per_tenant"], Number(e.target.value || 0))} /></div>
          <div><Label>Số file parse/ngày (0 = không giới hạn)</Label>
            <Input type="number" value={ai.files_parse_per_day ?? 0} onChange={(e) => setPath(["ai_policy","files_parse_per_day"], Number(e.target.value || 0))} /></div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">JSON nâng cao</h2>
        <Textarea rows={10} className="font-mono text-xs"
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => { try { setValue(JSON.parse(e.target.value)); } catch {} }} />
      </Card>

      <div className="flex justify-end"><Button onClick={save}>Lưu cài đặt</Button></div>
    </div>
  );
}

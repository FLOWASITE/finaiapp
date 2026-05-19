import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Send, Loader2 } from "lucide-react";
import {
  getDigestPrefs,
  updateDigestPrefs,
  sendDigestNow,
} from "@/lib/digest-prefs.functions";

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6); // 6..18

export function DigestSettingsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDigestPrefs);
  const updateFn = useServerFn(updateDigestPrefs);
  const sendFn = useServerFn(sendDigestNow);

  const { data, isLoading } = useQuery({
    queryKey: ["digest-prefs"],
    queryFn: () => getFn(),
  });

  const [sending, setSending] = useState(false);

  const updateMut = useMutation({
    mutationFn: (payload: {
      enabled?: boolean;
      send_hour?: number;
      template?: "short" | "standard" | "detailed";
    }) => updateFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digest-prefs"] });
      toast.success("Đã lưu cài đặt");
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const handleSendNow = async () => {
    setSending(true);
    try {
      await sendFn();
      toast.success("Đã gửi tóm tắt vào chat");
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Tóm tắt hàng ngày
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Mỗi sáng, trợ lý AI sẽ tự động đăng một tin nhắn vào ChatDock tổng hợp
          KPI ngày hôm qua, cảnh báo AR/AP/tồn kho và chứng từ chờ xử lý.
        </p>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="font-medium">Bật tóm tắt</Label>
            <p className="text-xs text-muted-foreground">
              Gửi 1 tin nhắn/ngày vào thread "Daily Digest"
            </p>
          </div>
          <Switch
            checked={data?.enabled ?? false}
            disabled={isLoading || updateMut.isPending}
            onCheckedChange={(v) => updateMut.mutate({ enabled: v })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="font-medium">Giờ gửi</Label>
            <p className="text-xs text-muted-foreground">
              Theo giờ Việt Nam (Asia/Ho_Chi_Minh)
            </p>
          </div>
          <Select
            value={String(data?.send_hour ?? 8)}
            disabled={isLoading || !data?.enabled || updateMut.isPending}
            onValueChange={(v) => updateMut.mutate({ send_hour: parseInt(v, 10) })}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="font-medium">Mẫu nội dung</Label>
            <p className="text-xs text-muted-foreground">
              {data?.template === "short"
                ? "1 dòng tóm tắt KPI"
                : data?.template === "detailed"
                ? "Thêm top KH/NCC + công nợ AR/AP"
                : "KPI + cảnh báo + inbox"}
            </p>
          </div>
          <Select
            value={data?.template ?? "standard"}
            disabled={isLoading || !data?.enabled || updateMut.isPending}
            onValueChange={(v) =>
              updateMut.mutate({ template: v as "short" | "standard" | "detailed" })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Ngắn</SelectItem>
              <SelectItem value="standard">Tiêu chuẩn</SelectItem>
              <SelectItem value="detailed">Chi tiết</SelectItem>
            </SelectContent>
          </Select>
        </div>



        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {data?.last_sent_date
              ? `Lần gửi gần nhất: ${new Date(data.last_sent_date).toLocaleDateString("vi-VN")}`
              : "Chưa gửi lần nào"}
          </p>
          <Button size="sm" variant="outline" onClick={handleSendNow} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Gửi thử ngay
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

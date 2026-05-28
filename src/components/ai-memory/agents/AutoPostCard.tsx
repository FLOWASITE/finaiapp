import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Zap, ShieldAlert, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  getAutoPostSettings,
  updateAutoPostSettings,
} from "@/lib/auto-post-settings.functions";

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

export function AutoPostCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAutoPostSettings);
  const saveFn = useServerFn(updateAutoPostSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["auto-post-settings"],
    queryFn: () => getFn(),
  });

  const [enabled, setEnabled] = useState(false);
  const [minConf, setMinConf] = useState(0.95);
  const [maxAmount, setMaxAmount] = useState(5_000_000);

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setMinConf(data.min_confidence);
      setMaxAmount(data.max_amount);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (i: { enabled: boolean; min_confidence: number; max_amount: number }) =>
      saveFn({ data: i }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-post-settings"] });
      toast.success("Đã lưu ngưỡng tự động duyệt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty =
    !!data &&
    (enabled !== data.enabled ||
      Math.abs(minConf - data.min_confidence) > 0.001 ||
      Math.abs(maxAmount - data.max_amount) > 0.5);

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-[#EEEDFE] p-2">
          <Zap className="h-5 w-5 text-[#4F46C7]" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight">Tự động duyệt hoá đơn</h3>
            {enabled ? (
              <Badge className="bg-[#0F6E56] text-white hover:bg-[#0F6E56]">Đang BẬT</Badge>
            ) : (
              <Badge variant="secondary">Tắt</Badge>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Khi Fin chắc chắn cao và giá trị nhỏ, hoá đơn được duyệt thẳng vào sổ — không
            cần KTV bấm. Mọi auto-post đều ghi log để KTT review.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={isLoading}
          onCheckedChange={setEnabled}
          aria-label="Bật/tắt tự động duyệt"
        />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <Label className="flex items-center justify-between text-[12.5px] font-medium">
            <span>Ngưỡng độ tin cậy tối thiểu</span>
            <span className="tabular-nums text-[#4F46C7]">
              {(minConf * 100).toFixed(0)}%
            </span>
          </Label>
          <Slider
            className="mt-2"
            min={80}
            max={99}
            step={1}
            value={[Math.round(minConf * 100)]}
            onValueChange={(v) => setMinConf((v[0] ?? 95) / 100)}
            disabled={!enabled || isLoading}
          />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            Mặc định 95%. Càng cao càng an toàn nhưng càng ít auto.
          </p>
        </div>
        <div>
          <Label className="text-[12.5px] font-medium">
            Trần giá trị hoá đơn (VND)
          </Label>
          <Input
            type="number"
            className="mt-2 tabular-nums"
            min={0}
            step={100000}
            value={maxAmount}
            onChange={(e) => setMaxAmount(Number(e.target.value) || 0)}
            disabled={!enabled || isLoading}
          />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            {formatVnd(maxAmount)} ₫ — hoá đơn lớn hơn luôn cần KTV duyệt.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <div>
          <strong>Luôn cần KTV duyệt dù bật auto:</strong> hoá đơn có FCT/thuế nhà thầu,
          lần đầu thấy NCC, hoặc trí nhớ AI đang mâu thuẫn trong 30 ngày gần đây.
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!dirty || saveMut.isPending}
          onClick={() => {
            if (!data) return;
            setEnabled(data.enabled);
            setMinConf(data.min_confidence);
            setMaxAmount(data.max_amount);
          }}
        >
          Huỷ
        </Button>
        <Button
          size="sm"
          disabled={!dirty || saveMut.isPending}
          onClick={() =>
            saveMut.mutate({
              enabled,
              min_confidence: minConf,
              max_amount: maxAmount,
            })
          }
        >
          {saveMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Lưu cài đặt
        </Button>
      </div>
    </div>
  );
}

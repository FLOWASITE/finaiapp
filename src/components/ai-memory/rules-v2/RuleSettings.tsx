import { useMemo } from "react";
import { Zap, Lightbulb, Eye } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { estimateAppliedCount } from "@/lib/rules/rule-test";
import type { Rule, RuleMode } from "@/types/rule";

const PRESETS = [
  { value: 0.95, label: "Nghiêm ngặt", hint: "95% — chỉ trường hợp rõ ràng" },
  { value: 0.85, label: "Cân bằng", hint: "85% — mặc định" },
  { value: 0.7, label: "Linh hoạt", hint: "70% — chấp nhận nghi ngờ" },
];

const MODES: { value: RuleMode; label: string; desc: string; Icon: typeof Zap }[] = [
  { value: "auto", label: "Tự duyệt", desc: "AI tự áp dụng và ghi sổ ngay khi đủ tin cậy", Icon: Zap },
  { value: "suggest", label: "Chỉ đề xuất", desc: "AI đề xuất, user phải duyệt mới ghi sổ", Icon: Lightbulb },
  { value: "learn_only", label: "Chỉ học", desc: "AI không hành động, chỉ thu thập pattern", Icon: Eye },
];

export function RuleSettings({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
}) {
  const estimate = useMemo(() => estimateAppliedCount(rule), [rule]);

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-[13px] font-medium">Ngưỡng tin cậy tối thiểu</Label>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          AI chỉ áp dụng khi tin cậy ≥ ngưỡng. Thấp hơn sẽ đẩy về "Cần xem lại".
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Slider
            min={0.5}
            max={1}
            step={0.01}
            value={[rule.confidence_threshold]}
            onValueChange={([v]) => onChange({ confidence_threshold: v })}
            className="flex-1"
          />
          <span className="w-12 text-right text-sm font-bold tabular-nums">
            {Math.round(rule.confidence_threshold * 100)}%
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {PRESETS.map((p) => {
            const active = Math.abs(rule.confidence_threshold - p.value) < 0.01;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ confidence_threshold: p.value })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors",
                  active
                    ? "border-[#4F46C7] bg-[#EEEDFE] text-[#26215C]"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div className="font-semibold">{p.label}</div>
                <div className="text-[10px] text-muted-foreground">{p.hint}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Với ngưỡng {Math.round(rule.confidence_threshold * 100)}%, quy tắc này sẽ áp dụng cho{" "}
          <span className="font-semibold text-foreground">~{estimate}</span> giao dịch trong 30 ngày qua.
        </p>
      </div>

      <div>
        <Label className="text-[13px] font-medium">Chế độ hoạt động</Label>
        <div className="mt-2 space-y-1.5">
          {MODES.map((m) => {
            const active = rule.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange({ mode: m.value })}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                  active ? "border-[#0F6E56] bg-[#0F6E56]/5" : "hover:bg-muted/50",
                )}
              >
                <m.Icon
                  className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-[#0F6E56]" : "text-muted-foreground")}
                />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">{m.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-[13px] font-medium">Phạm vi áp dụng</Label>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(["future", "retroactive"] as const).map((opt) => {
            const active = rule.applies_to === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ applies_to: opt })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-[12px] transition-colors",
                  active ? "border-[#4F46C7] bg-[#EEEDFE] text-[#26215C]" : "hover:bg-muted/50",
                )}
              >
                {opt === "future" ? "Chỉ giao dịch mới" : "Cả lịch sử"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RuleSettingsCompact({ rule }: { rule: Rule }) {
  const modeLabel = MODES.find((m) => m.value === rule.mode)?.label ?? rule.mode;
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-1.5 text-[11.5px]">
      <span className="text-muted-foreground">Tin cậy</span>
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-muted-foreground/15">
        <div
          className="h-full bg-[#4F46C7]"
          style={{ width: `${rule.confidence_threshold * 100}%` }}
        />
      </div>
      <span className="font-semibold tabular-nums">
        {Math.round(rule.confidence_threshold * 100)}%
      </span>
      <span className="text-muted-foreground/70">·</span>
      <span className="text-muted-foreground">Chế độ:</span>
      <span className="font-medium">{modeLabel}</span>
    </div>
  );
}

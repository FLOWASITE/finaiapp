import { useState } from "react";
import {
  Bot,
  User as UserIcon,
  LayoutTemplate,
  Lock,
  Zap,
  Lightbulb,
  Eye,
  Target,
  Clock,
  Power,
  Pencil,
  History as HistoryIcon,
  AlertTriangle,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ConditionsRead } from "./ConditionsBlock";
import { ActionsRead } from "./ActionsBlock";
import { RuleSettingsCompact } from "./RuleSettings";
import { RuleEditor } from "./RuleEditor";
import { useRuleStore } from "@/lib/rules/rule-store";
import type { Rule, RuleSource } from "@/types/rule";

const SOURCE_BADGE: Record<RuleSource, { label: string; bg: string; Icon: typeof Bot }> = {
  ai_learned: { label: "AI TỰ HỌC", bg: "#4F46C7", Icon: Bot },
  user_taught: { label: "BẠN DẠY", bg: "#0F6E56", Icon: UserIcon },
  template: { label: "TỪ MẪU", bg: "#737373", Icon: LayoutTemplate },
  system: { label: "HỆ THỐNG", bg: "#1F1F1F", Icon: Lock },
};

function statusPill(rule: Rule) {
  if (rule.status === "paused" || !rule.enabled)
    return { label: "Tạm tắt", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" };
  if (rule.status === "disabled")
    return { label: "Đã tắt", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" };
  if (rule.mode === "auto")
    return {
      label: "Đang chạy · Tự duyệt",
      className: "bg-[#0F6E56]/10 text-[#0F6E56]",
      dot: "bg-[#0F6E56]",
      Icon: Zap,
    };
  if (rule.mode === "suggest")
    return {
      label: "Đang test · Chỉ đề xuất",
      className: "bg-[#4F46C7]/10 text-[#4F46C7]",
      dot: "bg-[#4F46C7]",
      Icon: Lightbulb,
    };
  return {
    label: "Chỉ học",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    Icon: Eye,
  };
}

export function RuleCard({
  rule,
  onToggleEnabled,
  onSave,
}: {
  rule: Rule;
  onToggleEnabled?: (id: string, enabled: boolean, reason?: string) => void;
  onSave?: (rule: Rule) => Promise<void> | void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [reason, setReason] = useState("");
  const storeToggle = useRuleStore((s) => s.toggleEnabled);
  const toggleEnabled = onToggleEnabled ?? storeToggle;

  const badge = SOURCE_BADGE[rule.source];
  const pill = statusPill(rule);
  const disabled = !rule.enabled || rule.status === "paused";
  const accuracy =
    rule.applied_count > 0
      ? `${rule.correct_count}/${rule.applied_count} (${Math.round((rule.correct_count / rule.applied_count) * 100)}%)`
      : "—";
  const lastUsed = rule.last_used
    ? new Date(rule.last_used).toLocaleDateString("vi-VN")
    : "—";

  const handleDisable = () => {
    if (!reason.trim()) return;
    toggleEnabled(rule.id, false, reason.trim());
    setDisableOpen(false);
    setReason("");
  };

  return (
    <div
      id={`rule-${rule.id}`}
      className={cn(
        "animate-fade-in rounded-lg border bg-card p-4 transition-all",
        disabled && "opacity-65",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-bold tracking-wide text-white"
          style={{ backgroundColor: badge.bg }}
        >
          <badge.Icon className="h-3 w-3" />
          {badge.label}
        </span>
        {rule.learned_from && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{rule.learned_from}</span>
          </>
        )}
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
            pill.className,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
          {pill.label}
        </span>
      </div>

      <h3
        className={cn(
          "mt-2 cursor-pointer text-[14px] font-medium leading-snug hover:underline",
          disabled && "line-through text-muted-foreground",
        )}
        onClick={() => setEditOpen(true)}
      >
        {rule.name}
      </h3>
      {rule.description && (
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{rule.description}</p>
      )}

      {rule.status === "paused" && rule.paused_reason && (
        <div className="mt-2.5 rounded-md border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Lý do tắt: </span>
          {rule.paused_reason}
        </div>
      )}

      {!disabled && (
        <>
          <div className="mt-3 rounded-md bg-muted/30 p-2.5">
            <ConditionsRead conditions={rule.conditions} />
          </div>
          <div className="mt-1.5 rounded-md bg-muted/30 p-2.5">
            <ActionsRead actions={rule.actions} />
          </div>
          <div className="mt-2">
            <RuleSettingsCompact rule={rule} />
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Zap className="h-3 w-3" /> {rule.applied_count} lần
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3" /> {accuracy}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {lastUsed}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {rule.applied_count > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
              <HistoryIcon className="mr-1 h-3 w-3" /> Xem {rule.applied_count} lần
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="mr-1 h-3 w-3" /> Sửa
          </Button>
          {rule.enabled ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
              onClick={() => setDisableOpen(true)}
            >
              <Power className="mr-1 h-3 w-3" /> Tắt
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => toggleEnabled(rule.id, true)}
            >
              <Power className="mr-1 h-3 w-3" /> Bật lại
            </Button>
          )}
        </div>
      </div>

      <RuleEditor rule={rule} open={editOpen} onOpenChange={setEditOpen} onSave={onSave} />

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tắt quy tắc này?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có thể bật lại bất cứ lúc nào. Hãy cho AI biết lý do để cải thiện.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Lý do tắt (giúp AI hiểu)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisable} disabled={!reason.trim()}>
              Tắt quy tắc
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

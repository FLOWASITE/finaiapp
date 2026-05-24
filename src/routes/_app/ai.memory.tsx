import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain,
  Sparkles,
  Bot,
  User as UserIcon,
  PauseCircle,
  Zap,
  Target,
  Clock,
  Eye,
  Pencil,
  Power,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listAiMemory,
  promoteSuggestion,
  updateRule,
  disableRule,
  enableRule,
  deleteRule,
  promoteWatchToRule,
  dismissWatch,
  listRuleApplications,
  undoRuleApplication,
  type MemoryRule,
  type MemoryWatch,
  type RuleApplication,
} from "@/lib/ai-memory.functions";
import {
  RULE_TEMPLATES,
  TEMPLATES_BY_ID,
  ACCOUNT_QUICK_PICKS,
  parseSuggestion,
  renderRule,
  validateSlots,
} from "@/lib/ai-memory-templates";
import { PartnersTab, ContextTab, LimitsTab } from "@/components/ai-memory-tabs";
import { ClassificationsTab } from "@/components/ai-memory-classifications-tab";
import { RulesListV2 } from "@/components/ai-memory/rules-v2/RulesListV2";
import { MemoryGraph } from "@/components/ai-memory/graph/MemoryGraph";

export const Route = createFileRoute("/_app/ai/memory")({
  head: () => ({
    meta: [
      { title: "Trí nhớ AI — FinAI" },
      {
        name: "description",
        content:
          "Xem, sửa và xoá mọi quy tắc AI đã học từ bạn. Không phải hộp đen — bạn dạy AI thế nào, AI làm chính xác như thế.",
      },
    ],
  }),
  component: AIMemoryPage,
});

type TabKey = "rules" | "graph" | "classifications" | "partners" | "context" | "limits" | "learning";

function AIMemoryPage() {
  const [tab, setTab] = useState<TabKey>("rules");
  const list = useServerFn(listAiMemory);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory"],
    queryFn: () => list(),
    refetchOnWindowFocus: true,
  });

  // Realtime: lắng nghe thay đổi quy tắc và lịch sử áp dụng để cập nhật tức thì.
  useEffect(() => {
    const channel = supabase
      .channel("ai-memory-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_memory_rules" }, () => {
        qc.invalidateQueries({ queryKey: ["ai-memory"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_rule_applications" },
        () => {
          qc.invalidateQueries({ queryKey: ["ai-memory"] });
          qc.invalidateQueries({ queryKey: ["ai-memory", "applications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const rules = data?.rules ?? [];
  const watch = data?.watch ?? [];

  const suggestionCount = rules.filter((r) => r.type === "suggestion").length;
  const activeCount = rules.filter((r) => r.type === "active").length;
  const totalApplied = rules.reduce((s, r) => s + (r.applied_count || 0), 0);
  const accNum = rules.reduce((s, r) => s + (r.accuracy_correct || 0), 0);
  const accDen = rules.reduce((s, r) => s + (r.accuracy_total || 0), 0);
  const accPct = accDen > 0 ? ((accNum / accDen) * 100).toFixed(1) + "%" : "—";

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <MemoryHeader
        ruleCount={activeCount}
        suggestionCount={suggestionCount}
        totalApplied={totalApplied}
        accuracy={accPct}
      />
      <SubTabs value={tab} onChange={setTab} learningCount={watch.length} ruleCount={activeCount} />

      {tab === "graph" ? (
        <div className="flex-1 overflow-hidden">
          <MemoryGraph />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-4xl space-y-3 px-5 py-4">
            {isLoading ? (
              <LoadingSkeleton />
            ) : (
              <>
                {tab === "rules" && <RulesListV2 />}
                {tab === "classifications" && <ClassificationsTab />}
                {tab === "partners" && <PartnersTab />}
                {tab === "context" && <ContextTab />}
                {tab === "limits" && <LimitsTab />}
                {tab === "learning" && (
                  <WatchListView items={watch} onSwitchToRules={() => setTab("rules")} />
                )}
              </>
            )}
          </div>
        </ScrollArea>
      )}

      <WatchFooter count={watch.length} onClick={() => setTab("learning")} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      ))}
    </>
  );
}

// ====== Header ======

function MemoryHeader({
  ruleCount,
  suggestionCount,
  totalApplied,
  accuracy,
}: {
  ruleCount: number;
  suggestionCount: number;
  totalApplied: number;
  accuracy: string;
}) {
  return (
    <div className="border-b px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Brain className="h-5 w-5 text-[#4F46C7]" />
        <h1 className="text-[17px] font-semibold tracking-tight">Trí nhớ AI</h1>
        <span className="rounded-full bg-[#EEEDFE] px-2.5 py-0.5 text-[11px] font-medium text-[#26215C]">
          Mọi thứ AI đã học từ bạn
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
        Đây không phải hộp đen. Mọi quy tắc đều đọc, sửa, xoá được. Bạn dạy AI thế nào,
        AI làm chính xác như thế.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label="Quy tắc hoạt động" value={String(ruleCount)} />
        <StatCard label="Tổng lần áp dụng" value={totalApplied.toLocaleString("vi-VN")} />
        <StatCard label="Chính xác TB" value={accuracy} />
        <StatCard label="Đề xuất mới" value={String(suggestionCount)} accent />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        accent ? "border-[#4F46C7]/30 bg-[#EEEDFE]" : "bg-card",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          accent ? "text-[#26215C]" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          accent ? "text-[#26215C]" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ====== Sub tabs ======

function SubTabs({
  value,
  onChange,
  learningCount,
  ruleCount,
}: {
  value: TabKey;
  onChange: (t: TabKey) => void;
  learningCount: number;
  ruleCount: number;
}) {
  const tabs: { key: TabKey; label: string; count?: number; badge?: number }[] = [
    { key: "rules", label: "Quy tắc hạch toán", count: ruleCount },
    { key: "graph", label: "Sơ đồ trí nhớ" },
    { key: "classifications", label: "Hàng hóa / DV" },
    { key: "partners", label: "Đối tác", count: 128 },
    { key: "context", label: "Bối cảnh DN", count: 12 },
    { key: "limits", label: "Giới hạn", count: 8 },
    { key: "learning", label: "Đang học", badge: learningCount },
  ];
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b px-3">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span className="ml-1 text-muted-foreground/70">({t.count})</span>
            )}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#4F46C7] px-1.5 text-[10px] font-bold text-white">
                {t.badge}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ====== Rule list & card ======

function RuleList({ rules }: { rules: MemoryRule[] }) {
  const ordered = useMemo(() => {
    const order = { suggestion: 0, active: 1, disabled: 2 } as const;
    return [...rules].sort((a, b) => order[a.type] - order[b.type]);
  }, [rules]);

  if (ordered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Chưa có quy tắc nào. AI sẽ tự đề xuất khi phát hiện mẫu hành vi lặp lại.
      </div>
    );
  }

  return (
    <>
      {ordered.map((r) => (
        <RuleCard key={r.id} rule={r} />
      ))}
    </>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ai-memory"] });
}

function RuleCard({ rule }: { rule: MemoryRule }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [editWhen, setEditWhen] = useState(rule.when_text);
  const [editThen, setEditThen] = useState(rule.then_text);
  const [disableReason, setDisableReason] = useState("");

  // Template-driven promotion state (chỉ dùng khi rule là suggestion).
  const initialParsed = useMemo(() => parseSuggestion(rule), [rule]);
  const [tplId, setTplId] = useState<string>(initialParsed.templateId);
  const [slots, setSlots] = useState<Record<string, string>>(initialParsed.slots);
  const tpl = TEMPLATES_BY_ID[tplId] ?? TEMPLATES_BY_ID["vendor-account"];
  const rendered = useMemo(() => renderRule(tplId, slots), [tplId, slots]);
  const slotError = validateSlots(tplId, slots);

  const invalidate = useInvalidate();

  const promoteFn = useServerFn(promoteSuggestion);
  const updateFn = useServerFn(updateRule);
  const disableFn = useServerFn(disableRule);
  const enableFn = useServerFn(enableRule);
  const deleteFn = useServerFn(deleteRule);

  const promoteM = useMutation({
    mutationFn: promoteFn,
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      toast.success("Đã tạo quy tắc — AI sẽ áp dụng tự động");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      invalidate();
      setEditOpen(false);
      toast.success("Đã lưu thay đổi");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disableM = useMutation({
    mutationFn: disableFn,
    onSuccess: () => {
      invalidate();
      setDisableOpen(false);
      setDisableReason("");
      toast.success("Đã tắt quy tắc");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const enableM = useMutation({
    mutationFn: enableFn,
    onSuccess: () => {
      invalidate();
      toast.success("Đã bật lại quy tắc");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      invalidate();
      toast.success("Đã bỏ qua đề xuất");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isA = rule.type === "suggestion";
  const isB = rule.type === "active" && rule.source === "ai-learned";
  const isC = rule.type === "active" && rule.source === "user-taught";
  const isD = rule.type === "disabled";

  const badge = isA
    ? { label: "ĐỀ XUẤT QUY TẮC MỚI", Icon: Sparkles, color: "#26215C" }
    : isB
    ? { label: "AI TỰ HỌC", Icon: Bot, color: "#4F46C7" }
    : isC
    ? { label: "BẠN DẠY", Icon: UserIcon, color: "#0F6E56" }
    : { label: "TẠM TẮT", Icon: PauseCircle, color: "#737373" };

  const handleSaveEdit = () => {
    updateM.mutate({ data: { id: rule.id, when_text: editWhen.trim(), then_text: editThen.trim() } });
  };
  const handleDisable = () => {
    if (!disableReason.trim()) {
      toast.error("Vui lòng nhập lý do tắt");
      return;
    }
    disableM.mutate({ data: { id: rule.id, reason: disableReason.trim() } });
  };

  const accuracyDisplay =
    rule.accuracy_total > 0
      ? `${rule.accuracy_correct}/${rule.accuracy_total} (${((rule.accuracy_correct / rule.accuracy_total) * 100).toFixed(1)}%)`
      : "—";

  const lastUsedDisplay = rule.last_used_at
    ? new Date(rule.last_used_at).toLocaleDateString("vi-VN")
    : "—";

  return (
    <div
      className={cn(
        "animate-fade-in rounded-lg border bg-card p-4 transition-all",
        isA && "border-[#4F46C7] bg-[#F5F4FE]",
        isD && "opacity-65",
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-bold tracking-wide text-white"
          style={{ backgroundColor: badge.color }}
        >
          <badge.Icon className="h-3 w-3" />
          {badge.label}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{rule.origin}</span>
        {!isA && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isD ? "bg-muted-foreground/50" : "bg-emerald-500",
              )}
            />
            {isD ? "Không hoạt động" : "Đang dùng"}
          </span>
        )}
      </div>

      <h3
        className={cn(
          "mt-2 text-[13px] font-medium leading-snug",
          isD && "line-through text-muted-foreground",
        )}
      >
        {rule.title}
      </h3>

      {isD ? (
        <div className="mt-2.5 rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
          <span className="font-semibold text-foreground/80">Lý do tắt: </span>
          {rule.disable_reason}
        </div>
      ) : (
        <div className="mt-2.5 space-y-1.5 rounded-md bg-muted/40 p-3 text-[12.5px]">
          <div className="flex items-start gap-2">
            <ChipWhen />
            <span className="flex-1 leading-relaxed">{rule.when_text}</span>
          </div>
          <div className="flex items-start gap-2">
            <ChipThen />
            <span className="flex-1 leading-relaxed">{rule.then_text}</span>
          </div>
        </div>
      )}

      {(isB || isC) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" /> Áp dụng {rule.applied_count} lần
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="h-3 w-3" /> Đúng {accuracyDisplay}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> Cuối: {lastUsedDisplay}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {isA && (
          <>
            <Button
              size="sm"
              className="h-7 bg-[#4F46C7] text-white hover:bg-[#4338A8]"
              onClick={() => setCreateOpen(true)}
            >
              Tạo quy tắc
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setEditOpen(true)}>
              Tinh chỉnh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => deleteM.mutate({ data: { id: rule.id } })}
              disabled={deleteM.isPending}
            >
              Bỏ qua
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-muted-foreground"
              onClick={() => setAppliedOpen(true)}
            >
              Xem {rule.applied_count} lần áp dụng
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </>
        )}
        {(isB || isC) && (
          <>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setAppliedOpen(true)}>
              <Eye className="mr-1 h-3.5 w-3.5" />
              Xem {rule.applied_count} lần áp dụng
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Sửa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground hover:text-destructive"
              onClick={() => setDisableOpen(true)}
            >
              <Power className="mr-1 h-3.5 w-3.5" />
              Tắt
            </Button>
          </>
        )}
        {isD && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => enableM.mutate({ data: { id: rule.id } })}
              disabled={enableM.isPending}
            >
              Bật lại
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteM.mutate({ data: { id: rule.id } })}
              disabled={deleteM.isPending}
            >
              Xoá hẳn
            </Button>
          </>
        )}
      </div>

      {/* Create (promote suggestion) dialog — template-driven */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (o) {
            // Reset về mẫu detect mỗi lần mở
            setTplId(initialParsed.templateId);
            setSlots(initialParsed.slots);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo quy tắc từ đề xuất</DialogTitle>
            <DialogDescription>
              Chọn mẫu phù hợp và điền các giá trị. AI sẽ áp dụng quy tắc này tự động cho mọi
              trường hợp khớp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Template selector */}
            <div>
              <Label className="mb-1 block text-[12px]">Mẫu quy tắc</Label>
              <Select
                value={tplId}
                onValueChange={(v) => {
                  setTplId(v);
                  // Khi đổi mẫu, giữ lại các slot trùng key + parse lại từ rule gốc cho slot mới.
                  const reparsed = parseSuggestion(rule);
                  const next: Record<string, string> = {};
                  for (const s of TEMPLATES_BY_ID[v].slots) {
                    next[s.key] = slots[s.key] ?? reparsed.slots[s.key] ?? "";
                  }
                  setSlots(next);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{tpl.description}</p>
            </div>

            {/* Slot inputs */}
            <div className="grid grid-cols-2 gap-2.5">
              {tpl.slots.map((s) => {
                const val = slots[s.key] ?? "";
                const setVal = (v: string) =>
                  setSlots((prev) => ({ ...prev, [s.key]: v }));
                if (s.kind === "op") {
                  return (
                    <div key={s.key}>
                      <Label className="mb-1 block text-[12px]">{s.label}</Label>
                      <Select value={val || ">"} onValueChange={setVal}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[">", ">=", "<", "<="].map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                return (
                  <div key={s.key} className={s.kind === "text" ? "col-span-2" : ""}>
                    <Label className="mb-1 block text-[12px]">
                      {s.label}
                      {s.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      value={val}
                      placeholder={s.placeholder}
                      inputMode={s.kind === "number" || s.kind === "day" ? "numeric" : undefined}
                      onChange={(e) => setVal(e.target.value)}
                      className="h-9"
                    />
                    {s.kind === "account" && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ACCOUNT_QUICK_PICKS.slice(0, 8).map((acc) => (
                          <button
                            key={acc}
                            type="button"
                            onClick={() => setVal(acc)}
                            className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {acc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview KHI/THÌ chuẩn hoá */}
            <div className="space-y-1.5 rounded-md border border-[#4F46C7]/30 bg-[#F5F4FE] p-3 text-[12.5px]">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#4F46C7]">
                Xem trước quy tắc chuẩn hoá
              </div>
              <div className="flex items-start gap-2">
                <ChipWhen />
                <span className="flex-1 leading-relaxed">{rendered.when_text}</span>
              </div>
              <div className="flex items-start gap-2">
                <ChipThen />
                <span className="flex-1 leading-relaxed">{rendered.then_text}</span>
              </div>
            </div>

            {/* Đề xuất gốc */}
            <div className="rounded-md bg-muted/40 px-3 py-2 text-[11.5px] italic text-muted-foreground">
              <span className="font-semibold not-italic">Đề xuất gốc:</span> {rule.when_text}
              {" → "}
              {rule.then_text}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              className="bg-[#4F46C7] text-white hover:bg-[#4338A8]"
              disabled={promoteM.isPending || !!slotError}
              onClick={() =>
                promoteM.mutate({
                  data: {
                    id: rule.id,
                    template_id: tplId,
                    slots,
                    title: rendered.title,
                    when_text: rendered.when_text,
                    then_text: rendered.then_text,
                  },
                })
              }
            >
              {slotError ?? "Xác nhận tạo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa quy tắc</DialogTitle>
            <DialogDescription>
              Hỗ trợ cú pháp đơn giản: <code>vendor="..."</code>, <code>amount&gt;...</code>,{" "}
              <code>description contains "..."</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 inline-flex items-center gap-2">
                <ChipWhen /> Điều kiện
              </Label>
              <Textarea value={editWhen} onChange={(e) => setEditWhen(e.target.value)} rows={3} />
            </div>
            <div>
              <Label className="mb-1 inline-flex items-center gap-2">
                <ChipThen /> Hành động hạch toán
              </Label>
              <Textarea value={editThen} onChange={(e) => setEditThen(e.target.value)} rows={3} />
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              Sẽ áp dụng cho <b>{rule.applied_count}</b> mục trong 30 ngày qua nếu quy tắc
              này tồn tại.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateM.isPending}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tắt quy tắc?</AlertDialogTitle>
            <AlertDialogDescription>
              Hãy ghi lại lý do để AI hiểu vì sao và không tái tạo quy tắc tương tự.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            placeholder="Vd: Quy tắc quá rộng, có trường hợp ngoại lệ..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDisable}
            >
              Tắt quy tắc
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Applied list sheet — lịch sử thật từ ai_rule_applications */}
      <AppliedHistorySheet
        open={appliedOpen}
        onOpenChange={setAppliedOpen}
        rule={rule}
      />
    </div>
  );
}

function AppliedHistorySheet({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: MemoryRule;
}) {
  const invalidate = useInvalidate();
  const listFn = useServerFn(listRuleApplications);
  const undoFn = useServerFn(undoRuleApplication);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<RuleApplication | null>(null);
  const [undoReason, setUndoReason] = useState("");

  const { data: apps = [], isLoading, refetch } = useQuery({
    queryKey: ["ai-memory", "applications", rule.id],
    queryFn: () => listFn({ data: { rule_id: rule.id } }),
    enabled: open,
  });

  const undoM = useMutation({
    mutationFn: undoFn,
    onSuccess: () => {
      invalidate();
      refetch();
      setUndoTarget(null);
      setUndoReason("");
      toast.success("Đã hoàn tác — bút toán liên quan đã được gỡ bỏ");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{apps.length} lần áp dụng</SheetTitle>
            <SheetDescription className="line-clamp-2">{rule.title}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            {isLoading && (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </>
            )}
            {!isLoading && apps.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-[12.5px] text-muted-foreground">
                Chưa có lần áp dụng nào được ghi nhận.
              </div>
            )}
            {!isLoading &&
              apps.map((a) => {
                const isUndone = a.status === "undone";
                const isOpen = expanded === a.id;
                const conf = typeof a.ai_log?.confidence === "number" ? a.ai_log.confidence : null;
                const model = (a.ai_log?.model as string | undefined) ?? null;
                const latency = a.ai_log?.latency_ms as number | undefined;
                const tokens = a.ai_log?.tokens as number | undefined;
                const matched = a.ai_log?.matched_when as string | undefined;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-md border p-2.5 text-[12.5px] transition-colors",
                      isUndone && "bg-muted/40 opacity-70",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">
                          {a.journal_code ?? a.document_label ?? "—"}
                        </span>
                        {isUndone && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            đã hoàn tác
                          </Badge>
                        )}
                      </div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">
                        {new Date(a.applied_at).toLocaleString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    <div className={cn("mt-1 text-muted-foreground", isUndone && "line-through")}>
                      {a.then_snapshot}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {model && (
                        <span className="inline-flex items-center gap-1">
                          <Bot className="h-3 w-3" /> {model.split("/").pop()}
                        </span>
                      )}
                      {conf != null && (
                        <span className="inline-flex items-center gap-1">
                          <Target className="h-3 w-3" /> {(conf * 100).toFixed(0)}%
                        </span>
                      )}
                      {latency != null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {latency}ms
                        </span>
                      )}
                    </div>

                    {isOpen && (
                      <div className="mt-2 space-y-1.5 rounded bg-muted/50 p-2 text-[11.5px]">
                        {matched && (
                          <div>
                            <span className="font-semibold">Khớp điều kiện: </span>
                            <span className="text-muted-foreground">{matched}</span>
                          </div>
                        )}
                        {tokens != null && (
                          <div>
                            <span className="font-semibold">Tokens: </span>
                            <span className="text-muted-foreground">{tokens}</span>
                          </div>
                        )}
                        {a.document_label && (
                          <div>
                            <span className="font-semibold">Chứng từ: </span>
                            <span className="text-muted-foreground">{a.document_label}</span>
                          </div>
                        )}
                        {isUndone && a.undone_at && (
                          <div className="text-muted-foreground">
                            Hoàn tác lúc {new Date(a.undone_at).toLocaleString("vi-VN")}
                            {a.undo_reason ? ` — ${a.undo_reason}` : ""}
                          </div>
                        )}
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Log AI thô (JSON)
                          </summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-1.5 text-[10.5px]">
                            {JSON.stringify(a.ai_log, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}

                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11.5px]"
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                      >
                        {isOpen ? "Thu gọn" : "Chi tiết"}
                      </Button>
                      {!isUndone && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-destructive"
                          onClick={() => setUndoTarget(a)}
                        >
                          Hoàn tác
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!undoTarget} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hoàn tác lần áp dụng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bút toán liên quan ({undoTarget?.journal_code ?? "—"}) sẽ bị gỡ bỏ. Chứng từ
              gốc vẫn được giữ lại. Hành động này không thể đảo ngược.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={undoReason}
            onChange={(e) => setUndoReason(e.target.value)}
            placeholder="Lý do hoàn tác (tuỳ chọn)"
            rows={2}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={undoM.isPending}
              onClick={() =>
                undoTarget &&
                undoM.mutate({
                  data: { id: undoTarget.id, reason: undoReason.trim() || undefined },
                })
              }
            >
              Xác nhận hoàn tác
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChipWhen() {
  return (
    <span
      className="shrink-0 rounded-[3px] px-1.5 py-px text-[10px] font-semibold text-white"
      style={{ backgroundColor: "#26215C" }}
    >
      KHI
    </span>
  );
}
function ChipThen() {
  return (
    <span
      className="shrink-0 rounded-[3px] px-1.5 py-px text-[10px] font-semibold text-white"
      style={{ backgroundColor: "#0F6E56" }}
    >
      THÌ
    </span>
  );
}

// ====== Watch list view ======

function WatchListView({
  items,
  onSwitchToRules,
}: {
  items: MemoryWatch[];
  onSwitchToRules: () => void;
}) {
  const invalidate = useInvalidate();
  const promoteFn = useServerFn(promoteWatchToRule);
  const dismissFn = useServerFn(dismissWatch);

  const promoteM = useMutation({
    mutationFn: promoteFn,
    onSuccess: () => {
      invalidate();
      toast.success("Đã tạo quy tắc & chuyển sang tab Quy tắc");
      onSwitchToRules();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dismissM = useMutation({
    mutationFn: dismissFn,
    onSuccess: () => {
      invalidate();
      toast.success("Đã bỏ theo dõi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Không có mẫu nào đang theo dõi.
      </div>
    );
  }
  return (
    <>
      <div className="mb-2 text-[12px] text-muted-foreground">
        AI đang theo dõi {items.length} mẫu. Khi đủ tin cậy (thường 5 lần lặp), AI sẽ tự
        đề xuất tạo quy tắc.
      </div>
      {items.map((w) => (
        <div
          key={w.id}
          className="flex items-center gap-3 rounded-lg border bg-card p-3 animate-fade-in"
        >
          <span className="h-2 w-2 rounded-full bg-[#4F46C7] animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] leading-snug">{w.text}</div>
            <div className="text-[11px] text-muted-foreground">
              đã {w.seen_count}/{w.target_count} lần
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 bg-[#4F46C7] text-white hover:bg-[#4338A8]"
            disabled={promoteM.isPending}
            onClick={() =>
              promoteM.mutate({
                data: {
                  watch_id: w.id,
                  title: w.text,
                  when_text: w.text,
                  then_text: "(điền hành động hạch toán)",
                },
              })
            }
          >
            Tạo quy tắc luôn
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            disabled={dismissM.isPending}
            onClick={() => dismissM.mutate({ data: { id: w.id } })}
          >
            Bỏ theo dõi
          </Button>
        </div>
      ))}
    </>
  );
}

// ====== Footer ======

function WatchFooter({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t bg-muted/40 px-[18px] py-2.5">
      <span className="relative inline-flex">
        <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-[#4F46C7] opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4F46C7]" />
      </span>
      <div className="flex-1 text-[12.5px] text-muted-foreground">
        AI đang theo dõi <b className="text-foreground">{count}</b> mẫu chưa đủ tin cậy
        để tạo quy tắc · cần ~3–5 lần lặp lại nữa
      </div>
      <Button size="sm" variant="outline" className="h-7" onClick={onClick}>
        Xem chi tiết
      </Button>
    </div>
  );
}

// ====== Coming soon placeholder ======

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      <Badge variant="secondary" className="mb-2">
        Sắp ra mắt
      </Badge>
      <div>Mục "{label}" đang được hoàn thiện.</div>
    </div>
  );
}

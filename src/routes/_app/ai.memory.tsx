import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  type MemoryRule,
  type MemoryWatch,
} from "@/lib/ai-memory.functions";
import {
  RULE_TEMPLATES,
  TEMPLATES_BY_ID,
  ACCOUNT_QUICK_PICKS,
  parseSuggestion,
  renderRule,
  validateSlots,
} from "@/lib/ai-memory-templates";

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

type TabKey = "rules" | "partners" | "context" | "limits" | "learning";

function AIMemoryPage() {
  const [tab, setTab] = useState<TabKey>("rules");
  const list = useServerFn(listAiMemory);
  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory"],
    queryFn: () => list(),
  });

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

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl space-y-3 px-5 py-4">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {tab === "rules" && <RuleList rules={rules} />}
              {tab === "partners" && <ComingSoon label="Đối tác (128)" />}
              {tab === "context" && <ComingSoon label="Bối cảnh doanh nghiệp (12)" />}
              {tab === "limits" && <ComingSoon label="Giới hạn (8)" />}
              {tab === "learning" && (
                <WatchListView items={watch} onSwitchToRules={() => setTab("rules")} />
              )}
            </>
          )}
        </div>
      </ScrollArea>

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

      {/* Create (promote suggestion) dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xem trước quy tắc</DialogTitle>
            <DialogDescription>
              Sau khi tạo, AI sẽ tự động áp dụng cho mọi trường hợp khớp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md bg-muted/40 p-3 text-[13px]">
            <div className="flex items-start gap-2">
              <ChipWhen />
              <span>{rule.when_text}</span>
            </div>
            <div className="flex items-start gap-2">
              <ChipThen />
              <span>{rule.then_text}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button
              className="bg-[#4F46C7] text-white hover:bg-[#4338A8]"
              onClick={() => promoteM.mutate({ data: { id: rule.id } })}
              disabled={promoteM.isPending}
            >
              Xác nhận tạo
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

      {/* Applied list sheet (still mock — lịch sử áp dụng sẽ có sau) */}
      <Sheet open={appliedOpen} onOpenChange={setAppliedOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{rule.applied_count} lần áp dụng</SheetTitle>
            <SheetDescription>
              Danh sách bút toán đã được AI tạo từ quy tắc này.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {Array.from({ length: Math.min(10, rule.applied_count || 5) }).map((_, i) => (
              <div key={i} className="rounded-md border p-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <div className="font-medium">BT-{String(20240 + i).padStart(5, "0")}</div>
                  <div className="text-muted-foreground">
                    {new Date(Date.now() - i * 86400_000).toLocaleDateString("vi-VN")}
                  </div>
                </div>
                <div className="mt-1 text-muted-foreground">{rule.then_text}</div>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11.5px]">
                    Xem chi tiết
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-destructive"
                    onClick={() => toast.success("Đã gửi phản hồi cho AI")}
                  >
                    Báo cáo sai
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
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

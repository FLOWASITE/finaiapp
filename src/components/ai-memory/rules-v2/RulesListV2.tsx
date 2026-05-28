import { useMemo, useState } from "react";
import { Brain, Plus, Lightbulb } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RuleCard } from "./RuleCard";
import { RuleEditor } from "./RuleEditor";
import { makeEmptyRule } from "@/lib/rules/rule-store";
import { memoryRuleToRule } from "@/lib/rules/db-adapter";
import { legacyTextToRuleV2 } from "@/lib/ai-memory-templates";
import {
  listAiMemory,
  createRule,
  updateRule,
  disableRule,
  enableRule,
  deleteRule,
  promoteSuggestion,
  learnRulesNow,
} from "@/lib/ai-memory.functions";
import type { Rule } from "@/types/rule";

export function RulesListV2() {
  const list = useServerFn(listAiMemory);
  const createFn = useServerFn(createRule);
  const updateFn = useServerFn(updateRule);
  const disableFn = useServerFn(disableRule);
  const enableFn = useServerFn(enableRule);
  const deleteFn = useServerFn(deleteRule);
  const promoteFn = useServerFn(promoteSuggestion);
  const learnFn = useServerFn(learnRulesNow);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory"],
    queryFn: () => list(),
  });

  const [draft, setDraft] = useState<Rule | null>(null);
  const [approving, setApproving] = useState<Rule | null>(null);

  const rules: Rule[] = useMemo(
    () => (data?.rules ?? []).map(memoryRuleToRule),
    [data?.rules],
  );

  const suggestions = useMemo(
    () => rules.filter((r) => r.db_type === "suggestion"),
    [rules],
  );
  const activeRules = useMemo(
    () => rules.filter((r) => r.db_type !== "suggestion"),
    [rules],
  );

  const ordered = useMemo(() => {
    const order = (r: Rule) =>
      r.status === "active" && r.enabled ? 0 : r.status === "paused" ? 1 : 2;
    return [...activeRules].sort((a, b) => order(a) - order(b));
  }, [activeRules]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ai-memory"] });
    qc.invalidateQueries({ queryKey: ["memory-graph"] });
  };

  const disableM = useMutation({
    mutationFn: disableFn,
    onSuccess: () => {
      invalidate();
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
  const rejectM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      invalidate();
      toast.success("Đã bỏ qua đề xuất");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      invalidate();
      toast.success("Đã xoá quy tắc");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const learnM = useMutation({
    mutationFn: learnFn,
    onSuccess: (r) => {
      invalidate();
      if (r?.created) toast.success(`Đã học ${r.created} quy tắc mới từ phiếu đã ghi sổ`);
      else toast.info("Chưa có pattern nào lặp lại đủ để học (cần ≥ 3 phiếu cùng nhà cung cấp + tài khoản)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleToggle = (id: string, enabled: boolean, reason?: string) => {
    if (enabled) {
      enableM.mutate({ data: { id } });
    } else {
      disableM.mutate({ data: { id, reason: reason ?? "Người dùng tắt" } });
    }
  };

  /** Khi user bấm "Chấp nhận" trên 1 suggestion → pre-fill conditions/actions từ template rồi mở editor. */
  const handleApprove = (rule: Rule) => {
    if (rule.conditions.length === 0 && rule.actions.length === 0) {
      const parsed = legacyTextToRuleV2({
        title: rule.name,
        when_text: rule.legacy_when_text ?? rule.description,
        then_text: rule.legacy_then_text,
      });
      setApproving({
        ...rule,
        conditions: parsed.conditions,
        actions: parsed.actions,
        mode: rule.mode === "disabled" ? "auto" : rule.mode,
      });
    } else {
      setApproving(rule);
    }
  };

  const handleSave = async (rule: Rule) => {
    const existing = rules.find((r) => r.id === rule.id);
    const payload = {
      title: rule.name,
      when_text: rule.description || rule.name,
      then_text: rule.actions[0] ? `Hành động: ${rule.actions[0].type}` : "—",
      conditions: rule.conditions,
      actions: rule.actions,
      mode: rule.mode,
      confidence_threshold: rule.confidence_threshold,
      applies_to: rule.applies_to,
      enabled: rule.enabled,
      status: rule.status,
    };
    if (existing?.db_type === "suggestion") {
      // Promote suggestion → active with v2 data
      await promoteFn({
        data: {
          id: rule.id,
          title: rule.name,
          when_text: payload.when_text,
          then_text: payload.then_text,
          conditions: rule.conditions,
          actions: rule.actions,
          mode: rule.mode,
          confidence_threshold: rule.confidence_threshold,
          applies_to: rule.applies_to,
          enabled: rule.enabled,
          status: "active",
        },
      });
      toast.success("Đã chấp nhận đề xuất");
    } else if (existing) {
      await updateFn({ data: { id: rule.id, ...payload } });
    } else {
      await createFn({ data: { ...payload, source: "user-taught" } });
    }
    invalidate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const hasAny = ordered.length > 0 || suggestions.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Brain className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h3 className="mt-2 text-sm font-medium">Chưa có quy tắc nào</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          AI sẽ tự tạo quy tắc khi thấy bạn lặp lại pattern 3–5 lần.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" onClick={() => setDraft(makeEmptyRule())}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Tạo quy tắc thủ công
          </Button>
        </div>
        {draft && (
          <RuleEditor
            rule={draft}
            open={!!draft}
            onOpenChange={(o) => !o && setDraft(null)}
            onSave={handleSave}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground">
          {ordered.filter((r) => r.enabled).length} quy tắc đang chạy · {ordered.length} tổng
          {suggestions.length > 0 && ` · ${suggestions.length} đề xuất`}
        </div>
        <Button size="sm" variant="outline" onClick={() => setDraft(makeEmptyRule())}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Tạo quy tắc
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-[#4F46C7]" />
            Đề xuất từ AI ({suggestions.length})
          </div>
          <div className="space-y-3">
            {suggestions.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                onToggleEnabled={handleToggle}
                onSave={handleSave}
                onApprove={handleApprove}
                onReject={(rule) => rejectM.mutate({ data: { id: rule.id } })}
              />
            ))}
          </div>
        </div>
      )}

      {ordered.length > 0 ? (
        <div className="space-y-3">
          {suggestions.length > 0 && (
            <div className="mt-2 text-[12px] font-medium text-muted-foreground">
              Quy tắc đang chạy ({ordered.length})
            </div>
          )}
          {ordered.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              onToggleEnabled={handleToggle}
              onSave={handleSave}
              onDelete={(rule) => deleteM.mutate({ data: { id: rule.id } })}
            />
          ))}
        </div>
      ) : (
        suggestions.length > 0 && (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-3 text-center text-[12px] text-muted-foreground">
            Chưa có quy tắc nào đang chạy. Chấp nhận một đề xuất phía trên hoặc tạo quy tắc thủ công.
          </div>
        )
      )}


      {draft && (
        <RuleEditor
          rule={draft}
          open={!!draft}
          onOpenChange={(o) => !o && setDraft(null)}
          onSave={handleSave}
        />
      )}
      {approving && (
        <RuleEditor
          rule={approving}
          open={!!approving}
          onOpenChange={(o) => !o && setApproving(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

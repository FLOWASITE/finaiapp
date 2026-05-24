import { useMemo, useState } from "react";
import { Brain, Plus } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RuleCard } from "./RuleCard";
import { RuleEditor } from "./RuleEditor";
import { makeEmptyRule } from "@/lib/rules/rule-store";
import { memoryRuleToRule } from "@/lib/rules/db-adapter";
import {
  listAiMemory,
  createRule,
  updateRule,
  disableRule,
  enableRule,
} from "@/lib/ai-memory.functions";
import type { Rule } from "@/types/rule";

export function RulesListV2() {
  const list = useServerFn(listAiMemory);
  const createFn = useServerFn(createRule);
  const updateFn = useServerFn(updateRule);
  const disableFn = useServerFn(disableRule);
  const enableFn = useServerFn(enableRule);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory"],
    queryFn: () => list(),
  });

  const [draft, setDraft] = useState<Rule | null>(null);

  const rules: Rule[] = useMemo(
    () => (data?.rules ?? []).map(memoryRuleToRule),
    [data?.rules],
  );

  const ordered = useMemo(() => {
    const order = (r: Rule) =>
      r.status === "active" && r.enabled ? 0 : r.status === "paused" ? 1 : 2;
    return [...rules].sort((a, b) => order(a) - order(b));
  }, [rules]);

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

  const handleToggle = (id: string, enabled: boolean, reason?: string) => {
    if (enabled) {
      enableM.mutate({ data: { id } });
    } else {
      disableM.mutate({ data: { id, reason: reason ?? "Người dùng tắt" } });
    }
  };

  const handleSave = async (rule: Rule) => {
    const isExisting = rules.some((r) => r.id === rule.id);
    const payload = {
      title: rule.name,
      when_text: rule.description || rule.name,
      then_text: rule.actions[0]
        ? `Hành động: ${rule.actions[0].type}`
        : "—",
      conditions: rule.conditions,
      actions: rule.actions,
      mode: rule.mode,
      confidence_threshold: rule.confidence_threshold,
      applies_to: rule.applies_to,
      enabled: rule.enabled,
      status: rule.status,
    };
    if (isExisting) {
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

  if (ordered.length === 0) {
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
        </div>
        <Button size="sm" variant="outline" onClick={() => setDraft(makeEmptyRule())}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Tạo quy tắc
        </Button>
      </div>
      <div className="space-y-3">
        {ordered.map((r) => (
          <RuleCard
            key={r.id}
            rule={r}
            onToggleEnabled={handleToggle}
            onSave={handleSave}
          />
        ))}
      </div>
      {draft && (
        <RuleEditor
          rule={draft}
          open={!!draft}
          onOpenChange={(o) => !o && setDraft(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}

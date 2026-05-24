import { useMemo, useState } from "react";
import { Brain, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RuleCard } from "./RuleCard";
import { RuleEditor } from "./RuleEditor";
import { useRuleStore, makeEmptyRule } from "@/lib/rules/rule-store";
import type { Rule } from "@/types/rule";

export function RulesListV2() {
  const rules = useRuleStore((s) => s.rules);
  const [draft, setDraft] = useState<Rule | null>(null);

  const ordered = useMemo(() => {
    const order = (r: Rule) =>
      r.status === "active" && r.enabled ? 0 : r.status === "paused" ? 1 : 2;
    return [...rules].sort((a, b) => order(a) - order(b));
  }, [rules]);

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
          <RuleEditor rule={draft} open={!!draft} onOpenChange={(o) => !o && setDraft(null)} />
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
          <RuleCard key={r.id} rule={r} />
        ))}
      </div>
      {draft && (
        <RuleEditor rule={draft} open={!!draft} onOpenChange={(o) => !o && setDraft(null)} />
      )}
    </>
  );
}

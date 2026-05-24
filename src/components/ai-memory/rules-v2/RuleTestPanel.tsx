import { useState } from "react";
import { PlayCircle, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { simulateRule, type RuleTestResult } from "@/lib/rules/rule-test";
import { useRuleStore } from "@/lib/rules/rule-store";
import type { Rule } from "@/types/rule";

export function RuleTestPanel({
  rule,
  onTested,
}: {
  rule: Rule;
  onTested: () => void;
}) {
  const otherRules = useRuleStore((s) => s.rules.filter((r) => r.id !== rule.id));
  const [result, setResult] = useState<RuleTestResult | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    await new Promise((r) => setTimeout(r, 300));
    const r = simulateRule(rule, otherRules);
    setResult(r);
    setRunning(false);
    onTested();
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={running}
        className="h-9 w-full justify-center"
      >
        <PlayCircle className="mr-1.5 h-4 w-4" />
        {running ? "Đang chạy..." : "Chạy thử 30 ngày qua"}
      </Button>

      {result && (
        <div className="rounded-md border bg-muted/30 p-3 text-[12px]">
          <div className="font-medium">
            Quy tắc sẽ áp dụng cho{" "}
            <span className="text-[#4F46C7]">{result.matched_count}</span> giao dịch:
          </div>
          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              {result.would_book_correctly} mục giữ nguyên (đúng)
            </li>
            <li className="flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 text-amber-600" />
              {result.would_change} mục sẽ bị thay đổi
            </li>
            {result.would_conflict_with_other_rules > 0 && (
              <li className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                {result.would_conflict_with_other_rules} mục conflict với quy tắc khác
              </li>
            )}
          </ul>
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="mt-2 flex items-start gap-1.5 rounded border-l-2 border-amber-500 bg-amber-50 px-2 py-1 text-[11.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </div>
          ))}
          {result.samples.length > 0 && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 text-xs"
              onClick={() => setDetailOpen(true)}
            >
              Xem chi tiết →
            </Button>
          )}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết: trước vs sau khi áp dụng</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-2 font-normal">Ngày</th>
                  <th className="py-1.5 pr-2 font-normal">NCC</th>
                  <th className="py-1.5 pr-2 text-right font-normal">Số tiền</th>
                  <th className="py-1.5 pr-2 font-normal">Trước</th>
                  <th className="py-1.5 font-normal">Sau</th>
                </tr>
              </thead>
              <tbody>
                {result?.samples.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-mono">{s.date}</td>
                    <td className="py-1.5 pr-2">{s.vendor}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {s.amount.toLocaleString("vi-VN")}
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground line-through">
                      {s.current_account}
                    </td>
                    <td className="py-1.5 font-semibold text-[#0F6E56]">
                      {s.proposed_account}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRecordHistory } from "@/lib/admin.functions";
import { diffJsonb, formatDiffValue } from "@/lib/audit-diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

export function RecordAuditHistory({ tableName, recordId }: { tableName: string; recordId: string }) {
  const fn = useServerFn(getRecordHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-history", tableName, recordId],
    queryFn: () => fn({ data: { table_name: tableName, record_id: recordId } }),
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (isLoading) return <div className="text-xs text-muted-foreground">Đang tải lịch sử…</div>;
  const rows = data?.rows ?? [];
  if (rows.length === 0) return <div className="text-xs text-muted-foreground">Chưa có lịch sử kiểm toán.</div>;

  return (
    <div className="space-y-2">
      {rows.map((r: any) => {
        const diff = diffJsonb(r.before, r.after);
        const isOpen = !!open[r.id];
        return (
          <div key={r.id} className="rounded border border-border/50 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={r.action === "delete" ? "destructive" : r.action === "update" ? "default" : "secondary"}>
                  {r.action}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("vi-VN")}
                </span>
                <span className="text-xs">{r.actor_email ?? "—"}</span>
                {diff.length > 0 && (
                  <span className="text-xs text-muted-foreground">· {diff.length} field</span>
                )}
              </div>
              {diff.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setOpen({ ...open, [r.id]: !isOpen })}>
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              )}
            </div>
            {isOpen && diff.length > 0 && (
              <table className="mt-2 w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left">Trường</th>
                    <th className="text-left">Trước</th>
                    <th className="text-left">Sau</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.key} className="border-t border-border/30 align-top">
                      <td className="py-1 pr-2 font-mono">{d.key}</td>
                      <td className="py-1 pr-2 text-destructive break-all">{formatDiffValue(d.before)}</td>
                      <td className="py-1 break-all text-emerald-600 dark:text-emerald-400">{formatDiffValue(d.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

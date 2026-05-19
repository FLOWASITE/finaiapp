import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  listApplicationsBySource,
  type SourceKind,
  type RuleApplication,
} from "@/lib/ai-memory.functions";

const KIND_TITLE: Record<SourceKind, string> = {
  rule: "Quy tắc",
  partner: "Đối tác",
  context: "Bối cảnh DN",
  limit: "Giới hạn",
};

export function SourceAppliedSheet({
  open,
  onOpenChange,
  sourceKind,
  sourceId,
  sourceLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceKind: SourceKind;
  sourceId: string | null;
  sourceLabel: string;
}) {
  const listFn = useServerFn(listApplicationsBySource);
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["ai-memory", "applications", sourceKind, sourceId],
    queryFn: () => listFn({ data: { source_kind: sourceKind, source_id: sourceId! } }),
    enabled: open && !!sourceId,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {KIND_TITLE[sourceKind]} · {apps.length} lần được áp dụng
          </SheetTitle>
          <SheetDescription className="line-clamp-2">{sourceLabel}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {isLoading && (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </>
          )}
          {!isLoading && apps.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-[12.5px] text-muted-foreground">
              Mục ghi nhớ này chưa được AI dùng cho bút toán nào.
            </div>
          )}
          {!isLoading &&
            apps.map((a: RuleApplication) => (
              <div key={a.id} className="rounded-md border p-2.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {a.journal_code ?? a.document_label ?? "—"}
                    </span>
                    {a.status === "undone" && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        đã hoàn tác
                      </Badge>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(a.applied_at).toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground line-clamp-2">{a.then_snapshot}</div>
              </div>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

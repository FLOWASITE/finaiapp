import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Undo2, FileText, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
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
import {
  listRuleApplications,
  undoRuleApplication,
  type RuleApplication,
} from "@/lib/ai-memory.functions";

export function RuleApplicationsSheet({
  ruleId,
  ruleName,
  open,
  onOpenChange,
}: {
  ruleId: string;
  ruleName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const list = useServerFn(listRuleApplications);
  const undoFn = useServerFn(undoRuleApplication);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-rule-applications", ruleId],
    queryFn: () => list({ data: { rule_id: ruleId, limit: 100 } }),
    enabled: open,
  });

  const [confirm, setConfirm] = useState<RuleApplication | null>(null);
  const [reason, setReason] = useState("");

  const undoM = useMutation({
    mutationFn: undoFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-rule-applications", ruleId] });
      qc.invalidateQueries({ queryKey: ["ai-memory"] });
      toast.success("Đã hoàn tác lần áp dụng");
      setConfirm(null);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-[12px] text-muted-foreground">
            Chưa có lần áp dụng nào.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((app) => {
              const undone = app.status === "undone";
              const canUndo = !undone && !!app.journal_entry_id;
              return (
                <li
                  key={app.id}
                  className={cn(
                    "rounded-md border bg-card p-3 text-[12.5px]",
                    undone && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>
                          {new Date(app.applied_at).toLocaleString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>·</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            undone
                              ? "bg-muted text-muted-foreground"
                              : "bg-[#0F6E56]/10 text-[#0F6E56]",
                          )}
                        >
                          {undone ? "Đã hoàn tác" : "Đã áp dụng"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate font-medium">
                          {app.document_label ?? app.journal_code ?? "Chứng từ"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {app.then_snapshot}
                      </div>
                      {undone && app.undo_reason && (
                        <div className="mt-1 text-[11px] italic text-muted-foreground">
                          Lý do hoàn tác: {app.undo_reason}
                        </div>
                      )}
                    </div>
                    {canUndo && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => setConfirm(app)}
                      >
                        <Undo2 className="mr-1 h-3 w-3" /> Hoàn tác
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hoàn tác lần áp dụng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bút toán liên kết sẽ bị xoá khỏi sổ. Chứng từ gốc vẫn được giữ. Hãy nêu lý do
              để AI học cách điều chỉnh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Lý do hoàn tác (vd: AI hạch toán sai TK)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={undoM.isPending}
              onClick={() =>
                confirm &&
                undoM.mutate({ data: { id: confirm.id, reason: reason.trim() || undefined } })
              }
            >
              {undoM.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Đang hoàn tác...
                </>
              ) : (
                "Hoàn tác"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[88vh]">
          <DrawerHeader>
            <DrawerTitle>Lịch sử áp dụng</DrawerTitle>
            <DrawerDescription className="truncate">{ruleName}</DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[480px] flex-col p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b px-5 py-3">
          <SheetTitle className="text-[15px]">Lịch sử áp dụng</SheetTitle>
          <SheetDescription className="truncate text-[12px]">{ruleName}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}

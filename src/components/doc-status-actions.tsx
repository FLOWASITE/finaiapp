import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  transitionStatus,
  type DocStatus,
  type DocTable,
} from "@/lib/documents.functions";

type Action = {
  to: DocStatus;
  label: string;
  needsReason?: boolean;
  destructive?: boolean;
  requiresJE?: boolean;
};

const ACTIONS: Record<DocStatus, Action[]> = {
  uploaded: [
    { to: "ai_read", label: "Đánh dấu AI đã đọc" },
    { to: "reviewed", label: "Duyệt" },
    { to: "rejected", label: "Từ chối", destructive: true, needsReason: true },
  ],
  ai_read: [
    { to: "reviewed", label: "Duyệt" },
    { to: "rejected", label: "Từ chối", destructive: true, needsReason: true },
  ],
  reviewed: [
    { to: "posted", label: "Ghi sổ", requiresJE: true },
    { to: "ai_read", label: "Huỷ duyệt" },
    { to: "void", label: "Huỷ chứng từ", destructive: true, needsReason: true },
  ],
  posted: [
    { to: "void", label: "Huỷ chứng từ", destructive: true, needsReason: true },
    { to: "reviewed", label: "Mở lại để sửa" },
  ],
  void: [],
  rejected: [{ to: "uploaded", label: "Phục hồi" }],
};

export function DocStatusActions({
  table,
  id,
  status,
  hasJournalEntry = false,
  invalidateKeys = [],
  onChanged,
}: {
  table: DocTable;
  id: string;
  status: DocStatus | string;
  hasJournalEntry?: boolean;
  invalidateKeys?: string[];
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const transition = useServerFn(transitionStatus);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: (vars: { to: DocStatus; reason?: string }) =>
      transition({ data: { table, id, to_status: vars.to, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["doc-status-history", table, id] });
      setPendingAction(null);
      setReason("");
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acts = ACTIONS[(status as DocStatus) ?? "uploaded"] ?? [];
  if (acts.length === 0) return null;

  const handleClick = (a: Action) => {
    if (a.requiresJE && !hasJournalEntry) {
      toast.error("Chứng từ chưa có bút toán — hãy tạo bút toán trước khi ghi sổ.");
      return;
    }
    if (a.needsReason) {
      setPendingAction(a);
      return;
    }
    mut.mutate({ to: a.to });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {acts.map((a) => (
            <DropdownMenuItem
              key={a.to + a.label}
              onClick={() => handleClick(a)}
              className={a.destructive ? "text-destructive" : ""}
            >
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(o) => {
          if (!o) {
            setPendingAction(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Vui lòng nhập lý do. Hành động này sẽ được ghi lại trong lịch sử.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Lý do</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim() || mut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!pendingAction) return;
                mut.mutate({ to: pendingAction.to, reason: reason.trim() });
              }}
            >
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

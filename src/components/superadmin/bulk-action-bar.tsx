import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { bulkAccountAction } from "@/lib/superadmin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Lock, Unlock, KeyRound, Trash2, X } from "lucide-react";

export function BulkActionBar({
  selected,
  onClear,
}: {
  selected: string[];
  onClear: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [phrase, setPhrase] = useState("");
  const qc = useQueryClient();
  const fn = useServerFn(bulkAccountAction);

  const mut = useMutation({
    mutationFn: (action: "ban" | "unban" | "delete" | "reset_password") =>
      fn({
        data: {
          user_ids: selected,
          action,
          confirm_phrase: action === "delete" ? phrase : undefined,
        },
      }),
    onSuccess: (res: any, action) => {
      const skipped = res.skipped_self ? ` (bỏ qua ${res.skipped_self} chính bạn)` : "";
      if (res.failed > 0) {
        toast.warning(`Hoàn tất ${res.ok}/${selected.length} — ${res.failed} lỗi${skipped}`);
      } else {
        toast.success(`Đã ${labelOf(action)} ${res.ok} tài khoản${skipped}`);
      }
      qc.invalidateQueries({ queryKey: ["superadmin-accounts"] });
      onClear();
      setConfirm(false); setPhrase("");
    },
    onError: (e: any) => toast.error(e.message ?? "Thất bại"),
  });

  if (!selected.length) return null;
  const expected = `DELETE ${selected.length} accounts`;

  return (
    <>
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-3 py-2 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <span className="text-sm font-medium">Đã chọn {selected.length}</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" disabled={mut.isPending} onClick={() => mut.mutate("unban")}>
          <Unlock className="mr-1 h-3.5 w-3.5" /> Mở khóa
        </Button>
        <Button variant="outline" size="sm" disabled={mut.isPending} onClick={() => mut.mutate("ban")}>
          <Lock className="mr-1 h-3.5 w-3.5" /> Khóa
        </Button>
        <Button variant="outline" size="sm" disabled={mut.isPending} onClick={() => mut.mutate("reset_password")}>
          <KeyRound className="mr-1 h-3.5 w-3.5" /> Reset mật khẩu
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Xóa
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={confirm} onOpenChange={(o) => !o && setConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa {selected.length} tài khoản</DialogTitle>
            <DialogDescription>
              Thao tác KHÔNG hoàn tác. Dữ liệu tổ chức của các user này sẽ KHÔNG bị xóa tự động.
              Nhập chính xác: <code className="rounded bg-muted px-1">{expected}</code>
            </DialogDescription>
          </DialogHeader>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={expected} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={phrase !== expected || mut.isPending}
              onClick={() => mut.mutate("delete")}
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function labelOf(a: string) {
  return a === "ban" ? "khóa" : a === "unban" ? "mở khóa" : a === "delete" ? "xóa" : "gửi reset cho";
}

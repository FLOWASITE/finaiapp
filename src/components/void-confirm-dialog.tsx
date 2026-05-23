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
import { AlertTriangle, FileText, Package, Wallet, Landmark, Receipt } from "lucide-react";

type Item = { type: string; label: string; detail?: string };

function iconFor(type: string) {
  switch (type) {
    case "journal_entry":
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    case "stock_voucher":
      return <Package className="h-4 w-4 text-muted-foreground" />;
    case "cash_voucher":
      return <Wallet className="h-4 w-4 text-muted-foreground" />;
    case "bank_voucher":
      return <Landmark className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Receipt className="h-4 w-4 text-muted-foreground" />;
  }
}

export function VoidConfirmDialog({
  open,
  onOpenChange,
  items,
  title = "Xác nhận huỷ ghi sổ",
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  items: Item[];
  title?: string;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Các chứng từ và bút toán sau đây sẽ bị <strong>xoá</strong>. Hành động
            này không thể hoàn tác, nhưng phiếu có thể được ghi sổ lại sau khi
            chỉnh sửa.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[320px] overflow-y-auto rounded-md border bg-muted/30 divide-y">
          {items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              Không có chứng từ liên quan.
            </div>
          ) : (
            items.map((it, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                {iconFor(it.type)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{it.label}</div>
                  {it.detail && (
                    <div className="text-xs text-muted-foreground">{it.detail}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Đóng</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Đang huỷ..." : "Xác nhận huỷ ghi sổ"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

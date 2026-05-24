import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listWarehouses } from "@/lib/warehouses.functions";
import { stickStockVoucher } from "@/lib/purchase-vouchers.functions";
import { stickSalesStockVoucher } from "@/lib/sales-vouchers.functions";
import { invalidateLedgers } from "@/lib/query-invalidation";

export type StickStockTarget = {
  kind: "purchase" | "sales";
  id: string;
  voucher_no?: string;
} | null;

export function StickStockVoucherDialog({
  target,
  onClose,
}: {
  target: StickStockTarget;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const whFn = useServerFn(listWarehouses);
  const stickPurchase = useServerFn(stickStockVoucher);
  const stickSales = useServerFn(stickSalesStockVoucher);
  const [warehouseId, setWarehouseId] = useState<string>("");

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => whFn(),
    enabled: !!target,
  });

  useEffect(() => {
    if (!target) {
      setWarehouseId("");
      return;
    }
    const list = (warehouses ?? []) as any[];
    if (list.length === 1) setWarehouseId(list[0].id);
  }, [target, warehouses]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!target) return;
      if (target.kind === "purchase") {
        return stickPurchase({ data: { id: target.id, warehouseId } });
      }
      return stickSales({ data: { id: target.id, warehouseId } });
    },
    onSuccess: () => {
      toast.success(target?.kind === "purchase" ? "Đã tạo phiếu nhập kho" : "Đã tạo phiếu xuất kho");
      qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
      qc.invalidateQueries({ queryKey: ["purchase-vouchers"] });
      qc.invalidateQueries({ queryKey: ["pending-stock-docs"] });
      qc.invalidateQueries({ queryKey: ["movements-unposted"] });
      invalidateLedgers(qc);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được phiếu kho"),
  });

  const open = !!target;
  const title =
    target?.kind === "purchase" ? "Tạo phiếu nhập kho" : "Tạo phiếu xuất kho";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title}{target?.voucher_no ? ` — ${target.voucher_no}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Kho</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
            <SelectContent>
              {((warehouses ?? []) as any[]).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button disabled={!warehouseId || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Đang tạo..." : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

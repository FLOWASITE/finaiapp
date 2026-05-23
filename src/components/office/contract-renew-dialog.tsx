import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { renewContract } from "@/lib/office/contracts.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function ContractRenewDialog({
  contractId, currentEnd, currentFee,
}: { contractId: string; currentEnd: string | null; currentFee: number }) {
  const [open, setOpen] = useState(false);
  const [newEnd, setNewEnd] = useState("");
  const [newFee, setNewFee] = useState(currentFee);
  const [notes, setNotes] = useState("");

  const qc = useQueryClient();
  const fn = useServerFn(renewContract);

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: contractId,
          new_end_date: newEnd,
          new_fee_amount: Number(newFee) || 0,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Đã gia hạn hợp đồng");
      qc.invalidateQueries({ queryKey: ["office"] });
      setOpen(false);
      setNewEnd(""); setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <RefreshCw className="h-4 w-4 mr-1" />Gia hạn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Gia hạn hợp đồng</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Hạn hiện tại: {currentEnd ?? "—"}
          </div>
          <div>
            <Label>Hạn mới *</Label>
            <Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
          </div>
          <div>
            <Label>Phí mới (tuỳ chọn)</Label>
            <Input type="number" value={newFee} onChange={(e) => setNewFee(Number(e.target.value))} />
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!newEnd || mut.isPending}>
            {mut.isPending ? "Đang gia hạn..." : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

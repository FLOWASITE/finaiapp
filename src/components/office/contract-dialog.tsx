import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { upsertContract } from "@/lib/office/contracts.functions";
import { listClientLinks } from "@/lib/office/client-links.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const CYCLES = [
  ["monthly", "Hàng tháng"], ["quarterly", "Hàng quý"],
  ["yearly", "Hàng năm"], ["one_off", "Một lần"],
] as const;

const STATUSES = [
  ["draft", "Nháp"], ["active", "Hiệu lực"],
  ["expired", "Hết hạn"], ["terminated", "Chấm dứt"],
] as const;

export function ContractDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(upsertContract);
  const linksFn = useServerFn(listClientLinks);
  const links = useQuery({
    queryKey: ["office", "links"], queryFn: () => linksFn(), enabled: open,
  });

  const [f, setF] = useState({
    link_id: "", contract_no: "", sign_date: "", start_date: "", end_date: "",
    fee_amount: 0, billing_cycle: "monthly" as any, status: "draft" as any,
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          link_id: f.link_id,
          contract_no: f.contract_no,
          sign_date: f.sign_date || null,
          start_date: f.start_date || null,
          end_date: f.end_date || null,
          fee_amount: Number(f.fee_amount) || 0,
          billing_cycle: f.billing_cycle,
          services: [],
          status: f.status,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu hợp đồng");
      qc.invalidateQueries({ queryKey: ["office", "contracts"] });
      setOpen(false);
      setF({ link_id: "", contract_no: "", sign_date: "", start_date: "", end_date: "", fee_amount: 0, billing_cycle: "monthly", status: "draft" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Hợp đồng</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo hợp đồng mới</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Khách hàng *</Label>
            <Select value={f.link_id} onValueChange={(v) => setF({ ...f, link_id: v })}>
              <SelectTrigger><SelectValue placeholder="Chọn khách" /></SelectTrigger>
              <SelectContent>
                {(links.data ?? []).map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.display_name || l.tenant?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Số HĐ *</Label>
              <Input value={f.contract_no} onChange={(e) => setF({ ...f, contract_no: e.target.value })} />
            </div>
            <div>
              <Label>Ngày ký</Label>
              <Input type="date" value={f.sign_date} onChange={(e) => setF({ ...f, sign_date: e.target.value })} />
            </div>
            <div>
              <Label>Phí</Label>
              <Input type="number" value={f.fee_amount}
                onChange={(e) => setF({ ...f, fee_amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Hiệu lực từ</Label>
              <Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Đến</Label>
              <Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
            </div>
            <div>
              <Label>Chu kỳ</Label>
              <Select value={f.billing_cycle} onValueChange={(v) => setF({ ...f, billing_cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trạng thái</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()}
            disabled={!f.link_id || !f.contract_no.trim() || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

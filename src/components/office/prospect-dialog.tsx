import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { upsertProspect } from "@/lib/office/prospects.functions";
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

const STATUSES = [
  ["new", "Mới"], ["contacted", "Đã liên hệ"], ["negotiating", "Đang đàm phán"],
  ["won", "Đã ký"], ["lost", "Mất"],
] as const;

export function ProspectDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(upsertProspect);
  const [form, setForm] = useState({
    name: "", tax_id: "", contact_person: "", phone: "", email: "",
    industry: "", estimated_fee: 0, status: "new" as (typeof STATUSES)[number][0],
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          name: form.name,
          tax_id: form.tax_id || null,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          email: form.email || null,
          industry: form.industry || null,
          estimated_fee: Number(form.estimated_fee) || 0,
          status: form.status,
        },
      }),
    onSuccess: () => {
      toast.success("Đã thêm khách tiềm năng");
      qc.invalidateQueries({ queryKey: ["office", "prospects"] });
      setOpen(false);
      setForm({ name: "", tax_id: "", contact_person: "", phone: "", email: "", industry: "", estimated_fee: 0, status: "new" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Khách tiềm năng</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Thêm khách tiềm năng</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Tên khách *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>MST</Label>
            <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
          </div>
          <div>
            <Label>Ngành</Label>
            <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div>
            <Label>Người liên hệ</Label>
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </div>
          <div>
            <Label>SĐT</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Ước tính phí/tháng</Label>
            <Input
              type="number"
              value={form.estimated_fee}
              onChange={(e) => setForm({ ...form, estimated_fee: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Trạng thái</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.name.trim() || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

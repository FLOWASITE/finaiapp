import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { upsertStaff } from "@/lib/office/staff.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function StaffDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(upsertStaff);
  const [form, setForm] = useState({
    full_name: "", employee_code: "", position: "", department: "",
    phone: "", email: "", skills: "",
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          full_name: form.full_name,
          employee_code: form.employee_code || null,
          position: form.position || null,
          department: form.department || null,
          phone: form.phone || null,
          email: form.email || null,
          status: "active",
          skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Đã thêm nhân viên");
      qc.invalidateQueries({ queryKey: ["office", "staff"] });
      setOpen(false);
      setForm({ full_name: "", employee_code: "", position: "", department: "", phone: "", email: "", skills: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nhân viên</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Thêm nhân viên</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Họ tên *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Mã NV</Label>
              <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
            </div>
            <div>
              <Label>Phòng ban</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Chức danh</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div>
              <Label>SĐT</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Kỹ năng (phân cách bằng dấu phẩy)</Label>
              <Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="VAT, BCTC, BHXH" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.full_name.trim() || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

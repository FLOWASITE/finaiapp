import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { inviteStaffToClientTenant } from "@/lib/office/client-links.functions";
import { listStaff } from "@/lib/office/staff.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

export function InviteStaffDialog({ linkId, clientName }: { linkId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [role, setRole] = useState<"accountant" | "admin" | "viewer">("accountant");

  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteStaffToClientTenant);
  const staffFn = useServerFn(listStaff);

  const staff = useQuery({
    queryKey: ["office", "staff"], queryFn: () => staffFn(), enabled: open,
  });

  const candidates = (staff.data ?? []).filter(
    (s: { user_id: string | null }) => !!s.user_id,
  );

  const mut = useMutation({
    mutationFn: () =>
      inviteFn({ data: { link_id: linkId, user_id: userId, role } }),
    onSuccess: () => {
      toast.success("Đã mời nhân viên vào sổ sách khách");
      qc.invalidateQueries({ queryKey: ["office"] });
      setOpen(false);
      setUserId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="h-4 w-4 mr-1" />Mời NV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mời nhân viên vào sổ sách "{clientName}"</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Nhân viên sẽ trở thành thành viên tenant của khách hàng, có quyền ghi sổ kế toán.
          Chỉ liệt kê nhân viên đã liên kết tài khoản người dùng.
        </p>
        <div className="space-y-3">
          <div>
            <Label>Nhân viên</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
              <SelectContent>
                {candidates.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    Chưa có nhân viên nào liên kết user
                  </div>
                )}
                {candidates.map((s: { id: string; user_id: string | null; full_name: string; position: string | null }) => (
                  <SelectItem key={s.id} value={s.user_id!}>
                    {s.full_name}{s.position ? ` — ${s.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vai trò</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="accountant">Kế toán</SelectItem>
                <SelectItem value="admin">Quản trị</SelectItem>
                <SelectItem value="viewer">Xem</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!userId || mut.isPending}>
            {mut.isPending ? "Đang mời..." : "Mời"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

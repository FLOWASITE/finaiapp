import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inviteAccount, listOrganizations } from "@/lib/superadmin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, ShieldAlert } from "lucide-react";

const TENANT_ROLES = [
  { value: "owner", label: "Chủ sở hữu" },
  { value: "admin", label: "Quản trị" },
  { value: "accountant", label: "Kế toán" },
  { value: "viewer", label: "Chỉ xem" },
];

export function InviteAccountDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tenantId, setTenantId] = useState<string>("");
  const [tenantRole, setTenantRole] = useState<string>("viewer");
  const [grantSa, setGrantSa] = useState(false);

  const qc = useQueryClient();
  const orgsFn = useServerFn(listOrganizations);
  const inviteFn = useServerFn(inviteAccount);

  const { data: orgsData } = useQuery({
    queryKey: ["superadmin-organizations-light"],
    queryFn: () => orgsFn(),
    enabled: open,
    staleTime: 60_000,
  });

  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          email,
          display_name: displayName || undefined,
          tenant_id: tenantId || undefined,
          tenant_role: tenantId ? (tenantRole as any) : undefined,
          grant_superadmin: grantSa,
        },
      }),
    onSuccess: () => {
      toast.success(`Đã gửi lời mời tới ${email}`);
      qc.invalidateQueries({ queryKey: ["superadmin-accounts"] });
      setOpen(false);
      setEmail(""); setDisplayName(""); setTenantId(""); setTenantRole("viewer"); setGrantSa(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Mời thất bại"),
  });

  const orgs = (orgsData as any)?.organizations ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)} size="sm">
        <UserPlus className="mr-2 h-4 w-4" /> Mời tài khoản
      </Button>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Mời tài khoản mới</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ gửi email mời đặt mật khẩu. Có thể gắn ngay vào một tổ chức.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email *</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-name">Tên hiển thị</Label>
            <Input id="inv-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nguyễn Văn A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tổ chức (tùy chọn)</Label>
              <Select value={tenantId || "none"} onValueChange={(v) => setTenantId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Chưa gắn —</SelectItem>
                  {orgs.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.company_name ?? o.email ?? o.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vai trò tại tổ chức</Label>
              <Select value={tenantRole} onValueChange={setTenantRole} disabled={!tenantId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TENANT_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm cursor-pointer">
            <Checkbox checked={grantSa} onCheckedChange={(v) => setGrantSa(!!v)} className="mt-0.5" />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 font-medium text-destructive">
                <ShieldAlert className="h-3.5 w-3.5" /> Cấp quyền Super-admin
              </span>
              <span className="text-xs text-muted-foreground">
                Toàn quyền nền tảng. Chỉ cấp cho người tin cậy.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            onClick={() => invite.mutate()}
            disabled={!email || invite.isPending}
          >
            {invite.isPending ? "Đang gửi..." : "Gửi lời mời"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

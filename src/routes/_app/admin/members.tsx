import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useState } from "react";
import { toast } from "sonner";
import { listMembers, inviteMember, updateMemberRole, removeMember, revokeInvitation } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus, Copy } from "lucide-react";

export const Route = createFileRoute("/_app/admin/members")({ component: MembersPage });

const ROLES = ["owner", "accountant", "approver", "viewer"] as const;

function MembersPage() {
  const list = useServerFn(listMembers);
  const invite = useServerFn(inviteMember);
  const updateRole = useServerFn(updateMemberRole);
  const remove = useServerFn(removeMember);
  const revoke = useServerFn(revokeInvitation);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-members"], queryFn: () => list(),
 ...QUERY_PRESETS.TENANT_STATIC,
});

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("viewer");

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-members"] });

  const onInvite = async () => {
    try {
      await invite({ data: { email, role } });
      toast.success("Đã tạo lời mời");
      setOpen(false); setEmail("");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Thành viên</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><UserPlus className="mr-1.5 h-4 w-4" />Mời thành viên</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Mời thành viên mới</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="email@congty.vn" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter><Button onClick={onInvite}>Gửi lời mời</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Email</th><th className="text-left">Vai trò</th><th className="text-left">Tham gia</th><th className="w-20"></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>}
            {data?.members.map((m: any) => (
              <tr key={m.id} className="border-t border-border/50">
                <td className="px-3 py-2">{m.email ?? <span className="text-muted-foreground">{m.user_id.slice(0,8)}…</span>}</td>
                <td>
                  <Select value={m.role} onValueChange={async (v) => {
                    try { await updateRole({ data: { user_id: m.user_id, role: v as any } }); toast.success("Đã cập nhật"); refresh(); }
                    catch (e: any) { toast.error(e.message); }
                  }}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString("vi-VN")}</td>
                <td>
                  <Button size="icon" variant="ghost" onClick={async () => {
                    if (!confirm("Xóa quyền truy cập?")) return;
                    try { await remove({ data: { user_id: m.user_id } }); toast.success("Đã xóa"); refresh(); }
                    catch (e: any) { toast.error(e.message); }
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Lời mời đang chờ</h2>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Email</th><th className="text-left">Vai trò</th><th className="text-left">Hết hạn</th><th className="text-left">Link</th><th className="w-20"></th></tr>
            </thead>
            <tbody>
              {!data?.invites?.length && <tr><td colSpan={5} className="px-3 py-4 text-muted-foreground">Chưa có lời mời nào.</td></tr>}
              {data?.invites?.map((inv: any) => {
                const link = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${inv.token}`;
                return (
                  <tr key={inv.id} className="border-t border-border/50">
                    <td className="px-3 py-2">{inv.email}</td>
                    <td><Badge variant="outline">{inv.role}</Badge></td>
                    <td className="text-xs">{new Date(inv.expires_at).toLocaleDateString("vi-VN")}</td>
                    <td><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(link); toast.success("Đã sao chép link"); }}><Copy className="mr-1 h-3 w-3" />Sao chép</Button></td>
                    <td><Button size="icon" variant="ghost" onClick={async () => {
                      try { await revoke({ data: { id: inv.id } }); toast.success("Đã hủy"); refresh(); }
                      catch (e: any) { toast.error(e.message); }
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

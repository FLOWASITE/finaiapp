import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getSecurityPolicies, updateSecurityPolicies,
  listIpAllowlist, upsertIpAllowlist, deleteIpAllowlist,
} from "@/lib/superadmin-extra.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Shield, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/security")({
  component: SecurityPage,
});

const ROLES = ["owner", "admin", "accountant", "viewer", "superadmin"];

function SecurityPage() {
  const qc = useQueryClient();
  const getP = useServerFn(getSecurityPolicies);
  const updP = useServerFn(updateSecurityPolicies);
  const listIp = useServerFn(listIpAllowlist);
  const upIp = useServerFn(upsertIpAllowlist);
  const delIp = useServerFn(deleteIpAllowlist);

  const { data: policy } = useQuery({ queryKey: ["sec-policy"], queryFn: () => getP() });
  const { data: ips } = useQuery({ queryKey: ["ip-allowlist"], queryFn: () => listIp() });

  const [draftRoles, setDraftRoles] = useState<string[] | null>(null);
  const [draftIpEnabled, setDraftIpEnabled] = useState<boolean | null>(null);
  const [draftTimeout, setDraftTimeout] = useState<number | null>(null);
  const [ipDialog, setIpDialog] = useState(false);
  const [ipForm, setIpForm] = useState<{ scope: "global" | "tenant"; tenant_id: string; cidr: string; label: string }>({
    scope: "global", tenant_id: "", cidr: "", label: "",
  });

  const roles = draftRoles ?? (policy?.require_2fa_for_roles as string[] | undefined) ?? [];
  const ipEnabled = draftIpEnabled ?? policy?.ip_allowlist_enabled ?? false;
  const timeout = draftTimeout ?? policy?.session_timeout_minutes ?? 0;

  const toggleRole = (r: string) => {
    const set = new Set(roles);
    set.has(r) ? set.delete(r) : set.add(r);
    setDraftRoles(Array.from(set));
  };

  const savePolicy = async () => {
    await updP({ data: { require_2fa_for_roles: roles, ip_allowlist_enabled: ipEnabled, session_timeout_minutes: timeout } });
    toast.success("Đã lưu chính sách bảo mật");
    setDraftRoles(null); setDraftIpEnabled(null); setDraftTimeout(null);
    qc.invalidateQueries({ queryKey: ["sec-policy"] });
  };

  const submitIp = async () => {
    try {
      await upIp({ data: { scope: ipForm.scope, tenant_id: ipForm.tenant_id || null, cidr: ipForm.cidr, label: ipForm.label } });
      toast.success("Đã thêm CIDR");
      setIpDialog(false);
      setIpForm({ scope: "global", tenant_id: "", cidr: "", label: "" });
      qc.invalidateQueries({ queryKey: ["ip-allowlist"] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Chính sách bảo mật</h2>
        </div>

        <div>
          <Label className="text-sm">Bắt buộc 2FA theo vai trò</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => toggleRole(r)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  roles.includes(r) ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Lưu ý: cờ này được lưu nhưng thực thi 2FA cần triển khai MFA ở luồng đăng nhập.</p>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm">Bật IP allowlist</Label>
            <p className="text-xs text-muted-foreground">Khi bật, chỉ IP nằm trong danh sách mới truy cập được. (Chưa enforce ở middleware)</p>
          </div>
          <Switch checked={ipEnabled} onCheckedChange={(v) => setDraftIpEnabled(v)} />
        </div>

        <div className="border-t pt-3">
          <Label className="text-sm">Session timeout (phút, 0 = không giới hạn)</Label>
          <Input
            type="number" min={0} max={43200} className="mt-1 w-40"
            value={timeout}
            onChange={(e) => setDraftTimeout(Number(e.target.value || 0))}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={savePolicy}>Lưu chính sách</Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">IP Allowlist</h2>
          <Button size="sm" onClick={() => setIpDialog(true)}><Plus className="h-3.5 w-3.5 mr-1" />Thêm CIDR</Button>
        </div>
        {!ipEnabled && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            IP allowlist đang TẮT — các CIDR dưới đây chỉ là cấu hình, không chặn truy cập.
          </div>
        )}
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs"><tr>
              <th className="px-2 py-1.5 text-left">Phạm vi</th>
              <th className="px-2 py-1.5 text-left">CIDR</th>
              <th className="px-2 py-1.5 text-left">Nhãn</th>
              <th className="px-2 py-1.5 w-12"></th>
            </tr></thead>
            <tbody>
              {(ips ?? []).map((row: any) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-1.5"><Badge variant="outline">{row.scope}</Badge></td>
                  <td className="px-2 py-1.5 font-mono">{row.cidr}</td>
                  <td className="px-2 py-1.5">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <Button size="icon" variant="ghost" onClick={async () => {
                      await delIp({ data: { id: row.id } });
                      qc.invalidateQueries({ queryKey: ["ip-allowlist"] });
                    }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
              {(!ips || ips.length === 0) && <tr><td colSpan={4} className="px-2 py-6 text-center text-xs text-muted-foreground">Chưa có CIDR nào</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={ipDialog} onOpenChange={setIpDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm CIDR vào allowlist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Phạm vi</Label>
              <Select value={ipForm.scope} onValueChange={(v: any) => setIpForm({ ...ipForm, scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Toàn hệ thống</SelectItem>
                  <SelectItem value="tenant">Theo tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ipForm.scope === "tenant" && (
              <div>
                <Label>Tenant ID</Label>
                <Input value={ipForm.tenant_id} onChange={(e) => setIpForm({ ...ipForm, tenant_id: e.target.value })} />
              </div>
            )}
            <div>
              <Label>CIDR (vd: 203.0.113.0/24 hoặc 198.51.100.5/32)</Label>
              <Input value={ipForm.cidr} onChange={(e) => setIpForm({ ...ipForm, cidr: e.target.value })} />
            </div>
            <div>
              <Label>Nhãn (tuỳ chọn)</Label>
              <Input value={ipForm.label} onChange={(e) => setIpForm({ ...ipForm, label: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIpDialog(false)}>Huỷ</Button>
            <Button onClick={submitIp}>Thêm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

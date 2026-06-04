import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listTenantBilling, updateTenantPlan, setTenantSuspended,
} from "@/lib/superadmin-extra.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Lock, Unlock } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/billing")({
  component: BillingPage,
});

const PLANS = ["free", "pro", "business", "enterprise"];

function BillingPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTenantBilling);
  const updFn = useServerFn(updateTenantPlan);
  const susFn = useServerFn(setTenantSuspended);

  const { data } = useQuery({ queryKey: ["tenant-billing"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});

  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      plan: row.plan?.plan ?? "free",
      seats_limit: row.plan?.seats_limit ?? "",
      ai_tokens_quota: row.plan?.ai_tokens_quota ?? "",
      storage_quota_mb: row.plan?.storage_quota_mb ?? "",
      notes: row.plan?.notes ?? "",
    });
  };

  const save = async () => {
    try {
      await updFn({ data: {
        tenant_id: editing.id, plan: form.plan,
        seats_limit: form.seats_limit ? Number(form.seats_limit) : null,
        ai_tokens_quota: form.ai_tokens_quota ? Number(form.ai_tokens_quota) : null,
        storage_quota_mb: form.storage_quota_mb ? Number(form.storage_quota_mb) : null,
        notes: form.notes || null,
      }});
      toast.success("Đã cập nhật plan");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tenant-billing"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleSuspend = async (row: any) => {
    const suspend = row.status !== "suspended";
    const reason = suspend ? prompt("Lý do tạm ngưng?") || "" : "";
    try {
      await susFn({ data: { tenant_id: row.id, suspended: suspend, reason } });
      toast.success(suspend ? "Đã tạm ngưng" : "Đã khôi phục");
      qc.invalidateQueries({ queryKey: ["tenant-billing"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const pct = (used: number, quota?: number | null) => {
    if (!quota || quota <= 0) return null;
    return Math.min(100, Math.round((used / quota) * 100));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Billing & quota theo tenant</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs"><tr>
              <th className="px-2 py-1.5 text-left">Tenant</th>
              <th className="px-2 py-1.5 text-left">Plan</th>
              <th className="px-2 py-1.5 text-left">Trạng thái</th>
              <th className="px-2 py-1.5 text-right">Documents (tháng)</th>
              <th className="px-2 py-1.5 text-right">AI tokens</th>
              <th className="px-2 py-1.5 w-28"></th>
            </tr></thead>
            <tbody>
              {(data as any[] ?? []).map((row: any) => {
                const p = row.plan; const u = row.usage;
                const docPct = pct(u?.documents_count ?? 0, p?.seats_limit ? null : null);
                const aiPct = pct(u?.ai_tokens_used ?? 0, p?.ai_tokens_quota ?? null);
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{row.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-2 py-1.5"><Badge variant="outline">{p?.plan ?? "—"}</Badge></td>
                    <td className="px-2 py-1.5">
                      <Badge variant={row.status === "suspended" ? "destructive" : "default"}>{row.status}</Badge>
                    </td>
                    <td className="px-2 py-1.5 text-right">{u?.documents_count ?? 0}</td>
                    <td className="px-2 py-1.5 text-right">
                      {(u?.ai_tokens_used ?? 0).toLocaleString()} / {p?.ai_tokens_quota?.toLocaleString() ?? "∞"}
                      {aiPct !== null && (
                        <div className="mt-0.5 h-1 w-24 ml-auto rounded bg-muted">
                          <div className="h-full rounded bg-primary" style={{ width: `${aiPct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleSuspend(row)}>
                          {row.status === "suspended" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!data || (data as any[]).length === 0) && <tr><td colSpan={6} className="px-2 py-6 text-center text-xs text-muted-foreground">Chưa có tenant</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Đổi plan & quota — {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plan</Label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Seats</Label><Input type="number" value={form.seats_limit} onChange={(e) => setForm({ ...form, seats_limit: e.target.value })} /></div>
              <div><Label className="text-xs">AI tokens</Label><Input type="number" value={form.ai_tokens_quota} onChange={(e) => setForm({ ...form, ai_tokens_quota: e.target.value })} /></div>
              <div><Label className="text-xs">Storage MB</Label><Input type="number" value={form.storage_quota_mb} onChange={(e) => setForm({ ...form, storage_quota_mb: e.target.value })} /></div>
            </div>
            <div><Label>Ghi chú</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Huỷ</Button>
            <Button onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

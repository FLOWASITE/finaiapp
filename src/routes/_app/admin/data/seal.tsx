import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, Unlock, ShieldAlert, Check, X } from "lucide-react";
import {
  listSealStatus, sealPeriod, requestUnseal, approveUnseal, rejectUnseal,
} from "@/lib/period-seal.functions";

export const Route = createFileRoute("/_app/admin/data/seal")({
  component: SealPage,
});

function SealPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSealStatus);
  const sealFn = useServerFn(sealPeriod);
  const reqFn = useServerFn(requestUnseal);
  const apprFn = useServerFn(approveUnseal);
  const rejFn = useServerFn(rejectUnseal);

  const { data } = useQuery({ queryKey: ["seal-status"], queryFn: () => listFn() });
  const [dialog, setDialog] = useState<
    | { mode: "seal" | "request"; period_id: string; label: string }
    | null
  >(null);
  const [reason, setReason] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["seal-status"] });

  const doSeal = async () => {
    if (!dialog) return;
    try {
      if (dialog.mode === "seal") {
        await sealFn({ data: { period_id: dialog.period_id, reason } });
        toast.success("Đã niêm phong kỳ");
      } else {
        await reqFn({ data: { period_id: dialog.period_id, reason } });
        toast.success("Đã gửi yêu cầu mở niêm phong — cần chữ ký thứ 2");
      }
      setDialog(null); setReason(""); refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const onApprove = async (id: string) => {
    try { await apprFn({ data: { request_id: id } }); toast.success("Đã phê duyệt — kỳ đã mở"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const onReject = async (id: string) => {
    try { await rejFn({ data: { request_id: id } }); toast.success("Đã từ chối"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  const periods = data?.periods ?? [];
  const requests = data?.requests ?? [];
  const pending = requests.filter((r: any) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <ShieldAlert className="h-4 w-4 mt-0.5 text-amber-600" />
        <div>
          <div className="font-medium">Niêm phong (Seal) là biện pháp bảo vệ cao nhất</div>
          <div className="text-muted-foreground">
            Kỳ đã niêm phong KHÔNG cho phép thêm/sửa/xoá bút toán & chứng từ ở cấp database.
            Mở niêm phong cần <strong>2 chữ ký</strong>: chủ DN + quản trị viên.
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="p-4 space-y-2 border-amber-500/40">
          <h3 className="font-medium">Yêu cầu mở niêm phong chờ duyệt ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map((r: any) => {
              const p = periods.find((x: any) => x.id === r.period_id);
              return (
                <div key={r.id} className="flex items-center justify-between rounded border p-2">
                  <div className="text-sm">
                    <div className="font-medium">Kỳ {p ? `${p.period_no}/${p.year}` : r.period_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">Lý do: {r.reason}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Gửi bởi {r.requested_role} · hết hạn {new Date(r.expires_at).toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="default" onClick={() => onApprove(r.id)}>
                      <Check className="h-3.5 w-3.5 mr-1" />Phê duyệt
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(r.id)}>
                      <X className="h-3.5 w-3.5 mr-1" />Từ chối
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Kỳ kế toán</h3>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="px-2 py-1.5 text-left">Kỳ</th>
                <th className="px-2 py-1.5 text-left">Trạng thái</th>
                <th className="px-2 py-1.5 text-left">Niêm phong</th>
                <th className="px-2 py-1.5 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-1.5">{p.period_no}/{p.year}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline">{p.status}</Badge></td>
                  <td className="px-2 py-1.5">
                    {p.is_sealed
                      ? <Badge className="bg-red-500/15 text-red-700 border-red-500/30"><Lock className="h-3 w-3 mr-1" />Sealed</Badge>
                      : <Badge variant="secondary"><Unlock className="h-3 w-3 mr-1" />Mở</Badge>}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {p.is_sealed ? (
                      <Button size="sm" variant="outline"
                        onClick={() => { setDialog({ mode: "request", period_id: p.id, label: `${p.period_no}/${p.year}` }); setReason(""); }}>
                        Yêu cầu mở
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive"
                        onClick={() => { setDialog({ mode: "seal", period_id: p.id, label: `${p.period_no}/${p.year}` }); setReason(""); }}>
                        <Lock className="h-3.5 w-3.5 mr-1" />Niêm phong
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-6 text-center text-xs text-muted-foreground">Chưa có kỳ nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.mode === "seal" ? "Niêm phong kỳ " : "Yêu cầu mở niêm phong kỳ "}
              {dialog?.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.mode === "seal"
                ? "Sau khi niêm phong, mọi thao tác thêm/sửa/xoá trong kỳ này sẽ bị từ chối ở cấp database. Chỉ có thể mở lại với 2 chữ ký."
                : "Yêu cầu của bạn sẽ chờ chữ ký thứ 2 (chủ DN hoặc quản trị viên còn lại) trong vòng 48h."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={doSeal} disabled={reason.trim().length < (dialog?.mode === "seal" ? 3 : 10)}>
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

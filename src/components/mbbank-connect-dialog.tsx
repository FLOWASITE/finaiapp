import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, KeyRound, Power, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  setMbCredentials,
  toggleMbSync,
  triggerMbSyncNow,
  getMbSyncStatus,
} from "@/lib/mbbank.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const fmtTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";

export function MbBankConnectDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account: { id: string; name: string };
}) {
  const qc = useQueryClient();
  const setCreds = useServerFn(setMbCredentials);
  const toggle = useServerFn(toggleMbSync);
  const syncNow = useServerFn(triggerMbSyncNow);
  const fetchStatus = useServerFn(getMbSyncStatus);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["mb-sync-status", account.id],
    queryFn: () => fetchStatus({ data: { bank_account_id: account.id } }),
    enabled: open,
  });

  const acc = data?.account as any;
  const logs = (data?.logs ?? []) as any[];
  const hasCreds = !!acc?.mb_username;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const saveCreds = useMutation({
    mutationFn: () =>
      setCreds({ data: { bank_account_id: account.id, username, password } }),
    onSuccess: () => {
      toast.success("Đã lưu thông tin đăng nhập MB Bank");
      setPassword("");
      refetch();
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const toggleM = useMutation({
    mutationFn: (enabled: boolean) =>
      toggle({ data: { bank_account_id: account.id, enabled } }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const syncM = useMutation({
    mutationFn: () => syncNow({ data: { bank_account_id: account.id } }),
    onSuccess: () => {
      toast.success("Đã gửi yêu cầu đồng bộ, kết quả sẽ về sau ít phút");
      setTimeout(() => refetch(), 3000);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Kết nối MB Bank
          </DialogTitle>
          <DialogDescription>
            {account.name} — tự động tải sao kê 5 phút/lần qua Worker an toàn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          {hasCreds && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">Tài khoản MB: {acc.mb_username}</div>
                  <div className="text-xs text-muted-foreground">
                    Lần đồng bộ cuối: {fmtTime(acc?.last_synced_at)}
                  </div>
                </div>
                <StatusBadge status={acc?.last_sync_status} />
              </div>
              <div className="flex items-center justify-between pt-1 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <Power className="h-4 w-4" />
                  <span>Tự động đồng bộ</span>
                </div>
                <Switch
                  checked={!!acc?.sync_enabled}
                  onCheckedChange={(v) => toggleM.mutate(v)}
                  disabled={toggleM.isPending}
                />
              </div>
              {acc?.last_sync_error && (
                <div className="text-xs text-destructive p-2 rounded bg-destructive/10">
                  {acc.last_sync_error}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => syncM.mutate()}
                disabled={syncM.isPending || !acc?.sync_enabled}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncM.isPending ? "animate-spin" : ""}`} />
                Đồng bộ ngay
              </Button>
            </div>
          )}

          {/* Credentials */}
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {hasCreds ? "Cập nhật mật khẩu" : "Nhập thông tin đăng nhập MB Bank"}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên đăng nhập / Số ĐT</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={acc?.mb_username || "0901xxxxxx"}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mật khẩu</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mật khẩu được mã hoá AES-256-GCM trước khi lưu. Worker chỉ giải mã trong RAM khi đăng nhập.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => saveCreds.mutate()}
              disabled={!username || !password || saveCreds.isPending}
            >
              {saveCreds.isPending ? "Đang lưu…" : hasCreds ? "Cập nhật" : "Lưu & bật đồng bộ"}
            </Button>
          </div>

          {/* Recent logs */}
          {logs.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Lịch sử gần đây</div>
              <div className="space-y-1 max-h-40 overflow-auto">
                {logs.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/30">
                    <span className="text-muted-foreground">{fmtTime(l.started_at)}</span>
                    <span className="flex items-center gap-2">
                      {l.txn_new != null && <span>+{l.txn_new}/{l.txn_fetched ?? 0} GD</span>}
                      <StatusBadge status={l.status} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isFetching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 animate-spin" /> Đang tải trạng thái…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">Chưa chạy</Badge>;
  if (status === "success")
    return (
      <Badge className="text-xs bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Thành công
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="destructive" className="text-xs">
        <XCircle className="h-3 w-3 mr-1" /> Lỗi
      </Badge>
    );
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

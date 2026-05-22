import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import {
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Lock,
  KeyRound,
  Power,
  PowerOff,
  Unplug,
  Info,
  ListChecks,
  LayoutDashboard,
  AlertCircle,
  Wallet,
  Clock,
  Loader2,
} from "lucide-react";
import {
  setMbCredentials,
  toggleMbSync,
  triggerMbSyncNow,
  getMbSyncStatus,
  disconnectMb,
} from "@/lib/mbbank.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MbStatusBadge } from "./mbbank-status-badge";
import { cn } from "@/lib/utils";

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

const fmtRelative = (s?: string | null) =>
  s ? formatDistanceToNow(new Date(s), { addSuffix: true, locale: vi }) : "—";

const fmtFull = (s?: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";

const maskUser = (u?: string | null) => {
  if (!u) return "—";
  if (u.length <= 4) return u;
  return `${u.slice(0, 2)}${"•".repeat(Math.max(3, u.length - 4))}${u.slice(-2)}`;
};

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
  const disconnect = useServerFn(disconnectMb);

  const [polling, setPolling] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["mb-sync-status", account.id],
    queryFn: () => fetchStatus({ data: { bank_account_id: account.id } }),
    enabled: open,
    refetchInterval: polling ? 2000 : false,
  });

  const acc = data?.account as any;
  const logs = (data?.logs ?? []) as any[];
  const hasCreds = !!acc?.mb_username;

  // Stop polling when status changes from running to terminal
  useEffect(() => {
    if (!polling) return;
    if (acc?.last_sync_status && acc.last_sync_status !== "running") {
      setPolling(false);
      if (acc.last_sync_status === "success") toast.success("Đồng bộ hoàn tất");
      else if (acc.last_sync_status === "error") toast.error("Đồng bộ thất bại");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    }
  }, [acc?.last_sync_status, polling, qc]);

  // Safety: auto-stop polling after 30s
  useEffect(() => {
    if (!polling) return;
    const t = setTimeout(() => setPolling(false), 30000);
    return () => clearTimeout(t);
  }, [polling]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white font-bold text-sm shadow-sm"
              style={{ background: "linear-gradient(135deg,#0046b8,#e60012)" }}
              aria-hidden
            >
              MB
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base">Kết nối MB Bank</SheetTitle>
              <SheetDescription className="text-xs mt-0.5 truncate">
                {account.name} · Tự động đồng bộ sao kê 5 phút/lần
              </SheetDescription>
            </div>
            <MbStatusBadge status={acc?.last_sync_status} />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {hasCreds ? (
            <ConnectedView
              acc={acc}
              logs={logs}
              isFetching={isFetching}
              polling={polling}
              onSyncNow={async () => {
                try {
                  await syncNow({ data: { bank_account_id: account.id } });
                  toast.message("Đã gửi yêu cầu đồng bộ");
                  setPolling(true);
                  setTimeout(() => refetch(), 1500);
                } catch (e: any) {
                  toast.error(e?.message || "Không gửi được yêu cầu");
                }
              }}
              onToggle={async (v) => {
                try {
                  await toggle({ data: { bank_account_id: account.id, enabled: v } });
                  refetch();
                  qc.invalidateQueries({ queryKey: ["bank-accounts"] });
                } catch (e: any) {
                  toast.error(e?.message || "Lỗi");
                }
              }}
              onUpdatePassword={async (username, password) => {
                await setCreds({
                  data: { bank_account_id: account.id, username, password },
                });
                toast.success("Đã cập nhật mật khẩu");
                refetch();
              }}
              onDisconnect={async () => {
                try {
                  await disconnect({ data: { bank_account_id: account.id } });
                  toast.success("Đã ngắt kết nối MB Bank");
                  refetch();
                  qc.invalidateQueries({ queryKey: ["bank-accounts"] });
                } catch (e: any) {
                  toast.error(e?.message || "Lỗi");
                }
              }}
            />
          ) : (
            <EmptyConnectView
              onSubmit={async (username, password) => {
                await setCreds({
                  data: { bank_account_id: account.id, username, password },
                });
                toast.success("Đã kết nối MB Bank");
                await toggle({ data: { bank_account_id: account.id, enabled: true } });
                refetch();
                qc.invalidateQueries({ queryKey: ["bank-accounts"] });
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state — chưa kết nối                                                 */
/* -------------------------------------------------------------------------- */

function EmptyConnectView({
  onSubmit,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const m = useMutation({
    mutationFn: () => onSubmit(username, password),
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
    onSuccess: () => {
      setUsername("");
      setPassword("");
    },
  });

  const canSubmit = username.trim().length > 0 && password.length > 0 && !m.isPending;

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Hero */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-background to-background p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-tight">
              Đồng bộ sao kê MB Bank tự động
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Kết nối một lần — hệ thống tự lấy giao dịch & số dư mỗi 5 phút,
              gợi ý đối chiếu với phiếu thu/chi.
            </p>
          </div>
        </div>
      </div>

      {/* Trust signals */}
      <ul className="space-y-2 text-xs text-muted-foreground">
        <TrustItem icon={Lock} text="Mật khẩu được mã hoá AES-256-GCM trước khi lưu" />
        <TrustItem icon={ShieldCheck} text="Worker an toàn chỉ giải mã trong RAM khi đăng nhập" />
        <TrustItem icon={PowerOff} text="Có thể tắt đồng bộ hoặc ngắt kết nối bất cứ lúc nào" />
      </ul>

      {/* Form */}
      <form
        className="space-y-3 rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) m.mutate();
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Thông tin đăng nhập MB Bank</h3>
          <WorkerInfoTooltip />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mb-user" className="text-xs">Tên đăng nhập / Số điện thoại</Label>
          <Input
            id="mb-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="0901xxxxxx"
            autoComplete="off"
            className="h-10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mb-pw" className="text-xs">Mật khẩu</Label>
          <div className="relative">
            <Input
              id="mb-pw"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="h-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              tabIndex={-1}
              aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full h-10 mt-1" disabled={!canSubmit}>
          {m.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang kết nối…
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4 mr-2" /> Kết nối & bật đồng bộ
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

function TrustItem({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>{text}</span>
    </li>
  );
}

function WorkerInfoTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Info className="h-3 w-3" /> Cách hoạt động
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
          Một Worker riêng đăng nhập MB Bank thay bạn, giải OTP/captcha bằng OCR
          và lấy giao dịch mới. FinAI chỉ nhận giao dịch đã chuẩn hoá.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Connected state — đã kết nối                                               */
/* -------------------------------------------------------------------------- */

function ConnectedView({
  acc,
  logs,
  isFetching,
  polling,
  onSyncNow,
  onToggle,
  onUpdatePassword,
  onDisconnect,
}: {
  acc: any;
  logs: any[];
  isFetching: boolean;
  polling: boolean;
  onSyncNow: () => Promise<void>;
  onToggle: (v: boolean) => Promise<void>;
  onUpdatePassword: (username: string, password: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const running = polling || acc?.last_sync_status === "running";

  return (
    <Tabs defaultValue="overview" className="w-full">
      <div className="px-6 pt-4">
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="overview" className="text-xs gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> Tổng quan
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Lịch sử
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Bảo mật
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Overview */}
      <TabsContent value="overview" className="px-6 py-5 space-y-4 mt-0">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Tài khoản MB
              </div>
              <div className="font-medium text-sm mt-0.5">{acc.mb_username}</div>
            </div>
            <MbStatusBadge status={running ? "running" : acc?.last_sync_status} />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <Metric
              icon={Clock}
              label="Lần đồng bộ cuối"
              value={fmtRelative(acc?.last_synced_at)}
              tooltip={fmtFull(acc?.last_synced_at)}
            />
            <Metric
              icon={Wallet}
              label="Số dư hiện tại"
              value={acc?.current_balance != null ? VND.format(Number(acc.current_balance)) : "—"}
              tooltip={acc?.balance_synced_at ? `Cập nhật ${fmtRelative(acc.balance_synced_at)}` : undefined}
            />
          </div>
        </div>

        {acc?.last_sync_error && acc.last_sync_status === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex gap-2.5">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div className="text-xs">
              <div className="font-medium text-destructive mb-1">Lỗi đồng bộ gần nhất</div>
              <div className="text-destructive/85 break-words">{acc.last_sync_error}</div>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Power className="h-3.5 w-3.5" /> Tự động đồng bộ
              </div>
              <div className="text-[11px] text-muted-foreground">
                Chạy mỗi 5 phút qua Worker an toàn
              </div>
            </div>
            <Switch checked={!!acc?.sync_enabled} onCheckedChange={onToggle} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onSyncNow}
            disabled={running || !acc?.sync_enabled}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", running && "animate-spin")} />
            {running ? "Đang đồng bộ…" : "Đồng bộ ngay"}
          </Button>
        </div>

        {isFetching && !running && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Đang cập nhật…
          </p>
        )}
      </TabsContent>

      {/* History */}
      <TabsContent value="history" className="px-6 py-5 mt-0">
        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-xs text-muted-foreground">
            Chưa có lần đồng bộ nào
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {logs.map((l, i) => (
              <div key={i} className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{fmtRelative(l.started_at)}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtFull(l.started_at)}</div>
                  {l.error_text && (
                    <div className="text-[11px] text-destructive mt-1 line-clamp-2">{l.error_text}</div>
                  )}
                </div>
                <div className="text-right space-y-1 shrink-0">
                  <MbStatusBadge status={l.status} />
                  {l.txn_new != null && (
                    <div className="text-[10px] text-muted-foreground">
                      +{l.txn_new}/{l.txn_fetched ?? 0} GD
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Security */}
      <TabsContent value="security" className="px-6 py-5 space-y-4 mt-0">
        <div className="rounded-xl border bg-card p-4 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Tài khoản đã kết nối
          </div>
          <div className="font-mono text-sm">{maskUser(acc?.mb_username)}</div>
          <div className="text-[11px] text-muted-foreground pt-1">
            Mật khẩu được mã hoá AES-256-GCM. Không hiển thị lại.
          </div>
        </div>

        <UpdatePasswordCard
          username={acc?.mb_username || ""}
          onSubmit={onUpdatePassword}
        />

        <DisconnectCard onConfirm={onDisconnect} />
      </TabsContent>
    </Tabs>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon: any;
  label: string;
  value: string;
  tooltip?: string;
}) {
  const content = (
    <div className="space-y-0.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
  if (!tooltip) return content;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{content}</div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function UpdatePasswordCard({
  username,
  onSubmit,
}: {
  username: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  const m = useMutation({
    mutationFn: () => onSubmit(username, pw),
    onSuccess: () => {
      setPw("");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Cập nhật mật khẩu</div>
          <div className="text-[11px] text-muted-foreground">
            Dùng khi bạn đổi mật khẩu trên app MB Bank
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Đóng" : "Sửa"}
        </Button>
      </div>
      {open && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.length > 0 && !m.isPending) m.mutate();
          }}
        >
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Mật khẩu mới"
              autoComplete="new-password"
              className="h-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={!pw || m.isPending}>
            {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Lưu mật khẩu mới"}
          </Button>
        </form>
      )}
    </div>
  );
}

function DisconnectCard({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-destructive flex items-center gap-1.5">
            <Unplug className="h-3.5 w-3.5" /> Ngắt kết nối
          </div>
          <div className="text-[11px] text-destructive/80 mt-0.5">
            Xoá thông tin đăng nhập & tắt đồng bộ. Có thể kết nối lại sau.
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" disabled={busy}>
              Ngắt
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ngắt kết nối MB Bank?</AlertDialogTitle>
              <AlertDialogDescription>
                Thông tin đăng nhập sẽ bị xoá vĩnh viễn và đồng bộ tự động sẽ dừng.
                Giao dịch đã đồng bộ trước đây vẫn được giữ lại.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Huỷ</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Ngắt kết nối
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

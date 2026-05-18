import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getTctCredentials,
  saveTctCredentials,
  deleteTctCredentials,
  getTctCaptcha,
  syncTctInvoices,
} from "@/lib/einvoices-sync.functions";

export function SyncTctDialog({
  open,
  onOpenChange,
  defaultDirection = "in",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDirection?: "in" | "out";
}) {
  const qc = useQueryClient();
  const getCreds = useServerFn(getTctCredentials);
  const saveCreds = useServerFn(saveTctCredentials);
  const delCreds = useServerFn(deleteTctCredentials);
  const getCaptcha = useServerFn(getTctCaptcha);
  const syncFn = useServerFn(syncTctInvoices);

  const credsQ = useQuery({
    queryKey: ["tct-creds"],
    queryFn: () => getCreds({ data: undefined as any }),
    enabled: open,
  });
  const hasCreds = !!credsQ.data?.credentials;

  const [tab, setTab] = React.useState<"sync" | "account">("sync");
  React.useEffect(() => {
    if (open) setTab(hasCreds ? "sync" : "account");
  }, [open, hasCreds]);

  // Account form
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  const saveMut = useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      saveCreds({ data: vars }),
    onSuccess: () => {
      toast.success("Đã lưu tài khoản TCT");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["tct-creds"] });
      setTab("sync");
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi lưu tài khoản"),
  });

  const delMut = useMutation({
    mutationFn: () => delCreds({ data: undefined as any }),
    onSuccess: () => {
      toast.success("Đã xoá tài khoản TCT");
      qc.invalidateQueries({ queryKey: ["tct-creds"] });
    },
  });

  // Sync form
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const [direction, setDirection] = React.useState<"in" | "out">(
    defaultDirection,
  );
  const [dateFrom, setDateFrom] = React.useState(monthAgo);
  const [dateTo, setDateTo] = React.useState(today);
  const [mode, setMode] = React.useState<"manual" | "auto">("manual");

  // Manual captcha
  const [cap, setCap] = React.useState<{ key: string; svg: string } | null>(
    null,
  );
  const [capValue, setCapValue] = React.useState("");
  const [capLoading, setCapLoading] = React.useState(false);

  const loadCaptcha = React.useCallback(async () => {
    setCapLoading(true);
    setCapValue("");
    try {
      const r = await getCaptcha({ data: undefined as any });
      setCap(r);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được captcha");
    } finally {
      setCapLoading(false);
    }
  }, [getCaptcha]);

  React.useEffect(() => {
    if (open && tab === "sync" && mode === "manual" && hasCreds && !cap) {
      loadCaptcha();
    }
  }, [open, tab, mode, hasCreds, cap, loadCaptcha]);

  const syncMut = useMutation({
    mutationFn: () =>
      syncFn({
        data: {
          direction,
          dateFrom,
          dateTo,
          captchaMode: mode,
          captchaKey: mode === "manual" ? cap?.key ?? null : null,
          captchaValue: mode === "manual" ? capValue : null,
          captchaSvg: mode === "manual" ? cap?.svg ?? null : null,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `Đồng bộ xong: ${r.created} mới, ${r.duplicate} trùng / tổng ${r.fetched}`,
      );
      qc.invalidateQueries({ queryKey: ["einvoices"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Đồng bộ thất bại");
      // refresh captcha so user can retry
      if (mode === "manual") loadCaptcha();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Đồng bộ HĐĐT từ Cổng Tổng cục Thuế</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="sync" disabled={!hasCreds}>
              Đồng bộ
            </TabsTrigger>
            <TabsTrigger value="account">Tài khoản TCT</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Tài khoản đăng nhập tại <code>hoadondientu.gdt.gov.vn</code>.
              Mật khẩu được mã hoá AES-GCM trước khi lưu.
            </p>
            <div>
              <Label>Tên đăng nhập (MST)</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={credsQ.data?.credentials?.tct_username || "0123456789"}
              />
            </div>
            <div>
              <Label>Mật khẩu</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasCreds ? "(để trống nếu giữ nguyên)" : ""}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  saveMut.mutate({
                    username:
                      username || credsQ.data?.credentials?.tct_username || "",
                    password,
                  })
                }
                disabled={
                  saveMut.isPending ||
                  !password ||
                  (!username && !credsQ.data?.credentials?.tct_username)
                }
              >
                {saveMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Lưu
              </Button>
              {hasCreds && (
                <Button
                  variant="outline"
                  onClick={() => delMut.mutate()}
                  disabled={delMut.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Xoá tài khoản
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sync" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Loại HĐ</Label>
                <RadioGroup
                  value={direction}
                  onValueChange={(v) => setDirection(v as any)}
                  className="flex gap-4 pt-2"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="in" /> Đầu vào
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="out" /> Đầu ra
                  </label>
                </RadioGroup>
              </div>
              <div>
                <Label>Captcha</Label>
                <RadioGroup
                  value={mode}
                  onValueChange={(v) => setMode(v as any)}
                  className="flex gap-4 pt-2"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="manual" /> Nhập tay
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="auto" /> 2Captcha
                  </label>
                </RadioGroup>
              </div>
              <div>
                <Label>Từ ngày</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>Đến ngày</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {mode === "manual" && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label>Captcha</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={loadCaptcha}
                    disabled={capLoading}
                  >
                    <RefreshCw
                      className={`mr-1 h-3 w-3 ${capLoading ? "animate-spin" : ""}`}
                    />
                    Tải lại
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-40 rounded bg-white border border-border flex items-center justify-center overflow-hidden"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: cap?.svg ?? "" }}
                  />
                  <Input
                    value={capValue}
                    onChange={(e) => setCapValue(e.target.value)}
                    placeholder="Nhập mã captcha"
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {mode === "auto" && (
              <p className="text-xs text-muted-foreground">
                Hệ thống sẽ tự gửi captcha tới 2Captcha (mất 10-30s). Cần
                <code className="mx-1">TWOCAPTCHA_API_KEY</code>còn dư credit.
              </p>
            )}

            <Button
              className="w-full"
              onClick={() => syncMut.mutate()}
              disabled={
                syncMut.isPending ||
                !hasCreds ||
                (mode === "manual" && (!cap?.key || !capValue))
              }
            >
              {syncMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Đồng bộ
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

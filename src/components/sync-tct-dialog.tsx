import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { TctCaptcha } from "@/components/tct-captcha";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getTctCredentials,
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
  const getCaptcha = useServerFn(getTctCaptcha);
  const syncFn = useServerFn(syncTctInvoices);

  const credsQ = useQuery({
    queryKey: ["tct-creds"],
    queryFn: () => getCreds({ data: undefined as any }),
    enabled: open,
  });
  const hasCreds = !!credsQ.data?.credentials;

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
      if (!r.ok) {
        toast.error(r.error || "Không tải được captcha");
        setCap(null);
      } else {
        setCap({ key: r.key, svg: r.svg });
      }
    } catch (e: any) {
      toast.error(e?.message || "Không tải được captcha");
    } finally {
      setCapLoading(false);
    }
  }, [getCaptcha]);

  React.useEffect(() => {
    if (open && mode === "manual" && hasCreds && !cap) {
      loadCaptcha();
    }
  }, [open, mode, hasCreds, cap, loadCaptcha]);

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
      if (mode === "manual") loadCaptcha();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Đồng bộ HĐĐT từ Cổng Tổng cục Thuế</DialogTitle>
          <DialogDescription>
            Tải HĐĐT đầu vào / đầu ra trực tiếp từ cổng TCT bằng tài khoản đã
            khai báo.
          </DialogDescription>
        </DialogHeader>

        {!credsQ.isLoading && !hasCreds ? (
          <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-700">
              <KeyRound className="h-4 w-4" />
              Chưa khai báo tài khoản TCT
            </div>
            <p className="text-muted-foreground">
              Bạn cần khai báo tên đăng nhập + mật khẩu cổng{" "}
              <code>hoadondientu.gdt.gov.vn</code> trước khi đồng bộ.
            </p>
            <Button asChild>
              <Link
                to="/einvoices/credentials"
                onClick={() => onOpenChange(false)}
              >
                Đi tới khai báo
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
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
                <Label>Captcha</Label>
                <div className="flex items-center gap-3">
                  <TctCaptcha
                    svg={cap?.svg}
                    loading={capLoading}
                    onReload={loadCaptcha}
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
                Hệ thống sẽ tự gửi captcha tới 2Captcha (mất 10–30s). Cần
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

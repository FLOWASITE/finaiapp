import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  KeyRound,
  Save,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  RefreshCw,
  Loader2,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import {
  getTctCredentials,
  saveTctCredentials,
  deleteTctCredentials,
  getTctCaptcha,
  verifyTctLogin,
} from "@/lib/einvoices-sync.functions";

export const Route = createFileRoute("/_app/einvoices/credentials")({
  component: CredentialsPage,
});

function CredentialsPage() {
  const qc = useQueryClient();
  const getCreds = useServerFn(getTctCredentials);
  const saveCreds = useServerFn(saveTctCredentials);
  const delCreds = useServerFn(deleteTctCredentials);
  const getCaptcha = useServerFn(getTctCaptcha);
  const verifyFn = useServerFn(verifyTctLogin);

  const credsQ = useQuery({
    queryKey: ["tct-creds"],
    queryFn: () => getCreds({ data: undefined as any }),
  });
  const creds = credsQ.data?.credentials ?? null;
  const hasCreds = !!creds;

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);

  const saveMut = useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      saveCreds({ data: vars }),
    onSuccess: () => {
      toast.success("Đã lưu tài khoản TCT");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["tct-creds"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi lưu tài khoản"),
  });

  const delMut = useMutation({
    mutationFn: () => delCreds({ data: undefined as any }),
    onSuccess: () => {
      toast.success("Đã xoá tài khoản TCT");
      qc.invalidateQueries({ queryKey: ["tct-creds"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi xoá"),
  });

  // Test connection flow
  const [testOpen, setTestOpen] = React.useState(false);
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
    if (testOpen && !cap) loadCaptcha();
    if (!testOpen) {
      setCap(null);
      setCapValue("");
    }
  }, [testOpen, cap, loadCaptcha]);

  const verifyMut = useMutation({
    mutationFn: () =>
      verifyFn({
        data: { captchaKey: cap?.key ?? "", captchaValue: capValue },
      }),
    onSuccess: () => {
      toast.success("Kết nối TCT thành công");
      qc.invalidateQueries({ queryKey: ["tct-creds"] });
      setTestOpen(false);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Kết nối thất bại");
      loadCaptcha();
    },
  });

  const fmtDate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleString("vi-VN") : "—";

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to="/einvoices"
              search={{ tab: "out" }}
              className="inline-flex items-center hover:underline"
            >
              <ArrowLeft className="mr-1 h-3 w-3" /> Hoá đơn điện tử
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Thông tin đăng nhập HĐĐT
          </h1>
          <p className="text-sm text-muted-foreground">
            Tài khoản truy cập cổng{" "}
            <code className="text-xs">hoadondientu.gdt.gov.vn</code> dùng để
            đồng bộ HĐĐT.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-900 dark:text-blue-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Lovable Cloud (Cloudflare Workers) <b>không gọi trực tiếp được</b> tới cổng <code>:30000</code> của <code>hoadondientu.gdt.gov.vn</code>.
          Bạn cần tự host một HTTPS proxy nhỏ (xem <code>docs/tct-proxy/README.md</code>) và thêm secret{" "}
          <code>TCT_PROXY_URL</code> trỏ tới proxy đó. Khi chưa có proxy, "Kiểm tra kết nối" và đồng bộ sẽ báo <i>fetch failed</i>.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Trạng thái
          </CardTitle>
          <CardDescription>
            Mật khẩu được mã hoá AES-GCM bằng khoá riêng của máy chủ trước khi
            lưu vào cơ sở dữ liệu. Chỉ thành viên của tổ chức được phép xem các
            thông tin này.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {credsQ.isLoading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : hasCreds ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  Tên đăng nhập
                </div>
                <div className="font-medium">{creds!.tct_username}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Lần kết nối gần nhất
                </div>
                <div className="font-medium">{fmtDate(creds!.last_login_at)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cập nhật</div>
                <div className="font-medium">{fmtDate(creds!.updated_at)}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Chưa khai báo tài khoản TCT cho tổ chức đang chọn. Nhập thông
                tin bên dưới để kích hoạt đồng bộ.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            {hasCreds ? "Cập nhật mật khẩu" : "Khai báo tài khoản"}
          </CardTitle>
          <CardDescription>
            {hasCreds
              ? "Để trống mật khẩu nếu không muốn đổi. Để đổi tên đăng nhập, hãy nhập lại cả 2 trường."
              : "Tên đăng nhập thường là MST đơn vị (10 hoặc 13 ký tự)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tct-username">Tên đăng nhập (MST)</Label>
              <Input
                id="tct-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={creds?.tct_username || "0123456789"}
                autoComplete="username"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tct-password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="tct-password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasCreds ? "(giữ nguyên)" : ""}
                  autoComplete="current-password"
                  maxLength={200}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              onClick={() =>
                saveMut.mutate({
                  username: username || creds?.tct_username || "",
                  password,
                })
              }
              disabled={
                saveMut.isPending ||
                !password ||
                (!username && !creds?.tct_username)
              }
            >
              {saveMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Lưu
            </Button>

            <Button
              variant="outline"
              disabled={!hasCreds}
              onClick={() => setTestOpen(true)}
              title={
                hasCreds ? "Đăng nhập thử lên TCT" : "Cần lưu tài khoản trước"
              }
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Kiểm tra kết nối
            </Button>

            {hasCreds && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Xoá tài khoản
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xoá tài khoản TCT?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Sau khi xoá, bạn sẽ không thể đồng bộ HĐĐT cho tới khi
                      khai báo lại. Hành động này không xoá HĐĐT đã đồng bộ
                      trước đó.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Huỷ</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => delMut.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Xoá
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test-connection dialog (inline) */}
      <AlertDialog open={testOpen} onOpenChange={setTestOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kiểm tra kết nối TCT</AlertDialogTitle>
            <AlertDialogDescription>
              Nhập mã captcha bên dưới. Hệ thống sẽ đăng nhập thử bằng tài
              khoản đã lưu.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                Tài khoản: {creds?.tct_username ?? "—"}
              </Badge>
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
                className="h-12 w-40 overflow-hidden rounded border border-border bg-white"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: cap?.svg ?? "" }}
              />
              <Input
                value={capValue}
                onChange={(e) => setCapValue(e.target.value)}
                placeholder="Nhập mã captcha"
                maxLength={20}
                className="flex-1"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <Button
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending || !cap?.key || !capValue}
            >
              {verifyMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Đăng nhập thử
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

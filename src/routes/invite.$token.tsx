import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getInvitationByToken, acceptInvitation } from "@/lib/invitations.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, ShieldCheck, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({ component: InvitePage });

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchInv = useServerFn(getInvitationByToken);
  const accept = useServerFn(acceptInvitation);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => fetchInv({ data: { token } }),
  });

  const inv = data?.invitation;
  const owner = data?.owner;
  const status = data?.status ?? (isLoading ? "ok" : "not_found");
  const expired = status === "expired";
  const used = status === "used";
  const emailMismatch = inv && email && inv.email.toLowerCase() !== email.toLowerCase();

  const onAccept = async () => {
    setLoading(true);
    try {
      await accept({ data: { token } });
      toast.success("Đã tham gia thành công");
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Không thể chấp nhận lời mời");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Lời mời tham gia</h1>

        {isLoading && <p className="mt-4 text-sm text-muted-foreground">Đang kiểm tra…</p>}

        {!isLoading && !inv && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>Lời mời không tồn tại hoặc đã bị thu hồi.</span>
          </div>
        )}

        {inv && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1.5">
              <div>
                Bạn được mời tham gia{" "}
                <strong>{owner?.company_name ?? owner?.email ?? "công ty"}</strong>
              </div>
              <div>
                Vai trò: <Badge variant="outline">{inv.role}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Gửi đến: {inv.email} · Hết hạn{" "}
                {new Date(inv.expires_at).toLocaleString("vi-VN")}
              </div>
            </div>

            {used && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                Lời mời này đã được sử dụng.
              </div>
            )}
            {expired && !used && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                Lời mời đã hết hạn. Hãy yêu cầu chủ tài khoản gửi lại.
              </div>
            )}

            {!used && !expired && !email && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Vui lòng đăng nhập bằng email <strong>{inv.email}</strong> để chấp nhận.
                </p>
                <Button asChild className="w-full">
                  <Link to="/login" search={{ next: `/invite/${token}` } as any}>
                    Đăng nhập / Đăng ký
                  </Link>
                </Button>
              </div>
            )}

            {!used && !expired && email && emailMismatch && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>
                    Bạn đang đăng nhập bằng <strong>{email}</strong>, nhưng lời mời dành cho{" "}
                    <strong>{inv.email}</strong>.
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    await supabase.auth.signOut();
                  }}
                >
                  Đăng xuất
                </Button>
              </div>
            )}

            {!used && !expired && email && !emailMismatch && (
              <Button className="w-full" onClick={onAccept} disabled={loading}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {loading ? "Đang xử lý…" : "Chấp nhận lời mời"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

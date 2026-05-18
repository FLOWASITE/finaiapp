import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  BarChart3,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

const emailSchema = z.string().trim().email("Email không hợp lệ").max(255);
const passwordSchema = z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(72);

function scorePassword(pw: string): { score: number; label: string; tone: string } {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ["Rất yếu", "Yếu", "Trung bình", "Khá", "Mạnh", "Rất mạnh"];
  const tones = [
    "bg-destructive",
    "bg-destructive",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ];
  return { score: s, label: labels[s], tone: tones[s] };
}

function LoginPage() {
  const { mode, next } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<{ title: string; detail?: string } | null>(null);

  const dest = next && next.startsWith("/") ? next : "/dashboard";
  const strength = useMemo(() => scorePassword(password), [password]);

  function validate() {
    const next: typeof errors = {};
    const e = emailSchema.safeParse(email);
    if (!e.success) next.email = e.error.issues[0].message;
    const p = passwordSchema.safeParse(password);
    if (!p.success) next.password = p.error.issues[0].message;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}${dest}` },
        });
        if (error) throw error;
        toast.success("Tạo tài khoản thành công. Kiểm tra email để xác nhận.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Đăng nhập thành công");
      }
      navigate({ to: dest });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra";
      const friendly = /invalid login/i.test(msg)
        ? "Email hoặc mật khẩu không đúng."
        : /already registered|already exists/i.test(msg)
          ? "Email này đã được đăng ký. Hãy đăng nhập."
          : msg;
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  async function handleForgot() {
    const e = emailSchema.safeParse(email);
    if (!e.success) {
      setErrors((p) => ({ ...p, email: "Nhập email để khôi phục mật khẩu" }));
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Đã gửi email khôi phục mật khẩu");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không gửi được email");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="grid min-h-screen w-full lg:grid-cols-2">
        {/* Brand panel */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 p-10 text-primary-foreground">
          <div
            className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,white_0%,transparent_40%),radial-gradient(circle_at_80%_70%,white_0%,transparent_35%)]"
            aria-hidden
          />
          <div className="relative z-10 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15 backdrop-blur-sm font-bold ring-1 ring-primary-foreground/20">
              A
            </div>
            <span className="font-semibold tracking-tight text-lg">AccuVN</span>
          </div>

          <div className="relative z-10 space-y-6 max-w-md">
            <h2 className="text-3xl font-semibold leading-tight">
              Phần mềm kế toán dành cho doanh nghiệp Việt.
            </h2>
            <p className="text-primary-foreground/80 text-sm leading-relaxed">
              Quản lý hóa đơn, công nợ, thuế và báo cáo tài chính theo chuẩn
              TT133 / TT200 — tất cả trên một nền tảng hiện đại.
            </p>
            <ul className="space-y-3 text-sm">
              {[
                { icon: BarChart3, text: "Báo cáo tài chính tức thời" },
                { icon: Wallet, text: "Tự động đối chiếu sao kê ngân hàng" },
                { icon: ShieldCheck, text: "Bảo mật chuẩn doanh nghiệp" },
              ].map((f) => (
                <li key={f.text} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-foreground/15 ring-1 ring-primary-foreground/20">
                    <f.icon className="h-3.5 w-3.5" />
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 text-xs text-primary-foreground/60">
            © {new Date().getFullYear()} AccuVN. Mọi quyền được bảo lưu.
          </p>
        </aside>

        {/* Form panel */}
        <main className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                A
              </div>
              <span className="font-semibold tracking-tight">AccuVN</span>
            </Link>

            {/* Mode switcher */}
            <div
              role="tablist"
              className="mb-6 inline-flex rounded-full border border-border bg-muted/50 p-1 text-sm"
            >
              <button
                role="tab"
                aria-selected={!isSignup}
                onClick={() => setIsSignup(false)}
                className={cn(
                  "px-4 py-1.5 rounded-full transition-all",
                  !isSignup
                    ? "bg-background shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Đăng nhập
              </button>
              <button
                role="tab"
                aria-selected={isSignup}
                onClick={() => setIsSignup(true)}
                className={cn(
                  "px-4 py-1.5 rounded-full transition-all",
                  isSignup
                    ? "bg-background shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Tạo tài khoản
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {isSignup ? "Tạo tài khoản mới" : "Chào mừng trở lại"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignup ? (
                <>
                  Đã có tài khoản?{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setIsSignup(false)}
                  >
                    Đăng nhập
                  </button>
                </>
              ) : (
                <>
                  Chưa có tài khoản?{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setIsSignup(true)}
                  >
                    Tạo mới miễn phí
                  </button>
                </>
              )}
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ban@congty.com"
                    className={cn(
                      "pl-9 h-11",
                      errors.email && "border-destructive focus-visible:ring-destructive/40",
                    )}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                    }}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mật khẩu</Label>
                  {!isSignup && (
                    <button
                      type="button"
                      onClick={handleForgot}
                      disabled={resetting}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      {resetting ? "Đang gửi..." : "Quên mật khẩu?"}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    placeholder={isSignup ? "Tối thiểu 6 ký tự" : "••••••••"}
                    className={cn(
                      "pl-9 pr-10 h-11",
                      errors.password && "border-destructive focus-visible:ring-destructive/40",
                    )}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
                {isSignup && password.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors",
                            i < strength.score ? strength.tone : "bg-muted",
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Độ mạnh: <span className="font-medium text-foreground">{strength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : isSignup ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Tạo tài khoản
                  </>
                ) : (
                  "Đăng nhập"
                )}
              </Button>

              {isSignup && (
                <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  <span>
                    Bằng việc tạo tài khoản, bạn đồng ý với{" "}
                    <Link to="/" className="underline hover:text-foreground">
                      Điều khoản
                    </Link>{" "}
                    và{" "}
                    <Link to="/" className="underline hover:text-foreground">
                      Chính sách bảo mật
                    </Link>{" "}
                    của AccuVN.
                  </span>
                </p>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

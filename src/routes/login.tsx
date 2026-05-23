import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { FinAILogo } from "@/components/FinAILogo";
import { useEffect, useMemo, useState } from "react";

import { z } from "zod";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { clearSupabaseAuthStorage, withTimeoutReject } from "@/lib/auth-recovery";
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  Sparkles,
  CheckCircle2,
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
const AUTH_REQUEST_TIMEOUT_MS = 30_000;

type AuthSessionResponse = Awaited<ReturnType<typeof supabase.auth.getSession>>;

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

  // Nếu user đã đăng nhập sẵn, tự chuyển sang dashboard.
  // Race với timeout 1500ms để không bao giờ block UI khi Supabase auth
  // bị treo do refresh token hỏng trong localStorage.
  useEffect(() => {
    let active = true;
    withTimeoutReject(supabase.auth.getSession(), 3_000)
      .then((res: AuthSessionResponse) => {
        if (!active) return;
        if (res?.data?.session) navigate({ to: dest, replace: true });
      })
      .catch((err) => {
        const raw = err instanceof Error ? err.message : String(err ?? "");
        if (/refresh token|invalid refresh|jwt expired/i.test(raw)) {
          clearSupabaseAuthStorage();
        }
      });
    return () => {
      active = false;
    };
  }, [dest, navigate]);

  function validate() {
    const next: typeof errors = {};
    const e = emailSchema.safeParse(email);
    if (!e.success) next.email = e.error.issues[0].message;
    const p = passwordSchema.safeParse(password);
    if (!p.success) next.password = p.error.issues[0].message;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function mapAuthError(err: unknown): { title: string; detail?: string } {
    const raw = err instanceof Error ? err.message : String(err ?? "");
    const status = (err as { status?: number } | null)?.status;
    const code = (err as { code?: string } | null)?.code;
    const m = raw.toLowerCase();

    if (status === 0 || /failed to fetch|network|networkerror|timeout/i.test(raw)) {
      return {
        title: "Kết nối đăng nhập bị gián đoạn",
        detail: "Kiểm tra mạng rồi thử lại. Nếu đang dùng preview, hãy thử trên link đã publish.",
      };
    }

    if (
      code === "invalid_credentials" ||
      m.includes("invalid login") ||
      m.includes("invalid credentials")
    ) {
      return {
        title: "Email hoặc mật khẩu không đúng",
        detail: "Vui lòng kiểm tra lại thông tin đăng nhập.",
      };
    }
    if (m.includes("email not confirmed")) {
      return {
        title: "Email chưa được xác nhận",
        detail: "Mở email và nhấn liên kết xác nhận trước khi đăng nhập.",
      };
    }
    if (
      m.includes("already registered") ||
      m.includes("already exists") ||
      code === "user_already_exists"
    ) {
      return { title: "Email đã được đăng ký", detail: "Hãy chuyển sang chế độ Đăng nhập." };
    }
    if (m.includes("weak password") || m.includes("password should")) {
      return { title: "Mật khẩu quá yếu", detail: raw };
    }
    if (status === 429 || m.includes("rate limit") || m.includes("too many")) {
      return { title: "Quá nhiều yêu cầu", detail: "Vui lòng đợi một lát rồi thử lại." };
    }
    if (status === 422 || m.includes("invalid email")) {
      return { title: "Thông tin không hợp lệ", detail: raw };
    }
    if (m.includes("user not found")) {
      return { title: "Không tìm thấy tài khoản", detail: "Email này chưa được đăng ký." };
    }
    if (m.includes("signup") && m.includes("disabled")) {
      return { title: "Đăng ký đang bị tắt", detail: "Liên hệ quản trị viên để được hỗ trợ." };
    }
    return { title: "Đăng nhập thất bại", detail: raw || "Có lỗi không xác định xảy ra." };
  }

  function isRecoverableNetworkAuthError(err: unknown) {
    const raw = err instanceof Error ? err.message : String(err ?? "");
    const status = (err as { status?: number } | null)?.status;
    return status === 0 || /failed to fetch|network|networkerror|timeout/i.test(raw);
  }

  async function submitAuthOnce() {
    if (isSignup) {
      return withTimeoutReject(
        supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}${dest}` },
        }),
        AUTH_REQUEST_TIMEOUT_MS,
      );
    }

    return withTimeoutReject(
      supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      }),
      AUTH_REQUEST_TIMEOUT_MS,
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await submitAuthOnce();

      if (result.error) throw result.error;

      if (!isSignup) {
        await withTimeoutReject(supabase.auth.getSession(), 3_000).catch(() => null);
      }

      if (isSignup) {
        toast.success("Tạo tài khoản thành công. Kiểm tra email để xác nhận.");
      } else {
        toast.success("Đăng nhập thành công");
      }
      navigate({ to: dest, replace: true });
    } catch (err) {
      const mapped = mapAuthError(err);
      setFormError(mapped);
      toast.error(mapped.title, { description: mapped.detail });
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

  const submitLogin = !isSignup;

  return (
    <div
      className="min-h-screen w-full flex items-start sm:items-center justify-center p-0 sm:p-8"
      style={{ background: "var(--gradient-login-bg)" }}
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-none sm:rounded-2xl bg-[oklch(0.13_0.025_260)] text-white shadow-none sm:shadow-2xl ring-1 ring-white/10 grid lg:grid-cols-2 min-h-screen sm:min-h-0">
        {/* Left brand panel */}
        <aside
          className="relative hidden lg:flex flex-col justify-between p-10 text-white overflow-hidden"
          style={{ background: "var(--gradient-login-panel)" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 15%, oklch(1 0 0 / 0.15) 0%, transparent 45%), radial-gradient(circle at 85% 85%, oklch(0.72 0.16 162 / 0.35) 0%, transparent 50%)",
            }}
          />
          <svg
            aria-hidden
            className="absolute inset-x-0 bottom-0 w-full opacity-30"
            viewBox="0 0 600 200"
            preserveAspectRatio="none"
          >
            <path
              d="M0,160 L120,90 L220,140 L320,60 L420,120 L520,80 L600,130 L600,200 L0,200 Z"
              fill="oklch(0.72 0.16 162 / 0.55)"
            />
            <path
              d="M0,180 L100,130 L200,170 L300,110 L400,160 L500,120 L600,170 L600,200 L0,200 Z"
              fill="oklch(0.45 0.10 260 / 0.6)"
            />
          </svg>

          <div className="relative z-10">
            <FinAILogo height={52} />
          </div>

          <div className="relative z-10 mt-auto space-y-4 max-w-lg">
            <h2 className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight text-white">
              Sổ kế toán.
              <br />
              Phần mềm.
              <br />
              Agent.
            </h2>
            <p className="text-base leading-relaxed text-white/70 max-w-sm">
              Kiến tạo cho những người giữ cán cân tài chính.
            </p>
          </div>
        </aside>

        {/* Right form panel */}
        <main
          className="relative px-5 py-8 sm:px-10 sm:py-12 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-white/10 shadow-[inset_1px_0_0_oklch(1_0_0/0.06),inset_0_1px_0_oklch(1_0_0/0.05),-24px_0_60px_-30px_oklch(0_0_0/0.8)]"
          style={{
            background:
              "linear-gradient(180deg, oklch(0.19 0.035 260) 0%, oklch(0.16 0.03 262) 55%, oklch(0.14 0.025 265) 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(circle at 80% 0%, oklch(0.72 0.16 162 / 0.18) 0%, transparent 55%), radial-gradient(circle at 0% 100%, oklch(0.55 0.18 240 / 0.15) 0%, transparent 50%)",
            }}
          />
          <div className="relative z-10 flex flex-col justify-center">

          <Link to="/" className="mb-5 sm:mb-6 flex items-center justify-center lg:hidden">
            <FinAILogo height={40} />
          </Link>

          <h1 className="lg:hidden text-lg font-bold tracking-tight mb-6 text-center text-white">
            Sổ kế toán. Phần mềm. Agent.
          </h1>

          <div className="hidden lg:block text-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Chào mừng đến FinAI
            </h2>
            <p className="text-sm text-white/85 mt-1">

              Đăng nhập hoặc tạo tài khoản bằng email
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3 sm:space-y-4" noValidate>
            {formError && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-medium">{formError.title}</p>
                  {formError.detail && (
                    <p className="text-xs text-destructive/85">{formError.detail}</p>
                  )}
                </div>
              </div>
            )}

            {/* Email field — pill with pastel icon box */}
            <div>
              <div
                className={cn(
                  "group flex items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl bg-white/[0.07] pl-2 pr-3 sm:pr-4 h-14 sm:h-16 ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-[oklch(0.72_0.16_162)]/60 transition-all",
                  errors.email && "ring-destructive/60 focus-within:ring-destructive/60",
                )}
              >
                <span className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-[oklch(0.30_0.10_162)] text-[oklch(0.88_0.18_162)] ring-1 ring-white/5">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor="email"
                    className="block text-[11px] font-medium text-white/80"
                  >
                    Địa chỉ email
                  </Label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ten@congty.com"
                    className="w-full bg-transparent border-0 p-1 text-base sm:text-sm font-medium text-white placeholder:text-white/50 focus:outline-none focus:ring-0"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                    }}
                  />
                </div>
              </div>
              {errors.email && <p className="mt-1 ml-2 text-xs text-destructive">{errors.email}</p>}
            </div>

            {/* Password field */}
            <div>
              <div
                className={cn(
                  "group flex items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl bg-white/[0.07] pl-2 pr-2 h-14 sm:h-16 ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-[oklch(0.72_0.16_162)]/60 transition-all",
                  errors.password && "ring-destructive/60 focus-within:ring-destructive/60",
                )}
              >
                <span className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-[oklch(0.30_0.10_162)] text-[oklch(0.88_0.18_162)] ring-1 ring-white/5">
                  <Lock className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor="password"
                    className="block text-[11px] font-medium text-white/80"
                  >
                    Mật khẩu
                  </Label>
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    className="w-full bg-transparent border-0 p-1 text-base sm:text-sm font-medium text-white placeholder:text-white/50 focus:outline-none focus:ring-0"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="shrink-0 rounded-md p-1.5 sm:p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 ml-2 text-xs text-destructive">{errors.password}</p>
              )}
              {isSignup && password.length > 0 && (
                <div className="space-y-1 pt-2 px-2">
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

            {/* Remember + Forgot row */}
            {!isSignup && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs sm:text-sm">
                <label className="inline-flex items-center gap-2 text-white/85 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 sm:h-3.5 sm:w-3.5 rounded border-white/20 bg-transparent text-[oklch(0.72_0.16_162)] focus:ring-[oklch(0.72_0.16_162)]/40"
                  />
                  Ghi nhớ đăng nhập
                </label>
                <button
                  type="button"
                  onClick={handleForgot}
                  disabled={resetting}
                  className="font-medium text-[oklch(0.78_0.16_162)] hover:underline disabled:opacity-60"
                >
                  {resetting ? "Đang gửi..." : "Quên mật khẩu?"}
                </button>
              </div>
            )}

            {/* Login button — solid emerald accent */}
            <button
              type={submitLogin ? "submit" : "button"}
              onClick={submitLogin ? undefined : () => setIsSignup(false)}
              disabled={loading && submitLogin}
              className={cn(
                "w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white text-[oklch(0.18_0.04_260)] font-semibold text-sm sm:text-base ring-1 ring-white/20 shadow-[0_10px_30px_-10px_oklch(0_0_0/0.6)] transition-all hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-[0_14px_36px_-10px_oklch(0_0_0/0.7)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2",
              )}
            >
              {loading && submitLogin ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                "Đăng nhập"
              )}
            </button>

            <p className="text-center text-xs text-white/70 pt-1">
              {isSignup ? "Đã có tài khoản?" : "Chưa có tài khoản?"}
            </p>

            {/* Signup button — gradient cyan→blue */}
            <button
              type={!submitLogin ? "submit" : "button"}
              onClick={!submitLogin ? undefined : () => setIsSignup(true)}
              disabled={loading && !submitLogin}
              className={cn(
                "w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl text-white font-semibold text-sm sm:text-base shadow-[0_10px_30px_-10px_oklch(0.55_0.18_240/0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-10px_oklch(0.55_0.18_240/0.7)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2",
              )}
              style={{
                background: !submitLogin
                  ? "var(--gradient-signup-btn-hover)"
                  : "var(--gradient-signup-btn)",
              }}
            >
              {loading && !submitLogin ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : isSignup ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Tạo tài khoản
                </>
              ) : (
                "Đăng ký"
              )}
            </button>

            {isSignup && (
              <p className="flex items-start gap-2 text-[11px] text-muted-foreground pt-1">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                <span>
                  Bằng việc tạo tài khoản, bạn đồng ý với{" "}
                  <Link to="/welcome" className="underline hover:text-foreground">
                    Điều khoản
                  </Link>{" "}
                  và{" "}
                  <Link to="/welcome" className="underline hover:text-foreground">
                    Chính sách bảo mật
                  </Link>{" "}
                  của FinAI.
                </span>
              </p>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}

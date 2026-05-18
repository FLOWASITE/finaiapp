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
  BrainCircuit,
  Bot,
  Wand2,
  ArrowRight,
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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#070713] text-white">
      {/* Ambient AI background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* mesh gradient blobs */}
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.45),transparent_60%)] blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.35),transparent_60%)] blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.30),transparent_60%)] blur-3xl" />
        {/* grid overlay */}
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />
        {/* noise */}
        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')]" />
      </div>

      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
        {/* Brand / AI panel */}
        <aside className="relative hidden lg:flex flex-col justify-between p-12">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_24px_-4px_rgba(139,92,246,0.7)]">
              <Sparkles className="h-5 w-5" />
              <span className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">AccuVN</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                AI Accounting
              </div>
            </div>
          </div>

          <div className="space-y-8 max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              AI Copilot đang hoạt động
            </div>

            <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight">
              Kế toán thông minh,{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                vận hành bởi AI
              </span>
              .
            </h2>
            <p className="text-white/60 leading-relaxed">
              Tự động hạch toán, đối chiếu sao kê, dự báo dòng tiền và tạo báo
              cáo TT133/TT200 chỉ trong vài giây — như có một kế toán trưởng
              bên cạnh 24/7.
            </p>

            <ul className="space-y-3">
              {[
                { icon: BrainCircuit, text: "Hạch toán tự động từ hóa đơn & sao kê" },
                { icon: Bot, text: "Trợ lý AI hỏi đáp số liệu bằng ngôn ngữ tự nhiên" },
                { icon: Wand2, text: "Soạn báo cáo & tờ khai thuế trong một cú nhấp" },
                { icon: ShieldCheck, text: "Mã hoá end-to-end, tuân thủ chuẩn doanh nghiệp" },
              ].map((f) => (
                <li
                  key={f.text}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 backdrop-blur transition-colors hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 ring-1 ring-white/10">
                    <f.icon className="h-4 w-4 text-indigo-200" />
                  </span>
                  <span className="text-sm text-white/80">{f.text}</span>
                </li>
              ))}
            </ul>

            {/* Mini AI chat preview */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2 text-xs text-white/50">
                <Bot className="h-3.5 w-3.5" />
                AccuVN Copilot
              </div>
              <div className="space-y-2 text-sm">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-3 py-2 text-white/90">
                  Doanh thu Q2 so với Q1?
                </div>
                <div className="w-fit max-w-[90%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/20 px-3 py-2 text-white/90 ring-1 ring-white/10">
                  Q2 đạt <b>4.82 tỷ</b>, tăng <b>+18.3%</b> so với Q1. Top khách hàng:
                  Vinatex, FPT, Hoà Phát.
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} AccuVN · Made with AI in Vietnam
          </p>
        </aside>

        {/* Form panel */}
        <main className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-semibold tracking-tight">AccuVN</span>
            </Link>

            <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] p-7 backdrop-blur-2xl shadow-[0_20px_80px_-20px_rgba(99,102,241,0.35)]">
              {/* glow border */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3xl [background:linear-gradient(140deg,rgba(255,255,255,0.08),transparent_30%,transparent_70%,rgba(255,255,255,0.06))] [mask:linear-gradient(black,black)]"
              />

              {/* Mode switcher */}
              <div
                role="tablist"
                className="relative mb-6 grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm"
              >
                <span
                  className={cn(
                    "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 shadow-[0_4px_20px_-2px_rgba(139,92,246,0.6)] transition-transform duration-300 ease-out",
                    isSignup ? "translate-x-[calc(100%+4px)]" : "translate-x-1",
                  )}
                />
                <button
                  role="tab"
                  aria-selected={!isSignup}
                  onClick={() => setIsSignup(false)}
                  className={cn(
                    "relative z-10 rounded-full py-1.5 transition-colors",
                    !isSignup ? "text-white font-medium" : "text-white/60 hover:text-white/80",
                  )}
                >
                  Đăng nhập
                </button>
                <button
                  role="tab"
                  aria-selected={isSignup}
                  onClick={() => setIsSignup(true)}
                  className={cn(
                    "relative z-10 rounded-full py-1.5 transition-colors",
                    isSignup ? "text-white font-medium" : "text-white/60 hover:text-white/80",
                  )}
                >
                  Tạo tài khoản
                </button>
              </div>

              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">
                {isSignup ? "Bắt đầu cùng AI" : "Chào mừng trở lại"}
              </h1>
              <p className="mt-1.5 text-sm text-white/55">
                {isSignup
                  ? "Tạo tài khoản miễn phí và để Copilot lo phần còn lại."
                  : "Đăng nhập để tiếp tục với trợ lý kế toán AI của bạn."}
              </p>

              <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-white/80">
                    Email
                  </Label>
                  <div className="group relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-indigo-300" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="ban@congty.com"
                      className={cn(
                        "h-11 border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:border-indigo-400/40",
                        errors.email && "border-destructive/60 focus-visible:ring-destructive/40",
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
                    <Label htmlFor="password" className="text-white/80">
                      Mật khẩu
                    </Label>
                    {!isSignup && (
                      <button
                        type="button"
                        onClick={handleForgot}
                        disabled={resetting}
                        className="text-xs font-medium text-indigo-300 hover:text-indigo-200 hover:underline disabled:opacity-60"
                      >
                        {resetting ? "Đang gửi..." : "Quên mật khẩu?"}
                      </button>
                    )}
                  </div>
                  <div className="group relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-indigo-300" />
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      placeholder={isSignup ? "Tối thiểu 6 ký tự" : "••••••••"}
                      className={cn(
                        "h-11 border-white/10 bg-white/[0.04] pl-9 pr-10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:border-indigo-400/40",
                        errors.password && "border-destructive/60 focus-visible:ring-destructive/40",
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
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
                              i < strength.score ? strength.tone : "bg-white/10",
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-white/50">
                        Độ mạnh:{" "}
                        <span className="font-medium text-white/85">{strength.label}</span>
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="group relative h-11 w-full overflow-hidden border-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-medium text-white shadow-[0_10px_40px_-10px_rgba(139,92,246,0.7)] hover:opacity-95"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : isSignup ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Tạo tài khoản
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  ) : (
                    <>
                      Đăng nhập với AI
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>

                {isSignup && (
                  <p className="flex items-start gap-2 text-[11px] text-white/50">
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
                    <span>
                      Bằng việc tạo tài khoản, bạn đồng ý với{" "}
                      <Link to="/" className="underline hover:text-white">
                        Điều khoản
                      </Link>{" "}
                      và{" "}
                      <Link to="/" className="underline hover:text-white">
                        Chính sách bảo mật
                      </Link>
                      .
                    </span>
                  </p>
                )}
              </form>

              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-white/40">
                <ShieldCheck className="h-3.5 w-3.5" />
                Bảo vệ bởi mã hoá end-to-end · SOC2 ready
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

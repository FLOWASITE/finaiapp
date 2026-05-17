import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, FileScan, Sparkles, ShieldCheck, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              A
            </div>
            <span className="font-semibold tracking-tight">AccuVN</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link to="/login">Đăng nhập</Link>
            </Button>
            <Button asChild>
              <Link to="/login" search={{ mode: "signup" }}>
                Dùng thử miễn phí
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <Sparkles className="h-3 w-3 text-accent" />
            Kế toán AI cho doanh nghiệp Việt Nam
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
            Bóc tách hóa đơn và{" "}
            <span className="text-accent">định khoản tự động</span> theo Thông tư 133
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            AccuVN giúp kế toán SME tiết kiệm 80% thời gian nhập liệu. Upload hóa đơn — AI bóc
            tách, gợi ý 3 phương án định khoản chuẩn VAS, bạn chỉ cần duyệt.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/login" search={{ mode: "signup" }}>
                Bắt đầu miễn phí <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<FileScan className="h-5 w-5" />}
              title="OCR hóa đơn VN"
              desc="Bóc MST, số HĐ, mặt hàng, thuế GTGT từ ảnh hoặc PDF — nhận diện chuẩn định dạng Việt Nam."
            />
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" />}
              title="AI định khoản TT133"
              desc="Gợi ý 3 phương án Nợ/Có kèm lý do và độ tin cậy. Học từ chính bút toán lịch sử của bạn."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="An toàn — bạn duyệt cuối"
              desc="AI không bao giờ tự động ghi sổ. Mọi bút toán đều cần kế toán xác nhận trước khi vào sổ nhật ký."
            />
          </div>
        </section>

        <section className="border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid items-center gap-12 md:grid-cols-2">
              <div>
                <BarChart3 className="h-6 w-6 text-accent" />
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  Sổ nhật ký chung — sẵn sàng xuất báo cáo
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Mọi bút toán đã duyệt tự động vào sổ nhật ký, kèm liên kết hóa đơn gốc.
                  Export CSV để đối chiếu HTKK/eTax.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">17/05/2026 — VPP Thiên Long</span>
                    <span className="font-semibold">2.420.000</span>
                  </div>
                  <div className="pl-4 text-muted-foreground">
                    Nợ <span className="text-foreground">6422</span> · 2.200.000
                  </div>
                  <div className="pl-4 text-muted-foreground">
                    Nợ <span className="text-foreground">1331</span> · 220.000
                  </div>
                  <div className="pl-4 text-muted-foreground">
                    Có <span className="text-foreground">331</span> · 2.420.000
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
          © 2026 AccuVN — MVP demo
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, CheckCircle2, Clock, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const [pending, approved, total] = await Promise.all([
        supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["pending", "extracted", "reviewed"]),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("invoices").select("total").eq("status", "approved"),
      ]);
      const sum = (total.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0);
      return { pending: pending.count ?? 0, approved: approved.count ?? 0, totalAmount: sum };
    },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">Tình hình hóa đơn và bút toán tháng này</p>
        </div>
        <Button asChild>
          <Link to="/invoices">
            <Upload className="mr-2 h-4 w-4" /> Upload hóa đơn
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard icon={<Clock className="h-5 w-5" />} label="Chờ duyệt" value={stats?.pending ?? "—"} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Đã duyệt" value={stats?.approved ?? "—"} />
        <StatCard
          icon={<FileText className="h-5 w-5" />}
          label="Tổng tiền đã ghi sổ"
          value={
            stats ? new Intl.NumberFormat("vi-VN").format(stats.totalAmount) + " ₫" : "—"
          }
        />
      </div>

      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <h2 className="font-semibold">Bắt đầu nhanh</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>1. Vào <Link to="/invoices" className="text-accent underline">Hóa đơn</Link> và upload ảnh/PDF</li>
          <li>2. AI tự bóc tách → bạn review các trường</li>
          <li>3. Nhận 3 gợi ý định khoản, chọn và duyệt</li>
          <li>4. Bút toán vào <Link to="/journal" className="text-accent underline">Sổ nhật ký</Link></li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

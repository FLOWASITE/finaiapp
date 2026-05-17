import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSystemStats } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Users, FileText, BookOpen, ShoppingCart, FileSearch } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const fn = useServerFn(getSystemStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Đang tải…</div>;

  const cards = [
    { label: "Thành viên", value: data.counts.members, icon: Users },
    { label: "Hóa đơn mua", value: data.counts.invoices, icon: FileText },
    { label: "Hóa đơn bán", value: data.counts.sales, icon: ShoppingCart },
    { label: "Bút toán", value: data.counts.journal_entries, icon: BookOpen },
    { label: "Bản ghi nhật ký", value: data.counts.audit_logs, icon: FileSearch },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Hoạt động 30 ngày qua</h2>
          <span className="text-xs text-muted-foreground">Theo số lần thao tác/ngày</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.activitySeries}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

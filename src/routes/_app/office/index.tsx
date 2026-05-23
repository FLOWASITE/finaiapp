import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOfficeDashboard } from "@/lib/office/office-dashboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ListChecks, AlertTriangle, Clock, FileText, UserCog } from "lucide-react";

export const Route = createFileRoute("/_app/office/")({ component: OfficeDashboard });

function OfficeDashboard() {
  const fn = useServerFn(getOfficeDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["office", "dashboard"], queryFn: () => fn() });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (!data) return null;

  const kpis = [
    { label: "Khách đang phục vụ", value: data.activeClients, icon: Users },
    { label: "Nhân viên active", value: data.activeStaff, icon: UserCog },
    { label: "Công việc đang mở", value: data.openTasks, icon: ListChecks },
    { label: "Quá hạn", value: data.overdueTasks, icon: AlertTriangle, danger: true },
    { label: "Sắp đến hạn (14 ngày)", value: data.dueSoonTasks, icon: Clock },
    { label: "HĐ sắp hết hạn (30 ngày)", value: data.expiringContracts.length, icon: FileText },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className={k.danger && k.value > 0 ? "border-destructive/50" : ""}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data.expiringContracts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hợp đồng sắp hết hạn</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.expiringContracts.map((c: { id: string; contract_no: string; end_date: string }) => (
                <li key={c.id} className="flex justify-between border-b pb-2 last:border-0">
                  <span className="font-medium">{c.contract_no}</span>
                  <span className="text-muted-foreground">Hết hạn: {c.end_date}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

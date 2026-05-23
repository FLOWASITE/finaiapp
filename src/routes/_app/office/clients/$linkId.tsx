import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientLinks } from "@/lib/office/client-links.functions";
import { listContracts } from "@/lib/office/contracts.functions";
import { listTasks } from "@/lib/office/tasks.functions";
import { listAssignments } from "@/lib/office/staff.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { InviteStaffDialog } from "@/components/office/invite-staff-dialog";

export const Route = createFileRoute("/_app/office/clients/$linkId")({
  component: ClientDetail,
});

function ClientDetail() {
  const { linkId } = Route.useParams();
  const linksFn = useServerFn(listClientLinks);
  const contractsFn = useServerFn(listContracts);
  const tasksFn = useServerFn(listTasks);
  const assignFn = useServerFn(listAssignments);

  const links = useQuery({ queryKey: ["office", "links"], queryFn: () => linksFn() });
  const contracts = useQuery({ queryKey: ["office", "contracts"], queryFn: () => contractsFn() });
  const tasks = useQuery({
    queryKey: ["office", "tasks", "link", linkId],
    queryFn: () => tasksFn({ data: { link_id: linkId } }),
  });
  const assignments = useQuery({ queryKey: ["office", "assignments"], queryFn: () => assignFn() });

  const link = (links.data ?? []).find((l: { id: string }) => l.id === linkId) as
    | { id: string; display_name: string | null; status: string; fee_per_month: number;
        service_start_date: string | null;
        tenant: { name: string; tax_id: string | null; address: string | null } | null }
    | undefined;

  if (links.isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (!link) return <p className="text-sm text-muted-foreground">Không tìm thấy khách hàng</p>;

  const clientName = link.display_name || link.tenant?.name || "—";
  const linkContracts = (contracts.data ?? []).filter((c: { link: { id: string } | null }) => c.link?.id === linkId);
  const linkAssignments = (assignments.data ?? []).filter(
    (a: { link: { id: string } | null }) => a.link?.id === linkId,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/office/clients">
          <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        </Link>
        <InviteStaffDialog linkId={link.id} clientName={clientName} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {clientName}
            <Badge variant={link.status === "active" ? "default" : "secondary"}>{link.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">MST</p><p>{link.tenant?.tax_id ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phí/tháng</p><p>{Number(link.fee_per_month ?? 0).toLocaleString("vi-VN")}</p></div>
          <div><p className="text-xs text-muted-foreground">Bắt đầu</p><p>{link.service_start_date ?? "—"}</p></div>
          <div className="col-span-2 md:col-span-4">
            <p className="text-xs text-muted-foreground">Địa chỉ</p>
            <p>{link.tenant?.address ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Hợp đồng ({linkContracts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {linkContracts.length === 0 && <p className="text-sm text-muted-foreground">Chưa có hợp đồng</p>}
            {linkContracts.map((c: { id: string; contract_no: string; end_date: string | null; status: string; fee_amount: number | null }) => (
              <div key={c.id} className="flex justify-between border-b pb-2 last:border-0 text-sm">
                <div>
                  <p className="font-medium">{c.contract_no}</p>
                  <p className="text-xs text-muted-foreground">Hết hạn: {c.end_date ?? "—"}</p>
                </div>
                <div className="text-right">
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                  <p className="text-xs mt-1">{Number(c.fee_amount).toLocaleString("vi-VN")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Nhân viên phụ trách ({linkAssignments.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {linkAssignments.length === 0 && <p className="text-sm text-muted-foreground">Chưa phân công</p>}
            {linkAssignments.map((a: { id: string; role: string; staff: { full_name: string } | null }) => (
              <div key={a.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                <span className="font-medium">{a.staff?.full_name ?? "—"}</span>
                <Badge variant="outline">{a.role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Công việc ({tasks.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!tasks.data?.length && <p className="text-sm text-muted-foreground">Không có công việc</p>}
          {(tasks.data ?? []).map((t: { id: string; title: string; status: string; priority: string; due_date: string | null }) => (
            <div key={t.id} className="flex items-center justify-between border-b pb-2 last:border-0 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground">Hạn: {t.due_date ?? "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t.priority}</Badge>
                <Badge variant={t.status === "done" ? "default" : "secondary"}>{t.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

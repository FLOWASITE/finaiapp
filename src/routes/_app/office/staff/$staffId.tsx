import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStaff, listAssignments } from "@/lib/office/staff.functions";
import { listTasks } from "@/lib/office/tasks.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft } from "lucide-react";
import { AssignmentDialog } from "@/components/office/assignment-dialog";

export const Route = createFileRoute("/_app/office/staff/$staffId")({ component: StaffDetail });

function StaffDetail() {
  const { staffId } = Route.useParams();
  const staffFn = useServerFn(listStaff);
  const assignFn = useServerFn(listAssignments);
  const tasksFn = useServerFn(listTasks);

  const staff = useQuery({ queryKey: ["office", "staff"], queryFn: () => staffFn() });
  const assigns = useQuery({ queryKey: ["office", "assignments"], queryFn: () => assignFn() });
  const tasks = useQuery({ queryKey: ["office", "tasks"], queryFn: () => tasksFn({ data: {} }) });

  const s = (staff.data ?? []).find((x: { id: string }) => x.id === staffId) as
    | { id: string; full_name: string; position: string | null; department: string | null;
        phone: string | null; email: string | null; status: string; user_id: string | null;
        join_date: string | null; skills: string[] | null; notes: string | null;
        avatar_url?: string | null }
    | undefined;

  if (staff.isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (!s) return <p className="text-sm text-muted-foreground">Không tìm thấy nhân viên</p>;

  const myAssignments = (assigns.data ?? []).filter(
    (a: { staff: { id: string } | null }) => a.staff?.id === staffId,
  );
  const myTasks = (tasks.data ?? []).filter(
    (t: { assignee_user_id: string | null; status: string }) =>
      t.assignee_user_id === s.user_id && t.status !== "done" && t.status !== "cancelled",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/office/staff">
          <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        </Link>
        <AssignmentDialog staffId={s.id} staffName={s.full_name} />
      </div>

      <Card>
        <CardContent className="p-4 flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={s.avatar_url ?? undefined} />
            <AvatarFallback>{s.full_name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="col-span-2 md:col-span-4">
              <p className="text-lg font-semibold flex items-center gap-2">
                {s.full_name}
                <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
              </p>
            </div>
            <div><p className="text-xs text-muted-foreground">Vị trí</p><p>{s.position ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Phòng ban</p><p>{s.department ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">SĐT</p><p>{s.phone ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Email</p><p className="truncate">{s.email ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Ngày vào</p><p>{s.join_date ?? "—"}</p></div>
            <div className="col-span-2 md:col-span-4">
              <p className="text-xs text-muted-foreground mb-1">Kỹ năng</p>
              <div className="flex flex-wrap gap-1">
                {(s.skills ?? []).map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
                {!s.skills?.length && <p className="text-sm">—</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Khách phụ trách ({myAssignments.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!myAssignments.length && <p className="text-sm text-muted-foreground">Chưa phân công</p>}
            {myAssignments.map((a: { id: string; role: string; link: { id: string; display_name: string | null; tenant: { name: string } | null } | null }) => (
              <div key={a.id} className="flex justify-between items-center border-b pb-2 last:border-0 text-sm">
                {a.link ? (
                  <Link to="/office/clients/$linkId" params={{ linkId: a.link.id }}
                    className="text-primary hover:underline truncate">
                    {a.link.display_name || a.link.tenant?.name || "—"}
                  </Link>
                ) : <span>—</span>}
                <Badge variant="outline">{a.role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Công việc đang xử lý ({myTasks.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!myTasks.length && <p className="text-sm text-muted-foreground">Không có việc đang mở</p>}
            {myTasks.map((t: { id: string; title: string; status: string; priority: string; due_date: string | null }) => (
              <Link key={t.id} to="/office/tasks/$taskId" params={{ taskId: t.id }}
                className="flex justify-between items-center border-b pb-2 last:border-0 text-sm hover:bg-muted/40 -mx-2 px-2 rounded">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">Hạn: {t.due_date ?? "—"}</p>
                </div>
                <div className="flex gap-1">
                  <Badge variant="outline">{t.priority}</Badge>
                  <Badge variant="secondary">{t.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

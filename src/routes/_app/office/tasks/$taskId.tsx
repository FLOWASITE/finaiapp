import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, upsertTask, deleteTask } from "@/lib/office/tasks.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/office/tasks/$taskId")({ component: TaskDetail });

type ChecklistItem = { text: string; done: boolean };

function TaskDetail() {
  const { taskId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const upsertFn = useServerFn(upsertTask);
  const deleteFn = useServerFn(deleteTask);
  const navigate = Route.useNavigate();

  const { data } = useQuery({ queryKey: ["office", "tasks"], queryFn: () => listFn({ data: {} }) });
  const task = (data ?? []).find((t: { id: string }) => t.id === taskId) as
    | {
        id: string; title: string; description: string | null;
        status: string; priority: string; category: string;
        due_date: string | null; checklist: ChecklistItem[] | null;
        link: { display_name: string | null; tenant: { name: string } | null } | null;
        assignee: { display_name: string | null; email: string | null } | null;
      }
    | undefined;

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (task) setChecklist(Array.isArray(task.checklist) ? task.checklist : []);
  }, [task?.id]);

  const save = useMutation({
    mutationFn: (cl: ChecklistItem[]) =>
      upsertFn({
        data: {
          id: task!.id,
          title: task!.title,
          link_id: null,
          contract_id: null,
          description: task!.description,
          category: task!.category as never,
          priority: task!.priority as never,
          status: task!.status as never,
          assignee_user_id: null,
          reviewer_user_id: null,
          due_date: task!.due_date,
          period_month: null,
          period_year: null,
          checklist: cl,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office"] });
      toast.success("Đã lưu");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: taskId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office"] });
      toast.success("Đã xoá");
      navigate({ to: "/office/tasks" });
    },
  });

  if (!data) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (!task) return <p className="text-sm text-muted-foreground">Không tìm thấy công việc</p>;

  function toggle(i: number) {
    const next = checklist.map((c, idx) => (idx === i ? { ...c, done: !c.done } : c));
    setChecklist(next);
    save.mutate(next);
  }
  function add() {
    const text = newItem.trim();
    if (!text) return;
    const next = [...checklist, { text, done: false }];
    setChecklist(next);
    setNewItem("");
    save.mutate(next);
  }
  function remove(i: number) {
    const next = checklist.filter((_, idx) => idx !== i);
    setChecklist(next);
    save.mutate(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/office/tasks">
          <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => del.mutate()}>
          <Trash2 className="h-4 w-4 mr-1" />Xoá
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
            {task.title}
            <Badge variant="outline">{task.priority}</Badge>
            <Badge variant={task.status === "done" ? "default" : "secondary"}>{task.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Khách hàng</p>
            <p>{task.link?.display_name || task.link?.tenant?.name || "Nội bộ"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phụ trách</p>
            <p>{task.assignee?.display_name || task.assignee?.email || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Hạn</p><p>{task.due_date ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phân loại</p><p>{task.category}</p></div>
          {task.description && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-xs text-muted-foreground">Mô tả</p>
              <p className="whitespace-pre-wrap">{task.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Checklist ({checklist.filter(c => c.done).length}/{checklist.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox checked={c.done} onCheckedChange={() => toggle(i)} />
              <span className={`flex-1 text-sm ${c.done ? "line-through text-muted-foreground" : ""}`}>{c.text}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input placeholder="Thêm mục..." value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button onClick={add} size="sm"><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

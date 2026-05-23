import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, moveTaskStatus } from "@/lib/office/tasks.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/office/task-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/office/tasks/")({ component: TasksKanban });

const COLUMNS = [
  { id: "todo", label: "Cần làm" },
  { id: "in_progress", label: "Đang làm" },
  { id: "review", label: "Chờ duyệt" },
  { id: "done", label: "Hoàn thành" },
] as const;

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-600",
  high: "bg-orange-500/15 text-orange-600",
  med: "bg-blue-500/15 text-blue-600",
  low: "bg-muted text-muted-foreground",
};

function TasksKanban() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const moveFn = useServerFn(moveTaskStatus);
  const { data } = useQuery({ queryKey: ["office", "tasks"], queryFn: () => listFn({ data: {} }) });

  const move = useMutation({
    mutationFn: (p: { id: string; status: (typeof COLUMNS)[number]["id"] }) =>
      moveFn({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office"] });
      toast.success("Đã cập nhật trạng thái");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byStatus = (s: string) => (data ?? []).filter((t: any) => t.status === s);

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><TaskDialog /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          className="rounded-lg border bg-muted/30 p-2 min-h-[400px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("text/plain");
            if (id) move.mutate({ id, status: col.id });
          }}
        >
          <div className="flex items-center justify-between px-2 py-2">
            <h3 className="text-sm font-semibold">{col.label}</h3>
            <Badge variant="secondary">{byStatus(col.id).length}</Badge>
          </div>
          <div className="space-y-2">
            {byStatus(col.id).map((t: any) => (
              <Card
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                className="cursor-grab active:cursor-grabbing"
              >
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium leading-snug">{t.title}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">
                      {t.link?.display_name || t.link?.tenant?.name || "Nội bộ"}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLOR[t.priority] ?? ""}`}
                    >
                      {t.priority}
                    </span>
                  </div>
                  {t.due_date && (
                    <p className="text-[11px] text-muted-foreground">Hạn: {t.due_date}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {byStatus(col.id).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">—</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

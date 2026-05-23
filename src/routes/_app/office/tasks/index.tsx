import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, moveTaskStatus } from "@/lib/office/tasks.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskDialog } from "@/components/office/task-dialog";
import { toast } from "sonner";
import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import { useState } from "react";

export const Route = createFileRoute("/_app/office/tasks/")({ component: TasksKanban });

const COLUMNS = [
  { id: "todo", label: "Cần làm" },
  { id: "in_progress", label: "Đang làm" },
  { id: "review", label: "Chờ duyệt" },
  { id: "done", label: "Hoàn thành" },
] as const;
type ColId = (typeof COLUMNS)[number]["id"];

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-600",
  high: "bg-orange-500/15 text-orange-600",
  med: "bg-blue-500/15 text-blue-600",
  low: "bg-muted text-muted-foreground",
};

type TaskRow = {
  id: string; title: string; status: string; priority: string;
  due_date: string | null;
  link: { display_name: string | null; tenant: { name: string } | null } | null;
};

function TaskCard({ t }: { t: TaskRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`touch-none ${isDragging ? "opacity-50" : ""}`}>
      <Card className="cursor-grab active:cursor-grabbing">
        <CardContent className="p-3 space-y-2">
          <Link to="/office/tasks/$taskId" params={{ taskId: t.id }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-sm font-medium leading-snug hover:underline block">
            {t.title}
          </Link>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate">
              {t.link?.display_name || t.link?.tenant?.name || "Nội bộ"}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLOR[t.priority] ?? ""}`}>
              {t.priority}
            </span>
          </div>
          {t.due_date && (
            <p className="text-[11px] text-muted-foreground">Hạn: {t.due_date}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Column({ id, label, tasks }: { id: ColId; label: string; tasks: TaskRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef}
      className={`rounded-lg border bg-muted/30 p-2 min-h-[400px] transition-colors ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between px-2 py-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => <TaskCard key={t.id} t={t} />)}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">—</p>
        )}
      </div>
    </div>
  );
}

function TasksKanban() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const moveFn = useServerFn(moveTaskStatus);
  const { data } = useQuery({ queryKey: ["office", "tasks"], queryFn: () => listFn({ data: {} }) });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const move = useMutation({
    mutationFn: (p: { id: string; status: ColId }) => moveFn({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office"] });
      toast.success("Đã cập nhật trạng thái");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tasks = (data ?? []) as TaskRow[];
  const byStatus = (s: string) => tasks.filter((t) => t.status === s);
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const status = e.over?.id as ColId | undefined;
    if (!status) return;
    if (!COLUMNS.some((c) => c.id === status)) return;
    const id = e.active.id as string;
    const current = tasks.find((t) => t.id === id);
    if (!current || current.status === status) return;
    move.mutate({ id, status });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><TaskDialog /></div>
      <DndContext sensors={sensors}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {COLUMNS.map((col) => (
            <Column key={col.id} id={col.id} label={col.label} tasks={byStatus(col.id)} />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard t={activeTask} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Pencil, Plus, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  listThreads,
  renameThread,
  deleteThread,
  type ChatThread,
} from "@/lib/chat-threads.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Bucket = { label: string; items: ChatThread[] };

function bucketize(threads: ChatThread[]): Bucket[] {
  const now = Date.now();
  const buckets: Record<string, ChatThread[]> = {
    "Hôm nay": [],
    "7 ngày qua": [],
    "30 ngày qua": [],
    "Cũ hơn": [],
  };
  for (const t of threads) {
    const ageDays = (now - new Date(t.last_message_at).getTime()) / 86_400_000;
    if (ageDays < 1) buckets["Hôm nay"].push(t);
    else if (ageDays < 7) buckets["7 ngày qua"].push(t);
    else if (ageDays < 30) buckets["30 ngày qua"].push(t);
    else buckets["Cũ hơn"].push(t);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

export function ThreadList({ onNew }: { onNew: () => void }) {
  const list = useServerFn(listThreads);
  const rename = useServerFn(renameThread);
  const del = useServerFn(deleteThread);
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;

  const query = useQuery({
    queryKey: ["chat", "threads"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const [renaming, setRenaming] = useState<ChatThread | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const renameMut = useMutation({
    mutationFn: (v: { threadId: string; title: string }) => rename({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      setRenaming(null);
      toast.success("Đã đổi tên");
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi đổi tên"),
  });

  const deleteMut = useMutation({
    mutationFn: (threadId: string) => del({ data: { threadId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      toast.success("Đã xoá cuộc trò chuyện");
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi xoá"),
  });

  const buckets = query.data ? bucketize(query.data) : [];

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/5 bg-background/40">
      <div className="border-b border-white/5 p-3">
        <Button onClick={onNew} className="w-full justify-start gap-2" variant="secondary">
          <Plus className="h-4 w-4" />
          Cuộc trò chuyện mới
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-2 py-2">
        {query.isLoading && (
          <div className="px-2 py-4 text-xs text-muted-foreground">Đang tải…</div>
        )}
        {query.data && query.data.length === 0 && (
          <div className="px-2 py-6 text-xs text-muted-foreground">
            Chưa có cuộc trò chuyện nào. Bấm <span className="font-medium text-foreground">Cuộc trò chuyện mới</span> để bắt đầu.
          </div>
        )}
        {buckets.map((b) => (
          <div key={b.label} className="mb-3">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {b.label}
            </div>
            <ul className="space-y-0.5">
              {b.items.map((t) => {
                const isActive = t.id === activeId;
                return (
                  <li key={t.id} className="group relative">
                    <Link
                      to="/chat/$threadId"
                      params={{ threadId: t.id }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-xs transition-colors",
                        isActive
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t.title}</span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label="Tuỳ chọn"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameValue(t.title);
                            setRenaming(t);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Đổi tên
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Xoá "${t.title}"?`)) deleteMut.mutate(t.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Xoá
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi tên cuộc trò chuyện</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={200}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming && renameValue.trim()) {
                renameMut.mutate({ threadId: renaming.id, title: renameValue.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Huỷ</Button>
            <Button
              onClick={() =>
                renaming &&
                renameValue.trim() &&
                renameMut.mutate({ threadId: renaming.id, title: renameValue.trim() })
              }
              disabled={renameMut.isPending || !renameValue.trim()}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

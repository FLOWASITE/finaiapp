import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Pencil, Plus, Trash2, MessageSquare, Sparkles, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Star, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  setThreadPinned,
  setThreadStarred,
  type ChatThread,
} from "@/lib/chat-threads.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Bucket = { label: string; items: ChatThread[] };

function bucketize(threads: ChatThread[]): Bucket[] {
  const now = Date.now();
  const pinned: ChatThread[] = [];
  const rest: ChatThread[] = [];
  for (const t of threads) {
    if (t.pinned_at) pinned.push(t);
    else rest.push(t);
  }
  const buckets: Record<string, ChatThread[]> = {
    "Hôm nay": [],
    "7 ngày qua": [],
    "30 ngày qua": [],
    "Cũ hơn": [],
  };
  for (const t of rest) {
    const ageDays = (now - new Date(t.last_message_at).getTime()) / 86_400_000;
    if (ageDays < 1) buckets["Hôm nay"].push(t);
    else if (ageDays < 7) buckets["7 ngày qua"].push(t);
    else if (ageDays < 30) buckets["30 ngày qua"].push(t);
    else buckets["Cũ hơn"].push(t);
  }
  const out: Bucket[] = [];
  if (pinned.length) out.push({ label: "Đã ghim", items: pinned });
  for (const [label, items] of Object.entries(buckets)) {
    if (items.length) out.push({ label, items });
  }
  return out;
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function ThreadList({ onNew, collapsed = false, onToggle }: { onNew: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const list = useServerFn(listThreads);
  const rename = useServerFn(renameThread);
  const del = useServerFn(deleteThread);
  const pinFn = useServerFn(setThreadPinned);
  const starFn = useServerFn(setThreadStarred);
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
      qc.invalidateQueries({ queryKey: ["chat", "threads", "recent", "all"] });
      toast.success("Đã xoá cuộc trò chuyện");
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi xoá"),
  });

  const pinMut = useMutation({
    mutationFn: (v: { threadId: string; pinned: boolean }) => pinFn({ data: v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      qc.invalidateQueries({ queryKey: ["chat", "threads", "recent", "all"] });
      toast.success(v.pinned ? "Đã ghim" : "Đã bỏ ghim");
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const starMut = useMutation({
    mutationFn: (v: { threadId: string; starred: boolean }) => starFn({ data: v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      qc.invalidateQueries({ queryKey: ["chat", "threads", "recent", "all"] });
      toast.success(v.starred ? "Đã đánh dấu sao" : "Đã bỏ sao");
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = (query.data ?? []).filter((t) => {
    if (showStarredOnly && !t.starred) return false;
    if (q && !(t.title ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
  const buckets = bucketize(filtered);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-slate-200/70 bg-white transition-[width] duration-200",
        collapsed ? "w-14" : "w-64 xl:w-72",
      )}
    >
      <div className="px-3 py-4">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              title="Mở lịch sử (Cmd+\\)"
              aria-label="Mở lịch sử"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNew}
              title="Cuộc trò chuyện mới"
              aria-label="Cuộc trò chuyện mới"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground shadow-sm"
                style={{ background: "var(--gradient-ai)" }}
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight tracking-tight text-slate-900">Trợ lý kế toán</div>
                <div className="text-[10px] text-slate-500">AI assistant</div>
              </div>
              {onToggle && (
                <button
                  type="button"
                  onClick={onToggle}
                  title="Ẩn lịch sử (Cmd+\\)"
                  aria-label="Ẩn lịch sử"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              onClick={onNew}
              variant="outline"
              className="w-full justify-start gap-2 rounded-xl border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
            >
              <Plus className="h-4 w-4 text-primary" />
              Cuộc trò chuyện mới
            </Button>
          </>
        )}
      </div>
      {!collapsed && (
      <div className="chat-scroll flex-1 overflow-auto px-2 pb-3">
        <div className="mb-2 px-2 pt-1">
          <div className="group relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-primary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm hội thoại…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-primary/40 focus:bg-white focus:ring-1 focus:ring-primary/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Xoá tìm kiếm"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="mb-3 flex items-center justify-between px-3">
          <button
            type="button"
            onClick={() => setShowStarredOnly((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              showStarredOnly
                ? "border border-amber-500/20 bg-amber-500/10 text-amber-300"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            )}
            title="Chỉ hiển thị hội thoại đã đánh dấu sao"
          >
            <Star className={cn("h-3 w-3", showStarredOnly && "fill-current")} />
            {showStarredOnly ? "Đang lọc sao" : "Chỉ hiện sao"}
          </button>
        </div>
        {query.isLoading && (
          <div className="px-3 py-4 text-xs text-slate-500">Đang tải…</div>
        )}
        {query.data && query.data.length === 0 && (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <MessageSquare className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-xs leading-relaxed text-slate-500">
              Chưa có cuộc trò chuyện nào.<br />
              Bấm <span className="font-medium text-slate-700">Cuộc trò chuyện mới</span> để bắt đầu.
            </p>
          </div>
        )}
        {query.data && query.data.length > 0 && buckets.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-slate-500">
            {q
              ? `Không tìm thấy hội thoại nào cho “${searchQuery.trim()}”`
              : "Không có hội thoại đánh dấu sao"}
          </div>
        )}
        <div className="space-y-6">
          {buckets.map((b) => (
            <div key={b.label}>
              <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {b.label}
              </div>
              <ul className="space-y-0.5">
                {b.items.map((t) => {
                  const isActive = t.id === activeId;
                  const isPinned = !!t.pinned_at;
                  const isStarred = !!t.starred;
                  return (
                    <li key={t.id} className="group relative">
                      <Link
                        to="/chat/$threadId"
                        params={{ threadId: t.id }}
                        className={cn(
                          "relative flex flex-col gap-0.5 rounded-xl px-3 py-2.5 pr-9 transition-all",
                          isActive
                            ? "border border-primary/20 bg-primary/10 text-slate-900"
                            : "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full bg-primary shadow-[0_0_8px_oklch(var(--primary)/0.6)]" />
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{t.title}</span>
                          {isStarred && (
                            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                          )}
                          {isPinned && (
                            <Pin className="h-3 w-3 shrink-0 text-primary/70" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {relativeTime(t.last_message_at)}
                        </span>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="absolute right-1.5 top-2 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label="Tuỳ chọn"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => pinMut.mutate({ threadId: t.id, pinned: !isPinned })}
                          >
                            {isPinned ? (
                              <>
                                <PinOff className="mr-2 h-3.5 w-3.5" />
                                Bỏ ghim
                              </>
                            ) : (
                              <>
                                <Pin className="mr-2 h-3.5 w-3.5" />
                                Ghim lên đầu
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => starMut.mutate({ threadId: t.id, starred: !isStarred })}
                          >
                            <Star className={cn("mr-2 h-3.5 w-3.5", isStarred && "fill-amber-500 text-amber-500")} />
                            {isStarred ? "Bỏ đánh dấu sao" : "Đánh dấu sao"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
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
      </div>
      )}

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

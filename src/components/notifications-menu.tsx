import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

const typeStyles: Record<string, string> = {
  info: "bg-primary/15 text-primary",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  error: "bg-destructive/15 text-destructive",
};

export function NotificationsMenu() {
  const qc = useQueryClient();

  const { data = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchOnWindowFocus: true,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const unreadCount = useMemo(() => data.filter((n) => !n.read_at).length, [data]);

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-white/5"
          aria-label="Thông báo"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Thông báo</span>
            <span className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} chưa đọc` : "Tất cả đã đọc"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Đánh dấu tất cả
          </Button>
        </div>

        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Chưa có thông báo</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[420px]">
            <ul className="divide-y divide-border/50">
              {data.map((n) => {
                const unread = !n.read_at;
                const Wrapper: any = n.href ? Link : "div";
                const wrapperProps = n.href ? { to: n.href } : {};
                return (
                  <li key={n.id} className="group relative">
                    <Wrapper
                      {...wrapperProps}
                      onClick={() => unread && markOne.mutate(n.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer",
                        unread && "bg-primary/[0.03]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          typeStyles[n.type] ?? typeStyles.info,
                        )}
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium text-muted-foreground")}>
                            {n.title}
                          </p>
                          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        </div>
                        {n.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                        ) : null}
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {unread ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markOne.mutate(n.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary hover:underline shrink-0"
                        >
                          Đã đọc
                        </button>
                      ) : null}
                    </Wrapper>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

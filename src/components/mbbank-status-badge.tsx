import { cn } from "@/lib/utils";

export type MbSyncStatus = "success" | "error" | "running" | string | null | undefined;

const MAP: Record<string, { label: string; dot: string; bg: string; text: string; pulse?: boolean }> = {
  success: {
    label: "Thành công",
    dot: "bg-emerald-500",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  error: {
    label: "Lỗi",
    dot: "bg-destructive",
    bg: "bg-destructive/10",
    text: "text-destructive",
  },
  running: {
    label: "Đang chạy",
    dot: "bg-blue-500",
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-300",
    pulse: true,
  },
};

export function MbStatusBadge({
  status,
  size = "sm",
}: {
  status: MbSyncStatus;
  size?: "sm" | "md";
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        Chưa chạy
      </span>
    );
  }
  const cfg = MAP[status] ?? {
    label: status,
    dot: "bg-muted-foreground",
    bg: "bg-muted",
    text: "text-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
        cfg.bg,
        cfg.text,
        size === "sm" ? "text-[11px]" : "text-xs",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, cfg.pulse && "animate-pulse")} />
      {cfg.label}
    </span>
  );
}

import type { Agent, AgentStatus } from "@/types/agent";
import { cn } from "@/lib/utils";
import { AgentIcon } from "./AgentIcon";

const STATUS_COLOR: Record<AgentStatus, string> = {
  online: "bg-emerald-500",
  working: "bg-emerald-500 animate-pulse",
  idle: "bg-stone-400",
  warning: "bg-amber-500",
  error: "bg-red-500",
  disabled: "bg-stone-300",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  online: "Online",
  working: "Đang chạy",
  idle: "Sẵn sàng",
  warning: "Cảnh báo",
  error: "Lỗi",
  disabled: "Đã tắt",
};

function successColor(rate: number) {
  if (rate > 0.95) return "text-emerald-700";
  if (rate >= 0.85) return "text-amber-700";
  return "text-red-700";
}

export function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  return (
    <button
      id={`agent-card-${agent.id}`}
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-lg border bg-card p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5",
        agent.status === "disabled" && "opacity-60",
        agent.status === "error" && "border-red-300",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: agent.color.bg }}
        >
          <AgentIcon name={agent.icon} size={18} color={agent.color.icon} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold">{agent.name}</h3>
            <span
              className={cn("h-2 w-2 rounded-full shrink-0", STATUS_COLOR[agent.status])}
              title={STATUS_LABEL[agent.status]}
            />
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">
            {agent.role}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t pt-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{agent.stats.tasks_today} tasks</span>
        <span className={cn("ml-auto font-medium tabular-nums", successColor(agent.stats.success_rate))}>
          {Math.round(agent.stats.success_rate * 100)}% đúng
        </span>
      </div>

      {agent.status_message && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground">
          {agent.status_message}
        </p>
      )}
    </button>
  );
}

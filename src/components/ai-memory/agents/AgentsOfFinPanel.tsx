import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info, Settings as SettingsIcon, ArrowRight, ArrowRightLeft, Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sampleAgents, sampleOrchestrationFlow } from "@/data/sampleAgents";
import type { Agent } from "@/types/agent";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentCard } from "./AgentCard";
import { AutoPostCard } from "./AutoPostCard";
import { AgentDetailDrawer } from "./AgentDetailDrawer";
import { AgentIcon } from "./AgentIcon";
import { listAgentOverrides, upsertAgentSettings } from "@/lib/ai-agents.functions";
import { supabase } from "@/integrations/supabase/client";


function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

const RESULT_ICON: Record<string, string> = { success: "●", warning: "▲", error: "✕" };
const RESULT_COLOR: Record<string, string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  error: "text-red-600",
};

export function AgentsOfFinPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listAgentOverrides);
  const upsertFn = useServerFn(upsertAgentSettings);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ["ai-agents", "overrides"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  // Realtime: invalidate query khi có log mới
  useEffect(() => {
    const ch = supabase
      .channel("ai-agent-activity-logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ai_agent_activity_logs" },
        () => {
          qc.invalidateQueries({ queryKey: ["ai-agents", "overrides"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);


  const upsertMut = useMutation({
    mutationFn: (vars: Parameters<typeof upsertFn>[0]) => upsertFn(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Đã lưu cài đặt agent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Merge static metadata with DB overrides
  const agents: Agent[] = useMemo(() => {
    const byId = new Map((overrides ?? []).map((o) => [o.agent_id, o]));
    return sampleAgents.map((a) => {
      const ov = byId.get(a.id);
      if (!ov) return a;
      return {
        ...a,
        settings: ov.settings,
        status: ov.status,
        status_message: ov.status_message ?? a.status_message,
        stats: {
          ...a.stats,
          ...ov.stats,
          last_run: ov.stats.last_run ?? a.stats.last_run,
        },
        recent_activity: ov.recent_activity.length ? ov.recent_activity : a.recent_activity,
      };
    });
  }, [overrides]);

  const selected = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId],
  );

  const onlineCount = agents.filter((a) => a.status === "online" || a.status === "working").length;
  const totalTasksToday = agents.reduce((s, a) => s + a.stats.tasks_today, 0);
  const avgAccuracy = Math.round(
    (agents.reduce((s, a) => s + a.stats.success_rate, 0) / agents.length) * 100,
  );

  const handleSave = (updated: Agent) => {
    upsertMut.mutate({
      data: {
        agent_id: updated.id,
        settings: updated.settings,
        status: updated.status,
        status_message: updated.status_message ?? null,
      },
    });
    setSelectedId(null);
  };

  const allActivities = agents
    .flatMap((a) => a.recent_activity.map((act) => ({ ...act, agent_id: a.id })))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 20);

  const scrollToAgent = (id: string) => {
    setSelectedId(null);
    setTimeout(() => {
      const el = document.getElementById(`agent-card-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-[#4F46C7]");
        setTimeout(() => el.classList.remove("ring-2", "ring-[#4F46C7]"), 2000);
      }
    }, 50);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-lg border border-[#4F46C7]/20 bg-[#EEEDFE]/50 p-4">
        <Info className="h-5 w-5 shrink-0 text-[#4F46C7]" />
        <div className="text-[13px] leading-relaxed">
          <strong>Bạn không cần xem tab này để dùng Fin.</strong>{" "}
          Mặc định Fin tự lo mọi việc — bạn chỉ chat. Tab này dành cho KTT/CFO muốn tinh
          chỉnh kiến trúc kỹ thuật: bật/tắt từng agent, đặt ngưỡng tin cậy riêng, debug
          khi Fin sai.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3">
        <Stat label="6 agent chạy trong Fin" value={`${onlineCount}/6 online`} />
        <div className="h-8 w-px bg-border" />
        <Stat label="Tasks hôm nay" value={totalTasksToday.toLocaleString("vi-VN")} />
        <div className="h-8 w-px bg-border" />
        <Stat label="Chính xác trung bình" value={`${avgAccuracy}%`} highlight />
        <div className="ml-auto" />
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Button variant="ghost" size="sm" disabled className="gap-1.5">
          <SettingsIcon className="h-3.5 w-3.5" />
          Orchestrator settings
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onClick={() => setSelectedId(agent.id)} />
        ))}
      </div>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-[#4F46C7]" />
          <h3 className="text-[15px] font-semibold">Sơ đồ phối hợp</h3>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Khi bạn kéo hóa đơn vào chat, 6 agent phối hợp như sau:
        </p>
        <OrchestrationFlowView agents={agents} onNodeClick={scrollToAgent} />
        <p className="mt-4 text-[12px] text-muted-foreground leading-relaxed">
          Một <strong>Orchestrator</strong> điều phối: agent nào chạy trước, agent nào
          chạy song song, agent nào chờ kết quả. User chỉ thấy Fin trả lời — không biết
          bên trong có gì.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" />
          <h3 className="text-[15px] font-semibold">Hoạt động gần đây</h3>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">LIVE</Badge>
        </div>
        {allActivities.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Chưa có hoạt động nào. Agent sẽ ghi log khi xử lý giao dịch.
          </p>
        ) : (
          <ul className="divide-y">
            {allActivities.map((act) => {
              const agent = agents.find((a) => a.id === act.agent_id);
              if (!agent) return null;
              return (
                <li key={`${act.agent_id}-${act.id}`} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                    {formatRelative(act.timestamp)}
                  </span>
                  <button
                    onClick={() => setSelectedId(agent.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80"
                    style={{ backgroundColor: agent.color.bg, color: agent.color.icon }}
                  >
                    <AgentIcon name={agent.icon} size={11} />
                    {agent.name.replace("Agent ", "")}
                  </button>
                  <span className={cn("shrink-0", RESULT_COLOR[act.result])}>
                    {RESULT_ICON[act.result]}
                  </span>
                  <span className="flex-1 truncate">{act.action}</span>
                  {act.duration_ms && (
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {act.duration_ms}ms
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AgentDetailDrawer
        agent={selected}
        agents={agents}
        open={!!selected}
        onClose={() => setSelectedId(null)}
        onSave={handleSave}
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-[15px] font-semibold tabular-nums", highlight && "text-emerald-700")}>
        {value}
      </div>
    </div>
  );
}

function OrchestrationFlowView({ agents, onNodeClick }: { agents: Agent[]; onNodeClick: (id: string) => void }) {
  const steps = sampleOrchestrationFlow.steps;
  const grouped: typeof steps[] = [];
  steps.forEach((s) => {
    const last = grouped[grouped.length - 1];
    if (last && last[0].order === s.order) last.push(s);
    else grouped.push([s]);
  });
  const findAgent = (id: string) => agents.find((a) => a.id === id);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 overflow-x-auto md:flex-nowrap">
      {grouped.map((group, gi) => (
        <div key={gi} className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            {group.map((step) => {
              const agent = findAgent(step.agent_id);
              if (!agent) return null;
              return (
                <button
                  key={step.agent_id}
                  onClick={() => onNodeClick(step.agent_id)}
                  className="group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium hover:shadow-sm transition-all"
                  style={{
                    backgroundColor: agent.color.bg,
                    color: agent.color.icon,
                    borderColor: agent.color.icon + "33",
                  }}
                  title={step.condition}
                >
                  <AgentIcon name={agent.icon} size={12} />
                  {agent.name.replace("Agent ", "")}
                </button>
              );
            })}
            {group[0].condition && (
              <span className="text-[10px] italic text-muted-foreground pl-1">
                {group[0].condition}
              </span>
            )}
          </div>
          {gi < grouped.length - 1 && (
            <ArrowRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground",
                grouped[gi + 1][0].optional && "opacity-50",
              )}
              strokeDasharray={grouped[gi + 1][0].optional ? "2 2" : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Zap, Lightbulb, Eye } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Agent, AgentMode, ConfidenceProfile } from "@/types/agent";
import { AgentIcon } from "./AgentIcon";
import { SpecBusinessTab, SpecIntegrationTab, SpecSlaAuditTab } from "./AgentSpecTabs";

function formatRelative(iso?: string): string {
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

const PROFILE_THRESHOLD: Record<ConfidenceProfile, number> = {
  strict: 0.95,
  balanced: 0.85,
  flexible: 0.7,
};

export function AgentDetailDrawer({
  agent,
  agents,
  open,
  onClose,
  onSave,
}: {
  agent: Agent | null;
  agents: Agent[];
  open: boolean;
  onClose: () => void;
  onSave: (a: Agent) => void;
}) {
  const [draft, setDraft] = useState<Agent | null>(agent);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);

  useEffect(() => {
    setDraft(agent);
  }, [agent]);

  if (!draft) return null;

  const updateSettings = (patch: Partial<Agent["settings"]>) =>
    setDraft({ ...draft, settings: { ...draft.settings, ...patch } });

  const handleSave = () => {
    onSave(draft);
    toast.success("Đã lưu cài đặt");
  };

  const affected = useMemo(
    () => agents.filter((a) => a.depends_on.includes(draft.id)),
    [agents, draft.id],
  );

  const handleDisable = () => {
    if (draft.settings.enabled && affected.length > 0) {
      setConfirmDisableOpen(true);
    } else {
      updateSettings({ enabled: !draft.settings.enabled });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[640px] p-0 flex flex-col"
        >
          <SheetHeader className="px-5 py-4 border-b">
            <div className="flex items-start gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: draft.color.bg }}
              >
                <AgentIcon name={draft.icon} size={22} color={draft.color.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-[16px]">{draft.name}</SheetTitle>
                <p className="text-[12px] text-muted-foreground">{draft.role}</p>
              </div>
              <Badge variant="outline" className="capitalize">
                {draft.status}
              </Badge>
            </div>
          </SheetHeader>

          <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="mx-5 mt-3 flex h-9 w-[calc(100%-2.5rem)] overflow-x-auto">
              <TabsTrigger value="overview" className="text-[12px] shrink-0">Tổng quan</TabsTrigger>
              <TabsTrigger value="business" className="text-[12px] shrink-0">Nghiệp vụ</TabsTrigger>
              <TabsTrigger value="integration" className="text-[12px] shrink-0">Tích hợp</TabsTrigger>
              <TabsTrigger value="sla" className="text-[12px] shrink-0">SLA &amp; Audit</TabsTrigger>
              <TabsTrigger value="settings" className="text-[12px] shrink-0">Cài đặt</TabsTrigger>
              <TabsTrigger value="rules" className="text-[12px] shrink-0">
                Quy tắc ({draft.connected_rules_count})
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-[12px] shrink-0">Hoạt động</TabsTrigger>
              <TabsTrigger value="deps" className="text-[12px] shrink-0">Liên kết</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* OVERVIEW */}
              <TabsContent value="overview" className="mt-0 space-y-5">
                <Section title="Mô tả">
                  <p className="text-[13px] leading-relaxed">{draft.description}</p>
                </Section>
                <Section title="Thống kê 30 ngày qua">
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Tasks đã xử lý" value={draft.stats.tasks_total.toLocaleString("vi-VN")} />
                    <MiniStat label="Tỷ lệ chính xác" value={`${Math.round(draft.stats.success_rate * 100)}%`} />
                    <MiniStat label="Thời gian TB" value={`${draft.stats.avg_duration_ms}ms`} />
                    <MiniStat label="Lần chạy cuối" value={formatRelative(draft.stats.last_run)} />
                  </div>
                </Section>
                {draft.stats.last_error && (
                  <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-[13px]">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                    <div>
                      <strong>Lỗi gần nhất:</strong>
                      <p>{draft.stats.last_error.message}</p>
                      <small className="text-muted-foreground">
                        {formatRelative(draft.stats.last_error.timestamp)}
                      </small>
                    </div>
                  </div>
                )}
                <Section
                  title="Custom Instructions"
                  subtitle="System prompt riêng cho agent này (advanced)"
                >
                  {draft.settings.custom_instructions ? (
                    <pre className="rounded bg-muted p-3 text-[12px] whitespace-pre-wrap">
                      {draft.settings.custom_instructions}
                    </pre>
                  ) : (
                    <p className="text-[12px] text-muted-foreground italic">
                      Chưa có custom instructions. Dùng prompt mặc định.
                    </p>
                  )}
                  <Button variant="outline" size="sm" className="mt-2" disabled>
                    Chỉnh sửa
                  </Button>
                </Section>
              </TabsContent>

              {/* BUSINESS SPEC */}
              <TabsContent value="business" className="mt-0">
                {draft.spec ? <SpecBusinessTab spec={draft.spec} /> : <EmptySpec />}
              </TabsContent>
              <TabsContent value="integration" className="mt-0">
                {draft.spec ? <SpecIntegrationTab spec={draft.spec} /> : <EmptySpec />}
              </TabsContent>
              <TabsContent value="sla" className="mt-0">
                {draft.spec ? <SpecSlaAuditTab spec={draft.spec} /> : <EmptySpec />}
              </TabsContent>

              {/* SETTINGS */}
              <TabsContent value="settings" className="mt-0 space-y-6">
                <Field
                  label="Bật/tắt agent"
                  desc="Khi tắt, agent này không chạy. Các agent phụ thuộc có thể bị ảnh hưởng."
                  trailing={
                    <Switch
                      checked={draft.settings.enabled}
                      onCheckedChange={handleDisable}
                    />
                  }
                />

                <Field label="Chế độ hoạt động">
                  <div className="space-y-2">
                    {(
                      [
                        { v: "auto", icon: Zap, t: "Tự duyệt (auto)", d: "Agent tự xử lý khi đủ tin cậy, không cần user duyệt" },
                        { v: "suggest", icon: Lightbulb, t: "Chỉ đề xuất", d: "Agent gợi ý, user phải xác nhận mới ghi sổ" },
                        { v: "learn_only", icon: Eye, t: "Chỉ quan sát", d: "Agent thu thập pattern nhưng không hành động" },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon;
                      const active = draft.settings.mode === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => updateSettings({ mode: opt.v as AgentMode })}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                            active
                              ? "border-[#4F46C7] bg-[#EEEDFE]"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <div className="text-[13px] font-medium">{opt.t}</div>
                            <div className="text-[12px] text-muted-foreground">{opt.d}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Ngưỡng tin cậy">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { v: "strict", t: "Nghiêm ngặt", d: "95% — chỉ trường hợp rõ ràng" },
                        { v: "balanced", t: "Cân bằng", d: "85% — mặc định" },
                        { v: "flexible", t: "Linh hoạt", d: "70% — chấp nhận nghi ngờ" },
                      ] as const
                    ).map((p) => {
                      const active = draft.settings.confidence_profile === p.v;
                      return (
                        <button
                          key={p.v}
                          onClick={() =>
                            updateSettings({
                              confidence_profile: p.v as ConfidenceProfile,
                              confidence_threshold: PROFILE_THRESHOLD[p.v as ConfidenceProfile],
                            })
                          }
                          className={cn(
                            "rounded-md border p-2.5 text-left transition-colors",
                            active
                              ? "border-[#4F46C7] bg-[#EEEDFE]"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <div className="text-[12px] font-semibold">{p.t}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.d}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4">
                    <Slider
                      value={[draft.settings.confidence_threshold * 100]}
                      min={50}
                      max={100}
                      step={5}
                      onValueChange={(v) =>
                        updateSettings({ confidence_threshold: v[0] / 100 })
                      }
                    />
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Với ngưỡng <strong>{Math.round(draft.settings.confidence_threshold * 100)}%</strong>,
                      agent này sẽ áp dụng cho ~
                      {Math.round(draft.stats.tasks_total * draft.settings.confidence_threshold)} giao
                      dịch trong 30 ngày qua.
                    </p>
                  </div>
                </Field>

                <Field label="Lịch hoạt động">
                  <Select
                    value={draft.settings.schedule?.type ?? "always"}
                    onValueChange={(v) =>
                      updateSettings({
                        schedule: { ...(draft.settings.schedule ?? { type: "always" }), type: v as any },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Luôn chạy 24/7</SelectItem>
                      <SelectItem value="business_hours">Giờ hành chính (8:00-18:00)</SelectItem>
                      <SelectItem value="off_hours">Ngoài giờ (18:00-8:00)</SelectItem>
                      <SelectItem value="custom">Custom (cron expression)</SelectItem>
                    </SelectContent>
                  </Select>
                  {draft.settings.schedule?.type === "custom" && (
                    <Input
                      className="mt-2"
                      placeholder="0 9 1 * *"
                      value={draft.settings.schedule.custom_cron ?? ""}
                      onChange={(e) =>
                        updateSettings({
                          schedule: { type: "custom", custom_cron: e.target.value },
                        })
                      }
                    />
                  )}
                </Field>

                <Field label="Thông báo">
                  <div className="space-y-2">
                    {(
                      [
                        { k: "error", t: "Khi có lỗi" },
                        { k: "warning", t: "Khi có cảnh báo" },
                        { k: "completion", t: "Khi hoàn thành task (verbose)" },
                      ] as const
                    ).map((c) => (
                      <label key={c.k} className="flex items-center gap-2 text-[13px]">
                        <Checkbox
                          checked={draft.settings.notify_on[c.k]}
                          onCheckedChange={(v) =>
                            updateSettings({
                              notify_on: { ...draft.settings.notify_on, [c.k]: !!v },
                            })
                          }
                        />
                        {c.t}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Gửi qua: Zalo · Email · In-app
                  </p>
                </Field>
              </TabsContent>

              {/* RULES */}
              <TabsContent value="rules" className="mt-0">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px]">
                    <strong>{draft.connected_rules_count}</strong> quy tắc được agent này sử dụng
                  </span>
                  <Button variant="link" size="sm" className="h-auto p-0 text-[12px]" asChild>
                    <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }}>
                      Quản lý quy tắc đầy đủ <ExternalLink className="ml-1 h-3 w-3 inline" />
                    </a>
                  </Button>
                </div>
                <div className="space-y-2">
                  {draft.connected_rules_ids.map((id) => (
                    <div key={id} className="rounded border p-3 text-[12px]">
                      <code className="text-muted-foreground">{id}</code>
                    </div>
                  ))}
                  {draft.connected_rules_ids.length === 0 && (
                    <p className="text-[12px] text-muted-foreground italic">
                      Agent này chưa kết nối quy tắc nào.
                    </p>
                  )}
                </div>
              </TabsContent>

              {/* ACTIVITY */}
              <TabsContent value="activity" className="mt-0">
                <ul className="space-y-2">
                  {draft.recent_activity.map((act) => (
                    <li key={act.id} className="flex items-center gap-3 rounded border p-2.5 text-[12px]">
                      <span className="w-20 shrink-0 text-muted-foreground text-[11px]">
                        {formatRelative(act.timestamp)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0",
                          act.result === "success" && "text-emerald-600",
                          act.result === "warning" && "text-amber-600",
                          act.result === "error" && "text-red-600",
                        )}
                      >
                        ●
                      </span>
                      <span className="flex-1">{act.action}</span>
                      {act.duration_ms && (
                        <span className="text-muted-foreground tabular-nums text-[11px]">
                          {act.duration_ms}ms
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </TabsContent>

              {/* DEPENDENCIES */}
              <TabsContent value="deps" className="mt-0 space-y-5">
                <Section title="Agent này cần kết quả từ:">
                  {draft.depends_on.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground italic">
                      Không phụ thuộc agent nào — chạy độc lập
                    </p>
                  ) : (
                    <MiniAgentList ids={draft.depends_on} agents={agents} />
                  )}
                </Section>
                <Section title="Agent này feed kết quả cho:">
                  {draft.feeds_into.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground italic">
                      Không feed cho agent nào — là endpoint
                    </p>
                  ) : (
                    <MiniAgentList ids={draft.feeds_into} agents={agents} />
                  )}
                </Section>
                <Section title="Khi tắt agent này, ảnh hưởng:">
                  {affected.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground italic">
                      Không ảnh hưởng agent nào
                    </p>
                  ) : (
                    <div className="rounded border border-amber-300 bg-amber-50 p-3">
                      <MiniAgentList ids={affected.map((a) => a.id)} agents={agents} />
                    </div>
                  )}
                </Section>
              </TabsContent>
            </div>

            <div className="border-t px-5 py-3 flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                Hủy
              </Button>
              <div className="flex-1" />
              <Button onClick={handleSave}>Lưu thay đổi</Button>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tắt {draft.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tắt agent này sẽ ảnh hưởng đến:
              <ul className="mt-2 list-disc pl-5">
                {affected.map((a) => (
                  <li key={a.id}><strong>{a.name}</strong> — {a.role}</li>
                ))}
              </ul>
              Dây chuyền orchestration có thể bị đứt. Bạn chắc chắn?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateSettings({ enabled: false });
                setConfirmDisableOpen(false);
              }}
            >
              Tắt agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptySpec() {
  return (
    <p className="text-[12px] text-muted-foreground italic">
      Agent này chưa có đặc tả nghiệp vụ chi tiết.
    </p>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold">{title}</h4>
      {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  desc,
  children,
  trailing,
}: {
  label: string;
  desc?: string;
  children?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[13px] font-semibold">{label}</Label>
        {trailing}
      </div>
      {desc && <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function MiniAgentList({ ids, agents }: { ids: string[]; agents: Agent[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const a = agents.find((x) => x.id === id);
        if (!a) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
            style={{ backgroundColor: a.color.bg, color: a.color.icon, borderColor: a.color.icon + "33" }}
          >
            <AgentIcon name={a.icon} size={12} />
            {a.name}
          </span>
        );
      })}
    </div>
  );
}

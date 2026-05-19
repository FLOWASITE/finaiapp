import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Brain,
  Sparkles,
  Bot,
  User as UserIcon,
  PauseCircle,
  Zap,
  Target,
  Clock,
  Eye,
  Pencil,
  Power,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/ai/memory")({
  head: () => ({
    meta: [
      { title: "Trí nhớ AI — FinAI" },
      {
        name: "description",
        content:
          "Xem, sửa và xoá mọi quy tắc AI đã học từ bạn. Không phải hộp đen — bạn dạy AI thế nào, AI làm chính xác như thế.",
      },
    ],
  }),
  component: AIMemoryPage,
});

// ====== Types & mock data ======

type RuleSource = "ai-learned" | "user-taught";
type RuleType = "suggestion" | "active" | "disabled";

type Rule = {
  id: string;
  type: RuleType;
  source?: RuleSource;
  origin: string;
  title: string;
  when: string;
  then: string;
  appliedCount: number;
  accuracy: string;
  lastUsed: string;
  disableReason?: string;
  timestamp?: string;
};

const INITIAL_RULES: Rule[] = [
  {
    id: "s1",
    type: "suggestion",
    timestamp: "vừa rồi",
    origin:
      "Tôi thấy 5 hoá đơn Highlands Coffee gần đây bạn đều book vào TK 642 - Chi phí tiếp khách. Tạo quy tắc tự động cho lần sau?",
    title: "Hoá đơn Highlands Coffee → Chi phí tiếp khách (642)",
    when: "Hoá đơn từ Highlands Coffee (MST 0301...XX9)",
    then: 'Nợ 642 · Có 331 · ghi chú "Chi phí tiếp khách"',
    appliedCount: 5,
    accuracy: "5/5 (100%)",
    lastUsed: "—",
  },
  {
    id: "b1",
    type: "active",
    source: "ai-learned",
    origin: "Học từ 5 lần bạn duyệt liên tiếp ngày 12/9",
    title: 'Sao kê "TT HD" + khớp công nợ → đóng phải thu',
    when:
      'Sao kê có "TT HD" / "thanh toan HD" + số tiền khớp công nợ phải thu của 1 đối tác',
    then: "Nợ 112 (theo NH) · Có 131 (theo đối tác đã khớp)",
    appliedCount: 217,
    accuracy: "215/217 (99.1%)",
    lastUsed: "hôm nay 15:42",
  },
  {
    id: "c1",
    type: "active",
    source: "user-taught",
    origin: "Tạo từ Cần xem lại ngày 2/11",
    title: "Grab Business của nhân viên Marketing → Chi phí bán hàng",
    when:
      "HĐ Grab Business + người đi thuộc phòng Marketing (5 NV: Linh, Tú, An, Hương, Quang)",
    then: 'Nợ 641 · Có 331 · gán phòng ban "Marketing"',
    appliedCount: 18,
    accuracy: "18/18 (100%)",
    lastUsed: "3 ngày trước",
  },
  {
    id: "b2",
    type: "active",
    source: "ai-learned",
    origin: "Học từ 8 lần duyệt liên tiếp ngày 28/8 – 5/9",
    title: "Hoá đơn điện EVN HCM → Chi phí điện văn phòng (642)",
    when: 'Hoá đơn EVN HCMC + diễn giải chứa "tiền điện"',
    then: 'Nợ 642 · Có 331 · ghi chú "Tiền điện văn phòng"',
    appliedCount: 84,
    accuracy: "84/84 (100%)",
    lastUsed: "2 ngày trước",
  },
  {
    id: "c2",
    type: "active",
    source: "user-taught",
    origin: "Bạn tạo ngày 14/10",
    title: "Phí ngân hàng Vietcombank → 6427",
    when: 'Sao kê VCB + diễn giải chứa "Phí" / "Phi"',
    then: "Nợ 6427 · Có 112 (VCB)",
    appliedCount: 42,
    accuracy: "42/42 (100%)",
    lastUsed: "hôm nay 09:12",
  },
  {
    id: "d1",
    type: "disabled",
    origin: "Bạn tắt ngày 18/10",
    title: "Mọi quán cà phê → TK 642 (Tiếp khách)",
    when: 'Hoá đơn có "cafe" / "coffee" trong tên NCC',
    then: "Nợ 642 · Có 331",
    appliedCount: 12,
    accuracy: "9/12 (75%)",
    lastUsed: "18/10",
    disableReason:
      "Cà phê họp nội bộ phải vào 641, không phải tiếp khách. Quy tắc quá rộng.",
  },
];

type Watch = { id: string; text: string; progress: string };
const INITIAL_WATCH: Watch[] = [
  { id: "w1", text: "Hoá đơn từ Tiki Trading đều book vào 156", progress: "3/5 lần" },
  { id: "w2", text: 'Chuyển khoản cho "BHXH" đều book vào 338', progress: "2/5 lần" },
  { id: "w3", text: "Hoá đơn Viettel cố định kỳ tháng → 6427", progress: "4/5 lần" },
  { id: "w4", text: 'Sao kê có "luong T" + cuối tháng → 334', progress: "3/5 lần" },
  { id: "w5", text: "Hoá đơn Be Group người đi sales → 641", progress: "2/5 lần" },
  { id: "w6", text: 'Khoản chi "tiếp khách Phú Mỹ Hưng" → 642', progress: "1/5 lần" },
  { id: "w7", text: "Hoá đơn FPT Telecom → 6427", progress: "3/5 lần" },
  { id: "w8", text: 'Phiếu chi "VPP" → 6423', progress: "4/5 lần" },
  { id: "w9", text: "Hoá đơn xăng PVOil + xe công ty → 6422", progress: "2/5 lần" },
  { id: "w10", text: 'Sao kê "phi sms" Techcombank → 6427', progress: "3/5 lần" },
  { id: "w11", text: 'Khoản thu "hoan ung" từ NV → 141', progress: "2/5 lần" },
  { id: "w12", text: "Hoá đơn nhà mạng Vinaphone → 6427", progress: "1/5 lần" },
];

// ====== Page ======

type TabKey = "rules" | "partners" | "context" | "limits" | "learning";

function AIMemoryPage() {
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES);
  const [watch, setWatch] = useState<Watch[]>(INITIAL_WATCH);
  const [tab, setTab] = useState<TabKey>("rules");

  const suggestionCount = rules.filter((r) => r.type === "suggestion").length;
  const activeCount = rules.filter((r) => r.type === "active").length;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <MemoryHeader
        ruleCount={activeCount}
        suggestionCount={suggestionCount}
      />
      <SubTabs value={tab} onChange={setTab} learningCount={watch.length} ruleCount={activeCount} />

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl space-y-3 px-5 py-4">
          {tab === "rules" && (
            <RuleList rules={rules} setRules={setRules} />
          )}
          {tab === "partners" && <ComingSoon label="Đối tác (128)" />}
          {tab === "context" && <ComingSoon label="Bối cảnh doanh nghiệp (12)" />}
          {tab === "limits" && <ComingSoon label="Giới hạn (8)" />}
          {tab === "learning" && (
            <WatchListView
              items={watch}
              onPromote={(w) => {
                const newRule: Rule = {
                  id: `c-${Date.now()}`,
                  type: "active",
                  source: "user-taught",
                  origin: `Tạo từ watch list hôm nay (${w.progress})`,
                  title: w.text,
                  when: w.text,
                  then: "(điền hành động hạch toán)",
                  appliedCount: 0,
                  accuracy: "—",
                  lastUsed: "—",
                };
                setRules((r) => [newRule, ...r]);
                setWatch((ws) => ws.filter((x) => x.id !== w.id));
                toast.success("Đã tạo quy tắc & chuyển sang tab Quy tắc");
                setTab("rules");
              }}
              onUnwatch={(id) => setWatch((ws) => ws.filter((x) => x.id !== id))}
            />
          )}
        </div>
      </ScrollArea>

      <WatchFooter count={watch.length} onClick={() => setTab("learning")} />
    </div>
  );
}

// ====== Header ======

function MemoryHeader({
  ruleCount,
  suggestionCount,
}: {
  ruleCount: number;
  suggestionCount: number;
}) {
  return (
    <div className="border-b px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Brain className="h-5 w-5 text-[#4F46C7]" />
        <h1 className="text-[17px] font-semibold tracking-tight">Trí nhớ AI</h1>
        <span className="rounded-full bg-[#EEEDFE] px-2.5 py-0.5 text-[11px] font-medium text-[#26215C]">
          Mọi thứ AI đã học từ bạn
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
        Đây không phải hộp đen. Mọi quy tắc đều đọc, sửa, xoá được. Bạn dạy AI thế nào,
        AI làm chính xác như thế.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label="Quy tắc hoạt động" value={String(ruleCount)} />
        <StatCard label="Áp dụng / tháng" value="1,284" />
        <StatCard label="Chính xác TB" value="98.4%" />
        <StatCard
          label="Đề xuất mới"
          value={String(suggestionCount)}
          accent
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        accent ? "border-[#4F46C7]/30 bg-[#EEEDFE]" : "bg-card",
      )}
    >
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          accent ? "text-[#26215C]" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          accent ? "text-[#26215C]" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ====== Sub tabs ======

function SubTabs({
  value,
  onChange,
  learningCount,
  ruleCount,
}: {
  value: TabKey;
  onChange: (t: TabKey) => void;
  learningCount: number;
  ruleCount: number;
}) {
  const tabs: { key: TabKey; label: string; count?: number; badge?: number }[] = [
    { key: "rules", label: "Quy tắc hạch toán", count: ruleCount },
    { key: "partners", label: "Đối tác", count: 128 },
    { key: "context", label: "Bối cảnh DN", count: 12 },
    { key: "limits", label: "Giới hạn", count: 8 },
    { key: "learning", label: "Đang học", badge: learningCount },
  ];
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b px-3">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            {t.count != null && (
              <span className="ml-1 text-muted-foreground/70">({t.count})</span>
            )}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#4F46C7] px-1.5 text-[10px] font-bold text-white">
                {t.badge}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ====== Rule list & card ======

function RuleList({
  rules,
  setRules,
}: {
  rules: Rule[];
  setRules: React.Dispatch<React.SetStateAction<Rule[]>>;
}) {
  const ordered = useMemo(() => {
    const order = { suggestion: 0, active: 1, disabled: 2 } as const;
    return [...rules].sort((a, b) => order[a.type] - order[b.type]);
  }, [rules]);

  return (
    <>
      {ordered.map((r) => (
        <RuleCard key={r.id} rule={r} setRules={setRules} />
      ))}
    </>
  );
}

function RuleCard({
  rule,
  setRules,
}: {
  rule: Rule;
  setRules: React.Dispatch<React.SetStateAction<Rule[]>>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [editWhen, setEditWhen] = useState(rule.when);
  const [editThen, setEditThen] = useState(rule.then);
  const [disableReason, setDisableReason] = useState("");

  const isA = rule.type === "suggestion";
  const isB = rule.type === "active" && rule.source === "ai-learned";
  const isC = rule.type === "active" && rule.source === "user-taught";
  const isD = rule.type === "disabled";

  // === Badge config
  const badge = isA
    ? { label: "ĐỀ XUẤT QUY TẮC MỚI", Icon: Sparkles, color: "#26215C" }
    : isB
    ? { label: "AI TỰ HỌC", Icon: Bot, color: "#4F46C7" }
    : isC
    ? { label: "BẠN DẠY", Icon: UserIcon, color: "#0F6E56" }
    : { label: "TẠM TẮT", Icon: PauseCircle, color: "#737373" };

  const handleCreate = () => {
    setRules((rs) =>
      rs.map((x) =>
        x.id === rule.id
          ? {
              ...x,
              type: "active",
              source: "user-taught",
              origin: `Tạo từ đề xuất hôm nay (${x.appliedCount} lần đã làm tay)`,
              timestamp: undefined,
            }
          : x,
      ),
    );
    setCreateOpen(false);
    toast.success("Đã tạo quy tắc — AI sẽ áp dụng tự động");
  };

  const handleSaveEdit = () => {
    setRules((rs) =>
      rs.map((x) =>
        x.id === rule.id ? { ...x, when: editWhen.trim(), then: editThen.trim() } : x,
      ),
    );
    setEditOpen(false);
    toast.success("Đã lưu thay đổi");
  };

  const handleDisable = () => {
    if (!disableReason.trim()) {
      toast.error("Vui lòng nhập lý do tắt");
      return;
    }
    setRules((rs) =>
      rs.map((x) =>
        x.id === rule.id
          ? {
              ...x,
              type: "disabled",
              disableReason: disableReason.trim(),
              origin: `Bạn tắt ngày ${new Date().toLocaleDateString("vi-VN")}`,
            }
          : x,
      ),
    );
    setDisableOpen(false);
    setDisableReason("");
    toast.success("Đã tắt quy tắc");
  };

  const handleDismissSuggestion = () => {
    setRules((rs) => rs.filter((x) => x.id !== rule.id));
    toast.success("Đã bỏ qua đề xuất");
  };

  return (
    <div
      className={cn(
        "animate-fade-in rounded-lg border bg-card p-4 transition-all",
        isA && "border-[#4F46C7] bg-[#F5F4FE]",
        isD && "opacity-65",
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-bold tracking-wide text-white"
          style={{ backgroundColor: badge.color }}
        >
          <badge.Icon className="h-3 w-3" />
          {badge.label}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {isA ? rule.origin : rule.origin}
        </span>
        {!isA && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isD ? "bg-muted-foreground/50" : "bg-emerald-500",
              )}
            />
            {isD ? "Không hoạt động" : "Đang dùng"}
          </span>
        )}
        {isA && rule.timestamp && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {rule.timestamp}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className={cn(
          "mt-2 text-[13px] font-medium leading-snug",
          isD && "line-through text-muted-foreground",
        )}
      >
        {rule.title}
      </h3>

      {/* When / Then OR disable reason */}
      {isD ? (
        <div className="mt-2.5 rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
          <span className="font-semibold text-foreground/80">Lý do tắt: </span>
          {rule.disableReason}
        </div>
      ) : (
        <div className="mt-2.5 space-y-1.5 rounded-md bg-muted/40 p-3 text-[12.5px]">
          <div className="flex items-start gap-2">
            <ChipWhen />
            <span className="flex-1 leading-relaxed">{rule.when}</span>
          </div>
          <div className="flex items-start gap-2">
            <ChipThen />
            <span className="flex-1 leading-relaxed">{rule.then}</span>
          </div>
        </div>
      )}

      {/* Stats (only for B/C) */}
      {(isB || isC) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" /> Áp dụng {rule.appliedCount} lần
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="h-3 w-3" /> Đúng {rule.accuracy}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> Cuối: {rule.lastUsed}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {isA && (
          <>
            <Button
              size="sm"
              className="h-7 bg-[#4F46C7] text-white hover:bg-[#4338A8]"
              onClick={() => setCreateOpen(true)}
            >
              Tạo quy tắc
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setEditOpen(true)}>
              Tinh chỉnh
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={handleDismissSuggestion}>
              Bỏ qua
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-muted-foreground"
              onClick={() => setAppliedOpen(true)}
            >
              Xem {rule.appliedCount} lần áp dụng
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </>
        )}
        {(isB || isC) && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setAppliedOpen(true)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              Xem {rule.appliedCount} lần áp dụng
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Sửa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground hover:text-destructive"
              onClick={() => setDisableOpen(true)}
            >
              <Power className="mr-1 h-3.5 w-3.5" />
              Tắt
            </Button>
          </>
        )}
        {isD && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              setRules((rs) =>
                rs.map((x) =>
                  x.id === rule.id
                    ? { ...x, type: "active", source: "user-taught", disableReason: undefined }
                    : x,
                ),
              )
            }
          >
            Bật lại
          </Button>
        )}
      </div>

      {/* Create preview dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xem trước quy tắc</DialogTitle>
            <DialogDescription>
              Sau khi tạo, AI sẽ tự động áp dụng cho mọi trường hợp khớp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md bg-muted/40 p-3 text-[13px]">
            <div className="flex items-start gap-2">
              <ChipWhen />
              <span>{rule.when}</span>
            </div>
            <div className="flex items-start gap-2">
              <ChipThen />
              <span>{rule.then}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Huỷ
            </Button>
            <Button className="bg-[#4F46C7] text-white hover:bg-[#4338A8]" onClick={handleCreate}>
              Xác nhận tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa quy tắc</DialogTitle>
            <DialogDescription>
              Hỗ trợ cú pháp đơn giản: <code>vendor="..."</code>, <code>amount&gt;...</code>,{" "}
              <code>description contains "..."</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 inline-flex items-center gap-2">
                <ChipWhen /> Điều kiện
              </Label>
              <Textarea
                value={editWhen}
                onChange={(e) => setEditWhen(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label className="mb-1 inline-flex items-center gap-2">
                <ChipThen /> Hành động hạch toán
              </Label>
              <Textarea
                value={editThen}
                onChange={(e) => setEditThen(e.target.value)}
                rows={3}
              />
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              Sẽ áp dụng cho <b>{rule.appliedCount}</b> mục trong 30 ngày qua nếu quy tắc
              này tồn tại.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleSaveEdit}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tắt quy tắc?</AlertDialogTitle>
            <AlertDialogDescription>
              Hãy ghi lại lý do để AI hiểu vì sao và không tái tạo quy tắc tương tự.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            placeholder="Vd: Quy tắc quá rộng, có trường hợp ngoại lệ..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDisable}
            >
              Tắt quy tắc
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Applied list sheet */}
      <Sheet open={appliedOpen} onOpenChange={setAppliedOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{rule.appliedCount} lần áp dụng</SheetTitle>
            <SheetDescription>
              Danh sách bút toán đã được AI tạo từ quy tắc này.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {Array.from({ length: Math.min(10, rule.appliedCount || 5) }).map((_, i) => (
              <div key={i} className="rounded-md border p-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <div className="font-medium">BT-{String(20240 + i).padStart(5, "0")}</div>
                  <div className="text-muted-foreground">
                    {new Date(Date.now() - i * 86400_000).toLocaleDateString("vi-VN")}
                  </div>
                </div>
                <div className="mt-1 text-muted-foreground">{rule.then}</div>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11.5px]">
                    Xem chi tiết
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11.5px] text-muted-foreground hover:text-destructive"
                    onClick={() => toast.success("Đã gửi phản hồi cho AI")}
                  >
                    Báo cáo sai
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChipWhen() {
  return (
    <span
      className="shrink-0 rounded-[3px] px-1.5 py-px text-[10px] font-semibold text-white"
      style={{ backgroundColor: "#26215C" }}
    >
      KHI
    </span>
  );
}
function ChipThen() {
  return (
    <span
      className="shrink-0 rounded-[3px] px-1.5 py-px text-[10px] font-semibold text-white"
      style={{ backgroundColor: "#0F6E56" }}
    >
      THÌ
    </span>
  );
}

// ====== Watch list view ======

function WatchListView({
  items,
  onPromote,
  onUnwatch,
}: {
  items: Watch[];
  onPromote: (w: Watch) => void;
  onUnwatch: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Không có mẫu nào đang theo dõi.
      </div>
    );
  }
  return (
    <>
      <div className="mb-2 text-[12px] text-muted-foreground">
        AI đang theo dõi {items.length} mẫu. Khi đủ tin cậy (thường 5 lần lặp), AI sẽ tự
        đề xuất tạo quy tắc.
      </div>
      {items.map((w) => (
        <div
          key={w.id}
          className="flex items-center gap-3 rounded-lg border bg-card p-3 animate-fade-in"
        >
          <span className="h-2 w-2 rounded-full bg-[#4F46C7] animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] leading-snug">{w.text}</div>
            <div className="text-[11px] text-muted-foreground">đã {w.progress}</div>
          </div>
          <Button
            size="sm"
            className="h-7 bg-[#4F46C7] text-white hover:bg-[#4338A8]"
            onClick={() => onPromote(w)}
          >
            Tạo quy tắc luôn
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            onClick={() => onUnwatch(w.id)}
          >
            Bỏ theo dõi
          </Button>
        </div>
      ))}
    </>
  );
}

// ====== Footer ======

function WatchFooter({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 border-t bg-muted/40 px-[18px] py-2.5">
      <span className="relative inline-flex">
        <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-[#4F46C7] opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4F46C7]" />
      </span>
      <div className="flex-1 text-[12.5px] text-muted-foreground">
        AI đang theo dõi <b className="text-foreground">{count}</b> mẫu chưa đủ tin cậy
        để tạo quy tắc · cần ~3–5 lần lặp lại nữa
      </div>
      <Button size="sm" variant="outline" className="h-7" onClick={onClick}>
        Xem chi tiết
      </Button>
    </div>
  );
}

// ====== Coming soon placeholder ======

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      <Badge variant="secondary" className="mb-2">
        Sắp ra mắt
      </Badge>
      <div>Mục "{label}" đang được hoàn thiện.</div>
    </div>
  );
}

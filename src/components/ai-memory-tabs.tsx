import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  User as UserIcon,
  Users,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SourceAppliedSheet } from "@/components/ai-memory-source-sheet";
import { previewRetroApply, type RetroPreview } from "@/lib/ai-memory.functions";
import {
  listPartners,
  createPartner,
  updatePartner,
  deletePartner,
  type MemoryPartner,
  type PartnerKind,
} from "@/lib/ai-memory-partners.functions";
import {
  listContext,
  createContext,
  updateContext,
  deleteContext,
  CATEGORY_LABEL,
  type MemoryContext,
  type ContextCategory,
} from "@/lib/ai-memory-context.functions";
import {
  listLimits,
  createLimit,
  updateLimit,
  toggleLimit,
  deleteLimit,
  LIMIT_KIND_LABEL,
  SCOPE_LABEL,
  type MemoryLimit,
  type LimitKind,
  type LimitScope,
} from "@/lib/ai-memory-limits.functions";

function Loading() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-3 h-10 w-full" />
        </div>
      ))}
    </>
  );
}

// =================== PARTNERS ===================

const KIND_LABEL: Record<PartnerKind, string> = {
  customer: "Khách hàng",
  supplier: "Nhà cung cấp",
  employee: "Nhân viên",
  individual: "Cá nhân",
};
const KIND_COLOR: Record<PartnerKind, string> = {
  customer: "#0F6E56",
  supplier: "#4F46C7",
  employee: "#B45309",
  individual: "#737373",
};

export function PartnersTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listPartners);
  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory", "partners"],
    queryFn: () => fn(),
  });
  const [filter, setFilter] = useState<PartnerKind | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MemoryPartner | null>(null);
  const [creating, setCreating] = useState(false);
  const [usedWhere, setUsedWhere] = useState<MemoryPartner | null>(null);

  const items = useMemo(() => {
    const all = data ?? [];
    return all.filter((p) => {
      if (filter !== "all" && p.party_kind !== filter) return false;
      if (search && !p.display_name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [data, filter, search]);

  const deleteFn = useServerFn(deletePartner);
  const delM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "partners"] });
      toast.success("Đã xoá");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loading />;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Tìm theo tên đối tác…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs"
        />
        <div className="flex gap-1">
          {(["all", "customer", "supplier", "employee", "individual"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11.5px] font-medium",
                filter === k
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "all" ? "Tất cả" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="ml-auto h-8 bg-[#4F46C7] text-white hover:bg-[#4338A8]"
          onClick={() => setCreating(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Thêm đối tác
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Chưa có ghi nhớ đối tác nào. AI sẽ tự thêm khi phát hiện mẫu lặp lại, hoặc bạn thêm thủ
          công bằng nút bên trên.
        </div>
      ) : (
        items.map((p) => (
          <div key={p.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-bold tracking-wide text-white"
                style={{ backgroundColor: KIND_COLOR[p.party_kind] }}
              >
                {p.party_kind === "customer" && <Users className="h-3 w-3" />}
                {p.party_kind === "supplier" && <Building2 className="h-3 w-3" />}
                {p.party_kind === "employee" && <UserIcon className="h-3 w-3" />}
                {p.party_kind === "individual" && <UserIcon className="h-3 w-3" />}
                {KIND_LABEL[p.party_kind].toUpperCase()}
              </span>
              <span className="text-muted-foreground">
                · {p.sample_count} lần quan sát ·{" "}
                {p.last_seen_at
                  ? `gặp gần nhất ${new Date(p.last_seen_at).toLocaleDateString("vi-VN")}`
                  : "chưa có dữ liệu"}
              </span>
            </div>
            <h3 className="mt-2 text-[14px] font-semibold leading-snug">{p.display_name}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80">
              {p.behavior_text}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {p.default_account && (
                <Badge variant="secondary" className="font-mono">
                  TK {p.default_account}
                </Badge>
              )}
              {p.memo_keywords.map((m) => (
                <Badge key={m} variant="outline">
                  memo: {m}
                </Badge>
              ))}
              {p.bank_hints.map((b) => (
                <Badge key={b} variant="outline">
                  {b}
                </Badge>
              ))}
              {p.tags.map((t) => (
                <Badge key={t} variant="outline">
                  #{t}
                </Badge>
              ))}
            </div>
            <div className="mt-3 flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setUsedWhere(p)}
              >
                <History className="mr-1 h-3.5 w-3.5" />
                Dùng ở đâu
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(p)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Sửa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(`Xoá ghi nhớ "${p.display_name}"?`)) {
                    delM.mutate({ data: { id: p.id } });
                  }
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Xoá
              </Button>
            </div>
          </div>
        ))
      )}

      <PartnerDialog
        open={creating || !!editing}
        partner={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <SourceAppliedSheet
        open={!!usedWhere}
        onOpenChange={(o) => !o && setUsedWhere(null)}
        sourceKind="partner"
        sourceId={usedWhere?.id ?? null}
        sourceLabel={usedWhere?.display_name ?? ""}
      />
    </>
  );
}

function PartnerDialog({
  open,
  partner,
  onClose,
}: {
  open: boolean;
  partner: MemoryPartner | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createPartner);
  const updateFn = useServerFn(updatePartner);
  const [kind, setKind] = useState<PartnerKind>(partner?.party_kind ?? "supplier");
  const [name, setName] = useState(partner?.display_name ?? "");
  const [behavior, setBehavior] = useState(partner?.behavior_text ?? "");
  const [account, setAccount] = useState(partner?.default_account ?? "");
  const [memos, setMemos] = useState((partner?.memo_keywords ?? []).join(", "));
  const [banks, setBanks] = useState((partner?.bank_hints ?? []).join(", "));

  // reset khi mở dialog mới
  useMemo(() => {
    if (open) {
      setKind(partner?.party_kind ?? "supplier");
      setName(partner?.display_name ?? "");
      setBehavior(partner?.behavior_text ?? "");
      setAccount(partner?.default_account ?? "");
      setMemos((partner?.memo_keywords ?? []).join(", "));
      setBanks((partner?.bank_hints ?? []).join(", "));
    }
  }, [open, partner]);

  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        party_kind: kind,
        display_name: name.trim(),
        behavior_text: behavior.trim(),
        default_account: account.trim() || null,
        memo_keywords: memos
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        bank_hints: banks
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (partner) {
        return updateFn({ data: { id: partner.id, ...payload } });
      }
      return createFn({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "partners"] });
      toast.success(partner ? "Đã cập nhật" : "Đã thêm đối tác");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{partner ? "Sửa ghi nhớ đối tác" : "Thêm đối tác"}</DialogTitle>
          <DialogDescription>
            AI sẽ dùng các từ khoá memo + gợi ý ngân hàng để khớp sao kê khi giao dịch tới.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label className="mb-1 block text-[12px]">Loại</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PartnerKind)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as PartnerKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-[12px]">TK mặc định</Label>
            <Input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="VD: 642"
              className="h-9 font-mono"
            />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-[12px]">Tên hiển thị *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="FPT Telecom"
              className="h-9"
            />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-[12px]">Hành vi (1 câu tiếng Việt) *</Label>
            <Textarea
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
              placeholder="Hoá đơn ra ngày 5-7 hàng tháng · luôn book 642"
              className="min-h-[68px]"
            />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-[12px]">Từ khoá memo (cách nhau bởi dấu phẩy)</Label>
            <Input
              value={memos}
              onChange={(e) => setMemos(e.target.value)}
              placeholder="TT HD, TT FPT"
              className="h-9"
            />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-[12px]">Gợi ý ngân hàng</Label>
            <Input
              value={banks}
              onChange={(e) => setBanks(e.target.value)}
              placeholder="VCB, TCB"
              className="h-9"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !name.trim() || !behavior.trim()}
            className="bg-[#4F46C7] text-white hover:bg-[#4338A8]"
          >
            {partner ? "Lưu" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== CONTEXT ===================

export function ContextTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listContext);
  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory", "context"],
    queryFn: () => fn(),
  });
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const out = new Map<ContextCategory, MemoryContext[]>();
    (data ?? []).forEach((c) => {
      const arr = out.get(c.category) ?? [];
      arr.push(c);
      out.set(c.category, arr);
    });
    return out;
  }, [data]);

  if (isLoading) return <Loading />;

  return (
    <>
      <div className="rounded-lg border-l-4 border-l-[#4F46C7] bg-[#F5F4FE] p-3 text-[12.5px] leading-relaxed text-[#26215C]">
        <strong>Đây là "system prompt" của doanh nghiệp.</strong> AI đọc đầu tiên trước khi suy
        luận. Mỗi dòng là một câu tiếng Việt — sửa trực tiếp, không cần code.
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setCreating(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Thêm mục bối cảnh
        </Button>
      </div>

      {Array.from(grouped.entries()).map(([cat, items]) => (
        <div key={cat} className="rounded-lg border bg-card p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL[cat]}
          </div>
          <div className="divide-y">
            {items.map((c) => (
              <ContextRow key={c.id} item={c} />
            ))}
          </div>
        </div>
      ))}

      <ContextCreateDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function ContextRow({ item }: { item: MemoryContext }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateContext);
  const deleteFn = useServerFn(deleteContext);
  const previewFn = useServerFn(previewRetroApply);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.value_text);
  const [usedOpen, setUsedOpen] = useState(false);
  const [retro, setRetro] = useState<RetroPreview | null>(null);

  const updM = useMutation({
    mutationFn: updateFn,
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "context"] });
      setEditing(false);
      toast.success("Đã lưu — AI sẽ dùng giá trị mới ngay");
      // Time-travel: hỏi hồi tố nếu có bút toán trước đây dùng mục này.
      try {
        const preview = await previewFn({
          data: { source_kind: "context", source_id: item.id },
        });
        if (preview.affected_count > 0) setRetro(preview);
      } catch {
        /* im lặng — không chặn flow lưu */
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "context"] });
      toast.success("Đã xoá");
    },
  });

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-32 shrink-0 text-[12.5px] font-medium text-muted-foreground">
        {item.label}
      </div>
      <div className="flex-1">
        {editing ? (
          <div className="flex gap-2">
            <Textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="min-h-[60px] text-[13px]"
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                className="h-7 bg-[#4F46C7] text-white hover:bg-[#4338A8]"
                onClick={() =>
                  updM.mutate({ data: { id: item.id, value_text: val.trim() } })
                }
                disabled={updM.isPending || !val.trim()}
              >
                Lưu
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  setEditing(false);
                  setVal(item.value_text);
                }}
              >
                Huỷ
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-[13px] leading-relaxed hover:bg-muted/50"
          >
            <span className="flex-1">{item.value_text}</span>
            <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setUsedOpen(true)}
        title="Dùng ở đâu"
        className="opacity-30 transition-opacity hover:opacity-100"
      >
        <History className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Xoá mục "${item.label}"?`)) delM.mutate({ data: { id: item.id } });
        }}
        className="opacity-30 transition-opacity hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>

      <SourceAppliedSheet
        open={usedOpen}
        onOpenChange={setUsedOpen}
        sourceKind="context"
        sourceId={item.id}
        sourceLabel={item.label}
      />

      <AlertDialog open={!!retro} onOpenChange={(o) => !o && setRetro(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Áp dụng hồi tố cho {retro?.affected_count} bút toán?</AlertDialogTitle>
            <AlertDialogDescription>
              Mục "{item.label}" đã ảnh hưởng tới {retro?.affected_count} bút toán trong quá khứ.
              Bạn có muốn đánh dấu các bút toán này để AI rà soát lại theo giá trị mới?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto rounded border bg-muted/30 p-2 text-[12px]">
            {retro?.samples.map((s) => (
              <div key={s.id} className="border-b py-1 last:border-0">
                <div className="font-medium">{s.journal_code ?? s.document_label ?? "—"}</div>
                <div className="text-muted-foreground line-clamp-1">{s.then_snapshot}</div>
              </div>
            ))}
            {(retro?.affected_count ?? 0) > (retro?.samples.length ?? 0) && (
              <div className="pt-1 text-center text-[11px] text-muted-foreground">
                … và {(retro?.affected_count ?? 0) - (retro?.samples.length ?? 0)} bút toán khác
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Để sau</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#4F46C7] text-white hover:bg-[#4338A8]"
              onClick={() => {
                setRetro(null);
                toast.success(
                  `Đã gửi ${retro?.affected_count} bút toán vào hộp thư AI để rà soát lại`,
                );
              }}
            >
              Đánh dấu rà soát
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContextCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createContext);
  const [category, setCategory] = useState<ContextCategory>("other");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  const m = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "context"] });
      toast.success("Đã thêm");
      onClose();
      setKey("");
      setLabel("");
      setValue("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm mục bối cảnh</DialogTitle>
          <DialogDescription>
            Mỗi mục là một câu tiếng Việt giải thích một khía cạnh của doanh nghiệp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Label className="mb-1 block text-[12px]">Nhóm</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ContextCategory)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABEL) as ContextCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[12px]">Khoá (a-z, _)</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder="cong_no_chuan"
                className="h-9 font-mono"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[12px]">Nhãn</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Công nợ chuẩn"
              className="h-9"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[12px]">Giá trị (câu tiếng Việt)</Label>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Khách hàng SaaS thanh toán trước 12 tháng, phân bổ doanh thu đều"
              className="min-h-[72px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() =>
              m.mutate({
                data: {
                  category,
                  key: key.trim(),
                  label: label.trim(),
                  value_text: value.trim(),
                },
              })
            }
            disabled={m.isPending || !key.trim() || !label.trim() || !value.trim()}
            className="bg-[#4F46C7] text-white hover:bg-[#4338A8]"
          >
            Thêm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== LIMITS ===================

const KIND_STYLE: Record<LimitKind, { color: string; bg: string; Icon: typeof ShieldAlert }> = {
  block: { color: "#B91C1C", bg: "#FEF2F2", Icon: ShieldAlert },
  warn: { color: "#B45309", bg: "#FFFBEB", Icon: AlertTriangle },
  require_review: { color: "#4F46C7", bg: "#EEEDFE", Icon: ShieldCheck },
};

export function LimitsTab() {
  const qc = useQueryClient();
  const fn = useServerFn(listLimits);
  const toggleFn = useServerFn(toggleLimit);
  const deleteFn = useServerFn(deleteLimit);
  const { data, isLoading } = useQuery({
    queryKey: ["ai-memory", "limits"],
    queryFn: () => fn(),
  });
  const [creating, setCreating] = useState(false);
  const [usedWhere, setUsedWhere] = useState<MemoryLimit | null>(null);

  const toggleM = useMutation({
    mutationFn: toggleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-memory", "limits"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "limits"] });
      toast.success("Đã xoá");
    },
  });

  if (isLoading) return <Loading />;
  const items = data ?? [];

  return (
    <>
      <div className="rounded-lg border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] p-3 text-[12.5px] leading-relaxed text-[#7F1D1D]">
        <strong>Ranh giới AI không được vượt</strong> — kể cả khi tin cậy 99.9%. Đây là khoá an
        toàn cho compliance (TT 219, ngưỡng phê duyệt nội bộ).
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setCreating(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Thêm giới hạn
        </Button>
      </div>

      {items.map((l) => {
        const s = KIND_STYLE[l.limit_kind];
        return (
          <div
            key={l.id}
            className={cn("rounded-lg border bg-card p-4", !l.is_active && "opacity-60")}
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-bold tracking-wide text-white"
                style={{ backgroundColor: s.color }}
              >
                <s.Icon className="h-3 w-3" />
                {LIMIT_KIND_LABEL[l.limit_kind].toUpperCase()}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {SCOPE_LABEL[l.scope]}
              </Badge>
              <span className="ml-auto inline-flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {l.triggered_count > 0 ? `${l.triggered_count} lần kích hoạt` : "Chưa kích hoạt"}
                </span>
                <Switch
                  checked={l.is_active}
                  onCheckedChange={(v) =>
                    toggleM.mutate({ data: { id: l.id, is_active: v } })
                  }
                />
              </span>
            </div>
            <h3 className="mt-2 text-[14px] font-semibold leading-snug">{l.title}</h3>
            <div
              className="mt-2 rounded-md p-2.5 text-[13px] leading-relaxed"
              style={{ backgroundColor: s.bg, color: s.color }}
            >
              {l.rule_text}
            </div>
            <div className="mt-3 flex gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setUsedWhere(l)}
              >
                <History className="mr-1 h-3.5 w-3.5" />
                Dùng ở đâu
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(`Xoá giới hạn "${l.title}"?`)) {
                    delM.mutate({ data: { id: l.id } });
                  }
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Xoá
              </Button>
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Chưa có giới hạn nào.
        </div>
      )}

      <LimitCreateDialog open={creating} onClose={() => setCreating(false)} />
      <SourceAppliedSheet
        open={!!usedWhere}
        onOpenChange={(o) => !o && setUsedWhere(null)}
        sourceKind="limit"
        sourceId={usedWhere?.id ?? null}
        sourceLabel={usedWhere?.title ?? ""}
      />
    </>
  );
}

function LimitCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createLimit);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [ruleText, setRuleText] = useState("");
  const [kind, setKind] = useState<LimitKind>("warn");
  const [scope, setScope] = useState<LimitScope>("amount");
  const [severity, setSeverity] = useState<"low" | "med" | "high">("med");

  const m = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-memory", "limits"] });
      toast.success("Đã thêm giới hạn");
      onClose();
      setCode("");
      setTitle("");
      setRuleText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm giới hạn</DialogTitle>
          <DialogDescription>
            Mô tả ranh giới bằng một câu tiếng Việt rõ ràng. AI sẽ tuân thủ tuyệt đối.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <Label className="mb-1 block text-[12px]">Loại</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as LimitKind)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LIMIT_KIND_LABEL) as LimitKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {LIMIT_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[12px]">Phạm vi</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as LimitScope)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCOPE_LABEL) as LimitScope[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[12px]">Mức độ</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Thấp</SelectItem>
                  <SelectItem value="med">Trung bình</SelectItem>
                  <SelectItem value="high">Cao</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[12px]">Mã (a-z, _)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="amount_100m"
              className="h-9 font-mono"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[12px]">Tiêu đề</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ngưỡng phê duyệt giám đốc"
              className="h-9"
            />
          </div>
          <div>
            <Label className="mb-1 block text-[12px]">Câu giới hạn (đầy đủ)</Label>
            <Textarea
              value={ruleText}
              onChange={(e) => setRuleText(e.target.value)}
              placeholder="KHÔNG tự duyệt bút toán vượt 100.000.000 ₫ — phải có chữ ký giám đốc"
              className="min-h-[72px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() =>
              m.mutate({
                data: {
                  code: code.trim(),
                  title: title.trim(),
                  rule_text: ruleText.trim(),
                  limit_kind: kind,
                  scope,
                  severity,
                  params: {},
                },
              })
            }
            disabled={m.isPending || !code.trim() || !title.trim() || !ruleText.trim()}
            className="bg-[#4F46C7] text-white hover:bg-[#4338A8]"
          >
            Thêm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

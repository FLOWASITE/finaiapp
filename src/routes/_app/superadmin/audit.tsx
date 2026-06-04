import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { listSuperadminAuditLogs } from "@/lib/superadmin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, ChevronDown, Copy } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/audit")({
  validateSearch: (search: Record<string, unknown>) => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
    modal: search.modal === "1" || search.modal === true ? true : undefined,
  }),
  component: AuditPage,
});

const ACTION_LABEL: Record<string, string> = {
  "superadmin.role.grant": "Cấp vai trò",
  "superadmin.role.revoke": "Thu hồi vai trò",
  "superadmin.account.reset_password": "Reset mật khẩu",
  "superadmin.account.ban": "Khóa tài khoản",
  "superadmin.account.unban": "Mở khóa tài khoản",
  "superadmin.account.delete": "Xóa tài khoản",
  "superadmin.org.update": "Cập nhật tổ chức",
  "superadmin.org.delete": "Xóa tổ chức",
};

function badgeVariant(action: string): "default" | "destructive" | "secondary" | "outline" {
  if (action.endsWith(".delete") || action.endsWith(".ban") || action.endsWith(".revoke")) return "destructive";
  if (action.endsWith(".grant") || action.endsWith(".unban")) return "default";
  return "secondary";
}

const PAGE_SIZES = [25, 50, 100, 200];

const ACTION_PREFIXES: Array<{ value: string; label: string }> = [
  { value: "superadmin.", label: "Tất cả (superadmin.*)" },
  { value: "superadmin.role.", label: "Vai trò (grant/revoke)" },
  { value: "superadmin.role.grant", label: "Cấp vai trò" },
  { value: "superadmin.role.revoke", label: "Thu hồi vai trò" },
  { value: "superadmin.account.", label: "Tài khoản (mọi thao tác)" },
  { value: "superadmin.account.reset_password", label: "Reset mật khẩu" },
  { value: "superadmin.account.ban", label: "Khóa tài khoản" },
  { value: "superadmin.account.unban", label: "Mở khóa tài khoản" },
  { value: "superadmin.account.delete", label: "Xóa tài khoản" },
  { value: "superadmin.org.", label: "Tổ chức (mọi thao tác)" },
  { value: "superadmin.org.update", label: "Cập nhật tổ chức" },
  { value: "superadmin.org.delete", label: "Xóa tổ chức" },
];

const EMAIL_DATALIST_ID = "audit-actor-email-suggestions";

function useDebounced<T>(value: T, delay = 500): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function AuditPage() {
  const fetchLogs = useServerFn(listSuperadminAuditLogs);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [actorEmail, setActorEmail] = useState("");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [actionPrefix, setActionPrefix] = useState("superadmin.");
  const [selected, setSelected] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(!!search.modal);
  const [showTotal, setShowTotal] = useState(false);

  // Debounce 500ms để bộ lọc "ổn định" rồi mới gọi API kèm count đắt đỏ.
  const dActorEmail = useDebounced(actorEmail);
  const dTargetId = useDebounced(targetId);
  const dFrom = useDebounced(from);
  const dTo = useDebounced(to);
  const filtersSettling =
    dActorEmail !== actorEmail ||
    dTargetId !== targetId ||
    dFrom !== from ||
    dTo !== to;

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "superadmin-audit",
      actionPrefix,
      dActorEmail,
      dTargetId,
      dFrom,
      dTo,
      pageSize,
      showTotal,
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchLogs({
        data: {
          limit: pageSize,
          offset: pageParam as number,
          action_prefix: actionPrefix || undefined,
          actor_email: dActorEmail || undefined,
          target_id: dTargetId || undefined,
          from: dFrom || undefined,
          to: dTo ? `${dTo}T23:59:59` : undefined,
          // Chỉ đếm tổng khi user bật toggle, và CHỈ ở trang đầu.
          with_total: showTotal && (pageParam as number) === 0,
        },
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + (p.logs?.length ?? 0), 0);
      if (typeof lastPage.total === "number") {
        return loaded < lastPage.total ? loaded : undefined;
      }
      return lastPage.has_more ? loaded : undefined;
    },
  });

  const logs = useMemo(() => data?.pages.flatMap((p) => p.logs) ?? [], [data]);
  const total = data?.pages[0]?.total;

  const emailSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs as any[]) {
      if (l.actor_email) set.add(l.actor_email);
    }
    return Array.from(set).sort();
  }, [logs]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const pageCount = data?.pages.length ?? 0;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Tự cuộn dòng đang chọn vào giữa khi: mở modal, tải thêm trang mới,
  // hoặc khôi phục selected từ URL sau khi logs vừa load xong.
  // Thử lại tối đa vài frame vì rowRef có thể chưa kịp gắn ngay lập tức.
  useEffect(() => {
    if (!selected?.id) return;
    let cancelled = false;
    let frameId = 0;
    let tries = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const el = rowRefs.current.get(selected.id);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (tries++ < 10) frameId = requestAnimationFrame(tryScroll);
    };
    frameId = requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [selected?.id, pageCount, logs]);

  // Giữ selected đồng bộ với bản ghi mới nhất sau khi bộ lọc/refetch trả về.
  // Đồng thời khôi phục selected từ URL search (reload / back-forward).
  useEffect(() => {
    const targetId = selected?.id ?? search.selected;
    if (!targetId) return;
    const fresh = (logs as any[]).find((l) => l.id === targetId);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [logs, selected, search.selected]);

  // Đồng bộ selected/modal lên URL để giữ trạng thái khi reload / back-forward.
  useEffect(() => {
    const nextSelected = selected?.id;
    const nextModal = modalOpen ? true : undefined;
    if (search.selected === nextSelected && !!search.modal === !!nextModal) return;
    navigate({
      search: (prev: any) => ({ ...prev, selected: nextSelected, modal: nextModal }),
      replace: true,
    });
  }, [selected?.id, modalOpen, navigate, search.selected, search.modal]);


  // Tóm tắt bộ lọc hiện đang áp dụng (dùng giá trị đã debounce — khớp dữ liệu hiển thị).
  const activeFilters = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    const prefixLabel = ACTION_PREFIXES.find((p) => p.value === actionPrefix)?.label ?? actionPrefix;
    items.push({ label: "Loại hành động", value: prefixLabel });
    if (dActorEmail) items.push({ label: "Email", value: dActorEmail });
    if (dTargetId) items.push({ label: "Target ID", value: dTargetId });
    if (dFrom) items.push({ label: "Từ", value: dFrom });
    if (dTo) items.push({ label: "Đến", value: dTo });
    return items;
  }, [actionPrefix, dActorEmail, dTargetId, dFrom, dTo]);

  // Điều hướng bàn phím: ↑/↓ đổi selected, Enter mở modal chi tiết.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (logs.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = selected ? (logs as any[]).findIndex((l) => l.id === selected.id) : -1;
        let next = idx;
        if (e.key === "ArrowDown") next = idx < 0 ? 0 : Math.min(idx + 1, logs.length - 1);
        else next = idx < 0 ? 0 : Math.max(idx - 1, 0);
        setSelected((logs as any[])[next]);
      } else if (e.key === "Enter" && selected) {
        e.preventDefault();
        setModalOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [logs, selected, modalOpen]);

  return (
    <div className="space-y-4">
      <datalist id={EMAIL_DATALIST_ID}>
        {emailSuggestions.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Loại hành động</label>
          <Select value={actionPrefix} onValueChange={setActionPrefix}>
            <SelectTrigger className="h-8 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_PREFIXES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Email người thao tác</label>
          <Input
            className="h-8 w-56"
            placeholder="admin@..."
            list={EMAIL_DATALIST_ID}
            value={actorEmail}
            onChange={(e) => setActorEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Target ID (user/tenant)</label>
          <Input
            className="h-8 w-72 font-mono text-xs"
            placeholder="uuid"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Từ ngày</label>
          <Input type="date" className="h-8" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Đến ngày</label>
          <Input type="date" className="h-8" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-muted-foreground">Số dòng/trang</label>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showTotal} onCheckedChange={setShowTotal} />
          Hiển thị tổng
        </label>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>{logs.length} bản ghi</span>
          <span className="text-border">•</span>
          {filtersSettling ? (
            <span className="italic">đang chờ bộ lọc…</span>
          ) : !showTotal ? (
            <Badge variant="outline" className="font-normal">
              tổng: chưa khả dụng (bật “Hiển thị tổng”)
            </Badge>
          ) : isFetching && typeof total !== "number" ? (
            <Badge variant="secondary" className="font-normal">
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              đang tính tổng…
            </Badge>
          ) : typeof total === "number" ? (
            <Badge variant="secondary" className="font-normal">
              tổng: {total}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal">
              tổng: chưa khả dụng
            </Badge>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Thời gian</th>
              <th className="px-3 py-2 text-left">Hành động</th>
              <th className="px-3 py-2 text-left">Người thao tác</th>
              <th className="px-3 py-2 text-left">Đối tượng</th>
              <th className="px-3 py-2 text-left">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có nhật ký nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {logs.map((l: any) => {
              const isSelected = selected?.id === l.id;
              return (
              <tr
                key={l.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(l.id, el);
                  else rowRefs.current.delete(l.id);
                }}
                onClick={() => {
                  setSelected(l);
                  setModalOpen(true);
                }}
                aria-selected={isSelected}
                className={`cursor-pointer border-t align-top transition-colors ${
                  isSelected
                    ? "border-l-2 border-l-primary bg-primary/10 hover:bg-primary/15"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString("vi-VN")}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={badgeVariant(l.action)}>{ACTION_LABEL[l.action] ?? l.action}</Badge>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{l.action}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{l.actor_email ?? "—"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{l.user_id?.slice(0, 8)}…</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  <div>{l.table_name ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{l.record_id ?? ""}</div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  Bấm để xem chi tiết
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {hasNextPage && (
          <div
            ref={sentinelRef}
            className="flex justify-center border-t border-border p-3"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Đang tải thêm…
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-3.5 w-3.5" />
                  Cuộn xuống để tải thêm
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={modalOpen && !!selected} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-h-[85vh] max-w-3xl overflow-hidden"
          onOpenAutoFocus={(e) => {
            // Đảm bảo focus rơi vào nút "Đóng" để Enter/Escape thao tác ngay.
            e.preventDefault();
            closeBtnRef.current?.focus();
          }}
        >
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <Badge variant={badgeVariant(selected.action)}>
                    {ACTION_LABEL[selected.action] ?? selected.action}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{selected.action}</span>
                </DialogTitle>
                <DialogDescription>
                  {new Date(selected.created_at).toLocaleString("vi-VN")}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
                <div className="rounded border border-dashed border-border bg-muted/30 p-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Bộ lọc đang áp dụng
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {activeFilters.map((f) => (
                      <Badge key={f.label} variant="outline" className="font-normal">
                        <span className="text-muted-foreground">{f.label}:</span>
                        <span className="ml-1 font-mono">{f.value}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <DetailRow label="Log ID" value={selected.id} mono />
                  <DetailRow label="Người thao tác (email)" value={selected.actor_email ?? "—"} />
                  <DetailRow label="Actor user_id" value={selected.user_id ?? "—"} mono />
                  <DetailRow label="Bảng" value={selected.table_name ?? "—"} mono />
                  <DetailRow label="Record ID" value={selected.record_id ?? "—"} mono />
                  <DetailRow label="IP" value={selected.ip ?? "—"} mono />
                  <div className="sm:col-span-2">
                    <DetailRow label="User-Agent" value={selected.user_agent ?? "—"} mono />
                  </div>
                </div>

                {selected.before && (
                  <JsonBlock title="Trước (before)" data={selected.before} />
                )}
                {selected.after && (
                  <JsonBlock title="Sau (after)" data={selected.after} />
                )}
                {!selected.before && !selected.after && (
                  <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    Không có payload before/after.
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
                      toast.success("Đã copy JSON đầy đủ");
                    } catch {
                      toast.error("Không thể copy");
                    }
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy JSON
                </Button>
                <Button ref={closeBtnRef} size="sm" onClick={() => setModalOpen(false)}>
                  Đóng
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`break-all text-xs ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px]">
{JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

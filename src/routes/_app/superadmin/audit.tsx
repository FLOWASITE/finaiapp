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
import { RefreshCw, ChevronDown, Copy } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin/audit")({
  beforeLoad: requireSuperadminGuard,
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

function AuditPage() {
  const fetchLogs = useServerFn(listSuperadminAuditLogs);
  const [actorEmail, setActorEmail] = useState("");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [actionPrefix, setActionPrefix] = useState("superadmin.");
  const [selected, setSelected] = useState<any | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["superadmin-audit", actionPrefix, actorEmail, targetId, from, to, pageSize],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchLogs({
        data: {
          limit: pageSize,
          offset: pageParam as number,
          action_prefix: actionPrefix || undefined,
          actor_email: actorEmail || undefined,
          target_id: targetId || undefined,
          from: from || undefined,
          to: to ? `${to}T23:59:59` : undefined,
        },
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + (p.logs?.length ?? 0), 0);
      return loaded < (lastPage.total ?? 0) ? loaded : undefined;
    },
  });

  const logs = useMemo(() => data?.pages.flatMap((p) => p.logs) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const emailSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs as any[]) {
      if (l.actor_email) set.add(l.actor_email);
    }
    return Array.from(set).sort();
  }, [logs]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
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
        <div className="ml-auto text-xs text-muted-foreground">
          {logs.length} / {total} bản ghi
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
            {logs.map((l: any) => (
              <tr
                key={l.id}
                onClick={() => setSelected(l)}
                className="cursor-pointer border-t border-border align-top hover:bg-muted/30"
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
            ))}
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
    </div>
  );
}

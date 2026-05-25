import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, Loader2, CheckCircle2, Clock, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listProposals, approveProposal } from "@/lib/categorize.functions";
import { ProposalCard } from "@/components/categorize/ProposalCard";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_app/categorize")({
  head: () => ({
    meta: [
      { title: "Hạch toán — FinAI" },
      { name: "description", content: "Hàng đợi bút toán AI đề xuất chờ Kế toán trưởng duyệt." },
    ],
  }),
  component: CategorizePage,
});

function CategorizePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProposals);
  const approveFn = useServerFn(approveProposal);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"pending" | "auto_posted" | "approved" | "all">("pending");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["categorize", "proposals", filter],
    queryFn: () => listFn({ data: { status: filter, limit: 50 } }),
  });

  const items = data?.items ?? [];
  const stats = data?.stats ?? { pending: 0, auto_today: 0, accuracy_7d: null };

  const eligibleIds = useMemo(
    () =>
      items
        .filter((i: any) => {
          if (i.status !== "pending") return false;
          const ws = (i.warnings ?? []) as any[];
          if (ws.some((w) => w.severity === "error")) return false;
          // TSCĐ & 242 cần xác nhận riêng từng cái — không cho batch
          if (ws.some((w) => w.code === "cat-tscd-confirm" || w.code === "cat-242-allocate")) return false;
          return true;
        })
        .map((i: any) => i.id),
    [items],
  );

  const toggle = (id: string, v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(eligibleIds));
  const clearSel = () => setSelected(new Set());

  const [batchBusy, setBatchBusy] = useState(false);
  const batchApprove = async () => {
    if (selected.size === 0) return;
    setBatchBusy(true);
    let ok = 0, fail = 0;
    for (const id of Array.from(selected)) {
      try {
        await approveFn({ data: { proposal_id: id, entry_index: 0 } });
        ok++;
      } catch { fail++; }
    }
    setBatchBusy(false);
    clearSel();
    qc.invalidateQueries({ queryKey: ["categorize", "proposals"] });
    qc.invalidateQueries({ queryKey: ["sidebar", "ai-counts"] });
    toast.success(`Duyệt ${ok} bút toán${fail ? `, lỗi ${fail}` : ""}`);
  };

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Hạch toán
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bút toán AI đề xuất chờ duyệt. Engine ưu tiên mẫu NCC đã học, sau đó memory + luật, cuối cùng mới AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/ai/memory">Cài đặt agent</Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Clock} label="Chờ duyệt" value={stats.pending} tone="amber" />
        <StatCard icon={Sparkles} label="Tự ghi hôm nay" value={stats.auto_today} tone="emerald" />
        <StatCard icon={CheckCircle2} label="Độ chính xác 7 ngày" value={stats.accuracy_7d != null ? `${Math.round(stats.accuracy_7d * 100)}%` : "—"} tone="blue" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          ["pending", "Chờ duyệt"],
          ["auto_posted", "Tự ghi"],
          ["approved", "Đã duyệt"],
          ["all", "Tất cả"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setFilter(k); clearSel(); }}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Batch bar */}
      {filter === "pending" && eligibleIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <Badge variant="outline">{selected.size}/{eligibleIds.length} đã chọn</Badge>
          <Button size="sm" variant="ghost" onClick={selected.size === eligibleIds.length ? clearSel : selectAll}>
            {selected.size === eligibleIds.length ? "Bỏ chọn tất cả" : "Chọn tất cả hợp lệ"}
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={batchApprove} disabled={selected.size === 0 || batchBusy} className="gap-1.5">
            {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Duyệt {selected.size} bút toán
          </Button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Không có bút toán nào"
          description={filter === "pending" ? "Tất cả hoá đơn đã được hạch toán. Tốt lắm!" : "Chưa có dữ liệu cho bộ lọc này."}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <ProposalCard
              key={item.id}
              proposalId={item.id}
              invoice={item.invoice}
              dto={item.dto}
              confidence={item.confidence}
              source={item.source}
              selected={selected.has(item.id)}
              onSelectChange={filter === "pending" ? (v) => toggle(item.id, v) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: "amber" | "emerald" | "blue" }) {
  const tones = {
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 text-foreground">{value}</div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Loader2, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinMascot } from "@/components/fin-mascot";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listPendingAiActions,
  approveAiAction,
  cancelAiAction,
} from "@/lib/ai-actions.functions";

type AiAction = {
  id: string;
  tool_name: string;
  summary: string;
  status: "pending" | "approved" | "executed" | "failed";
  result_ref_table?: string | null;
  result_ref_id?: string | null;
  error_message?: string | null;
  created_at: string;
};

const TOOL_LABELS: Record<string, string> = {
  createInvoiceFromSO: "Xuất hoá đơn từ đơn đặt hàng",
  recordCustomerReceipt: "Thu tiền khách hàng",
};

const REF_ROUTES: Record<string, (id: string) => string> = {
  sales_invoices: (id) => `/sales/${id}`,
  customer_receipts: () => `/receipts`,
};

/**
 * Inline list of AI-proposed actions awaiting user approval.
 * Rendered inside ChatDock / chat thread; auto-refreshes via realtime + react-query.
 */
export function PendingActions() {
  const listFn = useServerFn(listPendingAiActions);
  const approveFn = useServerFn(approveAiAction);
  const cancelFn = useServerFn(cancelAiAction);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["ai_actions_pending"],
    queryFn: () => listFn({}),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("ai_actions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_actions" },
        () => qc.invalidateQueries({ queryKey: ["ai_actions_pending"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const actions = (data?.actions ?? []) as AiAction[];
  // Only show pending + recently-finished (executed/failed in last 5 min)
  const now = Date.now();
  const visible = actions.filter((a) => {
    if (a.status === "pending") return true;
    if (a.status === "approved") return true;
    const age = now - new Date(a.created_at).getTime();
    return age < 5 * 60 * 1000;
  });

  if (visible.length === 0) return null;

  const onApprove = async (id: string) => {
    setBusy(id);
    try {
      await approveFn({ data: { action_id: id } });
      toast.success("Đã thực thi");
      qc.invalidateQueries({ queryKey: ["ai_actions_pending"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi");
    } finally {
      setBusy(null);
    }
  };

  const onCancel = async (id: string) => {
    setBusy(id);
    try {
      await cancelFn({ data: { action_id: id } });
      qc.invalidateQueries({ queryKey: ["ai_actions_pending"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-border bg-muted/30 px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <FinMascot size="xs" glow={false} />
        Fin gợi ý hành động · {visible.length}
      </div>
      <div className="space-y-2">
        {visible.map((a) => (
          <ActionCard
            key={a.id}
            action={a}
            busy={busy === a.id}
            onApprove={() => onApprove(a.id)}
            onCancel={() => onCancel(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  action,
  busy,
  onApprove,
  onCancel,
}: {
  action: AiAction;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const label = TOOL_LABELS[action.tool_name] ?? action.tool_name;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          {action.status === "executed" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          ) : action.status === "failed" ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : action.status === "approved" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="text-xs">{label}</span>
        </div>
        <StatusBadge status={action.status} />
      </div>
      <div className="whitespace-pre-wrap text-xs text-muted-foreground">
        {action.summary}
      </div>
      {action.error_message && (
        <div className="mt-1.5 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {action.error_message}
        </div>
      )}
      {action.status === "pending" && (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" className="h-7 flex-1 text-xs" disabled={busy} onClick={onApprove}>
            <Check className="mr-1 h-3 w-3" /> Duyệt
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={busy}
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {action.status === "executed" && action.result_ref_table && (
        <div className="mt-2">
          {(() => {
            const router = REF_ROUTES[action.result_ref_table];
            if (!router || !action.result_ref_id) return null;
            return (
              <a
                href={router(action.result_ref_id)}
                className="text-xs text-primary hover:underline"
              >
                Mở chứng từ →
              </a>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AiAction["status"] }) {
  const map: Record<AiAction["status"], { label: string; variant: any }> = {
    pending: { label: "Chờ duyệt", variant: "outline" },
    approved: { label: "Đang chạy", variant: "secondary" },
    executed: { label: "Đã chạy", variant: "default" },
    failed: { label: "Lỗi", variant: "destructive" },
  };
  const { label, variant } = map[status];
  return (
    <Badge variant={variant} className="h-4 px-1.5 text-[10px]">
      {label}
    </Badge>
  );
}

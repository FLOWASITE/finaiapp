import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { proposeJournal, getProposalByInvoice } from "@/lib/categorize.functions";
import { ProposalCard } from "./ProposalCard";

export function CategorizeTab({
  invoiceId,
  categorize,
}: {
  invoiceId: string;
  categorize: any | null;
}) {
  const qc = useQueryClient();
  const getProp = useServerFn(getProposalByInvoice);
  const propose = useServerFn(proposeJournal);

  // Prime cache với dữ liệu đã có từ getDocument
  const { data, isLoading } = useQuery({
    queryKey: ["categorize", "by-invoice", invoiceId],
    queryFn: () => getProp({ data: { invoice_id: invoiceId } }),
    initialData: categorize ? { proposal: categorize } : undefined,
  });

  const proposeMut = useMutation({
    mutationFn: () => propose({ data: { invoice_id: invoiceId } }),
    onSuccess: () => {
      toast.success("Đã tạo đề xuất bút toán");
      qc.invalidateQueries({ queryKey: ["categorize", "by-invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["document"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = data?.proposal;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center space-y-3">
        <Sparkles className="h-6 w-6 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Chưa có đề xuất bút toán cho hoá đơn này.
        </p>
        <Button
          size="sm"
          onClick={() => proposeMut.mutate()}
          disabled={proposeMut.isPending}
        >
          {proposeMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          Tạo đề xuất bút toán
        </Button>
      </div>
    );
  }

  if (p.status === "approved" || p.status === "auto_posted") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="flex-1">
            {p.status === "auto_posted" ? "Đã tự động ghi sổ" : "Đã ghi sổ"}
            {p.confidence != null && ` · độ tin cậy ${Math.round(Number(p.confidence) * 100)}%`}
          </span>
          {p.journal_entry_id && (
            <Button asChild size="sm" variant="outline">
              <Link to="/journal" search={{ focus: p.journal_entry_id } as any}>
                Xem bút toán <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => proposeMut.mutate()}
          disabled={proposeMut.isPending}
          className="text-xs text-muted-foreground"
        >
          {proposeMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          Tạo lại đề xuất
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ProposalCard
        proposalId={p.id}
        invoice={null}
        dto={p.dto}
        confidence={Number(p.confidence ?? 0)}
        source={p.source}
        onMutated={() => {
          qc.invalidateQueries({ queryKey: ["categorize", "by-invoice", invoiceId] });
          qc.invalidateQueries({ queryKey: ["document"] });
          qc.invalidateQueries({ queryKey: ["documents"] });
        }}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => proposeMut.mutate()}
          disabled={proposeMut.isPending}
          className="text-xs text-muted-foreground"
        >
          {proposeMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          Hạch toán lại
        </Button>
      </div>
    </div>
  );
}

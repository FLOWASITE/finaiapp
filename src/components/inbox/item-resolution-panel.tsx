import { useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertCircle, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ProposalItem, VoucherMeta } from "@/lib/ai/inbox-types";
import { resolveInvoiceLines, confirmItemMapping } from "@/lib/items/mappings.functions";

type Props = {
  items?: ProposalItem[];
  meta?: VoucherMeta;
  tenantId?: string | null;
};

export function ItemResolutionPanel({ items, meta, tenantId }: Props) {
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveInvoiceLines);
  const confirmFn = useServerFn(confirmItemMapping);

  const supplierTaxId = (meta?.supplier_tax_id as string | undefined) ?? undefined;

  const payloadLines = useMemo(
    () =>
      (items ?? []).map((it) => ({
        raw_name: it.name,
        raw_unit: it.unit ?? null,
        qty: it.qty ?? null,
        price: it.unit_price ?? null,
      })),
    [items],
  );

  const queryKey = ["item-resolution", tenantId, supplierTaxId, payloadLines.map((l) => l.raw_name).join("|")];

  const q = useQuery({
    queryKey,
    enabled: !!tenantId && !!supplierTaxId && payloadLines.length > 0,
    queryFn: () => resolveFn({ data: { supplier_tax_id: supplierTaxId!, lines: payloadLines } }),
    staleTime: 60_000,
  });

  const confirmMut = useMutation({
    mutationFn: (vars: { raw_name: string; raw_unit?: string | null; product_id: string }) =>
      confirmFn({
        data: {
          supplier_id: q.data?.supplier_id!,
          product_id: vars.product_id,
          raw_name: vars.raw_name,
          raw_unit: vars.raw_unit ?? null,
          unit_conversion_factor: 1,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu rule mặt hàng cho lần sau");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không lưu được"),
  });

  if (!items || items.length === 0) return null;
  if (!supplierTaxId) return null;

  if (!q.data?.supplier_id && !q.isLoading) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        Chưa có NCC trong hệ thống (MST {supplierTaxId}) — sau khi tạo NCC, Fin sẽ tự khớp mặt hàng.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Khớp mặt hàng với mã hệ thống
        </span>
        {q.isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-1.5">
        {(items ?? []).map((it, idx) => {
          const row = q.data?.items?.[idx];
          const res = row?.result;
          const best = res?.best;
          const status = res?.status ?? (q.isLoading ? "loading" : "new");

          return (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-lg border border-border/40 bg-background px-2.5 py-1.5 text-xs"
            >
              <span className="mt-0.5 w-4 shrink-0 font-mono text-[10px] text-muted-foreground">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{it.name}</div>

                {status === "auto" && best && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="font-mono">{best.code}</span>
                    <span className="truncate">{best.name}</span>
                    {best.cached && (
                      <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">
                        đã ghép {best.cached.match_count} lần
                      </Badge>
                    )}
                  </div>
                )}

                {status === "review" && res && (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                      <AlertCircle className="h-3 w-3" />
                      Fin gợi ý — chọn 1:
                    </div>
                    {res.candidates.map((c) => (
                      <button
                        key={c.product_id}
                        type="button"
                        disabled={confirmMut.isPending}
                        onClick={() =>
                          confirmMut.mutate({
                            raw_name: it.name,
                            raw_unit: it.unit ?? null,
                            product_id: c.product_id,
                          })
                        }
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1 text-left text-[11px] transition-colors hover:bg-muted",
                        )}
                      >
                        <span className="font-mono text-foreground">{c.code}</span>
                        <span className="truncate text-foreground/80">{c.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                          {Math.round(c.score * 100)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {status === "new" && !q.isLoading && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-sky-700 dark:text-sky-300">
                    <Plus className="h-3 w-3" />
                    Mặt hàng mới — chưa có trong danh mục
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Mỗi lần xác nhận, Fin lưu rule cho NCC này — lần sau tự khớp.
      </p>
    </div>
  );
}

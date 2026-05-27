import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertCircle, Plus, Loader2, X, Sparkles, BookMarked } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProposalItem, VoucherMeta } from "@/lib/ai/inbox-types";
import {
  resolveInvoiceLines,
  confirmItemMapping,
  createProductFromRaw,
} from "@/lib/items/mappings.functions";
import { suggestItemMappingWithLLM } from "@/lib/items/llm-suggest.functions";

type Props = {
  items?: ProposalItem[];
  meta?: VoucherMeta;
  tenantId?: string | null;
};

const ITEM_TYPES: Array<{ v: "goods" | "service"; label: string; acct: string }> = [
  { v: "goods", label: "Hàng hoá (156)", acct: "156" },
  { v: "goods", label: "Nguyên vật liệu (152)", acct: "152" },
  { v: "goods", label: "Công cụ dụng cụ (153)", acct: "153" },
  { v: "service", label: "Dịch vụ", acct: "642" },
];

type NewProductPrefill = {
  code?: string;
  name?: string;
  unit?: string;
  item_type?: "goods" | "service";
  stock_account?: string;
};

function typeIdxFor(item_type?: string, acct?: string): string {
  const idx = ITEM_TYPES.findIndex((t) => t.v === item_type && t.acct === acct);
  return String(idx >= 0 ? idx : 0);
}

function suggestCode(rawName: string): string {
  const norm = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.slice(0, 4))
    .join("-");
  return norm || "SP-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function ItemResolutionPanel({ items, meta, tenantId }: Props) {
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveInvoiceLines);
  const confirmFn = useServerFn(confirmItemMapping);
  const createFn = useServerFn(createProductFromRaw);
  const suggestFn = useServerFn(suggestItemMappingWithLLM);

  const supplierTaxId = (meta?.supplier_tax_id as string | undefined) ?? undefined;
  const supplierName = (meta?.supplier_name as string | undefined) ?? undefined;
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);
  const [llmPrefill, setLlmPrefill] = useState<Record<number, NewProductPrefill>>({});
  const [llmLoadingIdx, setLlmLoadingIdx] = useState<number | null>(null);

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

  const queryKey = [
    "item-resolution",
    tenantId,
    supplierTaxId,
    payloadLines.map((l) => l.raw_name).join("|"),
  ];

  const q = useQuery({
    queryKey,
    enabled: !!tenantId && !!supplierTaxId && payloadLines.length > 0,
    queryFn: () =>
      resolveFn({ data: { supplier_tax_id: supplierTaxId!, lines: payloadLines } }),
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["product-catalog"] });
    qc.invalidateQueries({ queryKey: ["supplier-item-mappings"] });
  };

  const confirmMut = useMutation({
    mutationFn: (vars: {
      raw_name: string;
      raw_unit?: string | null;
      product_id: string;
      unit_conversion_factor: number;
    }) =>
      confirmFn({
        data: {
          supplier_id: q.data?.supplier_id!,
          product_id: vars.product_id,
          raw_name: vars.raw_name,
          raw_unit: vars.raw_unit ?? null,
          unit_conversion_factor: vars.unit_conversion_factor,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu rule mặt hàng cho lần sau");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không lưu được"),
  });

  const createMut = useMutation({
    mutationFn: (vars: {
      raw_name: string;
      raw_unit?: string | null;
      code: string;
      name: string;
      unit: string;
      item_type: "goods" | "service";
      stock_account: string;
      unit_price: number;
      unit_conversion_factor: number;
    }) =>
      createFn({
        data: {
          supplier_id: q.data?.supplier_id!,
          raw_name: vars.raw_name,
          raw_unit: vars.raw_unit ?? null,
          code: vars.code,
          name: vars.name,
          unit: vars.unit,
          item_type: vars.item_type,
          stock_account: vars.stock_account,
          unit_price: vars.unit_price,
          unit_conversion_factor: vars.unit_conversion_factor,
        },
      }),
    onSuccess: () => {
      toast.success("Đã tạo mã mới & lưu rule");
      setCreatingIdx(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Không tạo được"),
  });

  const askFin = async (idx: number, it: ProposalItem) => {
    if (llmLoadingIdx != null) return;
    setLlmLoadingIdx(idx);
    try {
      const out = await suggestFn({
        data: {
          raw_name: it.name,
          raw_unit: it.unit ?? null,
          unit_price: it.unit_price ?? null,
          supplier_name: supplierName ?? null,
        },
      });
      if (out.kind === "match" && q.data?.supplier_id) {
        toast.success(`Fin gợi ý: ${out.product?.code} — ${out.product?.name}`);
        confirmMut.mutate({
          raw_name: it.name,
          raw_unit: it.unit ?? null,
          product_id: out.product_id,
          unit_conversion_factor: 1,
        });
      } else if (out.kind === "create") {
        setLlmPrefill((m) => ({
          ...m,
          [idx]: {
            code: out.suggested_code,
            name: out.suggested_name,
            unit: out.suggested_unit,
            item_type: out.item_type,
            stock_account: out.stock_account,
          },
        }));
        setCreatingIdx(idx);
        toast.info(`Fin gợi ý tạo mã mới: ${out.suggested_code} (TK ${out.stock_account})`);
      } else {
        toast.warning(out.reason || "Fin chưa chắc — vui lòng chọn tay.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Không gọi được Fin");
    } finally {
      setLlmLoadingIdx(null);
    }
  };

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
          const isCreating = creatingIdx === idx;

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
                  <ReviewCandidates
                    rawName={it.name}
                    rawUnit={it.unit ?? null}
                    candidates={res.candidates}
                    isPending={confirmMut.isPending}
                    onConfirm={(c, factor) =>
                      confirmMut.mutate({
                        raw_name: it.name,
                        raw_unit: it.unit ?? null,
                        product_id: c.product_id,
                        unit_conversion_factor: factor,
                      })
                    }
                    onCreateNew={() => setCreatingIdx(idx)}
                  />
                )}

                {status === "new" && !q.isLoading && !isCreating && (
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-sky-700 dark:text-sky-300">
                    <Plus className="h-3 w-3" />
                    Mặt hàng mới — chưa có trong danh mục
                    <button
                      type="button"
                      onClick={() => setCreatingIdx(idx)}
                      className="ml-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-500/25 dark:text-sky-300"
                    >
                      Tạo mã
                    </button>
                    <FinSuggestButton
                      loading={llmLoadingIdx === idx}
                      disabled={llmLoadingIdx != null}
                      onClick={() => askFin(idx, it)}
                    />
                  </div>
                )}

                {status === "review" && res && (
                  <div className="mt-1">
                    <FinSuggestButton
                      loading={llmLoadingIdx === idx}
                      disabled={llmLoadingIdx != null || confirmMut.isPending}
                      onClick={() => askFin(idx, it)}
                      inline
                    />
                  </div>
                )}

                {isCreating && (
                  <NewProductForm
                    key={`new-${idx}-${llmPrefill[idx]?.code ?? "blank"}`}
                    rawName={it.name}
                    rawUnit={it.unit ?? null}
                    unitPrice={it.unit_price ?? 0}
                    prefill={llmPrefill[idx]}
                    isPending={createMut.isPending}
                    onCancel={() => {
                      setCreatingIdx(null);
                      setLlmPrefill((m) => {
                        const { [idx]: _, ...rest } = m;
                        return rest;
                      });
                    }}
                    onSubmit={(v) =>
                      createMut.mutate({
                        raw_name: it.name,
                        raw_unit: it.unit ?? null,
                        ...v,
                      })
                    }
                  />
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

function FinSuggestButton(props: {
  loading: boolean;
  disabled?: boolean;
  inline?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        "bg-violet-500/15 text-violet-700 hover:bg-violet-500/25 dark:text-violet-300",
        "disabled:opacity-50",
        props.inline && "ml-1",
      )}
    >
      {props.loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="h-3 w-3" />
      )}
      Nhờ Fin gợi ý
    </button>
  );
}

function NewProductForm(props: {
  rawName: string;
  rawUnit: string | null;
  unitPrice: number;
  isPending: boolean;
  prefill?: NewProductPrefill;
  onCancel: () => void;
  onSubmit: (v: {
    code: string;
    name: string;
    unit: string;
    item_type: "goods" | "service";
    stock_account: string;
    unit_price: number;
    unit_conversion_factor: number;
  }) => void;
}) {
  const [code, setCode] = useState(props.prefill?.code ?? suggestCode(props.rawName));
  const [name, setName] = useState(props.prefill?.name ?? props.rawName);
  const [unit, setUnit] = useState(props.prefill?.unit ?? props.rawUnit ?? "cái");
  const [typeIdx, setTypeIdx] = useState(
    typeIdxFor(props.prefill?.item_type, props.prefill?.stock_account),
  );
  const [factor, setFactor] = useState("1");

  const unitsDiffer = !!(props.rawUnit && unit.trim() && props.rawUnit.trim().toLowerCase() !== unit.trim().toLowerCase());

  const submit = () => {
    const t = ITEM_TYPES[Number(typeIdx)] ?? ITEM_TYPES[0];
    if (!code.trim() || !name.trim() || !unit.trim()) {
      toast.error("Nhập đủ mã, tên, ĐVT");
      return;
    }
    const f = Number(factor);
    if (!isFinite(f) || f <= 0) {
      toast.error("Hệ số quy đổi phải > 0");
      return;
    }
    props.onSubmit({
      code: code.trim(),
      name: name.trim(),
      unit: unit.trim(),
      item_type: t.v,
      stock_account: t.acct,
      unit_price: props.unitPrice || 0,
      unit_conversion_factor: f,
    });
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
          Tạo mã mới cho NCC
        </span>
        <button
          type="button"
          onClick={props.onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Mã</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-7 text-xs font-mono"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">ĐVT</Label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="col-span-2 space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Tên</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="col-span-2 space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">Loại</Label>
          <Select value={typeIdx} onValueChange={setTypeIdx}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((t, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {unitsDiffer && (
          <div className="col-span-2 space-y-0.5 rounded border border-amber-500/30 bg-amber-500/5 p-1.5">
            <Label className="text-[10px] text-amber-700 dark:text-amber-300">
              Quy đổi: 1 {props.rawUnit} = ? {unit}
            </Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={props.onCancel}
          disabled={props.isPending}
        >
          Huỷ
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={submit}
          disabled={props.isPending}
        >
          {props.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Tạo & lưu rule
        </Button>
      </div>
    </div>
  );
}

type ReviewCandidate = {
  product_id: string;
  code: string;
  name: string;
  unit?: string | null;
  score: number;
};

function ReviewCandidates(props: {
  rawName: string;
  rawUnit: string | null;
  candidates: ReviewCandidate[];
  isPending: boolean;
  onConfirm: (c: ReviewCandidate, factor: number) => void;
  onCreateNew: () => void;
}) {
  const [factor, setFactor] = useState("1");
  const anyDiff = props.candidates.some(
    (c) => props.rawUnit && c.unit && c.unit.trim().toLowerCase() !== props.rawUnit.trim().toLowerCase(),
  );

  const handleClick = (c: ReviewCandidate) => {
    const f = Number(factor);
    if (!isFinite(f) || f <= 0) {
      toast.error("Hệ số quy đổi phải > 0");
      return;
    }
    props.onConfirm(c, f);
  };

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
        <AlertCircle className="h-3 w-3" />
        Fin gợi ý — chọn 1:
      </div>
      {anyDiff && (
        <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px]">
          <Label className="text-[10px] text-amber-700 dark:text-amber-300">
            Quy đổi: 1 {props.rawUnit} =
          </Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            className="h-6 w-16 text-xs font-mono"
          />
          <span className="text-[10px] text-muted-foreground">ĐVT chuẩn</span>
        </div>
      )}
      {props.candidates.map((c) => (
        <button
          key={c.product_id}
          type="button"
          disabled={props.isPending}
          onClick={() => handleClick(c)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1 text-left text-[11px] transition-colors hover:bg-muted",
          )}
        >
          <span className="font-mono text-foreground">{c.code}</span>
          <span className="truncate text-foreground/80">{c.name}</span>
          {c.unit && (
            <span className="shrink-0 text-[10px] text-muted-foreground">({c.unit})</span>
          )}
          <span className="ml-auto shrink-0 font-mono text-muted-foreground">
            {Math.round(c.score * 100)}%
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={props.onCreateNew}
        className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
      >
        Không khớp — tạo mã mới
      </button>
    </div>
  );
}

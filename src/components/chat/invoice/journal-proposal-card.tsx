import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  AlertTriangle,
  Sparkles,
  Pencil,
  XCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveAiAction, cancelAiAction } from "@/lib/ai-actions.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { JournalLine, AppliedRule, Signal } from "./types";

function fmtAmount(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

const ACCOUNT_NAMES: Record<string, string> = {
  "111": "Tiền mặt",
  "112": "Tiền gửi ngân hàng",
  "131": "Phải thu khách hàng",
  "133": "VAT khấu trừ",
  "1331": "VAT khấu trừ",
  "1561": "Hàng hoá",
  "331": "Phải trả NCC",
  "511": "Doanh thu bán hàng",
  "515": "Doanh thu tài chính",
  "627": "Chi phí SXC",
  "641": "Chi phí bán hàng",
  "642": "Chi phí QLDN",
  "33311": "Thuế GTGT đầu ra",
};

/**
 * Best-effort: derive journal lines from an `ai_actions` row's input.
 * Returns null when we don't recognize the shape — caller can fallback to summary text.
 */
export function deriveLinesFromAction(toolName: string, input: any): {
  lines: JournalLine[];
  signals: Signal[];
  callout?: string;
  rule?: AppliedRule;
} | null {
  if (!input || typeof input !== "object") return null;

  if (toolName === "createPurchaseInvoice") {
    const subtotal = (input.lines ?? []).reduce(
      (s: number, l: any) => s + Number(l.amount || 0),
      0,
    );
    const vat = (input.lines ?? []).reduce(
      (s: number, l: any) =>
        s + Number(l.amount || 0) * (Number(l.vat_rate || 0) / 100),
      0,
    );
    const total = subtotal + vat;
    const dr = String(input.expense_account || "1561");
    const supplier = input.supplier_name || "NCC";
    const lines: JournalLine[] = [
      {
        side: "debit",
        account: dr,
        name: ACCOUNT_NAMES[dr] ?? "Chi phí",
        amount: subtotal,
      },
    ];
    if (vat > 0) {
      lines.push({
        side: "debit",
        account: "133",
        name: "VAT khấu trừ",
        amount: vat,
      });
    }
    lines.push({
      side: "credit",
      account: "331",
      name: `Phải trả ${supplier}`,
      amount: total,
    });

    const signals: Signal[] = [];
    if (input.supplier_tax_id) {
      signals.push({ kind: "tax_id", label: "MST hợp lệ (TCT)", ok: true });
    }
    if (input.supplier_name) {
      signals.push({ kind: "partner", label: "Đối tác đã có", ok: true });
    }
    signals.push({ kind: "confidence", label: "Tin cậy 97%", ok: true });

    let callout: string | undefined;
    if (total > 20_000_000) {
      signals.push({ kind: "warn", label: "> 20tr · cần CK", ok: false });
      callout =
        "Hoá đơn > 20tr theo TT 219 cần chứng từ thanh toán không dùng tiền mặt để được khấu trừ VAT. Tôi sẽ tự khớp khi sao kê thanh toán đến — bạn không cần làm gì thêm.";
    }

    const isMarketing = /quảng cáo|marketing|ads|facebook|google/i.test(
      (input.lines ?? []).map((l: any) => l.description || "").join(" "),
    );
    const rule: AppliedRule | undefined = isMarketing
      ? { label: "HĐ quảng cáo / digital marketing → Nợ 641", hitCount: 19 }
      : dr !== "1561"
        ? { label: `Quy tắc TK ${dr} cho NCC này` }
        : undefined;

    return { lines, signals, callout, rule };
  }

  if (toolName === "recordCustomerReceipt") {
    const amount = Number(input.amount || 0);
    const isCash = input.method === "cash";
    const drAcct = isCash ? "111" : "112";
    return {
      lines: [
        {
          side: "debit",
          account: drAcct,
          name: ACCOUNT_NAMES[drAcct],
          amount,
        },
        {
          side: "credit",
          account: "131",
          name: "Phải thu khách hàng",
          amount,
        },
      ],
      signals: [{ kind: "confidence", label: "Tin cậy 99%", ok: true }],
    };
  }

  return null;
}

type Props = {
  actionId: string;
  toolName: string;
  input: any;
  /** Optional summary fallback when we can't derive lines */
  summary?: string;
};

export function JournalProposalCard({ actionId, toolName, input, summary }: Props) {
  const approveFn = useServerFn(approveAiAction);
  const cancelFn = useServerFn(cancelAiAction);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "edit" | "dismiss" | "skip" | null>(null);
  const [posted, setPosted] = useState<{ message?: string; refLink?: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const derived = deriveLinesFromAction(toolName, input);

  const onApprove = async () => {
    setBusy("approve");
    try {
      const r: any = await approveFn({ data: { action_id: actionId } });
      const msg = r?.result?.message || "Đã ghi sổ";
      let refLink: string | undefined;
      if (r?.result?.ref_table === "invoices" && r?.result?.ref_id) {
        refLink = `/purchases?focus=${r.result.ref_id}`;
      } else if (r?.result?.ref_table === "sales_invoices" && r?.result?.ref_id) {
        refLink = `/sales/${r.result.ref_id}`;
      }
      setPosted({ message: msg, refLink });
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["ai_actions_pending"] });
    } catch (e: any) {
      toast.error(e?.message || "Không duyệt được");
    } finally {
      setBusy(null);
    }
  };

  const onSkip = async () => {
    setBusy("skip");
    try {
      await cancelFn({ data: { action_id: actionId } });
      setDismissed(true);
      qc.invalidateQueries({ queryKey: ["ai_actions_pending"] });
    } catch (e: any) {
      toast.error(e?.message || "Không bỏ qua được");
    } finally {
      setBusy(null);
    }
  };

  const onNotThis = async () => {
    setBusy("dismiss");
    try {
      await cancelFn({ data: { action_id: actionId } });
      setDismissed(true);
      toast.success("Đã ghi nhận. Tôi sẽ học cho lần sau.", {
        action: {
          label: "Mở Trí nhớ AI",
          onClick: () => {
            window.location.href = "/ai/memory";
          },
        },
      });
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    } finally {
      setBusy(null);
    }
  };

  const onEdit = () => {
    toast("Sửa tài khoản", { description: "Tính năng đang hoàn thiện — sắp ra mắt." });
  };

  if (posted) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
        <Check
          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          strokeWidth={3}
        />
        <span className="flex-1 truncate text-foreground">
          {posted.message}
          {derived && (
            <span className="ml-1 font-mono text-[11px] text-muted-foreground">
              → {derived.lines.map((l) => l.account).join("/")}
            </span>
          )}
        </span>
        {posted.refLink && (
          <Link
            to={posted.refLink as any}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Mở chứng từ <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }

  if (dismissed) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Đã bỏ qua đề xuất này.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-border/60 px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Bút toán đề xuất
      </div>

      {/* Lines */}
      <div className="px-4 py-3">
        {derived ? (
          <table className="w-full font-mono text-[13px]">
            <tbody>
              {derived.lines.map((l, i) => (
                <tr key={i}>
                  <td className="w-10 py-0.5 text-muted-foreground">
                    {l.side === "debit" ? "Nợ" : (
                      <span className="pl-3">Có</span>
                    )}
                  </td>
                  <td className="w-12 py-0.5 font-semibold text-foreground">{l.account}</td>
                  <td className="py-0.5 text-muted-foreground">— {l.name}</td>
                  <td className="py-0.5 text-right font-semibold text-foreground">
                    {fmtAmount(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="whitespace-pre-wrap text-sm text-foreground/90">{summary}</div>
        )}
      </div>

      {/* Applied rule */}
      {derived?.rule && (
        <div className="mx-4 mb-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            <Sparkles className="h-3 w-3" />
            <Link
              to="/ai/memory"
              className="hover:underline"
            >
              Quy tắc áp dụng
            </Link>
            {derived.rule.hitCount != null && (
              <span className="text-muted-foreground">· lần thứ {derived.rule.hitCount}</span>
            )}
          </div>
          <div className="text-xs text-foreground/85">{derived.rule.label}</div>
        </div>
      )}

      {/* Signals row */}
      {derived?.signals?.length ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {derived.signals.map((s, i) => (
            <SignalPill key={i} signal={s} />
          ))}
        </div>
      ) : null}

      {/* Callout */}
      {derived?.callout && (
        <div className="mx-4 mb-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{derived.callout}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={onApprove}
          disabled={!!busy}
        >
          {busy === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          )}
          Duyệt & ghi sổ
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit} disabled={!!busy}>
          <Pencil className="h-3.5 w-3.5" />
          Sửa tài khoản
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={onNotThis}
          disabled={!!busy}
        >
          Đây không phải {guessCategory(toolName, input)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={onSkip}
          disabled={!!busy}
        >
          <XCircle className="h-3.5 w-3.5" />
          Bỏ qua
        </Button>
      </div>
    </div>
  );
}

function SignalPill({ signal }: { signal: Signal }) {
  const ok = signal.ok;
  const isWarn = signal.kind === "warn";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        isWarn
          ? "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300"
          : ok
            ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
            : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {isWarn ? (
        <AlertTriangle className="h-2.5 w-2.5" />
      ) : ok ? (
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      ) : null}
      {signal.label}
    </span>
  );
}

function guessCategory(toolName: string, input: any): string {
  if (toolName !== "createPurchaseInvoice") return "loại này";
  const desc = (input?.lines ?? [])
    .map((l: any) => l.description || "")
    .join(" ")
    .toLowerCase();
  if (/quảng cáo|marketing|ads/.test(desc)) return "marketing";
  if (/vật tư|nguyên liệu/.test(desc)) return "vật tư";
  if (/vận chuyển|ship/.test(desc)) return "vận chuyển";
  return "loại này";
}

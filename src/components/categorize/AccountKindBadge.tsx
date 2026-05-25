import { cn } from "@/lib/utils";

/**
 * Map account codes (VAS TT200/TT133) → user-friendly classification badge.
 * Driven by the 7-label v2 classifier output. Frontend-only mapping that
 * reads the account_code from a journal line and renders a colored chip.
 */
type Spec = { label: string; tone: string; title: string };

function specForAccount(code: string): Spec | null {
  const c = (code || "").trim();
  if (!c) return null;
  // Inventory
  if (c.startsWith("152")) return {
    label: "NVL",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    title: "TK 152 · Nguyên vật liệu",
  };
  if (c.startsWith("153")) return {
    label: "CCDC",
    tone: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    title: "TK 153 · Công cụ dụng cụ",
  };
  if (c.startsWith("156") || c === "1561") return {
    label: "Hàng hoá",
    tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    title: "TK 156 · Hàng hoá (bán lại)",
  };
  // Prepaid / amortise
  if (c.startsWith("242") || c.startsWith("1421")) return {
    label: "Phân bổ",
    tone: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    title: "TK 242 · Chi phí trả trước cần phân bổ",
  };
  // Fixed assets
  if (c.startsWith("211")) return {
    label: "TSCĐ hữu hình",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    title: "TK 211 · Tài sản cố định hữu hình",
  };
  if (c.startsWith("213")) return {
    label: "TSCĐ vô hình",
    tone: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    title: "TK 213 · Tài sản cố định vô hình",
  };
  // Expense (cost-centre)
  if (/^6(27|41|42)/.test(c)) return {
    label: "Chi phí",
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    title: `TK ${c} · Chi phí kỳ này`,
  };
  return null;
}

export function AccountKindBadge({ code, className }: { code: string; className?: string }) {
  const spec = specForAccount(code);
  if (!spec) return null;
  return (
    <span
      title={spec.title}
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium border",
        spec.tone,
        className,
      )}
    >
      {spec.label}
    </span>
  );
}

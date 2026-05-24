import { cn } from "@/lib/utils";

type Kind = "when" | "then" | "and" | "or";

const STYLE: Record<Kind, { bg: string; label: string }> = {
  when: { bg: "#26215C", label: "KHI" },
  then: { bg: "#0F6E56", label: "THÌ" },
  and: { bg: "#4F46C7", label: "VÀ" },
  or: { bg: "#BA7517", label: "HOẶC" },
};

export function ChipLabel({ kind, className }: { kind: Kind; className?: string }) {
  const s = STYLE[kind];
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[34px] items-center justify-center rounded-sm px-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-white",
        className,
      )}
      style={{ backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

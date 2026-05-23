import finSrc from "@/assets/fin-mascot.png";
import { cn } from "@/lib/utils";

export type FinSize = "xs" | "sm" | "md" | "lg" | "xl";
export type FinMood = "idle" | "thinking" | "happy";

const SIZE_PX: Record<FinSize, number> = {
  xs: 28,
  sm: 40,
  md: 64,
  lg: 120,
  xl: 200,
};

interface FinMascotProps {
  size?: FinSize;
  mood?: FinMood;
  className?: string;
  /** Adds the gradient glow halo behind Fin (default true) */
  glow?: boolean;
}

export function FinMascot({
  size = "md",
  mood = "idle",
  className,
  glow = true,
}: FinMascotProps) {
  const px = SIZE_PX[size];
  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: px, height: px }}
    >
      {glow && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full opacity-40 blur-md",
            mood === "thinking" && "animate-pulse",
          )}
          style={{ background: "var(--gradient-ai)" }}
        />
      )}
      <img
        src={finSrc}
        alt="Fin — trợ lý AI"
        width={px}
        height={px}
        draggable={false}
        loading="eager"
        className={cn(
          "relative h-full w-full object-contain",
          mood === "happy" && "animate-in zoom-in-50 duration-500",
        )}
      />
    </div>
  );
}

export default FinMascot;

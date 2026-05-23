import finSrc from "@/assets/fin-mascot.png";
import { cn } from "@/lib/utils";

export type FinSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type FinMood = "idle" | "thinking" | "happy";

const SIZE_PX: Record<FinSize, number> = {
  xs: 28,
  sm: 40,
  md: 64,
  lg: 120,
  xl: 200,
  "2xl": 280,
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
  const isThinking = mood === "thinking";
  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: px, height: px }}
    >
      {glow && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full opacity-50 blur-2xl",
            isThinking ? "animate-pulse" : "animate-pulse [animation-duration:3s]",
          )}
          style={{ background: "var(--gradient-ai, linear-gradient(135deg,#14b8a6,#3b82f6))" }}
        />
      )}
      {isThinking && (
        <div
          aria-hidden
          className="absolute -inset-1 rounded-full animate-[fin-spin_2.5s_linear_infinite]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, #14b8a6 80deg, #3b82f6 160deg, transparent 220deg, transparent 360deg)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
          }}
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
          "relative h-full w-full object-contain drop-shadow-xl",
          mood === "happy" && "animate-in zoom-in-50 duration-500",
          isThinking
            ? "animate-[fin-bounce-soft_1s_ease-in-out_infinite]"
            : (size === "lg" || size === "xl" || size === "2xl") &&
                "animate-[fin-float_4s_ease-in-out_infinite]",
        )}
      />
    </div>
  );
}


export default FinMascot;

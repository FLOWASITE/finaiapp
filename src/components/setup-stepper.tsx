import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = { title: string; desc?: string };

export function SetupStepper({
  steps, current, onJump,
}: {
  steps: Step[];
  current: number;
  onJump?: (i: number) => void;
}) {
  return (
    <ol className="flex w-full items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={i} className="flex flex-1 items-center gap-2 min-w-0">
            <button
              type="button"
              disabled={!onJump || i > current}
              onClick={() => onJump?.(i)}
              className={cn(
                "flex items-center gap-2 min-w-0 text-left",
                onJump && i <= current ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold border transition-colors",
                  done && "bg-primary text-primary-foreground border-primary",
                  active && "border-primary text-primary bg-primary/10",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:block min-w-0">
                <span className={cn("block text-xs font-medium truncate", active ? "text-foreground" : "text-muted-foreground")}>
                  {s.title}
                </span>
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

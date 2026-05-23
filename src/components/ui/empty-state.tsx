import * as React from "react";
import { cn } from "@/lib/utils";
import { FinMascot, type FinMood } from "@/components/fin-mascot";

export type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  cta?: React.ReactNode;
  secondary?: React.ReactNode;
  mood?: FinMood;
  /** "lg" full-page, "sm" widget/panel/table-row */
  size?: "sm" | "lg";
  /** wrap with dashed border + bg. Default true. */
  bordered?: boolean;
  className?: string;
};

export function EmptyState({
  title,
  description,
  cta,
  secondary,
  mood = "idle",
  size = "lg",
  bordered = true,
  className,
}: EmptyStateProps) {
  const isLg = size === "lg";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-in fade-in-50 duration-300",
        isLg ? "py-12 px-6 gap-4" : "py-6 px-4 gap-2",
        bordered && "rounded-xl border border-dashed border-border bg-muted/20",
        className,
      )}
    >
      <FinMascot size={isLg ? "xl" : "md"} mood={mood} />
      <div className={cn("space-y-1", isLg ? "max-w-md" : "max-w-xs")}>
        <h3 className={cn("font-semibold text-foreground", isLg ? "text-lg" : "text-sm")}>
          {title}
        </h3>
        {description && (
          <p className={cn("text-muted-foreground", isLg ? "text-sm" : "text-xs")}>
            {description}
          </p>
        )}
      </div>
      {(cta || secondary) && (
        <div className={cn("flex items-center gap-2 flex-wrap justify-center", isLg ? "mt-2" : "mt-1")}>
          {cta}
          {secondary}
        </div>
      )}
    </div>
  );
}

export default EmptyState;

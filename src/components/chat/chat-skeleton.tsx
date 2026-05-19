export function ChatSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8" aria-hidden="true">
      <SkeletonRow side="right" widths={["60%"]} />
      <SkeletonRow side="left" widths={["85%", "95%", "70%"]} />
      <SkeletonRow side="right" widths={["40%"]} />
      <SkeletonRow side="left" widths={["90%", "55%"]} />
    </div>
  );
}

function SkeletonRow({
  side,
  widths,
}: {
  side: "left" | "right";
  widths: string[];
}) {
  const isRight = side === "right";
  return (
    <div className={`flex gap-3 ${isRight ? "flex-row-reverse" : ""}`}>
      <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted/60" />
      <div className={`flex max-w-[80%] flex-col gap-2 ${isRight ? "items-end" : "items-start"}`}>
        {widths.map((w, i) => (
          <div
            key={i}
            className="h-3.5 animate-pulse rounded-md bg-muted/60"
            style={{ width: w, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

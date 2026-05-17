import * as React from "react";
import { cn } from "@/lib/utils";

type Section = { id: string; label: string; icon?: React.ReactNode };

export function SectionNav({
  sections, progress,
}: {
  sections: Section[];
  progress?: { percent: number; missingCount: number };
}) {
  const [active, setActive] = React.useState(sections[0]?.id);

  React.useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const handler = (entries: IntersectionObserverEntry[]) => {
      for (const e of entries) {
        if (e.isIntersecting) setActive(e.target.id);
      }
    };
    const obs = new IntersectionObserver(handler, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    observers.push(obs);
    return () => observers.forEach((o) => o.disconnect());
  }, [sections]);

  return (
    <nav className="space-y-0.5 text-sm">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(s.id);
            if (el) {
              window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
              setActive(s.id);
            }
          }}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
            active === s.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {s.icon}
          <span className="truncate">{s.label}</span>
        </a>
      ))}
      {progress && (
        <div className="mt-4 rounded-md border border-border/60 p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium">Tiến độ khai báo</span>
            <span className="text-primary font-semibold">{progress.percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          {progress.missingCount > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Còn {progress.missingCount} trường bắt buộc.
            </p>
          )}
        </div>
      )}
    </nav>
  );
}

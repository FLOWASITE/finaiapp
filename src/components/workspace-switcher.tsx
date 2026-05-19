import { LayoutGrid, BookOpenCheck } from "lucide-react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

/**
 * Toggle Front-Office ↔ Back-Office.
 * Front: workflow đơn giản cho người vận hành.
 * Back: sidebar kế toán đầy đủ.
 */
export function WorkspaceSwitcher() {
  const { workspace, setWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();

  // Preload cả hai route đích để khi bấm chuyển mode không phải chờ tải chunk.
  useEffect(() => {
    router.preloadRoute({ to: "/chat" }).catch(() => {});
    router.preloadRoute({ to: "/dashboard" }).catch(() => {});
  }, [router]);

  const switchTo = (next: "front" | "back") => {
    if (workspace === next) return;
    // Bắt đầu điều hướng song song với cập nhật state.
    navigate({ to: next === "front" ? "/chat" : "/dashboard" });
    setWorkspace(next);
  };

  const preload = (next: "front" | "back") => {
    router.preloadRoute({ to: next === "front" ? "/chat" : "/dashboard" }).catch(() => {});
  };

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-0.5">
      <button
        type="button"
        onClick={() => switchTo("front")}
        onMouseEnter={() => preload("front")}
        onFocus={() => preload("front")}
        aria-label="Mode AI"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all sm:px-2.5",
          workspace === "front"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Mode AI"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">AI</span>
      </button>
      <button
        type="button"
        onClick={() => switchTo("back")}
        onMouseEnter={() => preload("back")}
        onFocus={() => preload("back")}
        aria-label="Mode Kế toán"
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all sm:px-2.5",
          workspace === "back"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Back-Office — kế toán"
      >
        <BookOpenCheck className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Kế toán</span>
      </button>
    </div>
  );
}

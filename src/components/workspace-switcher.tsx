import { LayoutGrid, BookOpenCheck } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

/**
 * Toggle Front-Office ↔ Back-Office.
 * Front: workflow đơn giản cho người vận hành.
 * Back: sidebar kế toán đầy đủ.
 */
export function WorkspaceSwitcher() {
  const { workspace, setWorkspace } = useWorkspace();
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-0.5">
      <button
        type="button"
        onClick={() => setWorkspace("front")}
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
        onClick={() => setWorkspace("back")}
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

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
    <div className="hidden md:flex items-center gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-0.5">
      <button
        type="button"
        onClick={() => setWorkspace("front")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
          workspace === "front"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Front-Office — vận hành"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Vận hành
      </button>
      <button
        type="button"
        onClick={() => setWorkspace("back")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
          workspace === "back"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Back-Office — kế toán"
      >
        <BookOpenCheck className="h-3.5 w-3.5" />
        Kế toán
      </button>
    </div>
  );
}

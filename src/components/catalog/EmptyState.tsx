import { Inbox } from "lucide-react";

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-muted-foreground">
      <div className="rounded-full bg-[#F1EFE8] p-4 mb-3">
        <Inbox className="h-6 w-6 text-[#0F6E56]" />
      </div>
      <div className="text-sm font-medium text-[#04342C]">{title}</div>
      {hint && <div className="text-xs mt-1 max-w-sm">{hint}</div>}
    </div>
  );
}

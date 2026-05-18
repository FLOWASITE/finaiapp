import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocStatus } from "@/lib/documents.functions";

const META: Record<
  DocStatus,
  { label: string; className: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  uploaded: { label: "Đã tải lên", variant: "outline", className: "" },
  ai_read: { label: "AI đã đọc", variant: "secondary", className: "" },
  reviewed: { label: "Đã duyệt", variant: "default", className: "" },
  posted: {
    label: "Đã ghi sổ",
    variant: "default",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white",
  },
  void: {
    label: "Đã huỷ",
    variant: "outline",
    className: "border-destructive text-destructive",
  },
  rejected: { label: "Từ chối", variant: "destructive", className: "" },
};

export function DocStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const m = META[(status as DocStatus) ?? "uploaded"] ?? META.uploaded;
  return (
    <Badge variant={m.variant} className={cn(m.className, className)}>
      {m.label}
    </Badge>
  );
}

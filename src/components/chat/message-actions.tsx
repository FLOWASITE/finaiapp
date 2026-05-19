import { Copy, RefreshCw, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
};

export function MessageActions({ content, onRegenerate, canRegenerate }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Đã sao chép");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được");
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <ActionBtn onClick={copy} title="Sao chép">
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </ActionBtn>
      {canRegenerate && onRegenerate && (
        <ActionBtn onClick={onRegenerate} title="Tạo lại">
          <RefreshCw className="h-3 w-3" />
        </ActionBtn>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground",
        "hover:bg-white/5 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

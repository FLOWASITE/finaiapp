import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Send, Square, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
};

/**
 * ChatGPT-style composer: auto-grow textarea, Enter to send,
 * Shift+Enter for newline, send button on the right.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  loading,
  placeholder = "Nhắn cho trợ lý AI…",
  autoFocus,
  compact,
  inputRef,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, []);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Auto-grow
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = compact ? 140 : 200;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [value, compact]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!disabled && !loading && value.trim()) onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "relative flex w-full items-end gap-2 rounded-2xl border border-white/10 bg-background/80 px-3 py-2 shadow-2xl shadow-emerald-500/5 backdrop-blur-xl transition focus-within:border-primary/50 focus-within:shadow-primary/10",
        compact ? "min-h-[48px]" : "min-h-[60px]",
      )}
    >
      <Sparkles className="mt-2 h-4 w-4 shrink-0 text-primary/70" />
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/70"
      />
      {loading && onStop ? (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          onClick={onStop}
          className="h-9 w-9 shrink-0 rounded-xl"
          aria-label="Dừng"
          title="Dừng"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          onClick={onSubmit}
          disabled={disabled || loading || !value.trim()}
          className="h-9 w-9 shrink-0 rounded-xl"
          aria-label="Gửi"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

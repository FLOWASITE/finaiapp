import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowUp, Square, Paperclip, Mic } from "lucide-react";
import { toast } from "sonner";
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
  const [focused, setFocused] = useState(false);
  useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, []);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

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
    <div className="relative">
      <div
        className={cn(
          "group relative flex w-full items-end gap-2 rounded-3xl border bg-card/70 px-4 py-2.5 backdrop-blur-xl transition-all duration-200",
          "border-border/60 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]",
          "focus-within:border-primary/50 focus-within:shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--primary)_25%,transparent)] focus-within:ring-1 focus-within:ring-primary/20",
          compact ? "min-h-[48px]" : "min-h-[60px]",
        )}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        {loading && onStop ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onStop}
            className="h-9 w-9 shrink-0 rounded-2xl border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
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
            className={cn(
              "h-9 w-9 shrink-0 rounded-2xl transition-transform",
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95",
              "disabled:opacity-40 disabled:hover:scale-100",
            )}
            aria-label="Gửi"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </Button>
        )}
      </div>
      {!compact && focused && (
        <div className="pointer-events-none absolute -bottom-5 right-2 text-[10px] text-muted-foreground/60">
          <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">Shift</kbd>
          {" + "}
          <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">Enter</kbd>
          {" để xuống dòng"}
        </div>
      )}
    </div>
  );
}

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { nextEntityCode, type CodeEntity } from "@/lib/codegen.functions";

interface AutoCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  entity: CodeEntity;
  /** ISO date for date-scoped entities (sale_invoice / purchase_invoice). */
  date?: string;
  placeholder?: string;
  error?: boolean;
  autoFillOnMount?: boolean;
  disabled?: boolean;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function AutoCodeInput({
  value,
  onChange,
  entity,
  date,
  placeholder,
  error,
  autoFillOnMount,
  disabled,
  className,
  inputRef,
}: AutoCodeInputProps) {
  const fn = useServerFn(nextEntityCode);
  const m = useMutation({
    mutationFn: () => fn({ data: { entity, date } }),
    onSuccess: (res) => onChange(res.code),
  });

  const filledRef = React.useRef(false);
  React.useEffect(() => {
    if (autoFillOnMount && !filledRef.current && !value && !m.isPending) {
      filledRef.current = true;
      m.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFillOnMount]);

  return (
    <TooltipProvider>
      <div className={cn("flex gap-1", className)}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(error && "border-destructive")}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || m.isPending}
              onClick={() => m.mutate()}
              aria-label="Tự sinh mã"
            >
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tự sinh mã</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

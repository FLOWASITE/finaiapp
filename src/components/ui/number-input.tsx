import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  onChange: (value: number) => void;
}

const formatVN = (n: number) => (n ? n.toLocaleString("vi-VN") : "");
const parseVN = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const [text, setText] = React.useState(formatVN(value));

    React.useEffect(() => {
      setText(formatVN(value));
    }, [value]);

    return (
      <Input
        {...props}
        ref={ref}
        inputMode="numeric"
        className={cn("text-right font-mono tabular-nums", className)}
        value={text}
        onChange={(e) => {
          const n = parseVN(e.target.value);
          setText(formatVN(n));
          onChange(n);
        }}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";

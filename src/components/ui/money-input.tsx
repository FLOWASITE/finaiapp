import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function format(n: number) {
  if (!n || !isFinite(n)) return "";
  return nf.format(Math.round(n));
}

function parse(s: string) {
  const n = Number((s ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: number;
  onChange: (n: number) => void;
};

/** Input số tiền với dấu phân cách hàng nghìn (vi-VN). */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, className, placeholder = "0", ...rest }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const [raw, setRaw] = React.useState<string>(format(value));

    React.useEffect(() => {
      if (!focused) setRaw(format(value));
    }, [value, focused]);

    return (
      <Input
        ref={ref}
        inputMode="numeric"
        className={cn("text-right tabular-nums", className)}
        placeholder={placeholder}
        value={raw}
        onFocus={(e) => {
          setFocused(true);
          setRaw(value ? String(Math.round(value)) : "");
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setRaw(format(value));
          rest.onBlur?.(e);
        }}
        onChange={(e) => {
          const s = e.target.value;
          const n = parse(s);
          setRaw(s);
          onChange(n);
        }}
        {...rest}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";

import * as React from "react";
import { useAccountingMode } from "@/hooks/use-workspace";
import { friendlyAccountName } from "@/lib/accounting/account-labels";
import { cn } from "@/lib/utils";

type Props = {
  code: string | null | undefined;
  /** Tên TK lấy từ COA (ưu tiên hơn map mặc định). */
  name?: string | null;
  className?: string;
  /** Nếu true thì luôn hiện mã TK bất kể accounting mode. */
  alwaysShowCode?: boolean;
};

/**
 * Hiển thị một tài khoản theo ngôn ngữ kinh doanh khi tắt accounting mode,
 * và hiện cả mã VAS khi bật.
 *
 *  <AccountTag code="511" />              → "Doanh thu"
 *  <AccountTag code="511" /> (acc mode)   → "511 · Doanh thu"
 */
export function AccountTag({ code, name, className, alwaysShowCode }: Props) {
  const { enabled } = useAccountingMode();
  if (!code) return null;
  const friendly = name?.trim() || friendlyAccountName(code);
  const showCode = enabled || alwaysShowCode;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80",
        className,
      )}
      title={`${code} · ${friendly}`}
    >
      {showCode && (
        <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
      )}
      <span>{friendly}</span>
    </span>
  );
}

import * as React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SplitActionItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  separatorBefore?: boolean;
  disabled?: boolean;
};

export type SplitActionButtonProps = {
  /** Primary action — nút chính bên trái */
  primary: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Các action phụ trong dropdown */
  items: SplitActionItem[];
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
};

/**
 * Split-button: primary action + chevron mở dropdown các action phụ.
 * Dùng để gom nhiều CTA ở header trang về một cụm gọn (theo design Misa).
 */
export function SplitActionButton({
  primary,
  items,
  variant = "default",
  size = "default",
  className,
}: SplitActionButtonProps) {
  const PrimaryIcon = primary.icon;
  return (
    <div className={cn("inline-flex isolate", className)}>
      <Button
        variant={variant}
        size={size}
        onClick={primary.onClick}
        disabled={primary.disabled}
        className="rounded-r-none"
      >
        {PrimaryIcon ? <PrimaryIcon className="mr-2 h-4 w-4" /> : null}
        {primary.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            aria-label="Thao tác khác"
            className="rounded-l-none border-l border-white/20 px-2"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          {items.map((it, idx) => {
            const Icon = it.icon;
            return (
              <React.Fragment key={`${it.label}-${idx}`}>
                {it.separatorBefore ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  disabled={it.disabled}
                  onSelect={(e) => {
                    e.preventDefault();
                    it.onSelect();
                  }}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  <span>{it.label}</span>
                </DropdownMenuItem>
              </React.Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

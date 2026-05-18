import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Hệ "shimmer + glow + icon micro-interaction" dùng chung cho mọi
 * variant hành động (default / destructive / secondary / add / receipt /
 * payment). Mỗi variant chỉ cần truyền 4 CSS var (gradient + shadow,
 * cả 2 trạng thái rest/hover) cùng màu focus ring.
 *
 * Cách dùng nội bộ: ghép `SHIMMER_BASE` với chuỗi biến CSS đặc thù.
 */
const SHIMMER_BASE =
  // layout & isolate cho pseudo-elements
  "group/btn relative isolate overflow-hidden font-semibold tracking-wide border border-white/15 " +
  // chuyển động lift nhẹ
  "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow,background] duration-300 ease-out " +
  // halo glow phía sau (::before)
  "before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-[inherit] before:blur-lg before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-70 hover:before:[animation:add-glow-pulse_2.4s_ease-in-out_infinite] " +
  // shimmer sweep (::after)
  "after:pointer-events-none after:absolute after:inset-y-0 after:-left-1/2 after:w-1/3 after:[background:linear-gradient(90deg,transparent,oklch(1_0_0/0.45),transparent)] after:opacity-0 group-hover/btn:after:opacity-100 hover:after:[animation:add-shimmer_1.1s_ease-out] " +
  // icon micro-interaction
  "[&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:scale-110 " +
  // focus ring chuẩn
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Primary hành động chính của trang — sapphire→violet */
        default: cn(
          SHIMMER_BASE,
          "text-white [background:var(--gradient-primary-btn)] [box-shadow:var(--shadow-primary-btn)] hover:[background:var(--gradient-primary-btn-hover)] hover:[box-shadow:var(--shadow-primary-btn-hover)] before:[background:var(--gradient-primary-btn)] focus-visible:ring-[oklch(0.55_0.14_270)] hover:[&_svg]:translate-x-0.5",
        ),
        /** Hành động phá hủy — crimson đậm */
        destructive: cn(
          SHIMMER_BASE,
          "text-white [background:var(--gradient-destructive-btn)] [box-shadow:var(--shadow-destructive-btn)] hover:[background:var(--gradient-destructive-btn-hover)] hover:[box-shadow:var(--shadow-destructive-btn-hover)] before:[background:var(--gradient-destructive-btn)] focus-visible:ring-[oklch(0.6_0.22_22)] hover:[&_svg]:rotate-12",
        ),
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5 active:translate-y-0 transition-[transform,box-shadow,background,color] duration-200 [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:scale-110",
        /** Hành động phụ — slate trung tính, glow rất nhẹ */
        secondary: cn(
          SHIMMER_BASE,
          "border-border/60 text-foreground [background:var(--gradient-secondary-btn)] [box-shadow:var(--shadow-secondary-btn)] hover:[background:var(--gradient-secondary-btn-hover)] hover:[box-shadow:var(--shadow-secondary-btn-hover)] before:[background:var(--gradient-secondary-btn)] before:opacity-0 hover:before:opacity-40 focus-visible:ring-[oklch(0.6_0.04_260)]",
        ),
        ghost:
          "hover:bg-accent hover:text-accent-foreground [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:scale-110",
        link: "text-primary underline-offset-4 hover:underline",
        /** "Thêm mới" — indigo→teal cao cấp */
        add: cn(
          SHIMMER_BASE,
          "text-white [background:var(--gradient-add)] [box-shadow:var(--shadow-add)] hover:[background:var(--gradient-add-hover)] hover:[box-shadow:var(--shadow-add-hover)] before:[background:var(--gradient-add)] focus-visible:ring-[oklch(0.72_0.16_165)] hover:[&_svg]:rotate-90",
        ),
        /** "Phiếu thu" — emerald→teal (tiền vào) */
        receipt: cn(
          SHIMMER_BASE,
          "text-white [background:var(--gradient-receipt)] [box-shadow:var(--shadow-receipt)] hover:[background:var(--gradient-receipt-hover)] hover:[box-shadow:var(--shadow-receipt-hover)] before:[background:var(--gradient-receipt)] focus-visible:ring-[oklch(0.72_0.16_165)] hover:[&_svg]:-translate-y-0.5",
        ),
        /** "Phiếu chi" — rose→orange (tiền ra) */
        payment: cn(
          SHIMMER_BASE,
          "text-white [background:var(--gradient-payment)] [box-shadow:var(--shadow-payment)] hover:[background:var(--gradient-payment-hover)] hover:[box-shadow:var(--shadow-payment-hover)] before:[background:var(--gradient-payment)] focus-visible:ring-[oklch(0.65_0.22_30)] hover:[&_svg]:translate-y-0.5",
        ),
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

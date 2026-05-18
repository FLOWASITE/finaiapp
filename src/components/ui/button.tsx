import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /**
         * "Thêm mới" — nút hành động chính: gradient indigo→teal,
         * shadow glow, hơi nhô lên khi hover. Dùng cho các CTA
         * "Thêm khách hàng", "Thêm hoá đơn", "Thêm chi nhánh", v.v.
         */
        add:
          "group/add relative isolate overflow-hidden text-white font-semibold tracking-wide border border-white/15 [background:var(--gradient-add)] [box-shadow:var(--shadow-add)] hover:[background:var(--gradient-add-hover)] hover:[box-shadow:var(--shadow-add-hover)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-[transform,box-shadow,background] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-[oklch(0.72_0.16_165)] before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-[inherit] before:[background:var(--gradient-add)] before:blur-lg before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-70 hover:before:[animation:add-glow-pulse_2.4s_ease-in-out_infinite] after:pointer-events-none after:absolute after:inset-y-0 after:-left-1/2 after:w-1/3 after:[background:linear-gradient(90deg,transparent,oklch(1_0_0/0.45),transparent)] after:opacity-0 group-hover/add:after:opacity-100 hover:after:[animation:add-shimmer_1.1s_ease-out] [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:rotate-90 hover:[&_svg]:scale-110",
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

import * as React from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AddNew — nút "Thêm mới" dùng chung cho toàn app.
 *
 * Mục tiêu:
 * - Thống nhất variant (`add`), icon (mặc định Plus) và khoảng cách icon/label.
 * - Hỗ trợ cả 3 mẫu sử dụng phổ biến:
 *     1) Trigger thường:        <AddNew label="Thêm chi nhánh" onClick={open} />
 *     2) Mở dialog (Radix):     <DialogTrigger asChild><AddNew label="..." /></DialogTrigger>
 *     3) Điều hướng route:      <AddNew label="Thêm hoá đơn" to="/sales/new" />
 *
 * Không chứa business logic — chỉ là lớp trình bày để loại bỏ trùng lặp UI.
 */

type AddNewBaseProps = {
  /** Nhãn hiển thị bên cạnh icon. Mặc định "Thêm". */
  label?: React.ReactNode;
  /** Icon Lucide tuỳ chọn. Mặc định <Plus />. */
  icon?: LucideIcon;
  /** Ẩn icon hoàn toàn (chỉ chữ). */
  hideIcon?: boolean;
};

type AddNewAsButtonProps = AddNewBaseProps &
  Omit<ButtonProps, "variant" | "children"> & {
    to?: undefined;
  };

type AddNewAsLinkProps = AddNewBaseProps & {
  /** Đường dẫn route TanStack. Khi có `to`, component render dưới dạng Link. */
  to: LinkProps["to"];
  params?: LinkProps["params"];
  search?: LinkProps["search"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
};

export type AddNewProps = AddNewAsButtonProps | AddNewAsLinkProps;

const isLinkProps = (p: AddNewProps): p is AddNewAsLinkProps =>
  typeof (p as AddNewAsLinkProps).to !== "undefined";

const AddNew = React.forwardRef<HTMLButtonElement, AddNewProps>((props, ref) => {
  const {
    label = "Thêm",
    icon: Icon = Plus,
    hideIcon = false,
    className,
    size,
  } = props;

  const content = (
    <>
      {!hideIcon ? <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" /> : null}
      <span>{label}</span>
    </>
  );

  if (isLinkProps(props)) {
    const { to, params, search, disabled } = props;
    return (
      <Button
        ref={ref}
        asChild
        variant="add"
        size={size}
        className={cn(className)}
        disabled={disabled}
      >
        <Link to={to} params={params as never} search={search as never}>
          {content}
        </Link>
      </Button>
    );
  }

  const { to: _to, label: _label, icon: _icon, hideIcon: _hi, ...rest } =
    props as AddNewAsButtonProps & { to?: undefined };

  return (
    <Button ref={ref} variant="add" size={size} className={cn(className)} {...rest}>
      {content}
    </Button>
  );
});

AddNew.displayName = "AddNew";

export { AddNew };

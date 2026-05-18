import * as React from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * AddNew — nút "Thêm mới" dùng chung cho toàn app.
 *
 * Mục tiêu:
 * - Thống nhất variant (`add`), icon (mặc định Plus), khoảng cách icon/label
 *   và kích thước icon theo `size` (sm/default/lg).
 * - Hỗ trợ cả 3 mẫu sử dụng phổ biến:
 *     1) Trigger thường:        <AddNew label="Thêm chi nhánh" onClick={open} />
 *     2) Mở dialog (Radix):     <DialogTrigger asChild><AddNew label="..." /></DialogTrigger>
 *     3) Điều hướng route:      <AddNew label="Thêm hoá đơn" to="/sales/new" />
 *
 * Không chứa business logic — chỉ là lớp trình bày để loại bỏ trùng lặp UI.
 */

/** Các size được phép cho AddNew (loại bỏ `icon` vì AddNew luôn có label). */
export type AddNewSize = "sm" | "default" | "lg";

type AddNewBaseProps = {
  /** Nhãn hiển thị bên cạnh icon. Mặc định "Thêm". */
  label?: React.ReactNode;
  /** Icon Lucide tuỳ chọn. Mặc định <Plus />. */
  icon?: LucideIcon;
  /** Ẩn icon hoàn toàn (chỉ chữ). */
  hideIcon?: boolean;
  /** Kích thước nút — đồng bộ với Button. Mặc định "default". */
  size?: AddNewSize;
};

type AddNewAsButtonProps = AddNewBaseProps &
  Omit<ButtonProps, "variant" | "children" | "size"> & {
    to?: undefined;
  };

type AddNewAsLinkProps = AddNewBaseProps & {
  /** Đường dẫn route TanStack. Khi có `to`, component render dưới dạng Link. */
  to: LinkProps["to"];
  params?: LinkProps["params"];
  search?: LinkProps["search"];
  className?: string;
  disabled?: boolean;
};

export type AddNewProps = AddNewAsButtonProps | AddNewAsLinkProps;

const isLinkProps = (p: AddNewProps): p is AddNewAsLinkProps =>
  typeof (p as AddNewAsLinkProps).to !== "undefined";

/**
 * Bảng kích thước icon + khoảng cách icon↔label theo size của Button.
 *
 * Lưu ý padding nút (đến từ `Button`):
 *   - sm:      h-8  px-3  text-xs   → icon nhỏ + gap hẹp
 *   - default: h-9  px-4  text-sm   → icon chuẩn
 *   - lg:      h-10 px-6  text-sm   → icon lớn + gap rộng
 *
 * (Button.tsx đã chuẩn hoá `lg` về `px-6` để cân với shimmer/glow của
 * variant `add` — `px-8` mặc định trước đây quá rộng cho nhãn ngắn.)
 */
const ICON_BY_SIZE: Record<AddNewSize, string> = {
  sm: "mr-1 h-3.5 w-3.5",
  default: "mr-1.5 h-4 w-4",
  lg: "mr-2 h-[18px] w-[18px]",
};

const AddNew = React.forwardRef<HTMLButtonElement, AddNewProps>((props, ref) => {
  const {
    label = "Thêm",
    icon: Icon = Plus,
    hideIcon = false,
    className,
    size = "default",
  } = props;

  const content = (
    <>
      {!hideIcon ? (
        <Icon className={ICON_BY_SIZE[size]} aria-hidden="true" />
      ) : null}
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

  const {
    to: _to,
    label: _label,
    icon: _icon,
    hideIcon: _hi,
    size: _size,
    ...rest
  } = props as AddNewAsButtonProps & { to?: undefined };

  return (
    <Button ref={ref} variant="add" size={size} className={cn(className)} {...rest}>
      {content}
    </Button>
  );
});

AddNew.displayName = "AddNew";

export { AddNew };

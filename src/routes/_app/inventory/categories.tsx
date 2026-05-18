import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inventory/categories")({
  component: CategoriesPlaceholder,
});

function CategoriesPlaceholder() {
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-2xl font-semibold">Nhóm hàng hoá</h1>
      <p className="text-muted-foreground">
        Trang quản lý nhóm hàng hoá đang được hoàn thiện. Vui lòng quay lại{" "}
        <Link to="/inventory" className="underline">trang Kho</Link> để quản lý sản phẩm.
      </p>
    </div>
  );
}

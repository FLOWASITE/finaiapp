import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/CatalogPage";

export const Route = createFileRoute("/_app/items/")({
  component: CatalogPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-red-600">
      Không tải được danh mục: {error instanceof Error ? error.message : "lỗi không xác định"}
    </div>
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/items/categories")({ component: CategoriesPage });

function CategoriesPage() {
  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>Nhóm hàng hoá</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Trang quản lý nhóm hàng hoá đang được hoàn thiện. Hiện có thể chọn nhóm khi tạo/sửa mặt hàng.
        </CardContent>
      </Card>
    </div>
  );
}

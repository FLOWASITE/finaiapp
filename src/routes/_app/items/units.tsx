import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/items/units")({ component: UnitsPage });

function UnitsPage() {
  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <CardTitle>Đơn vị tính & quy đổi</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Đang xây dựng. Tạm thời nhập ĐVT trực tiếp khi tạo mặt hàng.
        </CardContent>
      </Card>
    </div>
  );
}

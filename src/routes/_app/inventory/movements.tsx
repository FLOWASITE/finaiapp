import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/inventory/movements")({
  component: MovementsPage,
});

function MovementsPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Thẻ kho</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Trang Thẻ kho đang được xây dựng. Bạn có thể quản lý nhập/xuất kho tại trang Kho.
        </CardContent>
      </Card>
    </div>
  );
}

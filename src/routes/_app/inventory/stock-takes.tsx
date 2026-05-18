import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/inventory/stock-takes")({ component: StockTakesPage });

function StockTakesPage() {
  return (
    <div className="p-8">
      <Card>
        <CardHeader><CardTitle>Kiểm kê kho</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tính năng kiểm kê đang được xây dựng. Sẽ hỗ trợ tạo phiếu kiểm kê, đối chiếu tồn thực tế và tự sinh phiếu điều chỉnh.
        </CardContent>
      </Card>
    </div>
  );
}

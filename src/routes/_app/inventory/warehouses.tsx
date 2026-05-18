import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/inventory/warehouses")({ component: WarehousesPage });

function WarehousesPage() {
  return (
    <div className="p-8">
      <Card>
        <CardHeader><CardTitle>Danh mục kho</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Quản lý nhiều kho (kho tổng, kho chi nhánh…) đang được xây dựng.
        </CardContent>
      </Card>
    </div>
  );
}

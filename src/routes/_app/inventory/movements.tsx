import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/movements")({ component: MovementsPage });

function MovementsPage() {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Phiếu nhập / xuất kho</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/inventory/vouchers" search={{ type: "in" } as any}>
          <Card className="hover:border-primary transition">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-600">
                <ArrowDownToLine className="h-5 w-5" /> Phiếu nhập kho
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Danh sách phiếu nhập — lọc theo ngày, kho, trạng thái ghi sổ.
            </CardContent>
          </Card>
        </Link>
        <Link to="/inventory/vouchers" search={{ type: "out" } as any}>
          <Card className="hover:border-primary transition">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <ArrowUpFromLine className="h-5 w-5" /> Phiếu xuất kho
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Danh sách phiếu xuất — lọc theo ngày, kho, trạng thái ghi sổ.
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProduct } from "@/lib/inventory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UnitConversionsEditor } from "@/components/inventory/unit-conversions-editor";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/$id")({ component: ProductDetail });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

function ProductDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getProduct);
  const { data } = useQuery({ queryKey: ["product", id], queryFn: () => fn({ data: { id } }) });

  if (!data) return <div className="p-8 text-muted-foreground">Đang tải...</div>;
  const { product, kardex } = data;
  const value = Number(product.on_hand) * Number(product.unit_cost);

  const isService = (product as any).item_type === "service";
  const typeLabel = isService ? "🛎 Dịch vụ" : (product as any).item_type === "combo" ? "🧩 Combo" : "📦 Hàng hóa";

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/inventory"><ArrowLeft className="mr-1 h-4 w-4" />Tồn kho</Link></Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold">{product.code} — {product.name}</h1>
        <p className="text-sm text-muted-foreground">
          <Badge variant="outline" className="mr-2">{typeLabel}</Badge>
          {product.product_categories?.name ?? "Chưa phân loại"} · {product.unit}
        </p>
      </div>

      {isService ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Giá bán</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmt(product.unit_price)}</div>
              <p className="text-xs text-muted-foreground">VAT {product.vat_rate}%</p>
            </CardContent></Card>
          <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">TK doanh thu</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{product.revenue_account}</div>
              <p className="text-xs text-muted-foreground">Dịch vụ không quản lý tồn kho</p>
            </CardContent></Card>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Tồn hiện tại</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmt(product.on_hand)}</div>
                {Number(product.min_stock) > 0 && Number(product.on_hand) <= Number(product.min_stock) && (
                  <Badge variant="outline" className="mt-1 bg-rose-50 text-rose-700 border-rose-200">Sắp hết · tối thiểu {fmt(product.min_stock)}</Badge>
                )}
              </CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Đơn giá BQ</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmt(product.unit_cost)}</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Giá trị tồn</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmt(value)}</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Giá bán</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmt(product.unit_price)}</div>
                <p className="text-xs text-muted-foreground">VAT {product.vat_rate}%</p>
              </CardContent></Card>
          </div>

          <UnitConversionsEditor productId={product.id} baseUnit={product.unit} />

          <Card>
            <CardHeader><CardTitle className="text-base">Thẻ kho (Kardex)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Ngày</th>
                    <th className="px-4 py-2 text-left">Loại</th>
                    <th className="px-4 py-2 text-right">Nhập</th>
                    <th className="px-4 py-2 text-right">Xuất</th>
                    <th className="px-4 py-2 text-right">Đơn giá</th>
                    <th className="px-4 py-2 text-right">Tồn cuối</th>
                    <th className="px-4 py-2 text-left">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(kardex ?? []).map((m: any) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="px-4 py-2 whitespace-nowrap">{m.movement_date}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={m.movement_type === "in" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                          {m.movement_type === "in" ? "Nhập" : "Xuất"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{m.qty_in ? fmt(m.qty_in) : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">{m.qty_out ? fmt(m.qty_out) : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(m.unit_cost)}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(m.balance)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{m.note ?? m.ref_type ?? "—"}</td>
                    </tr>
                  ))}
                  {(kardex ?? []).length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Chưa có phát sinh</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

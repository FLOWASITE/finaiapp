import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listProducts } from "@/lib/inventory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/inventory/stock-card")({ component: StockCardPage });

function StockCardPage() {
  const list = useServerFn(listProducts);
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const items = (products ?? []).filter((p: any) => (p.item_type ?? "goods") !== "service" && (!search || [p.code, p.name].some((v) => v?.toLowerCase().includes(search.toLowerCase()))));

  return (
    <div className="p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Thẻ kho</h1>
        <p className="text-sm text-muted-foreground">Chọn một mặt hàng để xem chi tiết phát sinh nhập / xuất.</p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <Label className="text-xs">Tìm hàng hoá</Label>
          <Input placeholder="Mã hoặc tên..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {items.slice(0, 30).map((p: any) => (
              <li key={p.id}>
                <Link
                  to="/inventory/$id"
                  params={{ id: p.id }}
                  className="flex items-center justify-between py-2 hover:bg-muted/30 px-2 rounded"
                >
                  <span><span className="font-mono text-xs text-muted-foreground mr-2">{p.code}</span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">Tồn: {Number(p.on_hand ?? 0).toLocaleString("vi-VN")} {p.unit}</span>
                </Link>
              </li>
            ))}
            {items.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Không có mặt hàng</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

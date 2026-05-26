import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSupplierItemMappings,
  deleteSupplierItemMapping,
} from "@/lib/items/mappings.functions";
import { listMyTenants } from "@/lib/tenants.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Trash2, Search, Loader2, Brain } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings/item-mappings")({
  component: ItemMappingsPage,
});

const SOURCE_LABEL: Record<string, string> = {
  auto: "Tự khớp",
  user_confirm: "KTV xác nhận",
  user_create: "KTV tạo mới",
  imported: "Nhập từ file",
  llm: "Fin gợi ý",
};

function ItemMappingsPage() {
  const tenantsFn = useServerFn(listMyTenants);
  const listFn = useServerFn(listSupplierItemMappings);
  const delFn = useServerFn(deleteSupplierItemMapping);
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const tenantsQ = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => tenantsFn(),
  });
  const activeTenantId =
    tenantsQ.data?.tenants?.find((t: any) => t.is_active)?.id ?? null;

  const queryKey = ["supplier-item-mappings", activeTenantId, debounced];
  const q = useQuery({
    queryKey,
    enabled: !!activeTenantId,
    queryFn: () => listFn({ data: { search: debounced || null, limit: 300 } }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá rule");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được"),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm" className="h-7 -ml-2">
          <Link to="/settings">
            <ArrowLeft className="h-4 w-4" /> Cài đặt
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Trí nhớ mặt hàng theo NCC</h1>
          <p className="text-sm text-muted-foreground">
            Mỗi dòng là một rule: khi NCC này ghi tên này, Fin tự khớp về mã hệ thống tương ứng.
            Bạn có thể chỉnh hoặc xoá nếu sai.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {rows.length} rule
            {q.isLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên NCC ghi..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">NCC ghi (raw)</TableHead>
                  <TableHead>NCC</TableHead>
                  <TableHead>→ Mã hệ thống</TableHead>
                  <TableHead>ĐVT NCC → ĐVT chuẩn</TableHead>
                  <TableHead className="text-right">Khớp</TableHead>
                  <TableHead>Nguồn</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!q.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      {debounced
                        ? "Không có rule khớp tìm kiếm"
                        : "Chưa có rule nào — sau khi xác nhận mặt hàng trên hoá đơn, Fin sẽ lưu tự động."}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.raw_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.suppliers?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{r.products?.code ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.products?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.raw_unit ?? "—"} → {r.products?.unit ?? "—"}
                      {Number(r.unit_conversion_factor) !== 1 && (
                        <Badge variant="outline" className="ml-2 h-4 px-1 text-[9px]">
                          ×{r.unit_conversion_factor}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.match_count}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {SOURCE_LABEL[r.source] ?? r.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={delMut.isPending}
                        onClick={() => {
                          if (confirm(`Xoá rule "${r.raw_name}"?`)) delMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

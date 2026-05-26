import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSupplierItemMappings,
  deleteSupplierItemMapping,
  updateMappingProduct,
  listMappingConflicts,
} from "@/lib/items/mappings.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { listMyTenants } from "@/lib/tenants.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Trash2, Search, Loader2, Brain, AlertTriangle, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ProductPicker } from "@/components/items/product-picker";
import { BulkImportMappingsDialog } from "@/components/items/bulk-import-dialog";
import { backfillProductEmbeddings } from "@/lib/items/backfill-embeddings.functions";

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
  const updFn = useServerFn(updateMappingProduct);
  const suppliersFn = useServerFn(listSuppliers);
  const conflictsFn = useServerFn(listMappingConflicts);
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [supplierId, setSupplierId] = React.useState<string>("__all__");
  const [tab, setTab] = React.useState("rules");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const backfillFn = useServerFn(backfillProductEmbeddings);
  const backfillMut = useMutation({
    mutationFn: () => backfillFn({ data: { limit: 200 } }),
    onSuccess: (r: any) => toast.success(`Đã tạo embedding: ${r.ok}/${r.total} (lỗi: ${r.failed})`),
    onError: (e: any) => toast.error(e?.message ?? "Lỗi backfill"),
  });

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

  const suppliersQ = useQuery({
    queryKey: ["suppliers-list", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: () => suppliersFn(),
  });
  const suppliers = (suppliersQ.data ?? []) as Array<{ id: string; name: string }>;

  const queryKey = ["supplier-item-mappings", activeTenantId, debounced, supplierId];
  const q = useQuery({
    queryKey,
    enabled: !!activeTenantId && tab === "rules",
    queryFn: () =>
      listFn({
        data: {
          search: debounced || null,
          supplier_id: supplierId === "__all__" ? null : supplierId,
          limit: 300,
        },
      }),
  });

  const conflictsQ = useQuery({
    queryKey: ["mapping-conflicts", activeTenantId],
    enabled: !!activeTenantId && tab === "conflicts",
    queryFn: () => conflictsFn({ data: { limit: 100 } }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá rule");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["mapping-conflicts", activeTenantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được"),
  });

  const updMut = useMutation({
    mutationFn: (v: { id: string; product_id: string }) => updFn({ data: v }),
    onSuccess: () => {
      toast.success("Đã cập nhật mã hệ thống");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["mapping-conflicts", activeTenantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không cập nhật được"),
  });

  const rows = q.data?.rows ?? [];
  const conflicts = conflictsQ.data?.conflicts ?? [];

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
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Trí nhớ mặt hàng theo NCC</h1>
          <p className="text-sm text-muted-foreground">
            Mỗi dòng là một rule: khi NCC này ghi tên này, Fin tự khớp về mã hệ thống tương ứng.
            Bạn có thể chỉnh hoặc xoá nếu sai.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          Nhập từ CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => backfillMut.mutate()}
          disabled={backfillMut.isPending}
        >
          {backfillMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          )}
          Backfill embedding
        </Button>
      </div>

      <BulkImportMappingsDialog open={bulkOpen} onOpenChange={setBulkOpen} />


      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rules">Rule ({q.data?.rows?.length ?? "…"})</TabsTrigger>
          <TabsTrigger value="conflicts" className="gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Xung đột {conflicts.length ? `(${conflicts.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">
                {rows.length} rule
                {q.isLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue placeholder="Tất cả NCC" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tất cả NCC</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm theo tên NCC ghi..."
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26%]">NCC ghi (raw)</TableHead>
                      <TableHead>NCC</TableHead>
                      <TableHead className="w-[28%]">→ Mã hệ thống</TableHead>
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
                          {debounced || supplierId !== "__all__"
                            ? "Không có rule khớp bộ lọc"
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
                          <ProductPicker
                            value={{
                              id: r.product_id,
                              code: r.products?.code,
                              name: r.products?.name,
                            }}
                            disabled={updMut.isPending}
                            onSelect={(p) => {
                              if (p.id === r.product_id) return;
                              updMut.mutate({ id: r.id, product_id: p.id });
                            }}
                          />
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
        </TabsContent>

        <TabsContent value="conflicts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tên giống nhau nhưng map về mã khác nhau
                {conflictsQ.isLoading && (
                  <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Fin phát hiện cùng một cách viết được map về ≥2 mã hệ thống khác nhau
                (có thể khác NCC). Kiểm tra lại để tránh sai sót khi tự khớp.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!conflictsQ.isLoading && conflicts.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Không có xung đột nào. 
                </div>
              )}
              {conflicts.map((c: any) => (
                <div key={c.raw_name_norm} className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">
                    "{c.sample_raw_name}"
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({c.entries.length} rule)
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>NCC</TableHead>
                        <TableHead>Mã hệ thống</TableHead>
                        <TableHead className="text-right">Khớp</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.entries.map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">
                            {e.suppliers?.name ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{e.products?.code}</span>
                              <span className="text-xs text-muted-foreground">
                                {e.products?.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {e.match_count}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Xoá rule "${e.raw_name}"?`)) delMut.mutate(e.id);
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
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

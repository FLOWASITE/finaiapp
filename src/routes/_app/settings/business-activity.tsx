import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getBusinessConfig,
  updateBusinessConfig,
  listProductCatalog,
  upsertProductCatalog,
  deleteProductCatalog,
} from "@/lib/product-catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  ChevronLeft,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Info,
  Lightbulb,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings/business-activity")({
  component: BusinessActivityPage,
});

const BIZ_OPTIONS = [
  {
    value: "trading",
    label: "Thương mại (mua bán)",
    hint: "Mua hàng về bán lại → 156",
  },
  {
    value: "manufacturing",
    label: "Sản xuất",
    hint: "Mua NVL về sản xuất → 152",
  },
  {
    value: "service",
    label: "Dịch vụ",
    hint: "Cung cấp dịch vụ → chi phí 627/641/642",
  },
] as const;

function BusinessActivityPage() {
  const qc = useQueryClient();
  const getCfg = useServerFn(getBusinessConfig);
  const updateCfg = useServerFn(updateBusinessConfig);
  const listCat = useServerFn(listProductCatalog);
  const upsertCat = useServerFn(upsertProductCatalog);
  const deleteCat = useServerFn(deleteProductCatalog);

  const cfgQ = useQuery({
    queryKey: ["business-config"],
    queryFn: () => getCfg(),
  });
  const catQ = useQuery({
    queryKey: ["product-catalog"],
    queryFn: () => listCat(),
  });

  const [bizTypes, setBizTypes] = React.useState<string[]>([]);
  const [threshold, setThreshold] = React.useState<number>(5_000_000);
  const [costCenter, setCostCenter] = React.useState<"627" | "641" | "642">(
    "642",
  );

  React.useEffect(() => {
    if (cfgQ.data) {
      setBizTypes(cfgQ.data.business_types ?? []);
      setThreshold(cfgQ.data.ccdc_allocation_threshold ?? 5_000_000);
      setCostCenter(cfgQ.data.default_cost_center ?? "642");
    }
  }, [cfgQ.data]);

  const saveCfg = useMutation({
    mutationFn: () =>
      updateCfg({
        data: {
          business_types: bizTypes as ("trading" | "manufacturing" | "service")[],
          ccdc_allocation_threshold: threshold,
          default_cost_center: costCenter,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu cấu hình hoạt động");
      qc.invalidateQueries({ queryKey: ["business-config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Lưu thất bại"),
  });

  const items = (catQ.data?.items as any[]) ?? [];
  const hasTrading = bizTypes.includes("trading");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Cài đặt
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Briefcase className="h-6 w-6" />
          Hoạt động kinh doanh & Danh mục mặt hàng
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Giúp Fin hạch toán đúng tài khoản (152/153/156/211/213/242) cho từng mặt
          hàng trên hoá đơn đầu vào.
        </p>
      </div>

      {/* Why panel */}
      <Card className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20">
        <CardContent className="pt-6 flex gap-3">
          <Lightbulb className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-medium">Vì sao cần khai báo phần này?</p>
            <p className="text-muted-foreground">
              Cùng 1 món hàng <i>(ví dụ: laptop 50 triệu)</i> có thể vào nhiều tài
              khoản khác nhau tuỳ doanh nghiệp <b>làm gì</b> với nó:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>
                Nếu là <b>cửa hàng bán laptop</b> → <b>TK 156 (hàng hoá)</b>
              </li>
              <li>
                Nếu là <b>công ty tư vấn</b> mua cho nhân viên dùng → <b>TK 211
                (TSCĐ)</b>, phân bổ ≥ 3 năm
              </li>
              <li>
                Nếu là <b>xưởng sản xuất</b> mua linh kiện về lắp ráp → <b>TK 152
                (NVL)</b>
              </li>
            </ul>
            <p className="text-muted-foreground">
              Không có thông tin này, Fin sẽ phải đoán → confidence thấp → kế toán
              phải sửa nhiều.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Business config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loại hình hoạt động</CardTitle>
          <CardDescription>
            Chọn 1 hoặc nhiều loại — quyết định mặc định cho hàng mua vào.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-3">
            {BIZ_OPTIONS.map((opt) => {
              const checked = bizTypes.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    checked
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/30"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setBizTypes((prev) =>
                        v
                          ? Array.from(new Set([...prev, opt.value]))
                          : prev.filter((x) => x !== opt.value),
                      );
                    }}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {opt.hint}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ccdc-threshold">
                Ngưỡng phân bổ CCDC (VND)
              </Label>
              <Input
                id="ccdc-threshold"
                type="number"
                min={0}
                step={1_000_000}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Công cụ dụng cụ ≥ ngưỡng này (mặc định 5tr) sẽ vào TK 242 và phân
                bổ nhiều kỳ thay vì ghi nhận thẳng vào 153.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost-center">Bộ phận chi phí mặc định</Label>
              <Select
                value={costCenter}
                onValueChange={(v) =>
                  setCostCenter(v as "627" | "641" | "642")
                }
              >
                <SelectTrigger id="cost-center">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="627">627 — Sản xuất chung</SelectItem>
                  <SelectItem value="641">641 — Bán hàng</SelectItem>
                  <SelectItem value="642">642 — Quản lý DN</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Áp dụng khi không xác định được bộ phận từ tên dịch vụ.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Chuẩn kế toán hiện tại:{" "}
            <Badge variant="outline">
              {cfgQ.data?.accounting_standard ?? "TT133"}
            </Badge>
            <span>
              {cfgQ.data?.accounting_standard === "TT133"
                ? "(TT133 gộp TSCĐ vô hình vào TK 211)"
                : "(TT200 tách 211 hữu hình / 213 vô hình)"}
            </span>
          </div>

          <Button
            onClick={() => saveCfg.mutate()}
            disabled={saveCfg.isPending || cfgQ.isLoading}
          >
            Lưu cấu hình
          </Button>
        </CardContent>
      </Card>

      {/* Product catalog */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              Danh mục mặt hàng kinh doanh
            </CardTitle>
            <CardDescription>
              Liệt kê các mặt hàng bạn <b>mua về để bán lại</b>. Khi tên trên hoá
              đơn khớp danh mục này → Fin tự gán <b>TK 156</b>, thay vì đoán
              153/211.
              {!hasTrading && (
                <span className="block mt-1 text-amber-600">
                  Bạn chưa chọn "Thương mại" — danh mục này sẽ chỉ dùng làm gợi ý.
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <CsvImportButton
              onDone={() => qc.invalidateQueries({ queryKey: ["product-catalog"] })}
            />
            <ProductDialog onSaved={() => qc.invalidateQueries({ queryKey: ["product-catalog"] })} upsertCat={upsertCat} />
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
              Chưa có mặt hàng nào. Bấm <b>"Thêm mặt hàng"</b> để bắt đầu.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên mặt hàng</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Tên gọi khác</TableHead>
                  <TableHead className="w-24 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(r.aliases ?? []).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <ProductDialog
                          existing={r}
                          onSaved={() =>
                            qc.invalidateQueries({ queryKey: ["product-catalog"] })
                          }
                          upsertCat={upsertCat}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Xoá mặt hàng?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{r.name}" sẽ không còn được Fin nhận diện là hàng
                                bán lại.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Huỷ</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    await deleteCat({ data: { id: r.id } });
                                    toast.success("Đã xoá");
                                    qc.invalidateQueries({
                                      queryKey: ["product-catalog"],
                                    });
                                  } catch (e: any) {
                                    toast.error(e.message ?? "Lỗi");
                                  }
                                }}
                              >
                                Xoá
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductDialog({
  existing,
  upsertCat,
  onSaved,
}: {
  existing?: { id: string; name: string; sku: string | null; aliases: string[]; note: string | null };
  upsertCat: (input: any) => Promise<any>;
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(existing?.name ?? "");
  const [sku, setSku] = React.useState(existing?.sku ?? "");
  const [aliases, setAliases] = React.useState(
    (existing?.aliases ?? []).join("\n"),
  );
  const [note, setNote] = React.useState(existing?.note ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setSku(existing.sku ?? "");
      setAliases((existing.aliases ?? []).join("\n"));
      setNote(existing.note ?? "");
    } else if (open && !existing) {
      setName("");
      setSku("");
      setAliases("");
      setNote("");
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nhập tên mặt hàng");
      return;
    }
    setSaving(true);
    try {
      await upsertCat({
        data: {
          id: existing?.id,
          name: name.trim(),
          sku: sku.trim() || null,
          aliases: aliases
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20),
          note: note.trim() || null,
        },
      });
      toast.success(existing ? "Đã cập nhật" : "Đã thêm mặt hàng");
      onSaved();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Thêm mặt hàng
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Sửa mặt hàng" : "Thêm mặt hàng kinh doanh"}
          </DialogTitle>
          <DialogDescription>
            Mặt hàng bạn mua về để bán lại — sẽ được hạch toán vào TK 156.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Tên mặt hàng *</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Laptop Dell Latitude"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-sku">SKU / Mã hàng</Label>
            <Input
              id="p-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="(không bắt buộc)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-aliases">Tên gọi khác (mỗi dòng 1 cái)</Label>
            <Textarea
              id="p-aliases"
              rows={3}
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder={"Dell Latitude 5420\nLaptop Dell 14 inch"}
            />
            <p className="text-xs text-muted-foreground">
              Fin sẽ match cả các tên này khi đối chiếu với hoá đơn.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-note">Ghi chú</Label>
            <Input
              id="p-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Đang lưu..." : existing ? "Cập nhật" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyTenants } from "@/lib/tenants.functions";
import {
  getBusinessConfig,
  updateBusinessConfig,
  listProductCatalog,
  upsertProductCatalog,
  deleteProductCatalog,
  bulkImportProductCatalog,
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
import { Plus, Pencil, Trash2, Info, Lightbulb } from "lucide-react";

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

export function BusinessActivitySection({ showWhyPanel = true }: { showWhyPanel?: boolean }) {
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
  const [costCenter, setCostCenter] = React.useState<"627" | "641" | "642">("642");

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
    <div className="space-y-5">
      {showWhyPanel && (
        <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-3">
          <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1.5">
            <p className="font-medium">Vì sao cần khai báo phần này?</p>
            <p className="text-muted-foreground">
              Cùng 1 món hàng có thể vào nhiều tài khoản tuỳ DN <b>làm gì</b> với nó:
              cửa hàng bán → <b>156</b>; công ty tư vấn mua dùng → <b>211</b>; xưởng sản
              xuất mua lắp ráp → <b>152</b>. Không khai báo → Fin phải đoán.
            </p>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Loại hình hoạt động
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {BIZ_OPTIONS.map((opt) => {
            const checked = bizTypes.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition ${
                  checked ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"
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
                  <div className="text-xs text-muted-foreground">{opt.hint}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ccdc-threshold" className="text-xs">
            Ngưỡng phân bổ CCDC (VND)
          </Label>
          <Input
            id="ccdc-threshold"
            inputMode="numeric"
            value={threshold ? threshold.toLocaleString("vi-VN") : ""}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, "")) || 0;
              setThreshold(n);
            }}
            placeholder="5.000.000"
          />
          <p className="text-[11px] text-muted-foreground">
            CCDC ≥ ngưỡng (mặc định 5tr) → TK 242, phân bổ nhiều kỳ thay vì 153.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cost-center" className="text-xs">
            Bộ phận chi phí mặc định
          </Label>
          <Select
            value={costCenter}
            onValueChange={(v) => setCostCenter(v as "627" | "641" | "642")}
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
          <p className="text-[11px] text-muted-foreground">
            Áp dụng khi không xác định được bộ phận từ tên dịch vụ.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        Chế độ kế toán hiện tại:{" "}
        <Badge variant="outline">{cfgQ.data?.accounting_standard ?? "TT133"}</Badge>
        <span>
          {cfgQ.data?.accounting_standard === "TT133"
            ? "(TT133 gộp TSCĐ vô hình vào TK 211)"
            : "(TT200 tách 211 hữu hình / 213 vô hình)"}
        </span>
      </div>

      <div>
        <Button
          size="sm"
          onClick={() => saveCfg.mutate()}
          disabled={saveCfg.isPending || cfgQ.isLoading}
        >
          Lưu loại hình hoạt động
        </Button>
      </div>

      <div className="pt-2 border-t">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Danh mục mặt hàng kinh doanh
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">
              Mặt hàng bạn <b>mua về để bán lại</b>. Tên trên hoá đơn khớp → Fin tự gán{" "}
              <b>TK 156</b>.
              {!hasTrading && (
                <span className="block mt-1 text-amber-600">
                  Chưa chọn "Thương mại" — danh mục này chỉ dùng làm gợi ý.
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CsvImportButton
              onDone={() => qc.invalidateQueries({ queryKey: ["product-catalog"] })}
            />
            <ProductDialog
              onSaved={() => qc.invalidateQueries({ queryKey: ["product-catalog"] })}
              upsertCat={upsertCat}
            />
          </div>
        </div>

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
                              "{r.name}" sẽ không còn được Fin nhận diện là hàng bán
                              lại.
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
      </div>
    </div>
  );
}

function ProductDialog({
  existing,
  upsertCat,
  onSaved,
}: {
  existing?: {
    id: string;
    name: string;
    sku: string | null;
    aliases: string[];
    note: string | null;
  };
  upsertCat: (input: any) => Promise<any>;
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(existing?.name ?? "");
  const [sku, setSku] = React.useState(existing?.sku ?? "");
  const [aliases, setAliases] = React.useState((existing?.aliases ?? []).join("\n"));
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
            <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} />
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

function parseCsv(
  text: string,
): Array<{ name: string; sku?: string | null; aliases?: string[]; note?: string | null }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = /name|tên|sku/.test(first);
  const rows = hasHeader ? lines.slice(1) : lines;
  const out: Array<{
    name: string;
    sku?: string | null;
    aliases?: string[];
    note?: string | null;
  }> = [];
  for (const raw of rows) {
    const sep = raw.includes("\t") ? "\t" : ",";
    const cols = raw.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!cols[0]) continue;
    out.push({
      name: cols[0],
      sku: cols[1] || null,
      aliases: cols[2] ? cols[2].split("|").map((s) => s.trim()).filter(Boolean) : [],
      note: cols[3] || null,
    });
  }
  return out;
}

function CsvImportButton({ onDone }: { onDone: () => void }) {
  const bulkFn = useServerFn(bulkImportProductCatalog);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const items = parseCsv(text);
      if (items.length === 0) {
        toast.error("Không tìm thấy dòng hợp lệ trong tệp");
        return;
      }
      const res = await bulkFn({ data: { items } });
      toast.success(
        `Đã nhập ${res.inserted} mặt hàng${res.skipped ? ` (bỏ qua ${res.skipped})` : ""}`,
      );
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Lỗi nhập danh mục");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Cột: tên, SKU, alias (ngăn cách |), ghi chú"
      >
        {busy ? "Đang nhập…" : "Nhập CSV"}
      </Button>
    </>
  );
}

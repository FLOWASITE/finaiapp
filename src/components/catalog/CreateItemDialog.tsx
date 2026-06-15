import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { upsertCatalogItem } from "@/lib/catalog/catalog.functions";

const schema = z.object({
  code: z.string().min(1, "Mã không được để trống").max(50),
  name: z.string().min(1, "Tên không được để trống").max(255),
  itemType: z.enum(["service", "goods", "mixed"]),
  unit: z.string().max(20).default("cái"),
  vatRateStandard: z.number().min(0).max(1).default(0.1),
  defaultAccountTT99: z.string().max(10).optional(),
  can_be_sold: z.boolean().default(true),
  can_be_purchased: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

export type ProductLike = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  unit_cost?: number | null;
  unit_price?: number | null;
  on_hand?: number | null;
  item_type?: string | null;
  stock_account?: string | null;
  expense_account?: string | null;
  revenue_account?: string | null;
  vat_rate?: number | null;
  can_be_sold?: boolean;
  can_be_purchased?: boolean;
  barcode?: string | null;
  usage_count?: number | null;
};

export function CreateItemDialog({
  open,
  onOpenChange,
  onCreated,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (p: ProductLike) => void;
  mode: "purchase" | "sales";
}) {
  const upsertFn = useServerFn(upsertCatalogItem);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormValues>({
    code: "",
    name: "",
    itemType: "goods",
    unit: "cái",
    vatRateStandard: 0.1,
    defaultAccountTT99: "",
    can_be_sold: true,
    can_be_purchased: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSubmit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join(".")] = issue.message;
      }
      setErrors(next);
      return;
    }
    const v = parsed.data;
    setSubmitting(true);
    try {
      const row = await upsertFn({
        data: {
          item: {
            code: v.code,
            name: v.name,
            itemType: v.itemType,
            unit: v.unit,
            vatRateStandard: v.vatRateStandard,
            defaultAccountTT99: v.defaultAccountTT99 || (v.itemType === "service" ? "642" : "156"),
            can_be_sold: v.can_be_sold,
            can_be_purchased: v.can_be_purchased,
            isActive: true,
          } as any,
        },
      });
      const created: ProductLike = {
        id: (row as any).id,
        code: (row as any).code ?? v.code,
        name: (row as any).name ?? v.name,
        unit: (row as any).unit ?? v.unit,
        item_type: (row as any).item_type ?? v.itemType,
        vat_rate: (row as any).vat_rate ?? Math.round(v.vatRateStandard * 100),
        can_be_sold: (row as any).can_be_sold ?? v.can_be_sold,
        can_be_purchased: (row as any).can_be_purchased ?? v.can_be_purchased,
        stock_account: (row as any).stock_account ?? (v.itemType === "service" ? null : (v.defaultAccountTT99 || "156")),
        expense_account: (row as any).expense_account ?? (v.itemType === "service" ? (v.defaultAccountTT99 || "642") : null),
        revenue_account: (row as any).revenue_account ?? "511",
        unit_cost: (row as any).unit_cost ?? 0,
        unit_price: (row as any).unit_price ?? 0,
        on_hand: (row as any).on_hand ?? 0,
        barcode: (row as any).barcode ?? null,
      };
      toast.success(`Đã tạo "${v.name}"`);
      queryClient.invalidateQueries({ queryKey: ["products-picker"] });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onCreated(created);
      onOpenChange(false);
      setForm({
        code: "",
        name: "",
        itemType: "goods",
        unit: "cái",
        vatRateStandard: 0.1,
        defaultAccountTT99: "",
        can_be_sold: true,
        can_be_purchased: true,
      });
      setErrors({});
    } catch (e: any) {
      toast.error(e?.message ?? "Không tạo được sản phẩm");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>Tạo mặt hàng / dịch vụ mới</DialogTitle>
          <DialogDescription>Nhập thông tin cơ bản để thêm vào danh mục.</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4 space-y-4 overflow-auto text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mã sản phẩm *</Label>
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                disabled={submitting}
              />
              {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code}</p>}
            </div>
            <div>
              <Label>Tên sản phẩm *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                disabled={submitting}
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại</Label>
              <Select
                value={form.itemType}
                onValueChange={(v) => set("itemType", v as FormValues["itemType"])}
                disabled={submitting}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="goods">Hàng hóa</SelectItem>
                  <SelectItem value="service">Dịch vụ</SelectItem>
                  <SelectItem value="mixed">Hỗn hợp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Đơn vị tính</Label>
              <Input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>VAT chuẩn</Label>
              <Select
                value={String(form.vatRateStandard)}
                onValueChange={(v) => set("vatRateStandard", Number(v))}
                disabled={submitting}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="0.05">5%</SelectItem>
                  <SelectItem value="0.08">8%</SelectItem>
                  <SelectItem value="0.1">10%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>TK mặc định (TT99)</Label>
              <Input
                value={form.defaultAccountTT99}
                onChange={(e) => set("defaultAccountTT99", e.target.value)}
                placeholder={form.itemType === "service" ? "642" : "156"}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={form.can_be_purchased}
                onCheckedChange={(v) => set("can_be_purchased", !!v)}
                disabled={submitting}
              />
              <span>Cho phép mua</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={form.can_be_sold}
                onCheckedChange={(v) => set("can_be_sold", !!v)}
                disabled={submitting}
              />
              <span>Cho phép bán</span>
            </label>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            className="bg-[#0F6E56] hover:bg-[#085041] text-white"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Đang lưu…" : "Tạo sản phẩm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

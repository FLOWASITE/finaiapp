import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useCatalogStore } from "@/stores/catalogStore";
import { upsertCatalogItem } from "@/lib/catalog/catalog.functions";
import {
  AllocationMethod,
  Amortization,
  CategoryCode,
  ForeignSupplierTax,
  Frequency,
  ItemType,
  SupplierCountry,
} from "@/types/catalog";
import { CATEGORIES } from "@/data/categories";

const ACCOUNT_RE = /^[0-9]{3,4}$/;

// Gợi ý nhóm hạch toán chính theo bài toán phân loại mặt hàng
const ACCOUNT_PRESETS = [
  { value: "642", label: "Dịch vụ mua/bán (chi phí 642/641/627)" },
  { value: "152", label: "Nguyên vật liệu (152)" },
  { value: "153", label: "Công cụ dụng cụ (153)" },
  { value: "156", label: "Hàng hóa (156)" },
  { value: "242", label: "Chi phí trả trước – phân bổ (242)" },
  { value: "211", label: "TSCĐ hữu hình (211)" },
  { value: "213", label: "TSCĐ vô hình (213)" },
] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Tên không được để trống").max(200),
  nameEn: z.string().trim().max(200).optional(),
  category: z.string().min(1, "Chọn nhóm danh mục"),
  itemType: z.enum(["service", "goods", "mixed"]),
  defaultAccountTT99: z.string().trim().regex(ACCOUNT_RE, "TK 3-4 chữ số"),
  defaultAccountTT133: z.string().trim().regex(ACCOUNT_RE, "TK 3-4 chữ số"),
  altAccountsRaw: z.string().max(200),
  vatRateStandard: z.number().min(0).max(1),
  vatReductionEligible: z.boolean(),
  deductible: z.boolean(),
  aliasesRaw: z.string().max(500),
  typicalSuppliersRaw: z.string().max(500),
  supplierCountry: z.enum(["VN", "FOREIGN"]),
  frequency: z.enum(["monthly", "quarterly", "yearly", "one-time", "adhoc", "daily"]),
  amortization: z.enum(["expense_immediately", "prepaid_short", "prepaid_long"]),
  allocationMethod: z.enum(["single", "manual_split", "percent", "headcount", "area"]),
  foreignSupplierTax: z.enum(["none", "fct_applicable"]),
  fctVatRate: z.number().min(0).max(1),
  fctCitRate: z.number().min(0).max(1),
  notes: z.string().max(1000).optional(),
});

type FormState = z.infer<typeof schema>;

const DEFAULT: FormState = {
  name: "",
  nameEn: "",
  category: "VAN_PHONG",
  itemType: "service",
  defaultAccountTT99: "642",
  defaultAccountTT133: "642",
  altAccountsRaw: "",
  vatRateStandard: 0.1,
  vatReductionEligible: false,
  deductible: true,
  aliasesRaw: "",
  typicalSuppliersRaw: "",
  supplierCountry: "VN",
  frequency: "adhoc",
  amortization: "expense_immediately",
  allocationMethod: "single",
  foreignSupplierTax: "none",
  fctVatRate: 0,
  fctCitRate: 0,
  notes: "",
};

const splitList = (s: string) =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

function makeCode(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug || "ITEM"}_${rand}`;
}

export function ItemCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createItem = useCatalogStore((s) => s.createItem);
  const company = useCatalogStore((s) => s.company);
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(DEFAULT);
      setErrors({});
    }
  }, [open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const categoryOptions = useMemo(() => CATEGORIES, []);

  const applyAccountPreset = (acc: string) => {
    set("defaultAccountTT99", acc);
    set("defaultAccountTT133", acc);
    // Heuristic itemType + amortization theo nhóm hạch toán
    if (acc === "156" || acc === "152" || acc === "153") set("itemType", "goods");
    else if (acc === "211" || acc === "213") set("itemType", "goods");
    else set("itemType", "service");
    if (acc === "242") set("amortization", "prepaid_short");
    else if (acc === "211" || acc === "213") set("amortization", "prepaid_long");
    else set("amortization", "expense_immediately");
  };

  const handleSave = () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join(".")] = issue.message;
      }
      setErrors(next);
      toast.error("Vui lòng kiểm tra lại các trường được đánh dấu.");
      return;
    }
    const v = parsed.data;
    const code = makeCode(v.name);
    createItem({
      code,
      name: v.name,
      nameEn: v.nameEn || undefined,
      category: v.category as CategoryCode,
      itemType: v.itemType as ItemType,
      defaultAccountTT99: v.defaultAccountTT99,
      defaultAccountTT133: v.defaultAccountTT133,
      altAccounts: splitList(v.altAccountsRaw),
      vatRateStandard: v.vatRateStandard,
      vatReductionEligible: v.vatReductionEligible,
      deductible: v.deductible,
      aliases: splitList(v.aliasesRaw),
      typicalSuppliers: splitList(v.typicalSuppliersRaw),
      supplierCountry: v.supplierCountry as SupplierCountry,
      frequency: v.frequency as Frequency,
      amortization: v.amortization as Amortization,
      allocationMethod: v.allocationMethod as AllocationMethod,
      industryRelevance: [company.industry],
      foreignSupplierTax: v.foreignSupplierTax as ForeignSupplierTax,
      fctVatRate: v.foreignSupplierTax === "fct_applicable" ? v.fctVatRate : 0,
      fctCitRate: v.foreignSupplierTax === "fct_applicable" ? v.fctCitRate : 0,
      notes: v.notes || undefined,
      isActive: true,
    });
    toast.success(`Đã tạo "${v.name}"`);
    onOpenChange(false);
  };

  const err = (k: string) =>
    errors[k] ? <p className="text-xs text-red-600 mt-1">{errors[k]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>Tạo mặt hàng / dịch vụ mới</DialogTitle>
          <DialogDescription>
            Khai báo nhanh — Fin sẽ tự gợi ý tài khoản hạch toán & VAT dựa trên loại mặt hàng.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5 text-sm">
            {/* Thông tin chung */}
            <section className="space-y-3">
              <h4 className="font-semibold text-[#04342C]">Thông tin chung</h4>
              <div>
                <Label>Tên mặt hàng *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="VD: Tiền điện tháng, Bàn ghế văn phòng, Phần mềm kế toán..."
                />
                {err("name")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tên tiếng Anh</Label>
                  <Input
                    value={form.nameEn ?? ""}
                    onChange={(e) => set("nameEn", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nhóm danh mục *</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => set("category", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.nameVi}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {err("category")}
                </div>
              </div>
            </section>

            <Separator />

            {/* Hạch toán */}
            <section className="space-y-3">
              <h4 className="font-semibold text-[#04342C]">Hạch toán</h4>
              <div>
                <Label>Loại hạch toán (gợi ý nhanh)</Label>
                <Select onValueChange={applyAccountPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhóm để Fin tự điền TK & phân bổ..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>TK mặc định (TT 99)</Label>
                  <Input
                    value={form.defaultAccountTT99}
                    onChange={(e) => set("defaultAccountTT99", e.target.value)}
                  />
                  {err("defaultAccountTT99")}
                </div>
                <div>
                  <Label>TK mặc định (TT 133)</Label>
                  <Input
                    value={form.defaultAccountTT133}
                    onChange={(e) => set("defaultAccountTT133", e.target.value)}
                  />
                  {err("defaultAccountTT133")}
                </div>
              </div>
              <div>
                <Label>TK thay thế (ngăn cách bằng dấu phẩy)</Label>
                <Input
                  value={form.altAccountsRaw}
                  onChange={(e) => set("altAccountsRaw", e.target.value)}
                  placeholder="VD: 6277, 6417"
                />
              </div>
              <div className="grid grid-cols-[1.5fr_1fr] gap-3">
                <div>
                  <Label>Phân loại</Label>
                  <Select
                    value={form.itemType}
                    onValueChange={(v) => set("itemType", v as ItemType)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service">Dịch vụ</SelectItem>
                      <SelectItem value="goods">Hàng hóa</SelectItem>
                      <SelectItem value="mixed">Hỗn hợp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Phân bổ chi phí</Label>
                  <Select
                    value={form.amortization}
                    onValueChange={(v) => set("amortization", v as Amortization)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense_immediately">Ghi nhận ngay</SelectItem>
                      <SelectItem value="prepaid_short">Trả trước ngắn hạn</SelectItem>
                      <SelectItem value="prepaid_long">Trả trước dài hạn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Cách phân bổ bộ phận</Label>
                <Select
                  value={form.allocationMethod}
                  onValueChange={(v) => set("allocationMethod", v as AllocationMethod)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Một bộ phận</SelectItem>
                    <SelectItem value="manual_split">Chia thủ công</SelectItem>
                    <SelectItem value="percent">Theo tỉ lệ %</SelectItem>
                    <SelectItem value="headcount">Theo nhân sự</SelectItem>
                    <SelectItem value="area">Theo diện tích</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <Separator />

            {/* Thuế */}
            <section className="space-y-3">
              <h4 className="font-semibold text-[#04342C]">Thuế</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>VAT chuẩn</Label>
                  <Select
                    value={String(form.vatRateStandard)}
                    onValueChange={(v) => set("vatRateStandard", Number(v))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% / Không VAT</SelectItem>
                      <SelectItem value="0.05">5%</SelectItem>
                      <SelectItem value="0.08">8%</SelectItem>
                      <SelectItem value="0.1">10%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 pt-5">
                  <label className="inline-flex items-center gap-2">
                    <Checkbox
                      checked={form.vatReductionEligible}
                      onCheckedChange={(v) => set("vatReductionEligible", !!v)}
                    />
                    <span>Được giảm VAT 2%</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <Checkbox
                      checked={form.deductible}
                      onCheckedChange={(v) => set("deductible", !!v)}
                    />
                    <span>Được trừ TNDN</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Thuế nhà thầu</Label>
                  <Select
                    value={form.foreignSupplierTax}
                    onValueChange={(v) =>
                      set("foreignSupplierTax", v as ForeignSupplierTax)
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Không áp dụng</SelectItem>
                      <SelectItem value="fct_applicable">Có FCT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>FCT VAT</Label>
                  <Select
                    value={String(form.fctVatRate)}
                    onValueChange={(v) => set("fctVatRate", Number(v))}
                    disabled={form.foreignSupplierTax !== "fct_applicable"}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="0.02">2%</SelectItem>
                      <SelectItem value="0.03">3%</SelectItem>
                      <SelectItem value="0.05">5%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>FCT TNDN</Label>
                  <Select
                    value={String(form.fctCitRate)}
                    onValueChange={(v) => set("fctCitRate", Number(v))}
                    disabled={form.foreignSupplierTax !== "fct_applicable"}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="0.02">2%</SelectItem>
                      <SelectItem value="0.05">5%</SelectItem>
                      <SelectItem value="0.1">10%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            {/* NCC & tần suất */}
            <section className="space-y-3">
              <h4 className="font-semibold text-[#04342C]">Nhà cung cấp & tần suất</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Xuất xứ NCC</Label>
                  <Select
                    value={form.supplierCountry}
                    onValueChange={(v) =>
                      set("supplierCountry", v as SupplierCountry)
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VN">Việt Nam</SelectItem>
                      <SelectItem value="FOREIGN">Nước ngoài</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tần suất</Label>
                  <Select
                    value={form.frequency}
                    onValueChange={(v) => set("frequency", v as Frequency)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Hàng tháng</SelectItem>
                      <SelectItem value="quarterly">Hàng quý</SelectItem>
                      <SelectItem value="yearly">Hàng năm</SelectItem>
                      <SelectItem value="one-time">Một lần</SelectItem>
                      <SelectItem value="adhoc">Không định kỳ</SelectItem>
                      <SelectItem value="daily">Hàng ngày</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>NCC điển hình (ngăn cách bằng dấu phẩy)</Label>
                <Input
                  value={form.typicalSuppliersRaw}
                  onChange={(e) => set("typicalSuppliersRaw", e.target.value)}
                  placeholder="VD: EVN HCMC, SAWACO"
                />
              </div>
              <div>
                <Label>Tên gọi khác / aliases</Label>
                <Input
                  value={form.aliasesRaw}
                  onChange={(e) => set("aliasesRaw", e.target.value)}
                  placeholder="VD: tien dien, evn, electricity"
                />
              </div>
            </section>

            <Separator />

            <section>
              <Label>Ghi chú</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
              />
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            className="bg-[#0F6E56] hover:bg-[#085041] text-white"
            onClick={handleSave}
          >
            Tạo mặt hàng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

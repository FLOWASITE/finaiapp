import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getActiveCoaCircular } from "@/lib/coa.functions";
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

// Presets theo Loại × Chế độ kế toán
const GOODS_PRESETS = [
  { value: "156", label: "Hàng hóa (156)" },
  { value: "152", label: "Nguyên vật liệu (152)" },
  { value: "153", label: "Công cụ dụng cụ (153)" },
  { value: "242", label: "Chi phí trả trước – phân bổ (242)" },
  { value: "211", label: "TSCĐ hữu hình (211)" },
  { value: "213", label: "TSCĐ vô hình (213)" },
] as const;

const SERVICE_PRESETS_TT99 = [
  { value: "6417", label: "Chi phí DV mua ngoài – Bán hàng (6417)" },
  { value: "6427", label: "Chi phí DV mua ngoài – QLDN (6427)" },
  { value: "6277", label: "Chi phí DV mua ngoài – SXC (6277)" },
  { value: "632",  label: "Giá vốn dịch vụ (632)" },
] as const;

const SERVICE_PRESETS_TT133 = [
  { value: "6421", label: "Chi phí bán hàng (6421)" },
  { value: "6422", label: "Chi phí quản lý doanh nghiệp (6422)" },
  { value: "632",  label: "Giá vốn dịch vụ (632)" },
] as const;

const DEFAULT_SERVICE_TT99 = "6427";
const DEFAULT_SERVICE_TT133 = "6422";
const DEFAULT_GOODS = "156";

const schema = z.object({
  name: z.string().trim().min(1, "Tên không được để trống").max(200),
  category: z.string().min(1, "Chọn nhóm danh mục"),
  itemType: z.enum(["service", "goods"]),
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
  category: "VAN_PHONG",
  itemType: "service",
  defaultAccountTT99: DEFAULT_SERVICE_TT99,
  defaultAccountTT133: DEFAULT_SERVICE_TT133,
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (product: any) => void;
}) {
  const createItem = useCatalogStore((s) => s.createItem);
  const company = useCatalogStore((s) => s.company);
  const upsertFn = useServerFn(upsertCatalogItem);
  const coaFn = useServerFn(getActiveCoaCircular);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [categoryMode, setCategoryMode] = useState<"preset" | "other">("preset");
  const [categoryOther, setCategoryOther] = useState("");

  const { data: coa } = useQuery({
    queryKey: ["coa-circular"],
    queryFn: () => coaFn(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const regime: "TT99" | "TT133" = coa?.effective ?? "TT99";

  useEffect(() => {
    if (open) {
      setForm({
        ...DEFAULT,
        defaultAccountTT99: DEFAULT_SERVICE_TT99,
        defaultAccountTT133: DEFAULT_SERVICE_TT133,
      });
      setErrors({});
      setCategoryMode("preset");
      setCategoryOther("");
    }
  }, [open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const categoryOptions = useMemo(() => CATEGORIES, []);

  const servicePresets = regime === "TT133" ? SERVICE_PRESETS_TT133 : SERVICE_PRESETS_TT99;
  const presetList = form.itemType === "service" ? servicePresets : GOODS_PRESETS;

  const applyItemType = (next: "service" | "goods") => {
    if (next === "service") {
      const tt99 = DEFAULT_SERVICE_TT99;
      const tt133 = DEFAULT_SERVICE_TT133;
      setForm((f) => ({
        ...f,
        itemType: "service",
        defaultAccountTT99: tt99,
        defaultAccountTT133: tt133,
        amortization: "expense_immediately",
      }));
    } else {
      setForm((f) => ({
        ...f,
        itemType: "goods",
        defaultAccountTT99: DEFAULT_GOODS,
        defaultAccountTT133: DEFAULT_GOODS,
        category: "GOODS",
        amortization: "expense_immediately",
      }));
    }
  };

  const applyAccountPreset = (acc: string) => {
    // Đồng bộ cả 2 trường để payload đầy đủ; ô ẩn chỉ là mirror.
    set("defaultAccountTT99", acc);
    set("defaultAccountTT133", acc);
    if (acc === "242") set("amortization", "prepaid_short");
    else if (acc === "211" || acc === "213") set("amortization", "prepaid_long");
    else set("amortization", "expense_immediately");
  };

  const setDefaultAccount = (val: string) => {
    // Field hiển thị đổi → mirror sang field còn lại
    if (regime === "TT133") {
      set("defaultAccountTT133", val);
      set("defaultAccountTT99", val);
    } else {
      set("defaultAccountTT99", val);
      set("defaultAccountTT133", val);
    }
  };
  const displayedAccount = regime === "TT133" ? form.defaultAccountTT133 : form.defaultAccountTT99;
  const displayedAccountKey = regime === "TT133" ? "defaultAccountTT133" : "defaultAccountTT99";

  const handleSave = async () => {
    // Resolve category from mode
    const finalCategory =
      form.itemType === "goods"
        ? "GOODS"
        : categoryMode === "other"
          ? categoryOther.trim()
          : form.category;

    const toValidate: FormState = { ...form, category: finalCategory };
    const parsed = schema.safeParse(toValidate);
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
    const payload = {
      code,
      name: v.name,
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
    };

    if (onCreated) {
      setSubmitting(true);
      try {
        const row = await upsertFn({ data: { item: payload as any } });
        const created: any = {
          id: (row as any).id,
          code: (row as any).code ?? code,
          name: (row as any).name ?? v.name,
          unit: (row as any).unit ?? null,
          item_type: (row as any).item_type ?? v.itemType,
          vat_rate: (row as any).vat_rate ?? Math.round(v.vatRateStandard * 100),
          can_be_sold: (row as any).can_be_sold ?? true,
          can_be_purchased: (row as any).can_be_purchased ?? true,
          stock_account: (row as any).stock_account ?? null,
          expense_account: (row as any).expense_account ?? null,
          revenue_account: (row as any).revenue_account ?? null,
          unit_cost: (row as any).unit_cost ?? 0,
          unit_price: (row as any).unit_price ?? 0,
          on_hand: (row as any).on_hand ?? 0,
          barcode: (row as any).barcode ?? null,
        };
        queryClient.invalidateQueries({ queryKey: ["products-picker"] });
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        toast.success(`Đã tạo "${v.name}"`);
        onCreated(created);
        onOpenChange(false);
      } catch (e: any) {
        toast.error(e?.message ?? "Không tạo được mặt hàng");
      } finally {
        setSubmitting(false);
      }
    } else {
      createItem(payload as any);
      toast.success(`Đã tạo "${v.name}"`);
      onOpenChange(false);
    }
  };

  const err = (k: string) =>
    errors[k] ? <p className="text-xs text-red-600 mt-1">{errors[k]}</p> : null;

  const accountLabel =
    regime === "TT133" ? "Tài khoản mặc định (TT 133)" : "Tài khoản mặc định (TT 99)";

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

              {/* Toggle Dịch vụ / Hàng hóa */}
              <div>
                <Label>Đây là *</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Button
                    type="button"
                    variant={form.itemType === "service" ? "default" : "outline"}
                    className={
                      form.itemType === "service"
                        ? "bg-[#0F6E56] hover:bg-[#085041] text-white"
                        : ""
                    }
                    onClick={() => applyItemType("service")}
                  >
                    Dịch vụ
                  </Button>
                  <Button
                    type="button"
                    variant={form.itemType === "goods" ? "default" : "outline"}
                    className={
                      form.itemType === "goods"
                        ? "bg-[#0F6E56] hover:bg-[#085041] text-white"
                        : ""
                    }
                    onClick={() => applyItemType("goods")}
                  >
                    Hàng hóa
                  </Button>
                </div>
              </div>

              {/* Nhóm danh mục — chỉ cho Dịch vụ */}
              {form.itemType === "service" && (
                <div>
                  <Label>Nhóm danh mục *</Label>
                  <Select
                    value={categoryMode === "other" ? "__OTHER__" : form.category}
                    onValueChange={(v) => {
                      if (v === "__OTHER__") {
                        setCategoryMode("other");
                      } else {
                        setCategoryMode("preset");
                        set("category", v);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.nameVi}
                        </SelectItem>
                      ))}
                      <SelectItem value="__OTHER__">Khác…</SelectItem>
                    </SelectContent>
                  </Select>
                  {categoryMode === "other" && (
                    <Input
                      className="mt-2"
                      placeholder="Nhập nhóm danh mục tự do"
                      value={categoryOther}
                      onChange={(e) => setCategoryOther(e.target.value)}
                    />
                  )}
                  {err("category")}
                </div>
              )}
            </section>

            <Separator />

            {/* Hạch toán */}
            <section className="space-y-3">
              <h4 className="font-semibold text-[#04342C]">Hạch toán</h4>
              <div>
                <Label>
                  {form.itemType === "service"
                    ? "Tài khoản gợi ý cho Dịch vụ"
                    : "Loại hạch toán (gợi ý nhanh)"}
                </Label>
                <Select value={displayedAccount} onValueChange={applyAccountPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn tài khoản gợi ý..." />
                  </SelectTrigger>
                  <SelectContent>
                    {presetList.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{accountLabel}</Label>
                <Input
                  value={displayedAccount}
                  onChange={(e) => setDefaultAccount(e.target.value)}
                />
                {err(displayedAccountKey)}
              </div>

              <div>
                <Label>TK thay thế (ngăn cách bằng dấu phẩy)</Label>
                <Input
                  value={form.altAccountsRaw}
                  onChange={(e) => set("altAccountsRaw", e.target.value)}
                  placeholder="VD: 6277, 6417"
                />
              </div>

              {form.itemType === "goods" && (
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
              )}

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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            className="bg-[#0F6E56] hover:bg-[#085041] text-white"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? "Đang lưu…" : "Tạo mặt hàng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

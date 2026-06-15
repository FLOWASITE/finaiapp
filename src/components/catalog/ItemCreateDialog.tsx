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

const GOODS_PRESETS = [
  { value: "156", label: "Hàng hóa (156)" },
  { value: "152", label: "Nguyên vật liệu (152)" },
  { value: "153", label: "Công cụ dụng cụ (153)" },
  { value: "242", label: "Chi phí trả trước – phân bổ (242)" },
  { value: "211", label: "TSCĐ hữu hình (211)" },
  { value: "213", label: "TSCĐ vô hình (213)" },
] as const;

const SERVICE_PRESETS_TT99 = [
  { value: "6417", label: "DV mua ngoài – BH (6417)" },
  { value: "6427", label: "DV mua ngoài – QLDN (6427)" },
  { value: "6277", label: "DV mua ngoài – SXC (6277)" },
  { value: "632", label: "Giá vốn dịch vụ (632)" },
] as const;

const SERVICE_PRESETS_TT133 = [
  { value: "6421", label: "Chi phí bán hàng (6421)" },
  { value: "6422", label: "Chi phí QLDN (6422)" },
  { value: "632", label: "Giá vốn dịch vụ (632)" },
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary shrink-0">
        {children}
      </h3>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
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

  const servicePresets =
    regime === "TT133" ? SERVICE_PRESETS_TT133 : SERVICE_PRESETS_TT99;
  const presetList = form.itemType === "service" ? servicePresets : GOODS_PRESETS;

  const applyItemType = (next: "service" | "goods") => {
    if (next === "service") {
      setForm((f) => ({
        ...f,
        itemType: "service",
        defaultAccountTT99: DEFAULT_SERVICE_TT99,
        defaultAccountTT133: DEFAULT_SERVICE_TT133,
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
    set("defaultAccountTT99", acc);
    set("defaultAccountTT133", acc);
    if (acc === "242") set("amortization", "prepaid_short");
    else if (acc === "211" || acc === "213") set("amortization", "prepaid_long");
    else set("amortization", "expense_immediately");
  };

  const setDefaultAccount = (val: string) => {
    if (regime === "TT133") {
      set("defaultAccountTT133", val);
      set("defaultAccountTT99", val);
    } else {
      set("defaultAccountTT99", val);
      set("defaultAccountTT133", val);
    }
  };
  const displayedAccount =
    regime === "TT133" ? form.defaultAccountTT133 : form.defaultAccountTT99;
  const displayedAccountKey =
    regime === "TT133" ? "defaultAccountTT133" : "defaultAccountTT99";

  const handleSave = async () => {
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
    errors[k] ? <p className="text-xs text-destructive mt-1">{errors[k]}</p> : null;

  const accountLabel =
    regime === "TT133" ? "Tài khoản mặc định (TT 133)" : "Tài khoản mặc định (TT 99)";

  const inputCls =
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0";
  const triggerCls =
    "focus:ring-2 focus:ring-ring focus:ring-offset-0";
  const labelCls = "text-sm font-medium text-foreground block mb-2";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[880px] p-0 border border-border bg-card flex flex-col max-h-[90vh] overflow-hidden rounded-xl text-foreground">
        <DialogHeader className="px-8 py-5 border-b border-border">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Tạo mặt hàng / dịch vụ mới
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Khai báo nhanh — Fin sẽ tự gợi ý tài khoản hạch toán & VAT dựa trên loại mặt hàng.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-8 space-y-10 text-sm">
            {/* Thông tin chung */}
            <section className="space-y-5">
              <SectionTitle>Thông tin chung</SectionTitle>

              <div>
                <Label className={labelCls}>
                  Tên mặt hàng <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="VD: Tiền điện tháng, Bàn ghế văn phòng..."
                  className={inputCls}
                />
                {err("name")}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label className={labelCls}>
                    Đây là <span className="text-red-500">*</span>
                  </Label>
                  <div className="grid grid-cols-2 p-1 bg-muted border border-border rounded-lg">
                    <button
                      type="button"
                      onClick={() => applyItemType("service")}
                      className={`py-1.5 rounded-md text-sm font-medium transition-all ${
                        form.itemType === "service"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Dịch vụ
                    </button>
                    <button
                      type="button"
                      onClick={() => applyItemType("goods")}
                      className={`py-1.5 rounded-md text-sm font-medium transition-all ${
                        form.itemType === "goods"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Hàng hóa
                    </button>
                  </div>
                </div>

                {form.itemType === "service" && (
                  <div>
                    <Label className={labelCls}>
                      Nhóm danh mục <span className="text-red-500">*</span>
                    </Label>
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
                      <SelectTrigger className={triggerCls}>
                        <SelectValue />
                      </SelectTrigger>
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
                        className={`mt-2 ${inputCls}`}
                        placeholder="Nhập nhóm danh mục tự do"
                        value={categoryOther}
                        onChange={(e) => setCategoryOther(e.target.value)}
                      />
                    )}
                    {err("category")}
                  </div>
                )}
              </div>
            </section>

            {/* Hạch toán */}
            <section className="space-y-5">
              <SectionTitle>Hạch toán</SectionTitle>

              <div>
                <Label className="text-sm font-medium text-foreground block mb-3">
                  {form.itemType === "service"
                    ? "Tài khoản gợi ý cho Dịch vụ"
                    : "Loại hạch toán (gợi ý nhanh)"}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {presetList.map((p) => {
                    const isActive = displayedAccount === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => applyAccountPreset(p.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                          isActive
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-muted border-border text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label className={labelCls}>{accountLabel}</Label>
                  <Input
                    value={displayedAccount}
                    onChange={(e) => setDefaultAccount(e.target.value)}
                    className={inputCls}
                  />
                  {err(displayedAccountKey)}
                </div>
                <div>
                  <Label className={labelCls}>
                    TK thay thế{" "}
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">
                      (Phân cách bằng dấu phẩy)
                    </span>
                  </Label>
                  <Input
                    value={form.altAccountsRaw}
                    onChange={(e) => set("altAccountsRaw", e.target.value)}
                    placeholder="VD: 6277, 6417"
                    className={inputCls}
                  />
                </div>
              </div>

              {form.itemType === "goods" && (
                <div>
                  <Label className={labelCls}>Phân bổ chi phí</Label>
                  <Select
                    value={form.amortization}
                    onValueChange={(v) => set("amortization", v as Amortization)}
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense_immediately">Ghi nhận ngay</SelectItem>
                      <SelectItem value="prepaid_short">Trả trước ngắn hạn</SelectItem>
                      <SelectItem value="prepaid_long">Trả trước dài hạn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className={labelCls}>Cách phân bổ bộ phận</Label>
                <Select
                  value={form.allocationMethod}
                  onValueChange={(v) => set("allocationMethod", v as AllocationMethod)}
                >
                  <SelectTrigger className={triggerCls}>
                    <SelectValue />
                  </SelectTrigger>
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

            {/* Thuế */}
            <section className="space-y-5">
              <SectionTitle>Thuế</SectionTitle>

              <div className="grid grid-cols-2 gap-8 items-start">
                <div>
                  <Label className={labelCls}>VAT chuẩn</Label>
                  <Select
                    value={String(form.vatRateStandard)}
                    onValueChange={(v) => set("vatRateStandard", Number(v))}
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% / Không VAT</SelectItem>
                      <SelectItem value="0.05">5%</SelectItem>
                      <SelectItem value="0.08">8%</SelectItem>
                      <SelectItem value="0.1">10%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-3 pt-7">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <Checkbox
                      checked={form.vatReductionEligible}
                      onCheckedChange={(v) => set("vatReductionEligible", !!v)}
                      className="border-white/20 data-[state=checked]:bg-[#0F6E56] data-[state=checked]:border-[#0F6E56]"
                    />
                    <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                      Được giảm VAT 2%
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <Checkbox
                      checked={form.deductible}
                      onCheckedChange={(v) => set("deductible", !!v)}
                      className="border-white/20 data-[state=checked]:bg-[#0F6E56] data-[state=checked]:border-[#0F6E56]"
                    />
                    <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                      Được trừ TNDN
                    </span>
                  </label>
                </div>
              </div>

              <div className="bg-white/[0.02] p-4 rounded-lg border border-white/5 grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                    Thuế nhà thầu
                  </Label>
                  <Select
                    value={form.foreignSupplierTax}
                    onValueChange={(v) =>
                      set("foreignSupplierTax", v as ForeignSupplierTax)
                    }
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Không áp dụng</SelectItem>
                      <SelectItem value="fct_applicable">Có FCT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                    FCT VAT
                  </Label>
                  <Select
                    value={String(form.fctVatRate)}
                    onValueChange={(v) => set("fctVatRate", Number(v))}
                    disabled={form.foreignSupplierTax !== "fct_applicable"}
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="0.02">2%</SelectItem>
                      <SelectItem value="0.03">3%</SelectItem>
                      <SelectItem value="0.05">5%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                    FCT TNDN
                  </Label>
                  <Select
                    value={String(form.fctCitRate)}
                    onValueChange={(v) => set("fctCitRate", Number(v))}
                    disabled={form.foreignSupplierTax !== "fct_applicable"}
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
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

            {/* NCC & tần suất */}
            <section className="space-y-5">
              <SectionTitle>Nhà cung cấp & tần suất</SectionTitle>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label className={labelCls}>Xuất xứ NCC</Label>
                  <Select
                    value={form.supplierCountry}
                    onValueChange={(v) =>
                      set("supplierCountry", v as SupplierCountry)
                    }
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VN">Việt Nam</SelectItem>
                      <SelectItem value="FOREIGN">Nước ngoài</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={labelCls}>Tần suất</Label>
                  <Select
                    value={form.frequency}
                    onValueChange={(v) => set("frequency", v as Frequency)}
                  >
                    <SelectTrigger className={triggerCls}>
                      <SelectValue />
                    </SelectTrigger>
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
                <Label className={labelCls}>
                  NCC điển hình (ngăn cách bằng dấu phẩy)
                </Label>
                <Input
                  value={form.typicalSuppliersRaw}
                  onChange={(e) => set("typicalSuppliersRaw", e.target.value)}
                  placeholder="VD: EVN HCMC, SAWACO"
                  className={inputCls}
                />
              </div>
              <div>
                <Label className={labelCls}>Tên gọi khác / aliases</Label>
                <Input
                  value={form.aliasesRaw}
                  onChange={(e) => set("aliasesRaw", e.target.value)}
                  placeholder="VD: tien dien, evn, electricity"
                  className={inputCls}
                />
              </div>
            </section>

            <section>
              <Label className={labelCls}>Ghi chú</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                className={inputCls}
              />
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-8 py-5 border-t border-white/5 bg-[#0F1219] gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            Huỷ
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting}
            className="bg-[#0F6E56] hover:bg-[#128a6c] text-white shadow-lg shadow-[#0F6E56]/20 transition-all active:scale-[0.98]"
          >
            {submitting ? "Đang lưu…" : "Tạo mặt hàng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

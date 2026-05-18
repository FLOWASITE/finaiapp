import * as React from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { supabase } from "@/integrations/supabase/client";
import {
  getActiveTenant, updateActiveTenant, completeTenantSetup, getSetupProgress,
} from "@/lib/tenants.functions";
import { LEGAL_FORMS, TAX_METHODS, DECLARE_PERIODS } from "@/lib/vsic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Building2, FileSignature, Image as ImageIcon, Calculator, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TaxIdLookupInput } from "@/components/tax-id-lookup-input";
import { IndustryCombobox } from "@/components/industry-combobox";
import { SetupStepper } from "@/components/setup-stepper";

export const Route = createFileRoute("/_app/setup")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

type Form = Record<string, any>;
const STEPS = [
  { title: "Pháp lý", icon: <Building2 className="h-4 w-4" /> },
  { title: "Liên hệ", icon: <MapPin className="h-4 w-4" /> },
  { title: "Tài chính", icon: <Calculator className="h-4 w-4" /> },
  { title: "Người ký", icon: <FileSignature className="h-4 w-4" /> },
  { title: "Thương hiệu", icon: <ImageIcon className="h-4 w-4" /> },
];

function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getActiveTenant);
  const upd = useServerFn(updateActiveTenant);
  const complete = useServerFn(completeTenantSetup);
  const progressFn = useServerFn(getSetupProgress);

  const { data } = useQuery({ queryKey: ["active-tenant"], queryFn: () => get(),
 ...QUERY_PRESETS.TENANT_STATIC,
});
  const { data: progress } = useQuery({ queryKey: ["setup-progress"], queryFn: () => progressFn(),
 ...QUERY_PRESETS.TENANT_STATIC,
});
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<Form>({});
  const [billingSame, setBillingSame] = React.useState(true);
  const [shippingSame, setShippingSame] = React.useState(true);

  React.useEffect(() => {
    if (data?.tenant && Object.keys(form).length === 0) {
      setForm(data.tenant);
      setBillingSame(!data.tenant.billing_address);
      setShippingSame(!data.tenant.shipping_address);
    }
  }, [data, form]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const saveMut = useMutation({
    mutationFn: (v: any) => upd({ data: v }),
    onError: (e: any) => toast.error(e.message),
  });
  const completeMut = useMutation({
    mutationFn: () => complete(),
    onSuccess: () => {
      toast.success("Đã hoàn tất khai báo tổ chức");
      qc.invalidateQueries();
      navigate({ to: "/dashboard" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const persist = async () => {
    const payload: any = { ...form };
    payload.billing_address = billingSame ? null : form.billing_address ?? null;
    payload.shipping_address = shippingSame ? null : form.shipping_address ?? null;
    await saveMut.mutateAsync(payload);
    qc.invalidateQueries({ queryKey: ["active-tenant"] });
    qc.invalidateQueries({ queryKey: ["setup-progress"] });
  };

  const next = async () => {
    await persist();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const finish = async () => { await persist(); completeMut.mutate(); };

  if (!data) return <div className="p-8 text-sm text-muted-foreground">Đang tải…</div>;
  if (!data.tenant) return <div className="p-8 text-sm text-muted-foreground">Chưa chọn tổ chức.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold">Khai báo tổ chức</h1>
        <p className="text-sm text-muted-foreground">
          Hoàn tất thông tin pháp lý theo chuẩn phần mềm kế toán. Dữ liệu này sẽ được dùng trên hoá đơn, sổ sách và BCTC.
        </p>
        <SetupStepper steps={STEPS} current={step} onJump={(i) => setStep(i)} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {STEPS[step].icon}
            Bước {step + 1}/{STEPS.length}: {STEPS[step].title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && <LegalStep form={form} set={set} setForm={setForm} />}
          {step === 1 && <ContactStep form={form} set={set} billingSame={billingSame} setBillingSame={setBillingSame} shippingSame={shippingSame} setShippingSame={setShippingSame} />}
          {step === 2 && <FinanceStep form={form} set={set} />}
          {step === 3 && <SignersStep form={form} set={set} />}
          {step === 4 && <BrandingStep form={form} set={set} />}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 sticky bottom-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate({ to: "/dashboard" })}>Để sau</Button>
        </div>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={back}>
              <ArrowLeft className="mr-1 h-4 w-4" />Quay lại
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saveMut.isPending}>
              {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Tiếp tục<ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={completeMut.isPending || saveMut.isPending}>
              {(completeMut.isPending || saveMut.isPending) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-1 h-4 w-4" />Hoàn tất
              {progress ? ` (${progress.percent}%)` : ""}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LegalStep({ form, set, setForm }: any) {
  return (
    <div className="space-y-4">
      <Field label="Mã số thuế" required hint="Nhấn kính lúp để tự điền tên & địa chỉ.">
        <TaxIdLookupInput
          value={form.tax_id ?? ""}
          onChange={(v) => set("tax_id", v)}
          onResolved={(d) => setForm((p: any) => ({
            ...p, tax_id: d.taxId,
            company_name: p.company_name || d.name,
            address: p.address || d.address || "",
          }))}
        />
      </Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Tên pháp nhân" required hint="In trên hoá đơn, BCTC.">
          <Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} placeholder="CÔNG TY TNHH ABC" />
        </Field>
        <Field label="Tên giao dịch" hint="Tên thương mại / viết tắt.">
          <Input value={form.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} placeholder="ABC Co." />
        </Field>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Loại hình doanh nghiệp" required>
          <Select value={form.legal_form ?? ""} onValueChange={(v) => set("legal_form", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn loại hình" /></SelectTrigger>
            <SelectContent>
              {LEGAL_FORMS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ngày thành lập">
          <Input type="date" value={form.established_date ?? ""} onChange={(e) => set("established_date", e.target.value)} />
        </Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Số GPKD/ĐKKD" required>
          <Input value={form.business_reg_no ?? ""} onChange={(e) => set("business_reg_no", e.target.value)} placeholder="0123456789" />
        </Field>
        <Field label="Ngày cấp" required>
          <Input type="date" value={form.business_reg_date ?? ""} onChange={(e) => set("business_reg_date", e.target.value)} />
        </Field>
        <Field label="Nơi cấp">
          <Input value={form.business_reg_place ?? ""} onChange={(e) => set("business_reg_place", e.target.value)} placeholder="Sở KH-ĐT TP.HCM" />
        </Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Field label="Ngành nghề chính">
            <IndustryCombobox
              code={form.industry_code}
              name={form.industry_name}
              onChange={(code, name) => setForm((p: any) => ({ ...p, industry_code: code, industry_name: name }))}
            />
          </Field>
        </div>
        <Field label="Hoặc nhập mã ngành" hint="4-6 chữ số nếu không có trong danh mục.">
          <Input value={form.industry_code ?? ""} maxLength={6} onChange={(e) => set("industry_code", e.target.value.replace(/\D/g, ""))} placeholder="6920" />
        </Field>
      </div>
    </div>
  );
}

function ContactStep({ form, set, billingSame, setBillingSame, shippingSame, setShippingSame }: any) {
  return (
    <div className="space-y-4">
      <Field label="Địa chỉ trụ sở chính" required>
        <Textarea rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" />
      </Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Điện thoại">
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="0901234567" />
        </Field>
        <Field label="Fax">
          <Input value={form.fax ?? ""} onChange={(e) => set("fax", e.target.value)} placeholder="(028) 1234 5678" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="contact@company.vn" />
        </Field>
        <Field label="Website">
          <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://company.vn" />
        </Field>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={billingSame} onCheckedChange={(v) => setBillingSame(!!v)} />
          Địa chỉ xuất hoá đơn giống trụ sở chính
        </label>
        {!billingSame && (
          <Textarea rows={2} value={form.billing_address ?? ""} onChange={(e) => set("billing_address", e.target.value)} placeholder="Địa chỉ xuất hoá đơn" />
        )}
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={shippingSame} onCheckedChange={(v) => setShippingSame(!!v)} />
          Địa chỉ giao hàng giống trụ sở chính
        </label>
        {!shippingSame && (
          <Textarea rows={2} value={form.shipping_address ?? ""} onChange={(e) => set("shipping_address", e.target.value)} placeholder="Địa chỉ giao hàng" />
        )}
      </div>
    </div>
  );
}

function FinanceStep({ form, set }: any) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Chuẩn kế toán" required>
          <Select value={form.accounting_standard ?? ""} onValueChange={(v) => set("accounting_standard", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TT133">TT133 — Doanh nghiệp nhỏ và vừa</SelectItem>
              <SelectItem value="TT200">TT200 — Đầy đủ</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Đồng tiền hạch toán" required>
          <Input value={form.base_currency ?? "VND"} onChange={(e) => set("base_currency", e.target.value.toUpperCase())} maxLength={3} />
        </Field>
        <Field label="Tháng bắt đầu năm tài chính" required>
          <Select value={String(form.fiscal_year_start ?? 1)} onValueChange={(v) => set("fiscal_year_start", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>Tháng {m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cơ quan thuế quản lý">
          <Input value={form.tax_authority ?? ""} onChange={(e) => set("tax_authority", e.target.value)} placeholder="Chi cục Thuế Quận 1" />
        </Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="PP tính thuế GTGT" required>
          <Select value={form.tax_method ?? ""} onValueChange={(v) => set("tax_method", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              {TAX_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kỳ kê khai GTGT" required>
          <Select value={form.vat_period ?? ""} onValueChange={(v) => set("vat_period", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              {DECLARE_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kỳ kê khai TNCN">
          <Select value={form.pit_period ?? ""} onValueChange={(v) => set("pit_period", v)}>
            <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
            <SelectContent>
              {DECLARE_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function SignersStep({ form, set }: any) {
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Đại diện pháp luật</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Họ và tên" required>
            <Input value={form.legal_rep_name ?? ""} onChange={(e) => set("legal_rep_name", e.target.value)} />
          </Field>
          <Field label="Chức danh" required>
            <Input value={form.legal_rep_title ?? ""} onChange={(e) => set("legal_rep_title", e.target.value)} placeholder="Giám đốc / Tổng giám đốc" />
          </Field>
          <Field label="CCCD/CMND" hint="9 hoặc 12 chữ số.">
            <Input value={form.legal_rep_id_no ?? ""} onChange={(e) => set("legal_rep_id_no", e.target.value.replace(/\D/g, ""))} maxLength={12} placeholder="0790xxxxxxxx" />
          </Field>
          <Field label="Ngày cấp">
            <Input type="date" value={form.legal_rep_id_date ?? ""} onChange={(e) => set("legal_rep_id_date", e.target.value)} />
          </Field>
          <Field label="Điện thoại">
            <Input value={form.legal_rep_phone ?? ""} onChange={(e) => set("legal_rep_phone", e.target.value)} />
          </Field>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Kế toán trưởng</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Họ và tên">
            <Input value={form.chief_accountant_name ?? ""} onChange={(e) => set("chief_accountant_name", e.target.value)} />
          </Field>
          <Field label="Số chứng chỉ hành nghề">
            <Input value={form.chief_accountant_cert_no ?? ""} onChange={(e) => set("chief_accountant_cert_no", e.target.value)} placeholder="Vd: KT-2020-1234" />
          </Field>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Người lập biểu</h3>
        <Field label="Họ và tên">
          <Input value={form.preparer_name ?? ""} onChange={(e) => set("preparer_name", e.target.value)} />
        </Field>
      </section>
    </div>
  );
}

function BrandingStep({ form }: any) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tải logo, chữ ký, con dấu để in trên hoá đơn và BCTC. Bạn có thể bỏ qua bước này và cập nhật sau trong Cài đặt.
      </p>
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Vào <strong>Cài đặt → Tổ chức → Thương hiệu & chữ ký</strong> để tải ảnh.<br />
        Bấm <strong>Hoàn tất</strong> để kết thúc khai báo.
      </div>
      {form.logo_url && <img src={form.logo_url} alt="Logo" className="mx-auto h-16 object-contain" />}
    </div>
  );
}

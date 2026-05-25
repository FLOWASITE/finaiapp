import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  getSettings,
  updateSettings,
  togglePeriodLock,
  listFxRates,
  upsertFxRate,
} from "@/lib/settings.functions";
import {
  getActiveTenant,
  updateActiveTenant,
  listTenantMembers,
  inviteTenantMember,
  updateMemberRole,
  removeMember,
} from "@/lib/tenants.functions";
import { computeTenantSetupProgress } from "@/lib/tenant-setup-fields";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Lock,
  Unlock,
  Upload,
  X,
  UserPlus,
  Trash2,
  Building2,
  Calculator,
  FileSignature,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Scale,
  MapPin,
  Users as UsersIcon,
  AlertCircle,
  CheckCircle2,
  Wand2,
  RefreshCw,
  Loader2,
  Package,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { lookupTaxId, type TaxLookupResult } from "@/lib/tax-lookup.functions";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { TaxIdLookupInput } from "@/components/tax-id-lookup-input";
import { IndustryCombobox } from "@/components/industry-combobox";
import { SectionNav } from "@/components/settings-section-nav";
import { LEGAL_FORMS, TAX_METHODS, DECLARE_PERIODS } from "@/lib/vsic";
import { DigestSettingsCard } from "@/components/settings/digest-settings-card";
import { BusinessActivitySection } from "@/components/settings/business-activity-section";

export const Route = createFileRoute("/_app/settings/")({ component: SettingsPage });

const TAB_KEY = "settings.activeTab";
const TAB_VALUES = ["organization", "company", "members", "roles", "periods", "fx"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function SettingsPage() {
  const [tab, setTab] = React.useState<TabValue>("organization");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as TabValue | null;
      if (saved && TAB_VALUES.includes(saved)) setTab(saved);
    } catch {}
  }, []);

  const handleTabChange = (v: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(v) ? (v as TabValue) : "organization";
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {}
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Hồ sơ doanh nghiệp, kỳ kế toán, tỷ giá, phân quyền
        </p>
      </div>

      {/* Shortcut: nhóm 1 — Khai báo trọng yếu */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Khai báo trọng yếu
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              to: "/settings/business-activity",
              label: "Hoạt động & Mặt hàng",
              desc: "Cấu hình ngành nghề & ánh xạ tài khoản",
              icon: <Wand2 className="h-5 w-5" />,
            },
            {
              to: "/items",
              label: "Khai báo mặt hàng",
              desc: "Danh mục hàng hoá, dịch vụ, NVL, CCDC",
              icon: <Package className="h-5 w-5" />,
            },
            {
              to: "/settings/fiscal-periods",
              label: "Kỳ kế toán",
              desc: "Mở/khoá sổ theo tháng, quý, năm",
              icon: <Lock className="h-5 w-5" />,
            },
          ].map((it) => (
            <Button
              key={it.to}
              asChild
              variant="outline"
              className="group h-auto justify-start gap-3 border-primary/30 bg-primary/5 px-4 py-3 hover:border-primary/50 hover:bg-primary/10"
            >
              <Link to={it.to as any}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary group-hover:bg-primary/25">
                  {it.icon}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold leading-tight">{it.label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground leading-snug">
                    {it.desc}
                  </span>
                </span>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Shortcut: nhóm 2 — Cơ cấu tổ chức */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cơ cấu tổ chức
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { to: "/settings/branches", label: "Chi nhánh", icon: <Building2 className="h-4 w-4" /> },
            { to: "/settings/departments", label: "Phòng ban", icon: <UsersIcon className="h-4 w-4" /> },
            { to: "/settings/projects", label: "Dự án", icon: <Wand2 className="h-4 w-4" /> },
            { to: "/settings/cost-centers", label: "Bộ phận chi phí", icon: <Calculator className="h-4 w-4" /> },
          ].map((it) => (
            <Button
              key={it.to}
              asChild
              variant="outline"
              size="sm"
              title={it.label}
              className="justify-start h-auto py-2"
            >
              <Link to={it.to as any}>
                {it.icon}
                <span className="ml-2 whitespace-normal break-words text-left leading-tight text-xs">
                  {it.label}
                </span>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <DigestSettingsCard />
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div
          className="-mx-6 px-6 sm:mx-0 sm:px-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
          role="tablist"
          aria-label="Cài đặt"
        >
          <TabsList className="inline-flex h-auto w-max gap-1 bg-muted/60 p-1 rounded-lg">
            {[
              { v: "organization", label: "Tổ chức" },
              { v: "company", label: "Hồ sơ cá nhân" },
              { v: "members", label: "Thành viên" },
              { v: "roles", label: "Phân quyền" },
              { v: "periods", label: "Khoá sổ" },
              { v: "fx", label: "Tỷ giá" },
            ].map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                data-tab-value={t.v}
                ref={(el) => {
                  if (el && t.v === tab) {
                    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                  }
                }}
                className="snap-start shrink-0 min-h-9 px-3 sm:px-4 text-xs sm:text-sm whitespace-nowrap"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="organization">
          <OrganizationTab />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab />
        </TabsContent>
        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>
        <TabsContent value="periods">
          <PeriodsTab />
        </TabsContent>
        <TabsContent value="fx">
          <FxTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SECTIONS = [
  { id: "sec-business", label: "Thông tin doanh nghiệp", icon: <Building2 className="h-4 w-4" /> },
  { id: "sec-tax", label: "Thông tin kế toán thuế", icon: <Calculator className="h-4 w-4" /> },
  { id: "sec-activity", label: "Hoạt động kinh doanh", icon: <Package className="h-4 w-4" /> },
  { id: "sec-reps", label: "Người đại diện & Chữ ký", icon: <UsersIcon className="h-4 w-4" /> },
];

// Suy luận loại hình doanh nghiệp từ tên pháp nhân (theo cụm từ phổ biến tiếng Việt).
function inferLegalForm(companyName: string | null | undefined): string | null {
  if (!companyName) return null;
  const s = companyName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D");
  if (/\bHO\s*KINH\s*DOANH\b|\bHKD\b/.test(s)) return "household";
  if (/\bCHI\s*NHANH\b/.test(s)) return "branch";
  if (/\bDOANH\s*NGHIEP\s*TU\s*NHAN\b|\bDNTN\b/.test(s)) return "sole_prop";
  if (/\bHOP\s*DANH\b/.test(s)) return "partnership";
  if (/\bCO\s*PHAN\b|\bCONG\s*TY\s*CP\b|\bCTCP\b/.test(s)) return "jsc";
  if (/\bTNHH\b|\bTRACH\s*NHIEM\s*HUU\s*HAN\b/.test(s)) return "llc";
  return null;
}

// Map legal_form chi tiết → kind UI đơn giản hoá (Công ty / Hộ KD)
function legalFormToKind(lf: string | null | undefined): "company" | "household" {
  return lf === "household" ? "household" : "company";
}

function OrganizationTab() {
  const get = useServerFn(getActiveTenant);
  const upd = useServerFn(updateActiveTenant);
  const lookupFn = useServerFn(lookupTaxId);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["active-tenant"],
    queryFn: () => get(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });
  const progress = React.useMemo(() => computeTenantSetupProgress(data?.tenant), [data?.tenant]);
  const [form, setForm] = React.useState<any>(null);
  const [diffShipping, setDiffShipping] = React.useState(false);
  const [overwriteAll, setOverwriteAll] = React.useState(false);
  const loadedTenantIdRef = React.useRef<string | null>(null);
  const userEditedLegalFormRef = React.useRef(false);
  React.useEffect(() => {
    const t: any = data?.tenant;
    if (t && loadedTenantIdRef.current !== t.id) {
      loadedTenantIdRef.current = t.id;
      userEditedLegalFormRef.current = !!t.legal_form;
      setForm(t);
      setDiffShipping(
        !!(t.shipping_address && t.shipping_address !== (t.billing_address ?? t.address)),
      );
    }
  }, [data]);

  const canEdit = data?.myRole === "owner" || data?.myRole === "admin";
  const mutate = useMutation({
    mutationFn: (v: any) => upd({ data: v }),
    onSuccess: () => {
      toast.success("Đã lưu thay đổi");
      qc.invalidateQueries({ queryKey: ["active-tenant"] });
      qc.invalidateQueries({ queryKey: ["my-tenants"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const applyLookup = React.useCallback(
    (r: TaxLookupResult) => {
      setForm((prev: any) => {
        if (!prev) return prev;
        const mapping: Record<string, any> = {
          tax_id: r.taxId,
          company_name: r.name,
          trade_name: r.tradeName,
          address: r.address,
          legal_rep_name: r.director,
          legal_form: r.legalForm,
          business_reg_no: r.registrationNo,
          business_reg_date: r.registrationDate,
          established_date: r.establishedDate,
          industry_code: r.industryCode,
          industry_name: r.industryName,
          tax_authority: r.taxAuthority,
          phone: r.phone,
          email: r.email,
        };
        const next = { ...prev };
        let n = 0;
        for (const [k, v] of Object.entries(mapping)) {
          if (v === null || v === undefined || v === "") continue;
          const cur = prev[k];
          const isEmpty = cur === null || cur === undefined || cur === "";
          if (!overwriteAll && !isEmpty) continue;
          if (cur === v) continue;
          next[k] = v;
          n++;
        }
        if (n > 0) toast.success(`Đã điền ${n} trường từ MST — bấm Lưu để xác nhận`);
        else toast.info("Không có trường nào cần cập nhật");
        return next;
      });
    },
    [overwriteAll],
  );

  const refetchMut = useMutation({
    mutationFn: (taxCode: string) => lookupFn({ data: { taxCode } }),
    onSuccess: (r) => applyLookup(r),
    onError: (e: any) => toast.error(e.message || "Tra cứu MST thất bại"),
  });

  if (data && !data.tenant)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Chưa chọn tổ chức nào. Vui lòng chọn ở góc trên màn hình.
        </CardContent>
      </Card>
    );
  if (!form) return <OrganizationSkeleton />;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const dirty = JSON.stringify(form) !== JSON.stringify(data?.tenant);
  const reset = () => setForm(data?.tenant);
  const save = () => {
    const payload: any = { ...form };
    if (!diffShipping) payload.shipping_address = null;
    payload.billing_address = null;
    payload.fax = null;
    ["id", "user_id", "created_at", "updated_at", "setup_completed", "setup_completed_at"].forEach(
      (k) => delete payload[k],
    );
    mutate.mutate(payload);
    try {
      if (data?.tenant?.id)
        localStorage.setItem(`${FY_DAY_KEY}:${data.tenant.id}`, String(fyDay));
    } catch {}
  };

  const ROLE_LABEL: Record<string, string> = {
    owner: "Chủ sở hữu",
    admin: "Quản trị",
    accountant: "Kế toán",
    viewer: "Người xem",
  };
  const initials = (form.name ?? form.company_name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s: string) => s[0])
    .join("")
    .toUpperCase();
  const isComplete = !!progress.completed;
  const pct = progress.percent;
  const kind = legalFormToKind(form.legal_form);

  return (
    <div className="space-y-5 pb-24">
      {/* Hero card — gộp setup status + meta */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <Avatar className="h-14 w-14 ring-2 ring-border shadow-sm shrink-0">
              {form.logo_url ? (
                <AvatarImage
                  src={form.logo_url}
                  alt={form.name}
                  className="object-contain bg-white"
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold truncate">
                  {form.company_name || form.name || "(chưa đặt tên)"}
                </h2>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {ROLE_LABEL[data?.myRole ?? ""] ?? data?.myRole}
                </Badge>
                {!canEdit && (
                  <Badge variant="outline" className="text-[10px]">
                    Chỉ đọc
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {form.tax_id && <span>MST {form.tax_id}</span>}
                <span>{kind === "household" ? "Hộ kinh doanh" : "Công ty"}</span>
                {form.trade_name && <span className="truncate">{form.trade_name}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:self-center">
              {isComplete ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Hoàn tất
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400"
                >
                  <AlertCircle className="h-3 w-3" /> {pct}%
                </Badge>
              )}
            </div>
          </div>
          {!isComplete && (
            <>
              <div className="h-1 w-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-amber-50/50 dark:bg-amber-950/10 px-5 py-2.5 text-xs">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="flex-1 min-w-0">
                  Còn <b>{progress?.missing?.length ?? 0}</b> trường bắt buộc theo chuẩn kế toán
                  Việt Nam.
                </span>
                <Button asChild size="sm" variant="outline" className="h-7">
                  <Link to="/setup">
                    <Wand2 className="mr-1 h-3 w-3" />
                    Hoàn tất bằng Wizard
                  </Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* AI Memory banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-accent/40 px-4 py-2.5 text-xs">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
          AI
        </div>
        <div className="flex-1 min-w-[200px]">
          <span className="font-medium text-foreground">Đồng bộ với Trí nhớ AI · </span>
          <span className="text-muted-foreground">
            Mọi thay đổi tổ chức tự cập nhật vào Bối cảnh DN.
          </span>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7">
          <Link to="/ai/memory">Mở Trí nhớ AI</Link>
        </Button>
      </div>

      {/* 2-col layout: side nav + form */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <SectionNav
              sections={SECTIONS}
              progress={{ percent: pct, missingCount: progress?.missing?.length ?? 0 }}
            />
          </div>
        </aside>

        <div className="space-y-6 min-w-0">
          {/* 1. Thông tin doanh nghiệp */}
          <section id="sec-business" className="scroll-mt-20">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="h-4 w-4 text-primary" />
                  Thông tin doanh nghiệp
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Hàng 1: MST + Logo + Tên Công ty */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <Field label="Mã số thuế" required className="md:col-span-4">
                    <TaxIdLookupInput
                      disabled={!canEdit}
                      value={form.tax_id ?? ""}
                      onChange={(v) => set("tax_id", v)}
                      onResolved={applyLookup}
                    />
                  </Field>
                  <Field label="Logo công ty" className="md:col-span-3">
                    <CompactImageRow
                      label=""
                      hint="PNG/JPG"
                      url={form.logo_url}
                      onChange={(u) => set("logo_url", u)}
                      prefix="logo"
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Tên Công ty" required className="md:col-span-5">
                    <Input
                      disabled={!canEdit}
                      value={form.company_name ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((prev: any) => {
                          const next = { ...prev, company_name: v };
                          const inferred = inferLegalForm(v);
                          if (inferred && !userEditedLegalFormRef.current) {
                            next.legal_form = inferred;
                          }
                          return next;
                        });
                      }}
                      placeholder="VD: CÔNG TY TNHH ABC"
                    />
                  </Field>
                </div>

                {/* MST helpers */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      !canEdit ||
                      refetchMut.isPending ||
                      !(form.tax_id ?? "").replace(/\D/g, "").length ||
                      (form.tax_id ?? "").replace(/\D/g, "").length < 10
                    }
                    onClick={() => refetchMut.mutate((form.tax_id ?? "").replace(/\D/g, ""))}
                  >
                    {refetchMut.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    )}
                    Cập nhật từ MST
                  </Button>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={overwriteAll}
                      onCheckedChange={(v) => setOverwriteAll(!!v)}
                      disabled={!canEdit}
                    />
                    Ghi đè dữ liệu hiện có
                  </label>
                </div>

                {/* Hàng 2: Đại diện PL + Ngày thành lập + Website */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Đại diện pháp luật" required>
                    <Input
                      disabled={!canEdit}
                      value={form.legal_rep_name ?? ""}
                      onChange={(e) => set("legal_rep_name", e.target.value)}
                      placeholder="Họ và tên"
                    />
                  </Field>
                  <Field label="Ngày thành lập">
                    <Input
                      type="date"
                      disabled={!canEdit}
                      value={form.established_date ?? ""}
                      onChange={(e) => set("established_date", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Website">
                    <Input
                      disabled={!canEdit}
                      value={form.website ?? ""}
                      onChange={(e) => set("website", e.target.value)}
                      placeholder="https://congty.com"
                    />
                  </Field>
                </div>

                {/* Loại hình DN: 2 lựa chọn */}
                <Field label="Loại hình doanh nghiệp" required>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "company", label: "Công ty" },
                      { value: "household", label: "Hộ kinh doanh" },
                    ].map((opt) => {
                      const checked = kind === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            userEditedLegalFormRef.current = true;
                            if (opt.value === "household") {
                              set("legal_form", "household");
                            } else {
                              // giữ giá trị chi tiết nếu đã có (jsc/llc/...); nếu chưa thì mặc định llc
                              const cur = form.legal_form;
                              const detailed =
                                cur && cur !== "household" ? cur : "llc";
                              set("legal_form", detailed);
                            }
                          }}
                          className={`px-4 py-2 rounded-md border text-sm transition ${
                            checked
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-input hover:border-muted-foreground/40"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {kind === "company" && form.legal_form && form.legal_form !== "household" && (
                    <Hint>
                      Loại hình chi tiết:{" "}
                      <b>
                        {LEGAL_FORMS.find((f) => f.value === form.legal_form)?.label ??
                          form.legal_form}
                      </b>{" "}
                      (tự suy từ tên Công ty)
                    </Hint>
                  )}
                </Field>

                {/* Hàng 4: Địa chỉ + ĐT + Email */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <Field label="Địa chỉ trụ sở" required className="md:col-span-6">
                    <Textarea
                      disabled={!canEdit}
                      value={form.address ?? ""}
                      onChange={(e) => set("address", e.target.value)}
                      placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP"
                      rows={2}
                    />
                  </Field>
                  <Field label="Điện thoại" className="md:col-span-3">
                    <Input
                      disabled={!canEdit}
                      value={form.phone ?? ""}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="02838123456"
                    />
                  </Field>
                  <Field label="Email" className="md:col-span-3">
                    <Input
                      type="email"
                      disabled={!canEdit}
                      value={form.email ?? ""}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="ketoan@congty.com"
                    />
                  </Field>
                </div>

                {/* Toggle địa chỉ giao hàng */}
                <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
                  <Switch
                    disabled={!canEdit}
                    checked={diffShipping}
                    onCheckedChange={setDiffShipping}
                  />
                  <div className="text-sm">
                    <p className="font-medium">Có địa chỉ giao hàng riêng</p>
                    <p className="text-xs text-muted-foreground">
                      Bật nếu kho/giao nhận khác trụ sở.
                    </p>
                  </div>
                </div>
                {diffShipping && (
                  <Field label="Địa chỉ giao hàng">
                    <Textarea
                      disabled={!canEdit}
                      value={form.shipping_address ?? ""}
                      onChange={(e) => set("shipping_address", e.target.value)}
                      rows={2}
                    />
                  </Field>
                )}

                {/* Ngành nghề kinh doanh */}
                <Field label="Ngành nghề kinh doanh">
                  <IndustryCombobox
                    multi
                    disabled={!canEdit}
                    items={Array.isArray(form.industries) ? form.industries : []}
                    onChangeMulti={(items) => setForm({ ...form, industries: items })}
                  />
                </Field>
              </CardContent>
            </Card>
          </section>

          {/* 2. Thông tin kế toán thuế */}
          <section id="sec-tax" className="scroll-mt-20">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Calculator className="h-4 w-4 text-primary" />
                  Thông tin kế toán thuế
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Hàng 1: Chế độ KT + Ngày bắt đầu NTC + Đồng tiền */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Chế độ kế toán" required>
                    <Select
                      disabled={!canEdit}
                      value={form.accounting_standard ?? ""}
                      onValueChange={(v) => set("accounting_standard", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn chế độ…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TT133">
                          TT 133/2016 — DN nhỏ và vừa
                        </SelectItem>
                        <SelectItem value="TT99">TT 99/2025 — Áp dụng đầy đủ</SelectItem>
                        {form.accounting_standard === "TT200" && (
                          <SelectItem value="TT200">TT 200/2014 (cũ)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Ngày bắt đầu năm tài chính" required>
                    <div className="flex gap-2">
                      <Select
                        disabled={!canEdit}
                        value={String(fyDay)}
                        onValueChange={(v) => setFyDay(Number(v))}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {String(d).padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        disabled={!canEdit}
                        value={String(form.fiscal_year_start ?? 1)}
                        onValueChange={(v) => set("fiscal_year_start", Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              Tháng {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Hint>Đa số DN Việt Nam bắt đầu năm tài chính từ 01/Tháng 1.</Hint>
                  </Field>
                  <Field label="Đồng tiền" required>
                    <Input
                      disabled={!canEdit}
                      value={form.base_currency ?? "VND"}
                      onChange={(e) => set("base_currency", e.target.value.toUpperCase())}
                      maxLength={3}
                    />
                  </Field>
                </div>

                {/* Hàng 2: Kỳ kê khai + PP thuế + CQ thuế */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Kỳ kê khai GTGT" required>
                    <Select
                      disabled={!canEdit}
                      value={form.vat_period ?? ""}
                      onValueChange={(v) => set("vat_period", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn kỳ…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DECLARE_PERIODS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Phương pháp tính thuế" required>
                    <Select
                      disabled={!canEdit}
                      value={form.tax_method ?? ""}
                      onValueChange={(v) => set("tax_method", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn phương pháp…" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_METHODS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Cơ quan thuế quản lý">
                    <Input
                      disabled={!canEdit}
                      value={form.tax_authority ?? ""}
                      onChange={(e) => set("tax_authority", e.target.value)}
                      placeholder="VD: Chi cục Thuế Quận 1"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 3. Hoạt động kinh doanh */}
          <section id="sec-activity" className="scroll-mt-20">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-primary" />
                  Hoạt động kinh doanh
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BusinessActivitySection showWhyPanel={false} />
              </CardContent>
            </Card>
          </section>

          {/* 4. Người đại diện & Chữ ký */}
          <section id="sec-reps" className="scroll-mt-20">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <UsersIcon className="h-4 w-4 text-primary" />
                  Người đại diện & Chữ ký
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Đại diện theo pháp luật
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Họ và tên" required>
                      <Input
                        disabled={!canEdit}
                        value={form.legal_rep_name ?? ""}
                        onChange={(e) => set("legal_rep_name", e.target.value)}
                      />
                    </Field>
                    <Field label="Chức danh" required>
                      <Input
                        disabled={!canEdit}
                        value={form.legal_rep_title ?? ""}
                        onChange={(e) => set("legal_rep_title", e.target.value)}
                        placeholder="VD: Giám đốc"
                      />
                    </Field>
                    <Field label="Số CCCD / CMND">
                      <Input
                        disabled={!canEdit}
                        value={form.legal_rep_id_no ?? ""}
                        onChange={(e) => set("legal_rep_id_no", e.target.value)}
                        placeholder="9 hoặc 12 số"
                      />
                    </Field>
                    <Field label="Ngày cấp CCCD">
                      <Input
                        type="date"
                        disabled={!canEdit}
                        value={form.legal_rep_id_date ?? ""}
                        onChange={(e) => set("legal_rep_id_date", e.target.value || null)}
                      />
                    </Field>
                    <Field label="Điện thoại" className="md:col-span-2">
                      <Input
                        disabled={!canEdit}
                        value={form.legal_rep_phone ?? ""}
                        onChange={(e) => set("legal_rep_phone", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Kế toán trưởng
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Họ và tên">
                      <Input
                        disabled={!canEdit}
                        value={form.chief_accountant_name ?? ""}
                        onChange={(e) => set("chief_accountant_name", e.target.value)}
                      />
                    </Field>
                    <Field label="Số chứng chỉ hành nghề">
                      <Input
                        disabled={!canEdit}
                        value={form.chief_accountant_cert_no ?? ""}
                        onChange={(e) => set("chief_accountant_cert_no", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Người lập biểu
                  </p>
                  <Field label="Họ và tên">
                    <Input
                      disabled={!canEdit}
                      value={form.preparer_name ?? ""}
                      onChange={(e) => set("preparer_name", e.target.value)}
                    />
                  </Field>
                </div>
                <Separator />
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Chữ ký & Con dấu
                  </p>
                  <CompactImageRow
                    label="Chữ ký đại diện"
                    hint="PNG nền trong"
                    url={form.signature_url}
                    onChange={(u) => set("signature_url", u)}
                    prefix="signature"
                    disabled={!canEdit}
                  />
                  <CompactImageRow
                    label="Con dấu công ty"
                    hint="PNG nền trong"
                    url={form.stamp_url}
                    onChange={(u) => set("stamp_url", u)}
                    prefix="stamp"
                    disabled={!canEdit}
                  />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      {/* Sticky save bar */}
      {canEdit && dirty && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-xs text-muted-foreground">Bạn có thay đổi chưa lưu</span>
            <Separator orientation="vertical" className="h-5" />
            <Button size="sm" variant="ghost" onClick={reset} disabled={mutate.isPending}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Hoàn tác
            </Button>
            <Button size="sm" onClick={save} disabled={mutate.isPending}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {mutate.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrganizationSkeleton() {
  return (
    <div className="space-y-6 pb-24 animate-pulse">
      <div className="h-14 rounded-lg bg-muted/60" />
      <div className="h-24 rounded-lg bg-muted/60" />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <div className="hidden lg:block space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-md bg-muted/60" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-64 rounded-lg bg-muted/60" />
          <div className="h-48 rounded-lg bg-muted/60" />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

function MembersTab() {
  const list = useServerFn(listTenantMembers);
  const invite = useServerFn(inviteTenantMember);
  const updRole = useServerFn(updateMemberRole);
  const rm = useServerFn(removeMember);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["tenant-members"],
    queryFn: () => list(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "accountant" | "viewer">("accountant");

  const canManage = data?.myRole === "owner" || data?.myRole === "admin";
  const inviteMut = useMutation({
    mutationFn: () => invite({ data: { email, role } }),
    onSuccess: (r: any) => {
      toast.success(r?.invited ? "Đã gửi lời mời" : "Đã thêm thành viên");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: (v: { memberId: string; role: any }) => updRole({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-members"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const rmMut = useMutation({
    mutationFn: (memberId: string) => rm({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Đã gỡ thành viên");
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ROLE_LABEL: Record<string, string> = {
    owner: "Chủ sở hữu",
    admin: "Quản trị",
    accountant: "Kế toán",
    viewer: "Người xem",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thành viên tổ chức</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex gap-2 items-end border-b pb-4">
            <div className="flex-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@congty.com"
              />
            </div>
            <div>
              <Label>Vai trò</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Quản trị</SelectItem>
                  <SelectItem value="accountant">Kế toán</SelectItem>
                  <SelectItem value="viewer">Người xem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!email || inviteMut.isPending} onClick={() => inviteMut.mutate()}>
              <UserPlus className="h-4 w-4 mr-1" />
              Mời
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tham gia</TableHead>
              {canManage && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.members ?? []).map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="text-sm">{m.email ?? "(chưa rõ)"}</TableCell>
                <TableCell>
                  {canManage && m.role !== "owner" ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => roleMut.mutate({ memberId: m.id, role: v })}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Quản trị</SelectItem>
                        <SelectItem value="accountant">Kế toán</SelectItem>
                        <SelectItem value="viewer">Người xem</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{ROLE_LABEL[m.role] ?? m.role}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={m.status === "active" ? "default" : "secondary"}>
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString("vi-VN")}
                </TableCell>
                {canManage && (
                  <TableCell>
                    {m.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Gỡ thành viên này khỏi tổ chức?")) rmMut.mutate(m.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CompanyTab() {
  const get = useServerFn(getSettings);
  const upd = useServerFn(updateSettings);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => get(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });
  const [form, setForm] = React.useState<any>(null);
  const [email, setEmail] = React.useState<string>("");
  const [userId, setUserId] = React.useState<string>("");
  const [createdAt, setCreatedAt] = React.useState<string>("");
  const [pwd, setPwd] = React.useState({ next: "", confirm: "" });
  const [pwdLoading, setPwdLoading] = React.useState(false);

  React.useEffect(() => {
    if (data?.profile && !form) setForm(data.profile);
  }, [data, form]);
  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      setUserId(user.id);
      setCreatedAt(user.created_at ?? "");
    });
  }, []);

  const mutate = useMutation({
    mutationFn: (v: any) => upd({ data: v }),
    onSuccess: () => {
      toast.success("Đã lưu hồ sơ");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!form) return <p className="p-4">Đang tải…</p>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const dirty = JSON.stringify(form) !== JSON.stringify(data?.profile);
  const save = () =>
    mutate.mutate({
      display_name: form.display_name,
      job_title: form.job_title,
      phone: form.phone,
      avatar_url: form.avatar_url,
      language: form.language,
      timezone: form.timezone,
      date_format: form.date_format,
      number_format: form.number_format,
    });

  const initials =
    (form.display_name || email || "?")
      .trim()
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "?";
  const langLabel: Record<string, string> = { vi: "Tiếng Việt", en: "English" };

  async function changePassword() {
    if (pwd.next.length < 8) return toast.error("Mật khẩu tối thiểu 8 ký tự");
    if (pwd.next !== pwd.confirm) return toast.error("Mật khẩu xác nhận không khớp");
    setPwdLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd.next });
      if (error) throw error;
      setPwd({ next: "", confirm: "" });
      toast.success("Đã đổi mật khẩu");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPwdLoading(false);
    }
  }

  async function signOutEverywhere() {
    if (!confirm("Đăng xuất khỏi tất cả thiết bị khác?")) return;
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) toast.error(error.message);
    else toast.success("Đã đăng xuất phiên khác");
  }

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 py-5">
          <Avatar className="h-20 w-20 ring-2 ring-border shadow-sm">
            {form.avatar_url ? (
              <AvatarImage
                src={form.avatar_url}
                alt={form.display_name ?? email}
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {form.display_name || "(Chưa đặt tên)"}
            </h2>
            <p className="text-sm text-muted-foreground truncate">{email}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {form.job_title && (
                <Badge variant="secondary" className="text-[10px]">
                  {form.job_title}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {langLabel[form.language ?? "vi"]}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {form.timezone ?? "Asia/Ho_Chi_Minh"}
              </Badge>
            </div>
          </div>
          <AvatarUploader
            url={form.avatar_url}
            userId={userId}
            onChange={(u) => set("avatar_url", u)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <UsersIcon className="h-4 w-4 text-primary" /> Thông tin cá nhân
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Tên hiển thị" required>
            <Input
              value={form.display_name ?? ""}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="VD: Nguyễn Văn A"
            />
          </Field>
          <Field label="Chức danh">
            <Input
              value={form.job_title ?? ""}
              onChange={(e) => set("job_title", e.target.value)}
              placeholder="VD: Kế toán trưởng"
            />
          </Field>
          <Field label="Email đăng nhập">
            <Input value={email} disabled />
            <Hint>Liên hệ quản trị để thay đổi email.</Hint>
          </Field>
          <Field label="Số điện thoại">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="0901234567"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Calculator className="h-4 w-4 text-primary" /> Khu vực & Hiển thị
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Ngôn ngữ">
            <Select value={form.language ?? "vi"} onValueChange={(v) => set("language", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">Tiếng Việt</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Múi giờ">
            <Select
              value={form.timezone ?? "Asia/Ho_Chi_Minh"}
              onValueChange={(v) => set("timezone", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Ho_Chi_Minh">(GMT+7) Hồ Chí Minh / Hà Nội</SelectItem>
                <SelectItem value="Asia/Bangkok">(GMT+7) Bangkok</SelectItem>
                <SelectItem value="Asia/Singapore">(GMT+8) Singapore</SelectItem>
                <SelectItem value="Asia/Tokyo">(GMT+9) Tokyo</SelectItem>
                <SelectItem value="UTC">(GMT+0) UTC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Định dạng ngày">
            <Select
              value={form.date_format ?? "dd/MM/yyyy"}
              onValueChange={(v) => set("date_format", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd/MM/yyyy">31/12/2026</SelectItem>
                <SelectItem value="yyyy-MM-dd">2026-12-31</SelectItem>
                <SelectItem value="MM/dd/yyyy">12/31/2026</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Định dạng số">
            <Select
              value={form.number_format ?? "vi-VN"}
              onValueChange={(v) => set("number_format", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi-VN">1.234.567,89</SelectItem>
                <SelectItem value="en-US">1,234,567.89</SelectItem>
                <SelectItem value="de-DE">1.234.567,89 (EU)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-primary" /> Bảo mật
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Mật khẩu mới">
              <Input
                type="password"
                value={pwd.next}
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                placeholder="Tối thiểu 8 ký tự"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Xác nhận mật khẩu">
              <Input
                type="password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={changePassword}
              disabled={pwdLoading || !pwd.next}
            >
              <Lock className="mr-1 h-3.5 w-3.5" /> Đổi mật khẩu
            </Button>
            <Button variant="ghost" size="sm" onClick={signOutEverywhere}>
              <Unlock className="mr-1 h-3.5 w-3.5" /> Đăng xuất phiên khác
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid sm:grid-cols-2 gap-3 py-4 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono truncate">{userId.slice(0, 8)}…</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Ngày tạo tài khoản</span>
            <span>{createdAt ? new Date(createdAt).toLocaleDateString("vi-VN") : "—"}</span>
          </div>
        </CardContent>
      </Card>

      {dirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-xs text-muted-foreground pl-2">Có thay đổi chưa lưu</span>
          <Button variant="ghost" size="sm" onClick={() => setForm(data?.profile)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Huỷ
          </Button>
          <Button size="sm" onClick={save} disabled={mutate.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> Lưu thay đổi
          </Button>
        </div>
      )}
    </div>
  );
}

function AvatarUploader({
  url,
  userId,
  onChange,
}: {
  url?: string | null;
  userId: string;
  onChange: (u: string | null) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [preview, setPreview] = React.useState<{ file: File; objectUrl: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
  const MAX_BYTES = 2 * 1024 * 1024;

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.objectUrl);
    };
  }, [preview]);

  function pickFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      const msg = "Định dạng không hỗ trợ. Chỉ chấp nhận PNG, JPG, WEBP.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (file.size > MAX_BYTES) {
      const msg = `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(2)}MB). Tối đa 2MB.`;
      setError(msg);
      toast.error(msg);
      return;
    }
    if (preview) URL.revokeObjectURL(preview.objectUrl);
    setPreview({ file, objectUrl: URL.createObjectURL(file) });
  }

  async function confirmUpload() {
    if (!preview) return;
    if (!userId) {
      const m = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
      setError(m);
      toast.error(m);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = preview.file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, preview.file, {
        upsert: true,
        contentType: preview.file.type,
        cacheControl: "3600",
      });
      if (upErr) {
        const msg = upErr.message?.toLowerCase().includes("row-level")
          ? "Không có quyền tải lên. Vui lòng đăng nhập lại."
          : upErr.message?.toLowerCase().includes("payload") ||
              upErr.message?.toLowerCase().includes("size")
            ? "Ảnh vượt quá dung lượng cho phép của máy chủ."
            : `Tải ảnh thất bại: ${upErr.message}`;
        throw new Error(msg);
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onChange(`${data.publicUrl}?v=${Date.now()}`);
      toast.success("Đã cập nhật ảnh đại diện");
      URL.revokeObjectURL(preview.objectUrl);
      setPreview(null);
    } catch (e: any) {
      const msg = e?.message ?? "Tải ảnh thất bại. Vui lòng thử lại.";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  function cancelPreview() {
    if (preview) URL.revokeObjectURL(preview.objectUrl);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1 h-3 w-3" />
        {url ? "Đổi ảnh" : "Tải ảnh"}
      </Button>
      {url && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onChange(null)}
        >
          <X className="mr-1 h-3 w-3" /> Xoá
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">PNG/JPG/WEBP · ≤ 2MB</p>

      <PreviewDialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) cancelPreview();
        }}
        preview={preview}
        uploading={uploading}
        error={error}
        currentUrl={url ?? null}
        onConfirm={confirmUpload}
        onCancel={cancelPreview}
      />
    </div>
  );
}

function PreviewDialog({
  open,
  onOpenChange,
  preview,
  uploading,
  error,
  currentUrl,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preview: { file: File; objectUrl: string } | null;
  uploading: boolean;
  error: string | null;
  currentUrl: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xem trước ảnh đại diện</DialogTitle>
          <DialogDescription>
            Kiểm tra ảnh trước khi tải lên máy chủ. Bạn có thể chọn lại ảnh khác hoặc huỷ.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-4 py-2">
          <div className="flex flex-col items-center gap-1.5">
            <Avatar className="h-24 w-24 ring-2 ring-border">
              {currentUrl ? <AvatarImage src={currentUrl} className="object-cover" /> : null}
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                Hiện tại
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-muted-foreground">Trước</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Avatar className="h-24 w-24 ring-2 ring-primary">
              {preview ? <AvatarImage src={preview.objectUrl} className="object-cover" /> : null}
              <AvatarFallback>?</AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-primary font-medium">Sau khi lưu</span>
          </div>
          {preview && (
            <div className="flex-1 text-xs space-y-1">
              <p className="font-medium truncate">{preview.file.name}</p>
              <p className="text-muted-foreground">
                {(preview.file.size / 1024).toFixed(1)} KB ·{" "}
                {preview.file.type.replace("image/", "").toUpperCase()}
              </p>
            </div>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" disabled={uploading} onClick={onCancel}>
            Huỷ
          </Button>
          <Button type="button" disabled={uploading || !preview} onClick={onConfirm}>
            {uploading ? "Đang tải..." : "Lưu ảnh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactImageRow({
  label,
  hint,
  url,
  onChange,
  prefix,
  disabled,
}: {
  label: string;
  hint?: string;
  url?: string | null;
  onChange: (u: string | null) => void;
  prefix: string;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${prefix}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Đã tải ảnh");
    } catch (e: any) {
      toast.error(e.message ?? "Tải ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted/30 flex items-center justify-center">
        {url ? (
          <>
            <img src={url} alt={label} className="h-full w-full object-contain bg-white" />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </>
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1 h-3 w-3" />
        {uploading ? "..." : url ? "Đổi" : "Chọn"}
      </Button>
    </div>
  );
}

function ImageUploader({
  label,
  url,
  onChange,
  prefix,
}: {
  label: string;
  url?: string | null;
  onChange: (u: string | null) => void;
  prefix: string;
}) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${prefix}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Đã tải ảnh");
    } catch (e: any) {
      toast.error(e.message ?? "Tải ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        {url ? (
          <div className="relative inline-block">
            <img
              src={url}
              alt={label}
              className="h-20 w-auto rounded border bg-white object-contain p-1"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
            Chưa có ảnh
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1 h-3 w-3" />
          {uploading ? "Đang tải..." : "Chọn ảnh"}
        </Button>
      </div>
    </div>
  );
}

function PeriodsTab() {
  const get = useServerFn(getSettings);
  const toggle = useServerFn(togglePeriodLock);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => get(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);

  const mutate = useMutation({
    mutationFn: (v: any) => toggle({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const locks = data?.locks ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Khoá sổ kỳ kế toán</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div>
            <Label>Năm</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-28"
            />
          </div>
          <div>
            <Label>Tháng</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-24"
            />
          </div>
          <Button onClick={() => mutate.mutate({ year, month, action: "lock" })}>
            <Lock className="h-4 w-4 mr-2" />
            Khoá kỳ
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỳ</TableHead>
              <TableHead>Khoá lúc</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locks.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell>
                  {String(l.period_no).padStart(2, "0")}/{l.year}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {l.closed_at ? new Date(l.closed_at).toLocaleString("vi-VN") : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutate.mutate({ year: l.year, month: l.period_no, action: "unlock" })
                    }
                  >
                    <Unlock className="h-3 w-3 mr-1" />
                    Mở khoá
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FxTab() {
  const list = useServerFn(listFxRates);
  const upsert = useServerFn(upsertFxRate);
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["fx"],
    queryFn: () => list(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });
  const [form, setForm] = React.useState({
    rate_date: new Date().toISOString().slice(0, 10),
    currency: "USD",
    rate: 25000,
    source: "Vietcombank",
  });
  const mutate = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => {
      toast.success("Đã lưu tỷ giá");
      qc.invalidateQueries({ queryKey: ["fx"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tỷ giá ngoại tệ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <Label>Ngày</Label>
            <Input
              type="date"
              value={form.rate_date}
              onChange={(e) => setForm({ ...form, rate_date: e.target.value })}
            />
          </div>
          <div>
            <Label>Loại tiền</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <Label>Tỷ giá</Label>
            <Input
              type="number"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Nguồn</Label>
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </div>
          <Button onClick={() => mutate.mutate(form)} disabled={mutate.isPending}>
            Lưu
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Tỷ giá</TableHead>
              <TableHead>Nguồn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.rate_date}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.currency}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(r.rate).toLocaleString("vi-VN")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.source}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RolesTab() {
  const get = useServerFn(getSettings);
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => get(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });
  const roles = data?.roles ?? [];
  const labels: Record<string, string> = {
    owner: "Chủ doanh nghiệp",
    chief_accountant: "Kế toán trưởng",
    accountant: "Kế toán viên",
    viewer: "Người xem",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vai trò của bạn</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {roles.map((r) => (
            <Badge key={r} className="text-sm py-1 px-3">
              {labels[r] ?? r}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Hệ thống có 4 vai trò: <b>Chủ DN</b> (toàn quyền, khoá sổ), <b>Kế toán trưởng</b> (duyệt
          chứng từ),
          <b> Kế toán viên</b> (nhập liệu), <b>Người xem</b> (chỉ xem báo cáo). Mời thành viên mới
          sẽ được hỗ trợ ở phiên bản sau.
        </p>
      </CardContent>
    </Card>
  );
}

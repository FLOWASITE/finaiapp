import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { supabase } from "@/integrations/supabase/client";
import { runMonthlyDepreciation, upsertFixedAsset, bulkImportFixedAssets } from "@/lib/assets.functions";
import { listFaCategories } from "@/lib/fa-categories.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, Layers, Briefcase, Coins, TrendingDown, FolderTree, Pencil, Upload, Download, FileText, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AutoCodeInput } from "@/components/ui/auto-code-input";
import { AccountCombobox } from "@/components/ui/account-combobox";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/assets/")({
  component: Assets,
});

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const emptyAsset = {
  code: "", name: "",
  category_id: null as string | null,
  asset_kind: "tangible" as "tangible" | "intangible",
  cost: 0, salvage_value: 0,
  useful_life_months: 60,
  start_date: new Date().toISOString().slice(0, 10),
  method: "straight_line" as const,
  asset_account: "211", accumulated_account: "214", expense_account: "6422",
  supplier_id: null as string | null,
  branch_id: null, department_id: null, project_id: null, cost_center_id: null, assignee_id: null,
  serial_no: "", model: "", manufacturer: "", origin_country: "", mfg_year: null as number | null,
  location: "", quantity: 1, unit: "Cái",
  acquired_date: "", in_service_date: "",
  source_type: "manual" as const,
  source_doc_table: null, source_doc_id: null,
  funding_source: "", opening_accumulated: 0, opening_months: 0,
  image_url: null, notes: "",
  status: "active" as const,
};

function Assets() {
  const qc = useQueryClient();
  const runFn = useServerFn(runMonthlyDepreciation);
  const upsertFn = useServerFn(upsertFixedAsset);
  const listCatFn = useServerFn(listFaCategories);

  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyAsset);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  const assets = useQuery({
    queryKey: ["fixed_assets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fixed_assets")
        .select("*, depreciation_entries(period_month, amount), fa_categories(code,name,asset_kind), suppliers(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const cats = useQuery({ queryKey: ["fa_categories"], queryFn: () => listCatFn() });

  const save = useMutation({
    mutationFn: (input: any) => upsertFn({ data: input }),
    onSuccess: () => {
      toast.success(form.id ? "Đã cập nhật TSCĐ" : "Đã thêm TSCĐ");
      setOpen(false); setForm(emptyAsset);
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runDepreciation = async () => {
    setRunning(true);
    try {
      const r = await runFn({ data: { upToMonth: period } });
      toast.success(`Đã tạo ${r.created} bút toán khấu hao`);
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
      invalidateLedgers(qc);
    } catch (e: any) { toast.error(e.message); }
    finally { setRunning(false); }
  };

  const importFn = useServerFn(bulkImportFixedAssets);

  const downloadTemplate = () => {
    const headers = [
      "code", "name", "asset_kind", "category_code", "cost", "salvage_value",
      "useful_life_months", "start_date", "in_service_date", "method",
      "asset_account", "accumulated_account", "expense_account",
      "department_code", "branch_code", "location", "serial_no", "model",
      "manufacturer", "origin_country", "mfg_year", "unit", "quantity",
      "funding_source", "opening_accumulated", "opening_months", "notes",
    ];
    const example = [
      "TSCD001", "Máy tính Dell Latitude", "tangible", "", 25000000, 0,
      48, "2024-01-15", "2024-01-15", "straight_line",
      "211", "214", "6422",
      "", "", "Phòng IT", "DL2024-001", "Latitude 7430",
      "Dell", "Vietnam", 2024, "Cái", 1,
      "Vốn chủ sở hữu", 0, 0, "",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TSCD");
    XLSX.writeFile(wb, "mau-import-tscd.xlsx");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
      const toDate = (v: any) => {
        if (!v) return null;
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).slice(0, 10);
      };
      const toNum = (v: any, d = 0) => v == null || v === "" ? d : Number(v);
      const rows = raw.map(r => ({
        code: String(r.code ?? "").trim(),
        name: String(r.name ?? "").trim(),
        asset_kind: r.asset_kind === "intangible" ? "intangible" : "tangible",
        category_code: r.category_code ? String(r.category_code) : null,
        cost: toNum(r.cost),
        salvage_value: toNum(r.salvage_value, 0),
        useful_life_months: toNum(r.useful_life_months),
        start_date: toDate(r.start_date) ?? new Date().toISOString().slice(0, 10),
        in_service_date: toDate(r.in_service_date),
        method: r.method || "straight_line",
        asset_account: String(r.asset_account ?? "211"),
        accumulated_account: String(r.accumulated_account ?? "214"),
        expense_account: String(r.expense_account ?? "6422"),
        department_code: r.department_code ? String(r.department_code) : null,
        branch_code: r.branch_code ? String(r.branch_code) : null,
        location: r.location ? String(r.location) : null,
        serial_no: r.serial_no ? String(r.serial_no) : null,
        model: r.model ? String(r.model) : null,
        manufacturer: r.manufacturer ? String(r.manufacturer) : null,
        origin_country: r.origin_country ? String(r.origin_country) : null,
        mfg_year: r.mfg_year ? Number(r.mfg_year) : null,
        unit: r.unit ? String(r.unit) : null,
        quantity: toNum(r.quantity, 1),
        funding_source: r.funding_source ? String(r.funding_source) : null,
        opening_accumulated: toNum(r.opening_accumulated, 0),
        opening_months: toNum(r.opening_months, 0),
        notes: r.notes ? String(r.notes) : null,
      }));
      const result = await importFn({ data: { rows } });
      toast.success(`Nhập ${result.inserted} mới, cập nhật ${result.updated}${result.errors.length ? `, lỗi ${result.errors.length}` : ""}`);
      if (result.errors.length) console.warn("Import errors:", result.errors);
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
    } catch (err: any) {
      toast.error(`Lỗi import: ${err.message}`);
    }
  };

  const onCategoryChange = (id: string) => {
    const c = (cats.data ?? []).find((x: any) => x.id === id);
    setForm({
      ...form,
      category_id: id,
      asset_kind: c?.asset_kind ?? form.asset_kind,
      useful_life_months: c?.default_useful_life_months ?? form.useful_life_months,
      method: c?.default_method ?? form.method,
      asset_account: c?.default_asset_account ?? form.asset_account,
      accumulated_account: c?.default_accumulated_account ?? form.accumulated_account,
      expense_account: c?.default_expense_account ?? form.expense_account,
    });
  };

  const filtered = useMemo(() => {
    let list = assets.data ?? [];
    if (filterCat !== "all") list = list.filter((a: any) => a.category_id === filterCat);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) =>
        a.code?.toLowerCase().includes(s) || a.name?.toLowerCase().includes(s) ||
        a.serial_no?.toLowerCase().includes(s) || a.location?.toLowerCase().includes(s));
    }
    return list;
  }, [assets.data, search, filterCat]);

  const stats = useMemo(() => {
    const list = assets.data ?? [];
    let cost = 0, accumulated = 0;
    list.forEach((a: any) => {
      cost += Number(a.cost);
      const opening = Number(a.opening_accumulated ?? 0);
      const posted = (a.depreciation_entries ?? []).reduce((s: number, d: any) => s + Number(d.amount), 0);
      accumulated += opening + posted;
    });
    return { count: list.length, cost, accumulated, remaining: cost - accumulated };
  }, [assets.data]);

  return (
    <div className="p-8 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30">TK 211 · 214</Badge>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Tài sản cố định</h1>
            <p className="mt-1 text-sm opacity-90">Quản lý hồ sơ, khấu hao và biến động TSCĐ theo TT200/TT133</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild><Link to="/assets/categories"><FolderTree className="mr-2 h-4 w-4" /> Danh mục</Link></Button>
            <Button variant="secondary" asChild><Link to="/assets/audit"><ShieldCheck className="mr-2 h-4 w-4" /> Nhật ký</Link></Button>

            <Button variant="secondary" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" /> Mẫu Excel</Button>
            <label className="inline-flex items-center cursor-pointer rounded-md bg-white/90 text-foreground hover:bg-white px-3 py-2 text-sm font-medium">
              <Upload className="mr-2 h-4 w-4" /> Nhập Excel
              <input type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />
            </label>
            <div className="flex items-end gap-2 rounded-lg bg-white/10 px-3 py-2">
              <div>
                <div className="text-[10px] uppercase opacity-80">Trích đến tháng</div>
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-7 bg-white/90 text-foreground" />
              </div>
              <Button size="sm" variant="secondary" onClick={runDepreciation} disabled={running}>
                <Sparkles className="mr-2 h-4 w-4" />{running ? "Đang trích..." : "Chạy khấu hao"}
              </Button>
            </div>
            <Button variant="secondary" onClick={() => { setForm(emptyAsset); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Ghi tăng TSCĐ
            </Button>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild><Link to="/assets/events">Biến động tài sản</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/disposal">Thanh lý / Nhượng bán</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/reclassify">Chuyển TSCĐ ↔ CCDC</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/inventory">Kiểm kê tài sản</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/allocations">Tài sản phân bổ</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/depreciation">Bảng tính khấu hao</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/books">Sổ khấu hao</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to="/assets/reports">Báo cáo TSCĐ</Link></Button>
      </div>


      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi icon={<Briefcase className="h-4 w-4" />} label="Số tài sản" value={String(stats.count)} tone="bg-indigo-100 text-indigo-700" />
        <Kpi icon={<Coins className="h-4 w-4" />} label="Nguyên giá" value={fmt(stats.cost)} tone="bg-sky-100 text-sky-700" />
        <Kpi icon={<TrendingDown className="h-4 w-4" />} label="Hao mòn luỹ kế" value={fmt(stats.accumulated)} tone="bg-amber-100 text-amber-700" />
        <Kpi icon={<Layers className="h-4 w-4" />} label="Giá trị còn lại" value={fmt(stats.remaining)} tone="bg-emerald-100 text-emerald-700" />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-dashed bg-card p-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Tìm theo mã / tên / serial / vị trí..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Danh mục" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground bg-muted/30">
            <tr>
              <th className="p-3">Mã</th><th>Tên TSCĐ</th><th>Danh mục</th><th>Vị trí / Bộ phận</th>
              <th className="text-right">Nguyên giá</th>
              <th className="text-right">Đã KH</th>
              <th className="text-right">Còn lại</th>
              <th className="text-center">Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a: any) => {
              const opening = Number(a.opening_accumulated ?? 0);
              const posted = (a.depreciation_entries ?? []).reduce((s: number, d: any) => s + Number(d.amount), 0);
              const totalDone = opening + posted;
              const remaining = Number(a.cost) - Number(a.salvage_value) - totalDone;
              const pct = Math.min(100, Math.round((totalDone / Math.max(1, Number(a.cost))) * 100));
              return (
                <tr key={a.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{a.code}</td>
                  <td>
                    <div className="font-medium">{a.name}</div>
                    {a.serial_no && <div className="text-xs text-muted-foreground">S/N: {a.serial_no}</div>}
                  </td>
                  <td className="text-xs">{a.fa_categories?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-xs">{a.location ?? "—"}</td>
                  <td className="text-right font-mono">{fmt(Number(a.cost))}</td>
                  <td className="text-right">
                    <div className="font-mono text-xs text-emerald-700">{fmt(totalDone)}</div>
                    <div className="mt-1 h-1.5 w-20 ml-auto rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="text-right font-mono">{fmt(remaining)}</td>
                  <td className="text-center">
                    <Badge variant={a.status === "active" ? "default" : a.status === "disposed" ? "destructive" : "secondary"} className="text-[10px]">
                      {a.status === "active" ? "Đang dùng" : a.status === "disposed" ? "Đã giảm" : "Tạm dừng"}
                    </Badge>
                  </td>
                  <td className="pr-3 text-right whitespace-nowrap">
                    <Button asChild size="sm" variant="ghost" title="Thẻ TSCĐ">
                      <Link to="/assets/$id/card" params={{ id: a.id }}><FileText className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" title="Biên bản giao nhận (01-TSCĐ)">
                      <Link to="/assets/$id/handover" params={{ id: a.id }}><Printer className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ ...emptyAsset, ...a }); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Briefcase className="h-6 w-6 text-muted-foreground" /></div>
                <p className="mt-3 text-sm text-muted-foreground">Chưa có TSCĐ. Bấm "Ghi tăng TSCĐ" để bắt đầu.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog ghi tăng */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Sửa hồ sơ TSCĐ" : "Ghi tăng Tài sản cố định"}</DialogTitle></DialogHeader>
          <Tabs defaultValue="general" className="mt-2">
            <TabsList>
              <TabsTrigger value="general">Thông tin chung</TabsTrigger>
              <TabsTrigger value="depreciation">Khấu hao & TK</TabsTrigger>
              <TabsTrigger value="management">Quản trị</TabsTrigger>
              <TabsTrigger value="opening">Số dư đầu kỳ</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Mã TSCĐ *"><AutoCodeInput value={form.code} onChange={(v: string) => setForm({ ...form, code: v })} entity="fixed_asset" autoFillOnMount={!form.id} /></Field>
                <Field label="Tên *" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Danh mục" className="col-span-2">
                  <Select value={form.category_id ?? ""} onValueChange={onCategoryChange}>
                    <SelectTrigger><SelectValue placeholder="Chọn danh mục" /></SelectTrigger>
                    <SelectContent>
                      {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Loại">
                  <Select value={form.asset_kind} onValueChange={(v) => setForm({ ...form, asset_kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="tangible">Hữu hình</SelectItem><SelectItem value="intangible">Vô hình</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Nguyên giá *"><Input type="number" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></Field>
                <Field label="Giá trị thanh lý"><Input type="number" value={form.salvage_value || 0} onChange={(e) => setForm({ ...form, salvage_value: Number(e.target.value) })} /></Field>
                <Field label="Số lượng"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></Field>
                <Field label="Đơn vị"><Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
                <Field label="Ngày mua"><Input type="date" value={form.acquired_date ?? ""} onChange={(e) => setForm({ ...form, acquired_date: e.target.value || null })} /></Field>
                <Field label="Ngày đưa vào sử dụng"><Input type="date" value={form.in_service_date ?? ""} onChange={(e) => setForm({ ...form, in_service_date: e.target.value || null })} /></Field>
                <Field label="Nguồn hình thành">
                  <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Nhập tay</SelectItem>
                      <SelectItem value="purchase_invoice">Mua hàng</SelectItem>
                      <SelectItem value="construction">XDCB hoàn thành</SelectItem>
                      <SelectItem value="capital_contribution">Góp vốn</SelectItem>
                      <SelectItem value="donation">Biếu tặng</SelectItem>
                      <SelectItem value="transfer">Điều chuyển nội bộ</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Nguồn vốn"><Input value={form.funding_source ?? ""} placeholder="VD: Vốn chủ sở hữu" onChange={(e) => setForm({ ...form, funding_source: e.target.value })} /></Field>
              </div>
            </TabsContent>

            <TabsContent value="depreciation" className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Phương pháp KH" className="col-span-2">
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight_line">Đường thẳng</SelectItem>
                      <SelectItem value="declining_balance">Số dư giảm dần</SelectItem>
                      <SelectItem value="units_of_production">Theo sản lượng</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Thời gian (tháng) *"><Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: Number(e.target.value) })} /></Field>
                <Field label="Ngày bắt đầu KH *"><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                <Field label="TK Tài sản (211)">
                  <AccountCombobox value={form.asset_account} onChange={(v) => setForm({ ...form, asset_account: v })}
                    suggestions={[{code:"211",name:"TSCĐ hữu hình"},{code:"2111",name:"Nhà cửa, vật kiến trúc"},{code:"2112",name:"Máy móc, thiết bị"},{code:"2113",name:"Phương tiện vận tải"},{code:"2114",name:"Thiết bị, dụng cụ QL"},{code:"213",name:"TSCĐ vô hình"},{code:"2131",name:"Quyền sử dụng đất"},{code:"2135",name:"Phần mềm máy tính"}]} />
                </Field>
                <Field label="TK Hao mòn (214)">
                  <AccountCombobox value={form.accumulated_account} onChange={(v) => setForm({ ...form, accumulated_account: v })}
                    suggestions={[{code:"214",name:"Hao mòn TSCĐ"},{code:"2141",name:"Hao mòn TSCĐ hữu hình"},{code:"2143",name:"Hao mòn TSCĐ thuê TC"},{code:"2147",name:"Hao mòn TSCĐ vô hình"}]} />
                </Field>
                <Field label="TK Chi phí KH">
                  <AccountCombobox value={form.expense_account} onChange={(v) => setForm({ ...form, expense_account: v })}
                    suggestions={[{code:"6421",name:"CP nhân viên bán hàng"},{code:"6422",name:"CP QLDN"},{code:"6424",name:"CP khấu hao TSCĐ"},{code:"6427",name:"CP dịch vụ mua ngoài"},{code:"627",name:"CP sản xuất chung"},{code:"641",name:"CP bán hàng"},{code:"642",name:"CP QLDN"},{code:"154",name:"CP SXKD dở dang"}]} />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="management" className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Số seri"><Input value={form.serial_no ?? ""} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} /></Field>
                <Field label="Model"><Input value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
                <Field label="Hãng sản xuất"><Input value={form.manufacturer ?? ""} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
                <Field label="Xuất xứ"><Input value={form.origin_country ?? ""} onChange={(e) => setForm({ ...form, origin_country: e.target.value })} /></Field>
                <Field label="Năm SX"><Input type="number" value={form.mfg_year ?? ""} onChange={(e) => setForm({ ...form, mfg_year: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="Vị trí"><Input value={form.location ?? ""} placeholder="VD: Phòng IT — Tầng 3" onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
                <Field label="Ghi chú" className="col-span-3"><Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">Phòng ban / Chi nhánh / Dự án sẽ chọn được khi đã có dữ liệu trong các phân hệ tương ứng — hiện gắn theo doanh nghiệp hoạt động.</p>
            </TabsContent>

            <TabsContent value="opening" className="space-y-3">
              <div className="rounded-md border bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100">
                Dùng khi nhập TSCĐ đã được khấu hao một phần trước khi đưa vào hệ thống.
                Hệ thống sẽ bỏ qua N tháng đầu khi chạy khấu hao tự động.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hao mòn luỹ kế đầu kỳ"><Input type="number" value={form.opening_accumulated || 0} onChange={(e) => setForm({ ...form, opening_accumulated: Number(e.target.value) })} /></Field>
                <Field label="Số tháng đã KH"><Input type="number" value={form.opening_months || 0} onChange={(e) => setForm({ ...form, opening_months: Number(e.target.value) })} /></Field>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>{form.id ? "Cập nhật" : "Ghi tăng"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold font-mono">{value}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

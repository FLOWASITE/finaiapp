import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  listDocuments,
  getDocument,
  deleteDocument,
  unlinkDocument,
  uploadDocument,
  reparseDocument,
  listPurchaseDocuments,
} from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  Trash2,
  Eye,
  ExternalLink,
  Upload,
  Bot,
  RefreshCw,
  Mail,
  Landmark,
  Plug,
  Receipt,
  FileSpreadsheet,
  FileSignature,
  Wallet,
  Loader2,
  Sparkles,
  ArrowUpToLine,
  Search,
  SlidersHorizontal,
  X,
  ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SyncTctDialog } from "@/components/sync-tct-dialog";

const TAB_VALUES = ["all", "purchase", "sales", "bank"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const SearchSchema = z.object({
  highlight: z.string().uuid().optional(),
  tab: z.enum(TAB_VALUES).optional(),
});

export const Route = createFileRoute("/_app/documents/")({
  validateSearch: SearchSchema,
  staticData: { crumb: "Trung tâm tài liệu" },
  component: DocumentsPage,
});

// Tab → preset filter map + label + legacy route
const TAB_PRESETS: Record<TabValue, {
  label: string;
  kinds: string[] | null; // null = all
  legacyTo?: string;
  legacyLabel?: string;
  description: string;
}> = {
  all: {
    label: "Tất cả",
    kinds: null,
    description: "Mọi tài liệu — sao kê, hoá đơn, chứng từ từ mọi nguồn.",
  },
  purchase: {
    label: "Hoá đơn mua",
    kinds: ["purchase_invoice"],
    legacyTo: "/invoices",
    legacyLabel: "Trang hoá đơn mua",
    description: "Hoá đơn đầu vào (mua vào) — đã upload, OCR và liên kết kế toán.",
  },
  sales: {
    label: "Hoá đơn bán",
    kinds: ["sales_invoice"],
    legacyTo: "/sales",
    legacyLabel: "Trang hoá đơn bán",
    description: "Hoá đơn đầu ra (bán ra) đã tải lên hệ thống.",
  },
  bank: {
    label: "Ngân hàng",
    kinds: ["bank_statement", "bank_voucher", "cash_voucher", "receipt", "payment", "contract", "other"],
    description: "Sao kê ngân hàng, UNC, phiếu thu/chi, hợp đồng và chứng từ phụ trợ.",
  },
};

const OCR_LABELS: Record<string, string> = {
  pending: "Chờ OCR",
  processing: "Đang xử lý",
  done: "Hoàn tất",
  failed: "Lỗi",
  skipped: "Bỏ qua",
};
const OCR_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

const KIND_LABELS: Record<string, string> = {
  einvoice: "Hoá đơn điện tử",
  purchase_invoice: "Hoá đơn mua",
  sales_invoice: "Hoá đơn bán",
  bank_statement: "Sao kê NH",
  bank_voucher: "UNC ngân hàng",
  cash_voucher: "Phiếu thu/chi",
  receipt: "Phiếu thu",
  payment: "Phiếu chi",
  contract: "Hợp đồng",
  other: "Khác",
};

const KIND_ICON: Record<string, any> = {
  einvoice: Receipt,
  purchase_invoice: Receipt,
  sales_invoice: Receipt,
  bank_statement: Landmark,
  bank_voucher: Landmark,
  cash_voucher: Wallet,
  receipt: Wallet,
  payment: Wallet,
  contract: FileSignature,
  other: FileText,
};

const SOURCE_META: Record<string, { label: string; icon: any; tone: string }> = {
  manual: { label: "Upload tay", icon: Upload, tone: "text-foreground" },
  ai_chat: { label: "Chatbot AI", icon: Bot, tone: "text-violet-600 dark:text-violet-400" },
  tct_sync: { label: "Sync TCT", icon: RefreshCw, tone: "text-sky-600 dark:text-sky-400" },
  einvoice_sync: { label: "Sync HĐ điện tử", icon: RefreshCw, tone: "text-sky-600 dark:text-sky-400" },
  email: { label: "Email", icon: Mail, tone: "text-amber-600 dark:text-amber-400" },
  bank_import: { label: "Bank import", icon: Landmark, tone: "text-emerald-600 dark:text-emerald-400" },
  api: { label: "API", icon: Plug, tone: "text-muted-foreground" },
};

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_META).map(([k, v]) => [k, v.label]),
);

const UPLOAD_KINDS: Array<{ value: string; label: string }> = [
  { value: "purchase_invoice", label: "Hoá đơn mua" },
  { value: "sales_invoice", label: "Hoá đơn bán" },
  { value: "einvoice", label: "Hoá đơn điện tử" },
  { value: "bank_statement", label: "Sao kê ngân hàng" },
  { value: "bank_voucher", label: "Uỷ nhiệm chi" },
  { value: "cash_voucher", label: "Phiếu thu/chi" },
  { value: "contract", label: "Hợp đồng" },
  { value: "other", label: "Khác" },
];

const PAGE_SIZE = 50;

function formatBytes(n?: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPage() {
  const list = useServerFn(listDocuments);
  const search = useSearch({ from: "/_app/documents/" });
  const navigate = useNavigate();

  const currentTab: TabValue = search.tab ?? "all";
  const tabMeta = TAB_PRESETS[currentTab];

  const [searchText, setSearchText] = useState("");
  const [docKind, setDocKind] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [ocrStatus, setOcrStatus] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [issueFromDate, setIssueFromDate] = useState("");
  const [issueToDate, setIssueToDate] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [syncTctOpen, setSyncTctOpen] = useState(false);

  // deep-link ?highlight=
  useEffect(() => {
    if (search.highlight) {
      setOpenId(search.highlight);
    }
  }, [search.highlight]);

  // Reset inner doc_kind filter when tab changes (tab already constrains kinds)
  useEffect(() => {
    setDocKind("all");
    setLimit(PAGE_SIZE);
    // Also clear purchase-specific filters when leaving purchase tab
    if (currentTab !== "purchase") {
      setInvoiceNo("");
      setSupplierSearch("");
      setIssueFromDate("");
      setIssueToDate("");
    }
  }, [currentTab]);

  // Tab kinds take precedence over inner docKind filter — pick first matching kind for narrowing
  const effectiveDocKind =
    docKind !== "all"
      ? docKind
      : tabMeta.kinds && tabMeta.kinds.length === 1
        ? tabMeta.kinds[0]
        : undefined;

  const filters = {
    search: searchText || undefined,
    doc_kind: effectiveDocKind,
    source: sourceFilter === "all" ? undefined : sourceFilter,
    ocr_status: ocrStatus === "all" ? undefined : ocrStatus,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  };

  const purchaseFilters = {
    search: searchText || undefined,
    source: sourceFilter === "all" ? undefined : sourceFilter,
    ocr_status: ocrStatus === "all" ? undefined : ocrStatus,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    invoice_no: invoiceNo || undefined,
    supplier_search: supplierSearch || undefined,
    issue_from_date: issueFromDate || undefined,
    issue_to_date: issueToDate || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["documents", currentTab, filters, limit],
    queryFn: () => list({ data: { ...filters, limit, offset: 0 } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  // For multi-kind tabs (e.g. "files"), client-side filter by tabMeta.kinds
  const filteredRows = (data?.rows ?? []).filter((r: any) => {
    if (!tabMeta.kinds) return true;
    if (tabMeta.kinds.length === 1) return true; // already filtered server-side
    return tabMeta.kinds.includes(r.doc_kind);
  });

  const activeCount =
    (docKind !== "all" ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (ocrStatus !== "all" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (currentTab === "purchase" ? ((invoiceNo ? 1 : 0) + (supplierSearch ? 1 : 0) + (issueFromDate ? 1 : 0) + (issueToDate ? 1 : 0)) : 1 - 1);

  const resetFilters = () => {
    setDocKind("all");
    setSourceFilter("all");
    setOcrStatus("all");
    setFromDate("");
    setToDate("");
    setInvoiceNo("");
    setSupplierSearch("");
    setIssueFromDate("");
    setIssueToDate("");
  };

  const total = data?.total ?? 0;
  const rows = filteredRows;
  const canLoadMore = data && (data.rows?.length ?? 0) < total;

  const setTab = (t: TabValue) => {
    navigate({
      to: "/documents",
      search: (s: any) => ({ ...s, tab: t === "all" ? undefined : t }),
    });
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4 p-3 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card/70 p-4 shadow-sm">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Trung tâm tài liệu</h1>
              <Badge variant="secondary" className="h-6">Bản mới 20/05</Badge>
              <Badge variant="outline" className="h-6">Đã hợp nhất</Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">{tabMeta.description}</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {tabMeta.legacyTo && (
              <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Link to={tabMeta.legacyTo}>
                  <ExternalLink className="h-4 w-4 mr-1.5" /> {tabMeta.legacyLabel}
                </Link>
              </Button>
            )}
            <Button onClick={() => setSyncTctOpen(true)} variant="outline" size="sm" className="flex-1 sm:flex-none">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Đồng bộ HĐĐT
            </Button>
            <Button onClick={() => setUploadOpen(true)} className="flex-1 sm:flex-none">
              <ArrowUpToLine className="h-4 w-4 mr-1.5" /> Tải lên
            </Button>
          </div>
        </div>
        <SyncTctDialog open={syncTctOpen} onOpenChange={setSyncTctOpen} defaultDirection="in" />

        <Tabs value={currentTab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl p-1 sm:w-auto">
            {TAB_VALUES.map((t) => (
              <TabsTrigger key={t} value={t} className="shrink-0">
                {TAB_PRESETS[t].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>


        <Card className="p-3 sm:p-4">
          <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="relative min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên file..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-8 pr-8 h-9"
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Xoá tìm kiếm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 px-3">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Bộ lọc</span>
                  {activeCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {activeCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-80 p-3 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nguồn</label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Nguồn" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Mọi nguồn</SelectItem>
                      {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Loại tài liệu</label>
                  <Select value={docKind} onValueChange={setDocKind}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Loại tài liệu" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả loại</SelectItem>
                      {Object.entries(KIND_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Trạng thái OCR</label>
                  <Select value={ocrStatus} onValueChange={setOcrStatus}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Trạng thái OCR" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Mọy OCR</SelectItem>
                      {Object.entries(OCR_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Từ ngày</label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Đến ngày</label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9" />
                  </div>
                </div>
                {currentTab === "purchase" && (
                  <>
                    <div className="border-t pt-2 space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground">Lọc theo hoá đơn</div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Số hoá đơn</label>
                        <Input
                          placeholder="VD: 0000123"
                          value={invoiceNo}
                          onChange={(e) => setInvoiceNo(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Nhà cung cấp / MST</label>
                        <Input
                          placeholder="Tên NCC hoặc MST..."
                          value={supplierSearch}
                          onChange={(e) => setSupplierSearch(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Ngày HĐ từ</label>
                          <Input type="date" value={issueFromDate} onChange={(e) => setIssueFromDate(e.target.value)} className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Ngày HĐ đến</label>
                          <Input type="date" value={issueToDate} onChange={(e) => setIssueToDate(e.target.value)} className="h-9" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {activeCount > 0 && (
                  <Button size="sm" variant="ghost" className="w-full h-8" onClick={resetFilters}>
                    Xoá tất cả bộ lọc
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            {activeCount > 0 && (
              <Button size="sm" variant="ghost" className="col-span-2 h-8 justify-start text-xs text-muted-foreground sm:col-span-1 sm:h-9" onClick={resetFilters}>
                <X className="h-3.5 w-3.5 mr-1" /> Xoá lọc
              </Button>
            )}
          </div>


          {currentTab === "purchase" ? (
            <PurchaseInvoicesTable
              filters={filters}
              onOpenDoc={(id: string) => setOpenId(id)}
            />
          ) : isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên file</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Nguồn</TableHead>
                    <TableHead>OCR</TableHead>
                    <TableHead className="text-right">Kích thước</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d: any) => (
                    <DocumentRow
                      key={d.id}
                      d={d}
                      highlighted={search.highlight === d.id}
                      onOpen={() => setOpenId(d.id)}
                    />
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        Chưa có tài liệu nào.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {rows.length > 0 && (
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Hiển thị {rows.length}/{total} tài liệu</span>
                  {canLoadMore && (
                    <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                      Tải thêm
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </Card>

        <DocumentDrawer
          id={openId}
          onClose={() => {
            setOpenId(null);
            if (search.highlight) navigate({ to: "/documents", search: (s: any) => ({ ...s, highlight: undefined }) });
          }}
        />
        <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      </div>
    </TooltipProvider>
  );
}

function DocumentRow({
  d,
  highlighted,
  onOpen,
}: {
  d: any;
  highlighted?: boolean;
  onOpen: () => void;
}) {
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (highlighted) {
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2500);
      return () => clearTimeout(t);
    }
  }, [highlighted]);

  const KindIcon = KIND_ICON[d.doc_kind] ?? FileText;
  const sourceMeta = SOURCE_META[d.source] ?? { label: d.source, icon: FileText, tone: "" };
  const SourceIcon = sourceMeta.icon;

  return (
    <TableRow
      ref={rowRef}
      className={cn(
        "cursor-pointer transition-colors",
        pulse && "ring-2 ring-primary bg-primary/5",
      )}
      onClick={onOpen}
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <KindIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate max-w-xs">
            {d.original_filename ?? d.storage_path?.split("/").pop() ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{KIND_LABELS[d.doc_kind] ?? d.doc_kind}</Badge>
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5">
              <SourceIcon className={cn("h-4 w-4", sourceMeta.tone)} />
              <span className="text-xs text-muted-foreground">{sourceMeta.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{sourceMeta.label}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
            OCR_TONE[d.ocr_status] ?? "bg-muted text-muted-foreground",
          )}
        >
          {OCR_LABELS[d.ocr_status] ?? d.ocr_status}
        </span>
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
        {formatBytes(d.size_bytes)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(d.created_at).toLocaleDateString("vi-VN")}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" onClick={onOpen}>
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const upload = useServerFn(uploadDocument);
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [docKind, setDocKind] = useState("purchase_invoice");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFiles([]);
    setNotes("");
    setUploading(false);
  };

  const submit = async () => {
    if (files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`${f.name}: vượt 20MB`);
        continue;
      }
      try {
        const buf = await f.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
        );
        await upload({
          data: {
            fileBase64: b64,
            filename: f.name,
            mimeType: f.type || "application/octet-stream",
            doc_kind: docKind as any,
            notes: notes || undefined,
          },
        });
        okCount++;
      } catch (e: any) {
        toast.error(`${f.name}: ${e.message ?? "lỗi"}`);
      }
    }
    if (okCount > 0) {
      toast.success(`Đã tải lên ${okCount}/${files.length} file`);
      qc.invalidateQueries({ queryKey: ["documents"] });
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tải lên tài liệu</DialogTitle>
          <DialogDescription>
            File được lưu vào kho tài liệu chung. Chưa OCR — bạn có thể "Parse lại" sau khi tải lên.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Loại tài liệu</label>
            <Select value={docKind} onValueChange={setDocKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UPLOAD_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Tệp ({files.length})</label>
            <Input
              type="file"
              multiple
              accept=".pdf,image/*,.xml,.xlsx,.xls,.docx"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                {files.map((f, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="truncate">{f.name}</span>
                    <span className="tabular-nums">{formatBytes(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Ghi chú (tuỳ chọn)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={uploading || files.length === 0}>
            {uploading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Tải lên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const getDoc = useServerFn(getDocument);
  const delDoc = useServerFn(deleteDocument);
  const unlink = useServerFn(unlinkDocument);
  const reparse = useServerFn(reparseDocument);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDoc({ data: { id: id! } }),
    enabled: !!id,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const delMut = useMutation({
    mutationFn: () => delDoc({ data: { id: id! } }),
    onSuccess: () => {
      toast.success("Đã xoá tài liệu");
      qc.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMut = useMutation({
    mutationFn: (l: { entity_table: string; entity_id: string }) =>
      unlink({ data: { document_id: id!, entity_table: l.entity_table as any, entity_id: l.entity_id } }),
    onSuccess: () => {
      toast.success("Đã gỡ liên kết");
      qc.invalidateQueries({ queryKey: ["document", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reparseMut = useMutation({
    mutationFn: () => reparse({ data: { id: id! } }),
    onSuccess: (r: any) => {
      toast.success(`Đã parse lại (${r.parser ?? "—"})`);
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doc = data?.doc;
  const aiUpload = data?.aiUpload;
  const isImage = doc?.mime_type?.startsWith("image/");
  const isPdf = doc?.mime_type === "application/pdf";

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{doc?.original_filename ?? "Tài liệu"}</SheetTitle>
          <SheetDescription>
            {doc && (
              <>
                {formatBytes(doc.size_bytes)} · {doc.mime_type} ·{" "}
                <span className="inline-flex items-center gap-1">
                  {(() => {
                    const m = SOURCE_META[doc.source];
                    const I = m?.icon ?? FileText;
                    return <I className={cn("h-3 w-3 inline", m?.tone)} />;
                  })()}
                  {SOURCE_LABELS[doc.source] ?? doc.source}
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full mt-4" />
        ) : doc ? (
          <div className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              {data.signedUrl && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <a href={data.signedUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" /> Mở
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={data.signedUrl} download={doc.original_filename ?? ""}>
                      <Download className="h-4 w-4 mr-1" /> Tải về
                    </a>
                  </Button>
                </>
              )}
              {doc.storage_path && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reparseMut.isPending}
                  onClick={() => reparseMut.mutate()}
                >
                  {reparseMut.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  Parse lại
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive ml-auto">
                    <Trash2 className="h-4 w-4 mr-1" /> Xoá
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xoá tài liệu?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Hành động không thể hoàn tác. Nếu tài liệu đang liên kết với chứng từ, hệ
                      thống sẽ chặn xoá.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Huỷ</AlertDialogCancel>
                    <AlertDialogAction onClick={() => delMut.mutate()}>Xoá</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Xem trước</TabsTrigger>
                <TabsTrigger value="ocr">OCR</TabsTrigger>
                <TabsTrigger value="links">Liên kết ({(data.links?.length ?? 0) + (doc.einvoice_id ? 1 : 0)})</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-3">
                {data.signedUrl && isImage && (
                  <img
                    src={data.signedUrl}
                    alt={doc.original_filename ?? ""}
                    className="max-w-full rounded border"
                  />
                )}
                {data.signedUrl && isPdf && (
                  <iframe
                    src={data.signedUrl}
                    className="w-full h-[600px] rounded border"
                    title="PDF preview"
                  />
                )}
                {data.signedUrl && !isImage && !isPdf && (
                  <p className="text-sm text-muted-foreground">
                    Không hỗ trợ xem trước định dạng này. Bấm "Tải về" để xem.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="ocr" className="mt-3 space-y-3">
                {aiUpload && (
                  <div className="rounded border bg-muted/30 p-3 text-xs space-y-1">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {aiUpload.parser_used && (
                        <span>Parser: <code className="font-mono">{aiUpload.parser_used}</code></span>
                      )}
                      {aiUpload.pages != null && <span>Trang: <b>{aiUpload.pages}</b></span>}
                      {aiUpload.parser_ms != null && (
                        <span>Đọc: <b>{(aiUpload.parser_ms / 1000).toFixed(1)}s</b></span>
                      )}
                      {aiUpload.structurer_ms != null && (
                        <span>Cấu trúc: <b>{(aiUpload.structurer_ms / 1000).toFixed(1)}s</b></span>
                      )}
                      <span>Trạng thái: <b>{aiUpload.status}</b></span>
                    </div>
                    {aiUpload.error && (
                      <div className="text-destructive break-words pt-1">{aiUpload.error}</div>
                    )}
                  </div>
                )}
                {doc.ocr_extracted ? (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                    {JSON.stringify(doc.ocr_extracted, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Chưa có dữ liệu OCR. {doc.storage_path && "Bấm \"Parse lại\" để chạy OCR/AI."}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="links" className="mt-3 space-y-2">
                {doc.einvoice_id && (
                  <div className="flex items-center justify-between border rounded p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-sky-600" />
                      <span>Hoá đơn điện tử</span>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/einvoices/$id" params={{ id: doc.einvoice_id }}>
                        Mở <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                )}
                {(data.links ?? []).length === 0 && !doc.einvoice_id ? (
                  <p className="text-sm text-muted-foreground">Chưa liên kết với chứng từ nào.</p>
                ) : (
                  <ul className="space-y-2">
                    {(data.links ?? []).map((l: any) => (
                      <li
                        key={l.entity_table + l.entity_id}
                        className="flex items-center justify-between border rounded p-2 text-sm"
                      >
                        <div>
                          <Badge variant="outline" className="mr-2">{l.entity_table}</Badge>
                          <span className="text-muted-foreground">{l.link_type}</span>
                          <code className="ml-2 text-xs text-muted-foreground">
                            {l.entity_id.slice(0, 8)}…
                          </code>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={unlinkMut.isPending}
                          onClick={() =>
                            unlinkMut.mutate({ entity_table: l.entity_table, entity_id: l.entity_id })
                          }
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Gỡ
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function vnd(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("vi-VN");
}

function PurchaseInvoicesTable({
  filters,
  onOpenDoc,
}: {
  filters: any;
  onOpenDoc: (id: string) => void;
}) {
  const listFn = useServerFn(listPurchaseDocuments);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading } = useQuery({
    queryKey: ["purchase-documents", filters, limit],
    queryFn: () =>
      listFn({
        data: {
          search: filters.search,
          source: filters.source,
          ocr_status: filters.ocr_status,
          from_date: filters.from_date,
          to_date: filters.to_date,
          limit,
          offset: 0,
        },
      }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setExpanded((m) => ({ ...m, [id]: !m[id] }));

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const canLoadMore = rows.length < total;

  const sumSub = rows.reduce((s: number, r: any) => s + Number(r.invoice?.subtotal ?? 0), 0);
  const sumVat = rows.reduce((s: number, r: any) => s + Number(r.invoice?.vat_amount ?? 0), 0);
  const sumTotal = rows.reduce((s: number, r: any) => s + Number(r.invoice?.total ?? 0), 0);

  return (
    <>
      {rows.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          <div>
            <div className="text-muted-foreground">Tiền hàng</div>
            <div className="font-mono font-semibold">{vnd(sumSub)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">VAT</div>
            <div className="font-mono font-semibold">{vnd(sumVat)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Tổng sau thuế</div>
            <div className="font-mono font-semibold">{vnd(sumTotal)}</div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Ngày HĐ</TableHead>
              <TableHead>Số HĐ</TableHead>
              <TableHead>Nhà cung cấp</TableHead>
              <TableHead>Mặt hàng</TableHead>
              <TableHead className="text-right">Tiền trước thuế</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Tổng sau thuế</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => {
              const inv = r.invoice;
              const doc = r.doc;
              const lines: any[] = r.lines ?? [];
              const hasLines = lines.length > 0;
              const isOpen = !!expanded[doc.id];
              return (
                <Fragment key={doc.id}>
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer"
                    onClick={() => hasLines && toggle(doc.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {hasLines ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => toggle(doc.id)}
                          aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
                        >
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 transition-transform",
                              isOpen && "rotate-90",
                            )}
                          />
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {inv?.issue_date ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{inv?.invoice_no ?? "—"}</TableCell>
                    <TableCell>
                      <div className="max-w-[220px] truncate">{inv?.supplier_name ?? "—"}</div>
                      {inv?.supplier_tax_id && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {inv.supplier_tax_id}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[260px] truncate text-sm text-muted-foreground">
                        {r.lines_summary ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{vnd(inv?.subtotal)}</TableCell>
                    <TableCell className="text-right font-mono">{vnd(inv?.vat_amount)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {vnd(inv?.total)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                          OCR_TONE[doc.ocr_status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {OCR_LABELS[doc.ocr_status] ?? doc.ocr_status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {inv?.id && (
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/invoices/$id" params={{ id: inv.id }}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => onOpenDoc(doc.id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && hasLines && (
                    <TableRow key={`${doc.id}-lines`} className="bg-muted/20 hover:bg-muted/20">
                      <TableCell></TableCell>
                      <TableCell colSpan={9} className="p-0">
                        <div className="p-3">
                          <div className="mb-2 text-xs font-medium text-muted-foreground">
                            Chi tiết mặt hàng ({lines.length} dòng)
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-10">#</TableHead>
                                <TableHead>Mô tả</TableHead>
                                <TableHead className="text-right">SL</TableHead>
                                <TableHead className="text-right">Đơn giá</TableHead>
                                <TableHead className="text-right">Thành tiền</TableHead>
                                <TableHead className="text-right">VAT %</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lines.map((l: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                  <TableCell>{l.description || "—"}</TableCell>
                                  <TableCell className="text-right font-mono">
                                    {l.qty ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {vnd(l.unit_price)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {vnd(l.amount)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {l.vat_rate != null ? `${l.vat_rate}%` : "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                  Chưa có hoá đơn mua nào.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Hiển thị {rows.length}/{total} hoá đơn</span>
          {canLoadMore && (
            <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Tải thêm
            </Button>
          )}
        </div>
      )}
    </>
  );
}

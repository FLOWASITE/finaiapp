import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Check, ExternalLink, Maximize2, Sparkles, ChevronDown, Loader2 } from "lucide-react";
import { getUploadSignedUrl } from "@/lib/ai/parse-document.functions";
import {
  saveLineClassification,
  lookupLineClassifications,
} from "@/lib/ai/line-classifications.functions";
import { cn } from "@/lib/utils";
import { kindMeta, normalizeLineName, type LineClassification, type LineKind } from "@/lib/ai/classify-line";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { XmlInvoicePreview, type EinvoiceExtras } from "./xml-invoice-preview";
import { PdfPagePreview } from "@/components/invoice-viewer/pdf-page-preview";
import { JournalProposalCard } from "./journal-proposal-card";

function fmtVND(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN");
}


type Field = { label: string; value: React.ReactNode };

export type InvoiceProposal = {
  actionId: string;
  toolName: string;
  input: any;
  summary?: string;
};

export function InvoiceExtractCard({
  parsed,
  uploadId,
  filename,
  kind,
  proposal,
}: {
  parsed: any;
  uploadId?: string | null;
  filename?: string;
  kind?: string;
  proposal?: InvoiceProposal | null;
}) {
  const getUrlFn = useServerFn(getUploadSignedUrl);
  const { data: urlData, isLoading: urlLoading } = useQuery({
    queryKey: ["ai_upload_url", uploadId],
    queryFn: () => getUrlFn({ data: { uploadId: uploadId! } }),
    enabled: !!uploadId,
    staleTime: 50 * 60 * 1000,
  });

  const isImageByName = filename ? /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i.test(filename) : false;
  const isPdfByName = filename ? /\.pdf$/i.test(filename) : false;
  const isXmlByName = filename ? /\.xml$/i.test(filename) : false;
  const mime = (urlData as any)?.mimeType as string | null | undefined;
  const isImage = isImageByName || (mime ?? "").startsWith("image/");
  const isPdf = isPdfByName || mime === "application/pdf";
  const isXml = isXmlByName || (mime ?? "").includes("xml") || !!parsed?._einvoice;

  const isInvoice =
    kind === "purchase_invoice" || !!parsed?.vendor_name || isImage || isPdf || isXml;

  const [zoomOpen, setZoomOpen] = useState(false);

  if (!isInvoice) return null;

  const vendor = parsed?.vendor_name ?? "—";
  const taxId = parsed?.vendor_tax_id ?? null;
  const invNo = parsed?.invoice_no ?? "—";
  const issueDate = parsed?.issue_date ?? null;
  const subtotal = Number(parsed?.subtotal ?? 0);
  const vat = Number(parsed?.vat_amount ?? 0);
  const total = Number(parsed?.total ?? subtotal + vat);
  const invoiceLines: Array<{
    description?: string | null;
    qty?: number | null;
    unit?: string | null;
    unit_price?: number | null;
    amount?: number | null;
    classification?: LineClassification;
  }> = Array.isArray(parsed?.lines) ? parsed.lines : [];
  const classificationSummary = parsed?.classification_summary as
    | { dominant: LineKind; account: string; label: string; mixed: boolean }
    | null
    | undefined;

  // Detect empty extraction (all key fields missing) — likely OCR/parse failed
  const isEmptyExtract =
    !parsed?.vendor_name &&
    !parsed?.invoice_no &&
    !parsed?.issue_date &&
    !(subtotal > 0) &&
    !(total > 0) &&
    !(invoiceLines.length > 0);

  const rawText: string | null = parsed?._rawText ?? null;
  const notes: string | null = parsed?.notes ?? null;
  const schemaWarn: string | null = parsed?._schemaWarning
    ? "Dữ liệu PDF chưa đầy đủ, hệ thống đã chuẩn hóa phần đọc được."
    : null;
  const parserNotes: string | null = parsed?._parserNotes ?? null;

  const fields: Field[] = [
    { label: "Số HĐ", value: <span className="font-semibold">{invNo}</span> },
    { label: "Ngày", value: fmtDate(issueDate) },
    { label: "NCC", value: <span className="font-semibold">{vendor}</span> },
    taxId
      ? {
          label: "MST",
          value: (
            <span className="inline-flex items-center gap-2">
              <span className="font-mono">{taxId}</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                MST hợp lệ
              </span>
            </span>
          ),
        }
      : null,
    classificationSummary
      ? {
          label: "Loại",
          value: (
            <span className="inline-flex items-center gap-1.5">
              <KindBadge kind={classificationSummary.dominant} />
              {classificationSummary.mixed ? (
                <span className="text-[10px] text-muted-foreground">(hỗn hợp)</span>
              ) : null}
              <span className="text-[10px] text-muted-foreground">
                → TK {classificationSummary.account}
              </span>
            </span>
          ),
        }
      : null,
    { label: "Giá trước thuế", value: <span className="font-mono">{fmtVND(subtotal)}</span> },
    vat ? { label: "VAT", value: <span className="font-mono">{fmtVND(vat)}</span> } : null,
    {
      label: "Tổng",
      value: <span className="font-mono text-base font-bold">{fmtVND(total)}</span>,
    },
  ].filter(Boolean) as Field[];

  // Determine whether the left preview can be zoomed
  const canZoom =
    (isXml && !!parsed?._einvoice) || (isPdf && !!urlData?.url) || (isImage && !!urlData?.url);

  const openZoom = () => {
    setZoomOpen(true);
  };

  const renderZoomBtn = () =>
    canZoom ? (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openZoom();
        }}
        className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/85 px-2 py-1 text-[10.5px] font-medium text-foreground/80 shadow-sm backdrop-blur transition hover:bg-background hover:text-foreground"
        title="Xem lớn"
      >
        <Maximize2 className="h-3 w-3" />
        Xem lớn
      </button>
    ) : null;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
        <div
          className={cn(
            "grid gap-0",
            isXml
              ? "grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
              : isPdf
                ? "grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
                : "grid-cols-[160px_1fr]",
          )}
        >
          {/* Thumbnail / Preview */}
          <div className="relative flex flex-col items-center justify-center gap-2 border-b border-border/60 bg-muted/30 p-3 md:border-b-0 md:border-r">
            {renderZoomBtn()}
            {isXml && parsed?._einvoice ? (
              <XmlInvoicePreview
                data={parsed._einvoice as EinvoiceExtras}
                signedUrl={urlData?.url ?? null}
              />
            ) : isPdf && uploadId && urlLoading && !urlData ? (
              <div className="h-[420px] w-full animate-pulse rounded-md bg-muted" />
            ) : isPdf && urlData?.url ? (
              <div className="flex w-full flex-col items-stretch gap-2">
                <PdfPagePreview url={urlData.url} filename={filename} />
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={urlData.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Mở PDF gốc trong tab mới
                  </a>
                </div>
              </div>
            ) : isImage && uploadId && !urlData && urlLoading ? (
              <div className="h-40 w-full animate-pulse rounded-md bg-muted" />
            ) : isImage && urlData?.url ? (
              <a
                href={urlData.url}
                target="_blank"
                rel="noreferrer"
                className="block w-full"
                title="Bấm để xem ảnh gốc"
              >
                <img
                  src={urlData.url}
                  alt={filename ?? "invoice"}
                  className="max-h-56 w-full rounded-md bg-background object-contain"
                  loading="lazy"
                />
              </a>
            ) : urlData?.url ? (
              <a
                href={urlData.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col items-center gap-2 rounded-md p-2 text-center hover:bg-background/40"
              >
                <div className="flex h-14 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                  Xem HĐ gốc
                </div>
              </a>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-14 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isImage ? "Không tải được ảnh" : isPdf ? "PDF" : "HÓA ĐƠN"}
                </div>
              </div>
            )}
            {filename && !(isXml && parsed?._einvoice) && (
              <div className="line-clamp-2 break-all text-center text-[10px] text-muted-foreground/80">
                {filename}
              </div>
            )}
            {!(isXml && parsed?._einvoice) && (parsed?._signed != null || taxId) ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {parsed?._signed ? "đã ký số" : "đã xác minh"}
              </span>
            ) : null}
          </div>

          {/* Right column — for XML invoices, replace duplicate fields with the journal proposal */}
          <div className={cn(isXml ? "" : "p-4")}>
            {isXml && !isEmptyExtract ? (
              <ProposalSlot proposal={proposal} />
            ) : isEmptyExtract ? (
              <div className="space-y-2 p-4">
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  Chưa đọc được dữ liệu hoá đơn từ {isPdf ? "PDF" : "tệp"} này — bạn có thể mở file
                  gốc để kiểm tra.
                  {schemaWarn ? (
                    <div className="mt-1 opacity-80">Chi tiết: {schemaWarn}</div>
                  ) : null}
                  {parserNotes ? <div className="mt-1 opacity-80">{parserNotes}</div> : null}
                </div>
                {rawText ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Xem nội dung đã trích xuất
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground/80">
                      {rawText.slice(0, 4000)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {fields.map((f, i) => (
                    <FieldRow key={i} label={f.label} value={f.value} />
                  ))}
                </dl>
                {invoiceLines.length > 0 ? (
                  <div className="mt-3 border-t border-border/40 pt-2">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Chi tiết dòng ({invoiceLines.length})
                    </div>
                    <ul className="space-y-1">
                      {invoiceLines.slice(0, 8).map((ln, i) => (
                        <LineRow key={i} line={ln} />
                      ))}
                      {invoiceLines.length > 8 ? (
                        <li className="text-[10px] text-muted-foreground">
                          … và {invoiceLines.length - 8} dòng khác
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
                {notes ? (
                  <div className="mt-3 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                    {notes}
                  </div>
                ) : null}
                {parserNotes ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">{parserNotes}</div>
                ) : null}
                {rawText && isPdf ? (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Xem nội dung đã đọc từ PDF
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground/80">
                      {rawText.slice(0, 4000)}
                    </pre>
                  </details>
                ) : null}
                {/* Non-XML: also surface the proposal underneath the fields */}
                {proposal ? (
                  <div className="mt-3 border-t border-border/40 pt-3">
                    <JournalProposalCard
                      actionId={proposal.actionId}
                      toolName={proposal.toolName}
                      input={proposal.input}
                      summary={proposal.summary}
                      embedded
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Zoom dialog */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-auto p-0">
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle className="text-sm font-semibold">{filename ?? "Hoá đơn"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5">
            {isXml && parsed?._einvoice ? (
              <XmlInvoicePreview
                data={parsed._einvoice as EinvoiceExtras}
                signedUrl={urlData?.url ?? null}
                size="large"
              />
            ) : isPdf && urlData?.url ? (
              <div className="flex flex-col gap-2">
                <PdfPagePreview url={urlData.url} filename={filename} large />
                <a
                  href={urlData.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 self-end text-[12px] font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Mở PDF trong tab mới
                </a>
              </div>
            ) : isImage && urlData?.url ? (
              <img
                src={urlData.url}
                alt={filename ?? "invoice"}
                className="mx-auto max-h-[82vh] w-auto rounded-md bg-background object-contain"
              />
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Không có nội dung để xem.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProposalSlot({ proposal }: { proposal?: InvoiceProposal | null }) {
  if (!proposal) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border/60 px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bút toán đề xuất
        </div>
        <div className="flex-1 px-4 py-4">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
            AI đang lập bút toán đề xuất…
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3.5 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-4/6 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/6 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <JournalProposalCard
      actionId={proposal.actionId}
      toolName={proposal.toolName}
      input={proposal.input}
      summary={proposal.summary}
      embedded
    />
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className={cn("self-center text-[11px] text-muted-foreground")}>{label}</dt>
      <dd className="self-center text-foreground">{value}</dd>
    </>
  );
}

const KIND_TONE: Record<LineKind, string> = {
  goods:
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30",
  fixed_asset: "bg-sky-500/12 text-sky-700 dark:text-sky-400 ring-sky-500/30",
  ccdc: "bg-violet-500/12 text-violet-700 dark:text-violet-400 ring-violet-500/30",
  service: "bg-amber-500/14 text-amber-700 dark:text-amber-400 ring-amber-500/30",
};

function KindBadge({
  kind,
  confidence,
  signals,
}: {
  kind: LineKind;
  confidence?: number;
  signals?: { label: string }[];
}) {
  const meta = kindMeta(kind);
  const tone = KIND_TONE[kind];
  const lowConf = confidence != null && confidence < 80;
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        tone,
        lowConf && "ring-amber-500/60",
      )}
    >
      {meta.label}
      {confidence != null ? (
        <span className="opacity-70">{confidence}%</span>
      ) : null}
    </span>
  );
  if (!signals || signals.length === 0) return badge;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-[11px]">
          <div className="mb-1 font-semibold">
            Vì sao là {meta.label}? (TK gợi ý {meta.account})
          </div>
          <ul className="list-disc space-y-0.5 pl-3">
            {signals.map((s, i) => (
              <li key={i}>{s.label}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LineRow({
  line,
}: {
  line: {
    description?: string | null;
    qty?: number | null;
    unit?: string | null;
    unit_price?: number | null;
    amount?: number | null;
    classification?: LineClassification;
  };
}) {
  const c = line.classification;
  return (
    <li className="flex items-start justify-between gap-2 text-[11.5px]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground">
            {line.description ?? "—"}
          </span>
          {c ? (
            <KindBadge kind={c.kind} confidence={c.confidence} signals={c.signals} />
          ) : null}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {line.qty ?? "—"} {line.unit ?? ""} × {fmtVND(line.unit_price ?? 0)}
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px]">
        {fmtVND(line.amount ?? 0)}
      </div>
    </li>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Check, ExternalLink, Maximize2, Sparkles } from "lucide-react";
import { getUploadSignedUrl } from "@/lib/ai/parse-document.functions";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { XmlInvoicePreview, type EinvoiceExtras } from "./xml-invoice-preview";
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

  const isImageByName = filename
    ? /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i.test(filename)
    : false;
  const isPdfByName = filename ? /\.pdf$/i.test(filename) : false;
  const isXmlByName = filename ? /\.xml$/i.test(filename) : false;
  const mime = (urlData as any)?.mimeType as string | null | undefined;
  const isImage = isImageByName || (mime ?? "").startsWith("image/");
  const isPdf = isPdfByName || mime === "application/pdf";
  const isXml = isXmlByName || (mime ?? "").includes("xml") || !!parsed?._einvoice;

  const isInvoice = kind === "purchase_invoice" || !!parsed?.vendor_name || isImage || isPdf || isXml;

  const [zoomOpen, setZoomOpen] = useState(false);

  if (!isInvoice) return null;

  const vendor = parsed?.vendor_name ?? "—";
  const taxId = parsed?.vendor_tax_id ?? null;
  const invNo = parsed?.invoice_no ?? "—";
  const issueDate = parsed?.issue_date ?? null;
  const subtotal = Number(parsed?.subtotal ?? 0);
  const vat = Number(parsed?.vat_amount ?? 0);
  const total = Number(parsed?.total ?? subtotal + vat);
  const firstLine = parsed?.lines?.[0]?.description ?? null;

  // Detect empty extraction (all key fields missing) — likely OCR/parse failed
  const isEmptyExtract =
    !parsed?.vendor_name &&
    !parsed?.invoice_no &&
    !parsed?.issue_date &&
    !(subtotal > 0) &&
    !(total > 0) &&
    !(parsed?.lines?.length > 0);

  const rawText: string | null = parsed?._rawText ?? null;
  const notes: string | null = parsed?.notes ?? null;
  const schemaWarn: string | null = parsed?._schemaWarning ?? null;

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
    firstLine ? { label: "Mặt hàng", value: firstLine } : null,
    { label: "Giá trước thuế", value: <span className="font-mono">{fmtVND(subtotal)}</span> },
    vat
      ? { label: "VAT", value: <span className="font-mono">{fmtVND(vat)}</span> }
      : null,
    {
      label: "Tổng",
      value: <span className="font-mono text-base font-bold">{fmtVND(total)}</span>,
    },
  ].filter(Boolean) as Field[];

  // Determine whether the left preview can be zoomed
  const canZoom = (isXml && !!parsed?._einvoice) || (isPdf && !!urlData?.url) || (isImage && !!urlData?.url);

  const renderZoomBtn = () =>
    canZoom ? (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setZoomOpen(true);
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
                {/* Desktop: inline iframe preview. Most desktop browsers render PDFs in iframes;
                    mobile browsers usually don't, so we hide the iframe on small screens
                    and rely on the tappable tile + actions below. */}
                <iframe
                  src={`${urlData.url}#toolbar=0&navpanes=0&view=FitH`}
                  title={filename ?? "pdf"}
                  className="hidden h-[440px] w-full rounded-md border border-border/40 bg-background md:block"
                />
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-background/60 p-6 text-center transition hover:border-primary/40 hover:bg-background md:hidden"
                >
                  <div className="flex h-14 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-7 w-7" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">Xem hoá đơn PDF</div>
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    <Maximize2 className="h-3 w-3" />
                    Bấm để mở lớn
                  </div>
                </button>
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
                  Chưa đọc được dữ liệu hoá đơn từ {isPdf ? "PDF" : "tệp"} này — bạn có thể mở file gốc để kiểm tra.
                  {schemaWarn ? <div className="mt-1 opacity-80">Chi tiết: {schemaWarn}</div> : null}
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
                {notes ? (
                  <div className="mt-3 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                    {notes}
                  </div>
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
            <DialogTitle className="text-sm font-semibold">
              {filename ?? "Hoá đơn"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5">
            {isXml && parsed?._einvoice ? (
              <XmlInvoicePreview
                data={parsed._einvoice as EinvoiceExtras}
                signedUrl={urlData?.url ?? null}
                size="large"
              />
            ) : isPdf && urlData?.url ? (
              <object
                data={`${urlData.url}#toolbar=1&view=FitH`}
                type="application/pdf"
                className="h-[80vh] w-full rounded-md bg-background"
                aria-label={filename ?? "pdf"}
              />
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

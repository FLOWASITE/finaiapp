import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Check, ExternalLink } from "lucide-react";
import { getUploadSignedUrl } from "@/lib/ai/parse-document.functions";
import { cn } from "@/lib/utils";
import { XmlInvoicePreview, type EinvoiceExtras } from "./xml-invoice-preview";

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

export function InvoiceExtractCard({
  parsed,
  uploadId,
  filename,
  kind,
}: {
  parsed: any;
  uploadId?: string | null;
  filename?: string;
  kind?: string;
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

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
      <div
        className={cn(
          "grid gap-0",
          isXml
            ? "grid-cols-1 md:grid-cols-[300px_1fr]"
            : isPdf
              ? "grid-cols-1 md:grid-cols-[260px_1fr]"
              : "grid-cols-[140px_1fr]",
        )}
      >
        {/* Thumbnail / Preview */}
        <div className="relative flex flex-col items-center justify-center gap-2 border-b border-border/60 bg-muted/30 p-3 md:border-b-0 md:border-r">
          {isXml && parsed?._einvoice ? (
            <XmlInvoicePreview
              data={parsed._einvoice as EinvoiceExtras}
              signedUrl={urlData?.url ?? null}
            />
          ) : isPdf && uploadId && urlLoading && !urlData ? (
            <div className="h-64 w-full animate-pulse rounded-md bg-muted" />
          ) : isPdf && urlData?.url ? (
            <>
              <object
                data={`${urlData.url}#toolbar=0&navpanes=0&view=FitH`}
                type="application/pdf"
                className="h-64 w-full rounded-md bg-background"
                aria-label={filename ?? "pdf"}
              >
                <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="text-[11px] text-muted-foreground">
                    Trình duyệt không xem được PDF trực tiếp
                  </div>
                </div>
              </object>
              <a
                href={urlData.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Mở PDF gốc
              </a>
            </>
          ) : isImage && uploadId && !urlData && urlLoading ? (
            <div className="h-32 w-full animate-pulse rounded-md bg-muted" />
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
                className="max-h-40 w-full rounded-md bg-background object-contain"
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
          {filename && (
            <div className="line-clamp-2 break-all text-center text-[10px] text-muted-foreground/80">
              {filename}
            </div>
          )}
          {parsed?._signed != null || taxId ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {parsed?._signed ? "đã ký số" : "đã xác minh"}
            </span>
          ) : null}
        </div>

        {/* Fields */}
        <div className="p-4">
          {isEmptyExtract ? (
            <div className="space-y-2">
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
            </>
          )}
        </div>
      </div>
    </div>
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

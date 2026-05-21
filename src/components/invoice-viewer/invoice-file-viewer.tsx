import { useState } from "react";
import { ExternalLink, FileText, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  XmlInvoicePreview,
  type EinvoiceExtras,
} from "@/components/chat/invoice/xml-invoice-preview";
import { PdfPagePreview } from "./pdf-page-preview";

export type InvoiceFileViewerProps = {
  einvoice?: EinvoiceExtras | null;
  signedUrl?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  /** Hiển thị nút Xem lớn (mặc định true). */
  enableZoom?: boolean;
};

function detectKind(
  mimeType?: string | null,
  filename?: string | null,
  hasEinvoice?: boolean,
): { isXml: boolean; isPdf: boolean; isImage: boolean } {
  const mime = (mimeType ?? "").toLowerCase();
  const name = (filename ?? "").toLowerCase();
  const isXmlByName = /\.xml$/i.test(name);
  const isPdfByName = /\.pdf$/i.test(name);
  const isImageByName = /\.(jpe?g|png|webp|gif|heic|bmp|tiff?)$/i.test(name);
  const isXml = isXmlByName || mime.includes("xml") || !!hasEinvoice;
  const isPdf = isPdfByName || mime === "application/pdf";
  const isImage = isImageByName || mime.startsWith("image/");
  return { isXml, isPdf, isImage };
}

/**
 * Reusable viewer cho file hoá đơn (XML einvoice / PDF canvas / ảnh).
 * Tách từ chatbot InvoiceExtractCard để dùng chung ở Trung tâm tài liệu.
 */
export function InvoiceFileViewer({
  einvoice,
  signedUrl,
  mimeType,
  filename,
  enableZoom = true,
}: InvoiceFileViewerProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const { isXml, isPdf, isImage } = detectKind(mimeType, filename, !!einvoice);

  const canZoom =
    enableZoom &&
    ((isXml && !!einvoice) || (isPdf && !!signedUrl) || (isImage && !!signedUrl));

  const ZoomButton = canZoom ? (
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
      <div className="relative flex w-full flex-col items-center justify-center gap-2">
        {ZoomButton}
        {isXml && einvoice ? (
          <XmlInvoicePreview data={einvoice} signedUrl={signedUrl ?? null} />
        ) : isPdf && signedUrl ? (
          <div className="flex w-full flex-col items-stretch gap-2">
            <PdfPagePreview url={signedUrl} filename={filename ?? undefined} />
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Mở PDF gốc trong tab mới
            </a>
          </div>
        ) : isImage && signedUrl ? (
          <a href={signedUrl} target="_blank" rel="noreferrer" className="block w-full">
            <img
              src={signedUrl}
              alt={filename ?? "invoice"}
              className="max-h-[60vh] w-full rounded-md bg-background object-contain"
              loading="lazy"
            />
          </a>
        ) : signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col items-center gap-2 rounded-md p-2 text-center hover:bg-background/40"
          >
            <div className="flex h-14 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
              Mở file gốc
            </div>
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <div className="flex h-14 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FileText className="h-6 w-6" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Không có file để xem
            </div>
          </div>
        )}
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-auto p-0">
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle className="text-sm font-semibold">
              {filename ?? "Hoá đơn"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5">
            {isXml && einvoice ? (
              <XmlInvoicePreview
                data={einvoice}
                signedUrl={signedUrl ?? null}
                size="large"
              />
            ) : isPdf && signedUrl ? (
              <div className="flex flex-col gap-2">
                <PdfPagePreview url={signedUrl} filename={filename ?? undefined} large />
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 self-end text-[12px] font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Mở PDF trong tab mới
                </a>
              </div>
            ) : isImage && signedUrl ? (
              <img
                src={signedUrl}
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

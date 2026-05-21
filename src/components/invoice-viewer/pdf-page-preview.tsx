import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { cn } from "@/lib/utils";

export function PdfPagePreview({
  url,
  filename,
  large = false,
}: {
  url: string;
  filename?: string;
  large?: boolean;
}) {
  type PdfViewport = { width: number; height: number };
  type PdfPage = {
    getViewport: (opts: { scale: number }) => PdfViewport;
    render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => {
      promise: Promise<void>;
    };
  };
  type PdfDocument = { getPage: (pageNumber: number) => Promise<PdfPage> };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let task: { promise: Promise<unknown>; destroy?: () => void } | null = null;

    async function renderFirstPage() {
      setStatus("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        task = (pdfjs as any).getDocument({ url, withCredentials: false });
        const pdf = (await task!.promise) as PdfDocument;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: large ? 1.45 : 1.15 });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const maxCssWidth = large ? 920 : 520;
        const cssWidth = Math.min(baseViewport.width, maxCssWidth);
        const scale = cssWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: (large ? 1.45 : 1.15) * scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) setStatus("ready");
      } catch (error) {
        console.warn("[PdfPagePreview] render failed", error);
        if (!cancelled) setStatus("error");
      }
    }

    renderFirstPage();
    return () => {
      cancelled = true;
      try {
        task?.destroy?.();
      } catch (error) {
        console.warn("[PdfPagePreview] cleanup failed", error);
      }
    };
  }, [large, url]);

  if (status === "error") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-background/60 p-6 text-center transition hover:border-primary/40 hover:bg-background"
      >
        <div className="flex h-14 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileText className="h-7 w-7" />
        </div>
        <div className="text-sm font-semibold text-foreground">Mở hoá đơn PDF</div>
        <div className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
          <ExternalLink className="h-3 w-3" />
          Trình duyệt không render được preview
        </div>
      </a>
    );
  }

  return (
    <div className="relative flex w-full justify-center overflow-auto rounded-md border border-border/40 bg-background p-2">
      {status === "loading" ? (
        <div
          className={cn(
            "w-full animate-pulse rounded-md bg-muted",
            large ? "h-[70vh]" : "h-[360px]",
          )}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        aria-label={filename ?? "PDF preview"}
        className={cn(
          "max-w-full rounded bg-background shadow-sm",
          status === "loading" && "absolute opacity-0",
        )}
      />
    </div>
  );
}

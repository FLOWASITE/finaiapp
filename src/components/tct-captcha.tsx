import * as React from "react";
import { RefreshCw, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function svgToDataUrl(svg: string | null | undefined): string | null {
  if (!svg) return null;
  try {
    // Safe base64 encode for unicode SVG payloads
    const b64 =
      typeof window === "undefined"
        ? Buffer.from(svg, "utf-8").toString("base64")
        : btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${b64}`;
  } catch {
    return null;
  }
}

export function TctCaptcha({
  svg,
  loading,
  onReload,
  className,
}: {
  svg: string | null | undefined;
  loading?: boolean;
  onReload: () => void;
  className?: string;
}) {
  const src = React.useMemo(() => svgToDataUrl(svg), [svg]);
  const [zoomOpen, setZoomOpen] = React.useState(false);

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="flex h-14 w-48 items-center justify-center overflow-hidden rounded border border-border bg-white">
        {src ? (
          <img
            src={src}
            alt="Mã captcha TCT"
            draggable={false}
            className="h-full w-full select-none object-contain"
            style={{ imageRendering: "crisp-edges" }}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onReload}
          disabled={loading}
          title="Tải lại captcha"
          aria-label="Tải lại captcha"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>

        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={!src}
              title="Phóng to captcha"
              aria-label="Phóng to captcha"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Mã captcha (phóng to)</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center rounded border border-border bg-white p-4">
              {src ? (
                <img
                  src={src}
                  alt="Mã captcha TCT phóng to"
                  draggable={false}
                  className="h-40 w-auto select-none"
                  style={{ imageRendering: "crisp-edges" }}
                />
              ) : (
                <div className="h-40 w-full animate-pulse bg-muted" />
              )}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReload}
                disabled={loading}
              >
                <RefreshCw
                  className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Tải lại
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  /** Storage bucket name (e.g. "invoices" or "einvoices"). */
  bucket?: string;
  /** Current file path stored in DB (relative inside the bucket). */
  filePath?: string | null;
  /** Label displayed above the control. */
  label?: string;
  /** Accepted file types (input accept attr). */
  accept?: string;
  /** Allow user to clear the attachment. */
  allowClear?: boolean;
  /** Called after a successful upload with the new storage path. */
  onUploaded: (path: string, file: File) => void | Promise<void>;
  /** Optional clear handler — only called when user clicks the clear button. */
  onClear?: () => void | Promise<void>;
};

export function AttachInvoiceFile({
  bucket = "invoices",
  filePath,
  label = "File hoá đơn đính kèm",
  accept = "image/*,application/pdf,.xml",
  allowClear = false,
  onUploaded,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Chưa đăng nhập");
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${uid}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      await onUploaded(path, file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openFile = async () => {
    if (!filePath) return;
    setViewing(true);
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, 60 * 10);
      if (error || !data?.signedUrl) throw error ?? new Error("Không tạo được link");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không mở được file");
    } finally {
      setViewing(false);
    }
  };

  const fileName = filePath ? filePath.split("/").pop() : null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1.5" />
          )}
          {filePath ? "Thay file" : "Upload file"}
        </Button>
        {filePath && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openFile}
              disabled={viewing}
              className="text-primary"
            >
              {viewing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-1.5" />
              )}
              Xem
            </Button>
            <span className="text-xs text-muted-foreground truncate max-w-[260px]" title={fileName ?? ""}>
              {fileName}
            </span>
            {allowClear && onClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onClear()}
                className="text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        {!filePath && !uploading && (
          <span className="text-xs text-muted-foreground">Chưa có file (PDF / ảnh / XML)</span>
        )}
      </div>
    </div>
  );
}

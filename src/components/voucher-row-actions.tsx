import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Paperclip, Eye, MoreVertical,
  Pencil, Printer, Copy, Trash2, Download, Upload, Loader2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { uploadDocument, linkDocument } from "@/lib/documents.functions";

export type AttachmentRef = {
  id: string;
  original_filename: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string | null;
};

export function PostedBadge({ posted }: { posted: boolean }) {
  return posted ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" /> Đã hạch toán
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" /> Chưa hạch toán
    </span>
  );
}

type AttachCellProps = {
  attachments: AttachmentRef[];
  entityTable: "cash_vouchers" | "bank_vouchers";
  entityId: string;
  docKind: "cash_voucher" | "bank_voucher";
  invalidateKeys: string[][];
};

export function AttachmentsCell({ attachments, entityTable, entityId, docKind, invalidateKeys }: AttachCellProps) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadDocument);
  const link = useServerFn(linkDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const count = attachments.length;

  const openFile = async (a: AttachmentRef) => {
    try {
      const { data, error } = await supabase.storage
        .from(a.storage_bucket)
        .createSignedUrl(a.storage_path, 60 * 10);
      if (error || !data?.signedUrl) throw error ?? new Error("Không tạo được link");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message || "Không mở được file");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await upload({
        data: {
          fileBase64: b64,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          doc_kind: docKind,
        },
      });
      if (!res?.id) throw new Error("Upload thất bại");
      await link({ data: { document_id: res.id, entity_table: entityTable, entity_id: entityId, link_type: "attachment" } });
      toast.success("Đã đính kèm tài liệu");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (err: any) {
      toast.error(err?.message || "Lỗi đính kèm");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors " +
            (count > 0
              ? "bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100"
              : "text-muted-foreground hover:bg-muted")
          }
          title={count > 0 ? `${count} tài liệu đính kèm` : "Chưa có tài liệu"}
        >
          <Paperclip className="h-3.5 w-3.5" />
          {count > 0 ? <span className="font-medium">{count}</span> : <span>—</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
          Tài liệu đính kèm ({count})
        </div>
        <div className="max-h-60 overflow-y-auto">
          {attachments.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">Chưa có tài liệu</div>
          ) : (
            attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate text-xs flex-1" title={a.original_filename ?? ""}>
                  {a.original_filename ?? "(không tên)"}
                </span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openFile(a)} title="Xem">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openFile(a)} title="Tải về">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="border-t mt-2 pt-2 px-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf,.xml"
            className="hidden"
            onChange={handleUpload}
            disabled={busy}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Đính kèm file
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type RowActionsProps = {
  onView?: () => void;
  onEdit?: () => void;
  onPrint?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

export function VoucherRowActions({ onView, onEdit, onPrint, onDuplicate, onDelete }: RowActionsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        className="h-7 w-7 p-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={onView}
        title="Xem phiếu"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-7 w-7 p-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
            title="Hành động khác"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" /> Chỉnh sửa
            </DropdownMenuItem>
          )}
          {onPrint && (
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="h-4 w-4 mr-2" /> In phiếu
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" /> Nhân bản
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Xóa
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

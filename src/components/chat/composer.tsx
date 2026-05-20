import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUp, Square, Paperclip, Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseDocument } from "@/lib/ai/parse-document.functions";
import { ParseProgressDialog, type FileProgress, type Phase } from "@/components/chat/parse-progress-dialog";
import { cn } from "@/lib/utils";

type ImportKind = "purchase_invoice" | "bank_statement" | "cash_voucher";

export type AttachmentPayload = {
  name: string;
  mime: string;
  size: number;
  base64: string;
  kind: ImportKind;
};

export type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Bật nút đính kèm chứng từ (mặc định true). */
  enableAttach?: boolean;
  /** Bật nút ghi âm (mặc định true). */
  enableVoice?: boolean;
  /**
   * Khi mic ghi xong: nếu truyền callback, parent quyết định gửi;
   * nếu không, transcript được điền vào ô input.
   */
  onTranscript?: (text: string) => void;
  /**
   * Nếu cung cấp, Composer sẽ ĐỌC file → base64 rồi gọi callback này
   * thay vì tự parse + điều hướng /import/preview.
   * Dùng để xử lý chứng từ NGAY TRONG phòng hội thoại.
   */
  onAttach?: (files: AttachmentPayload[]) => void;
};

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  loading,
  placeholder = "Nhắn cho trợ lý AI…",
  autoFocus,
  compact,
  inputRef,
  enableAttach = true,
  enableVoice = true,
  onTranscript,
  onAttach,
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<any>(null);
  const [focused, setFocused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsePhase, setParsePhase] = useState<Phase | null>(null);
  const [parseFiles, setParseFiles] = useState<FileProgress[]>([]);
  const [nextTarget, setNextTarget] = useState<"/import/preview" | "/bank/import-statement" | null>(null);
  const navigate = useNavigate();
  const parseFn = useServerFn(parseDocument);

  useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, []);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = compact ? 140 : 200;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [value, compact]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!disabled && !loading && value.trim()) onSubmit();
    }
  };

  // ----- Mic (Web Speech API) -----
  const toggleVoice = () => {
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome/Safari.");
      return;
    }
    if (recording && recogRef.current) {
      recogRef.current.stop();
      return;
    }
    const r = new SR();
    r.lang = "vi-VN";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      onChange((finalText + interim).trim());
    };
    r.onerror = (e: any) => {
      toast.error(`Lỗi ghi âm: ${e.error || "unknown"}`);
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      recogRef.current = null;
      const text = finalText.trim();
      if (text && onTranscript) setTimeout(() => onTranscript(text), 80);
    };
    recogRef.current = r;
    setRecording(true);
    r.start();
  };

  // ----- Attach (parse chứng từ) -----
  const openPicker = (kind: ImportKind) => {
    if (!fileRef.current) return;
    fileRef.current.dataset.kind = kind;
    fileRef.current.click();
  };

  const readBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || "");
        resolve(s.split(",")[1] || s);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const validateFiles = (files: File[]) =>
    files.filter((f) => {
      if (f.size > 12 * 1024 * 1024) {
        toast.error(`${f.name}: quá 12MB, bỏ qua`);
        return false;
      }
      if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
        toast.error(`${f.name}: chỉ PDF/ảnh`);
        return false;
      }
      return true;
    });

  const handleUploadBatch = async (files: File[], kind: ImportKind) => {
    if (!files.length || uploading) return;
    const valid = validateFiles(files);
    if (!valid.length) return;

    // --- New path: hand off to parent (xử lý ngay trong phòng chat) ---
    if (onAttach) {
      setUploading(true);
      const toastId = toast.loading(`Đang đọc ${valid.length} file…`);
      try {
        const payloads: AttachmentPayload[] = [];
        for (const f of valid) {
          const base64 = await readBase64(f);
          payloads.push({ name: f.name, mime: f.type, size: f.size, base64, kind });
        }
        toast.success(`Đã đính kèm ${payloads.length} file`, { id: toastId });
        onAttach(payloads);
      } catch (e: any) {
        toast.error(e?.message || "Không đọc được file", { id: toastId });
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
      return;
    }

    // --- Legacy path: parse client-side + show 2-phase dialog ---
    setUploading(true);
    const initial: FileProgress[] = valid.map((f) => ({ name: f.name, phase: "queued" }));
    setParseFiles(initial);
    setParsePhase("parsing");

    const updateFile = (idx: number, patch: Partial<FileProgress>) =>
      setParseFiles((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

    const items: Array<{ filename: string; kind: ImportKind; parsed: any; error?: string }> = [];
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      const startedAt = Date.now();
      try {
        updateFile(i, { phase: "reading" });
        const base64 = await readBase64(file);
        updateFile(i, { phase: "parsing" });
        const res: any = await parseFn({
          data: { fileBase64: base64, mimeType: file.type, filename: file.name, kind },
        });
        // Server returns observability fields: parser_used, pages, structurer_ms, parser_ms
        updateFile(i, {
          phase: "done",
          parserUsed: res?.parser_used,
          pages: res?.pages,
          ms: Date.now() - startedAt,
        });
        items.push({ filename: file.name, kind, parsed: res?.parsed ?? {} });
      } catch (e: any) {
        updateFile(i, { phase: "error", error: e?.message || "lỗi", ms: Date.now() - startedAt });
        items.push({ filename: file.name, kind, parsed: null, error: e?.message || "lỗi" });
      }
    }
    const ok = items.filter((i) => !i.error);
    const failed = items.filter((i) => i.error);
    const batchPayload = { kind, items: ok, failed, createdAt: Date.now() };
    (window as any).__lastBatchImport = batchPayload;
    if (ok.length) (window as any).__lastParsedDoc = { kind, parsed: ok[0].parsed };
    try {
      sessionStorage.setItem("lastBatchImport", JSON.stringify(batchPayload));
    } catch {}
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";

    if (!ok.length) {
      // Keep dialog open in "ready" phase so the user can read errors, but no continue button enabled.
      setParsePhase("ready");
      setNextTarget(null);
      return;
    }
    setNextTarget(kind === "bank_statement" ? "/bank/import-statement" : "/import/preview");
    setParsePhase("ready");
  };

  const closeParseDialog = () => {
    setParsePhase(null);
    setParseFiles([]);
    setNextTarget(null);
  };

  const continueToReview = () => {
    const target = nextTarget;
    closeParseDialog();
    if (target) navigate({ to: target });
  };

  const busy = !!loading || uploading;

  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        data-kind="purchase_invoice"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          const k = (e.target.dataset.kind as ImportKind) || "purchase_invoice";
          if (files.length) handleUploadBatch(files, k);
        }}
      />
      <div
        className={cn(
          "group relative flex w-full items-end gap-2 rounded-3xl border bg-card/70 px-4 py-2.5 backdrop-blur-xl transition-all duration-200",
          "border-border/60 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]",
          "focus-within:border-primary/50 focus-within:shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--primary)_25%,transparent)] focus-within:ring-1 focus-within:ring-primary/20",
          compact ? "min-h-[48px]" : "min-h-[60px]",
        )}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={recording ? "Đang nghe…" : placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />

        {enableAttach && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={busy}
                className="h-9 w-9 shrink-0 rounded-2xl text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label="Đính kèm chứng từ"
                title="Đính kèm chứng từ"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openPicker("purchase_invoice")}>
                Hoá đơn mua (PDF/ảnh)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openPicker("bank_statement")}>
                Sao kê ngân hàng
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openPicker("cash_voucher")}>
                Phiếu thu/chi viết tay
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {enableVoice && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={toggleVoice}
            disabled={busy}
            className={cn(
              "h-9 w-9 shrink-0 rounded-2xl",
              recording
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            aria-label={recording ? "Dừng ghi âm" : "Ghi âm"}
            title={recording ? "Dừng ghi âm" : "Ghi âm (vi-VN)"}
          >
            {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}

        {loading && onStop ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onStop}
            className="h-9 w-9 shrink-0 rounded-2xl border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Dừng"
            title="Dừng"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={onSubmit}
            disabled={disabled || busy || !value.trim()}
            className={cn(
              "h-9 w-9 shrink-0 rounded-2xl transition-transform",
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95",
              "disabled:opacity-40 disabled:hover:scale-100",
            )}
            aria-label="Gửi"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </Button>
        )}
      </div>
      {!compact && focused && (
        <div className="pointer-events-none absolute -bottom-5 right-2 text-[10px] text-muted-foreground/60">
          <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">Shift</kbd>
          {" + "}
          <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">Enter</kbd>
          {" để xuống dòng"}
        </div>
      )}
      <ParseProgressDialog
        open={parsePhase !== null}
        phase={parsePhase ?? "parsing"}
        files={parseFiles}
        onContinue={continueToReview}
        onClose={closeParseDialog}
        continueLabel={nextTarget === "/bank/import-statement" ? "Mở sao kê ngân hàng" : "Xem lại & chỉnh sửa"}
      />
    </div>
  );
}

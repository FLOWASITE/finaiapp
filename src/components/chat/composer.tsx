import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUp, Square, Paperclip, Mic, MicOff, Loader2, X, FileText, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseDocument } from "@/lib/ai/parse-document.functions";
import { classifyImports, resolveBankAccount } from "@/lib/ai/classify-import.functions";
import {
  ParseProgressPanel,
  type FileProgress,
  type Phase,
  type ClassificationResult,
  type ClassifyDecision,
} from "@/components/chat/parse-progress-dialog";
import { cn } from "@/lib/utils";

type ImportKind = "purchase_invoice" | "bank_statement" | "cash_voucher";

export type AttachmentPayload = {
  name: string;
  mime: string;
  size: number;
  base64: string;
  kind: ImportKind;
  uploadId?: string | null;
  file_hash?: string | null;
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
  onAttach?: (files: AttachmentPayload[], note?: string) => void;
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
  const [classifications, setClassifications] = useState<ClassificationResult[]>([]);
  const [decisions, setDecisions] = useState<Record<number, ClassifyDecision>>({});
  const [parsedItems, setParsedItems] = useState<Array<{ filename: string; kind: ImportKind; parsed: any; file_hash: string | null; uploadId: string | null }>>([]);
  const [pending, setPending] = useState<AttachmentPayload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const navigate = useNavigate();
  const parseFn = useServerFn(parseDocument);
  const classifyFn = useServerFn(classifyImports);
  const resolveBankFn = useServerFn(resolveBankAccount);

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

  const canSubmit = () => !disabled && !loading && !uploading && (value.trim().length > 0 || pending.length > 0);

  const doSubmit = () => {
    if (!canSubmit()) return;
    if (pending.length > 0 && onAttach) {
      const note = value.trim();
      const files = pending;
      setPending([]);
      onChange("");
      onAttach(files, note || undefined);
      return;
    }
    onSubmit();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      doSubmit();
    }
  };

  const removePending = (idx: number) =>
    setPending((prev) => prev.filter((_, i) => i !== idx));

  const previewUrl = useMemo(
    () =>
      pending.map((p) =>
        p.mime.startsWith("image/") ? `data:${p.mime};base64,${p.base64}` : null,
      ),
    [pending],
  );

  const formatSize = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
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

  const isXml = (f: File) =>
    f.type === "application/xml" ||
    f.type === "text/xml" ||
    f.name.toLowerCase().endsWith(".xml");

  const normalizedMime = (f: File) => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".pdf")) return "application/pdf";
    if (name.endsWith(".xml") && (!f.type || !f.type.includes("xml"))) return "application/xml";
    return f.type || "application/octet-stream";
  };

  const validateFiles = (files: File[]) =>
    files.filter((f) => {
      const mime = normalizedMime(f);
      if (f.size > 12 * 1024 * 1024) {
        toast.error(`${f.name}: quá 12MB, bỏ qua`);
        return false;
      }
      if (!mime.startsWith("image/") && mime !== "application/pdf" && !isXml(f)) {
        toast.error(`${f.name}: chỉ PDF/ảnh/XML`);
        return false;
      }
      return true;
    });

  const handleUploadBatch = async (files: File[], kind: ImportKind) => {
    if (!files.length || uploading) return;
    const valid = validateFiles(files);
    if (!valid.length) return;

    // --- New path: stash as pending chips, gửi cùng message khi user bấm Gửi ---
    if (onAttach) {
      setUploading(true);
      const toastId = toast.loading(`Đang đọc ${valid.length} file…`);
      try {
        const payloads: AttachmentPayload[] = [];
        for (const f of valid) {
          const base64 = await readBase64(f);
          payloads.push({ name: f.name, mime: normalizedMime(f), size: f.size, base64, kind });
        }
        setPending((prev) => [...prev, ...payloads]);
        toast.success(`Đã đính kèm ${payloads.length} file`, { id: toastId });
        // Focus lại textarea để user gõ ghi chú.
        setTimeout(() => ref.current?.focus(), 0);
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

    const items: Array<{ filename: string; kind: ImportKind; parsed: any; file_hash: string | null; uploadId: string | null; error?: string }> = [];
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      const startedAt = Date.now();
      try {
        updateFile(i, { phase: "reading" });
        const base64 = await readBase64(file);
        updateFile(i, { phase: "parsing" });
        const res: any = await parseFn({
          data: { fileBase64: base64, mimeType: normalizedMime(file), filename: file.name, kind },
        });
        updateFile(i, {
          phase: "done",
          parserUsed: res?.parser_used,
          pages: res?.pages,
          ms: Date.now() - startedAt,
        });
        items.push({ filename: file.name, kind, parsed: res?.parsed ?? {}, file_hash: res?.file_hash ?? null, uploadId: res?.uploadId ?? null });
      } catch (e: any) {
        updateFile(i, { phase: "error", error: e?.message || "lỗi", ms: Date.now() - startedAt });
        items.push({ filename: file.name, kind, parsed: null, file_hash: null, uploadId: null, error: e?.message || "lỗi" });
      }
    }
    const ok = items.filter((i) => !i.error);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";

    if (!ok.length) {
      setParsePhase("ready");
      setNextTarget(null);
      return;
    }

    // --- New: Phase 2 — classify & dedupe ---
    setParsedItems(ok.map((o) => ({ filename: o.filename, kind: o.kind, parsed: o.parsed, file_hash: o.file_hash, uploadId: o.uploadId })));
    setParsePhase("classifying");
    try {
      const classifyRes: any = await classifyFn({
        data: {
          items: ok.map((o) => ({
            filename: o.filename,
            file_hash: o.file_hash,
            kind: o.kind,
            parsed: o.parsed,
          })),
        },
      });
      const results: ClassificationResult[] = classifyRes?.results ?? [];
      setClassifications(results);
      // Init decisions from suggested_action & auto-match.
      // Auto-skip files that are exact duplicates (file_hash already imported).
      const init: Record<number, ClassifyDecision> = {};
      results.forEach((r, i) => {
        const isFileDup = r.warnings?.some((w: any) => w.type === "file_duplicate");
        init[i] = {
          action: isFileDup ? "skip" : r.suggested_action,
          bankAccountId: r.bank_account_match?.id ?? null,
          includeOverlapDup: false,
        };
      });
      setDecisions(init);
    } catch (e: any) {
      toast.error(`Không phân loại được: ${e?.message || "lỗi"}`);
      // Skip classify and go straight to ready
      const batchPayload = { kind, items: ok, failed: items.filter((i) => i.error), createdAt: Date.now() };
      (window as any).__lastBatchImport = batchPayload;
      setNextTarget(kind === "bank_statement" ? "/bank/import-statement" : "/import/preview");
      setParsePhase("ready");
    }
  };

  const closeParseDialog = () => {
    setParsePhase(null);
    setParseFiles([]);
    setNextTarget(null);
    setClassifications([]);
    setDecisions({});
    setParsedItems([]);
  };

  // Phase classifying → continue: filter, persist batch, then go to ready
  const continueFromClassify = async () => {
    const kept = parsedItems
      .map((p, i) => ({ p, i, d: decisions[i] }))
      .filter(({ d }) => d?.action !== "skip");

    if (!kept.length) {
      toast.message("Đã bỏ qua tất cả file.");
      closeParseDialog();
      return;
    }

    const kind = kept[0].p.kind;
    // Apply per-row exclusion of overlap dups (bank_statement only)
    const items = kept.map(({ p, i, d }) => {
      const cls = classifications[i];
      let parsed = p.parsed;
      if (kind === "bank_statement" && cls?.txn_overlap && cls.txn_overlap.duplicate_count > 0 && !d?.includeOverlapDup) {
        const dupSet = new Set(cls.txn_overlap.duplicate_indices);
        const txns = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
        parsed = { ...parsed, transactions: txns.filter((_: any, idx: number) => !dupSet.has(idx)) };
      }
      return { filename: p.filename, kind: p.kind, parsed, file_hash: p.file_hash, uploadId: p.uploadId };
    });

    // Preselect bank account if matched
    const bankAccountId = kind === "bank_statement"
      ? (kept.find(({ d }) => d?.bankAccountId)?.d?.bankAccountId ?? null)
      : null;

    const batchPayload = { kind, items, failed: [], createdAt: Date.now(), bankAccountId };
    (window as any).__lastBatchImport = batchPayload;
    if (items.length) (window as any).__lastParsedDoc = { kind, parsed: items[0].parsed };
    try {
      sessionStorage.setItem("lastBatchImport", JSON.stringify(batchPayload));
    } catch {}

    setNextTarget(kind === "bank_statement" ? "/bank/import-statement" : "/import/preview");
    setParsePhase("ready");
  };

  const handleCreateBankAccount = async (idx: number, meta: any) => {
    if (!meta?.account_no) return;
    try {
      const res: any = await resolveBankFn({
        data: {
          account_no: meta.account_no,
          bank_name: meta.bank_name ?? undefined,
          account_holder: meta.account_holder ?? undefined,
          currency: meta.currency ?? undefined,
        },
      });
      toast.success(res.created ? "Đã tạo TK ngân hàng mới" : "Đã liên kết TK có sẵn");
      setClassifications((prev) =>
        prev.map((c, i) =>
          i === idx
            ? {
                ...c,
                bank_account_match: {
                  id: res.id,
                  name: meta.bank_name ? `${meta.bank_name} — ${meta.account_no}` : meta.account_no,
                  account_no: meta.account_no,
                  bank_name: meta.bank_name ?? null,
                },
                warnings: c.warnings.filter((w) => w.type !== "bank_account_unknown"),
              }
            : c,
        ),
      );
      setDecisions((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? { action: "continue" }), bankAccountId: res.id } }));
    } catch (e: any) {
      toast.error(e?.message || "Không tạo được TK");
    }
  };

  const continueToReview = () => {
    const target = nextTarget;
    closeParseDialog();
    if (target) navigate({ to: target });
  };

  const busy = !!loading || uploading;

  // ----- Drag & drop file vào bất kỳ đâu trên trang (uỷ quyền tới Composer) -----
  useEffect(() => {
    if (!enableAttach || !onAttach) return;
    if (typeof window === "undefined") return;

    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types || []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setDragOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) handleUploadBatch(files, "purchase_invoice");
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enableAttach, onAttach, uploading]);


  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*,application/xml,text/xml,.xml"
        multiple
        className="hidden"
        data-kind="purchase_invoice"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          const k = (e.target.dataset.kind as ImportKind) || "purchase_invoice";
          if (files.length) handleUploadBatch(files, k);
        }}
      />
      {dragOver && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/10 backdrop-blur-sm animate-in fade-in duration-150"
          aria-hidden
        >
          <div className="pointer-events-none flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary/60 bg-background/90 px-10 py-8 shadow-2xl shadow-primary/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <UploadCloud className="h-7 w-7" />
            </div>
            <div className="text-center">
              <div className="text-base font-semibold text-foreground">Thả file vào đây</div>
              <div className="mt-1 text-xs text-muted-foreground">
                PDF, ảnh hoặc XML · tối đa 12MB / file
              </div>
            </div>
          </div>
        </div>
      )}
      {parsePhase !== null && (
        <div className="mb-2 rounded-2xl border border-border/60 bg-card/80 p-3 shadow-lg backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <ParseProgressPanel
            inline
            phase={parsePhase}
            files={parseFiles}
            onContinue={parsePhase === "classifying" ? continueFromClassify : continueToReview}
            onClose={closeParseDialog}
            continueLabel={nextTarget === "/bank/import-statement" ? "Mở sao kê ngân hàng" : "Xem lại & chỉnh sửa"}
            classifications={classifications}
            uploadIds={parsedItems.map((p) => p.uploadId)}
            decisions={decisions}
            onDecisionChange={(idx: number, patch: Partial<ClassifyDecision>) =>
              setDecisions((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? { action: "continue" }), ...patch } }))
            }
            onCreateBankAccount={handleCreateBankAccount}
          />
        </div>
      )}
      <div
        className={cn(
          "group relative flex w-full items-end gap-2 rounded-3xl border bg-card/45 px-4 py-2.5 backdrop-blur-xl transition-all duration-200",
          "border-border/60 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]",
          "focus-within:border-primary/50 focus-within:shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--primary)_25%,transparent)] focus-within:ring-1 focus-within:ring-primary/20",
          compact ? "min-h-[48px]" : "min-h-[60px]",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {pending.length > 0 && pending.length < 6 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {pending.map((p, i) => {
                const isImg = p.mime.startsWith("image/");
                return (
                  <div
                    key={`${p.name}-${i}`}
                    className="group/chip relative flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 py-1.5 pl-1.5 pr-7 shadow-sm"
                  >
                    {isImg && previewUrl[i] ? (
                      <img
                        src={previewUrl[i] as string}
                        alt={p.name}
                        className="h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <FileText className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 max-w-[180px]">
                      <div className="truncate text-xs font-medium text-foreground">{p.name}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        {(p.mime.split("/")[1] || "file").toUpperCase()} · {formatSize(p.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePending(i)}
                      aria-label={`Bỏ ${p.name}`}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {pending.length >= 6 && (
            <div className="pt-1">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {pending.length} file đính kèm
                </span>
                <button
                  type="button"
                  onClick={() => setPending([])}
                  className="text-muted-foreground/70 hover:text-destructive"
                >
                  Bỏ tất cả
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
                {pending.slice(0, 9).map((p, i) => {
                  const isImg = p.mime.startsWith("image/");
                  return (
                    <div
                      key={`${p.name}-${i}`}
                      title={p.name}
                      className="group/chip relative aspect-square overflow-hidden rounded-md border border-border/60 bg-background/80"
                    >
                      {isImg && previewUrl[i] ? (
                        <img
                          src={previewUrl[i] as string}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-muted/60 px-1 text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          <span className="w-full truncate text-center text-[9px] leading-none">
                            {(p.mime.split("/")[1] || "file").toUpperCase()}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePending(i)}
                        aria-label={`Bỏ ${p.name}`}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover/chip:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
                {pending.length > 9 && (
                  <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/40 text-[11px] font-semibold text-muted-foreground">
                    +{pending.length - 9}
                  </div>
                )}
              </div>
            </div>
          )}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              recording
                ? "Đang nghe…"
                : pending.length > 0
                  ? "Thêm ghi chú cho file (tuỳ chọn)…"
                  : placeholder
            }
            rows={1}
            className="w-full resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
        </div>


        {enableAttach && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => openPicker("purchase_invoice")}
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
            onClick={doSubmit}
            disabled={!canSubmit()}

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
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Paperclip, Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { Composer } from "@/components/chat/composer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";
import { parseDocument } from "@/lib/ai/parse-document.functions";

type ImportKind = "purchase_invoice" | "bank_statement" | "cash_voucher";

/**
 * Khung chat dock ở footer các trang trong Mode AI.
 * Khi gửi: tạo thread mới + lưu tin nhắn đầu, rồi điều hướng sang
 * /chat/$threadId?autostart=1 để trang chat tự stream phản hồi.
 *
 * Bổ sung:
 * - Mic: Web Speech API (vi-VN), kết thúc tự gửi.
 * - Attach: dropdown 3 loại chứng từ, parse qua server fn rồi điều hướng
 *   tới trang preview tương ứng.
 */
export function ChatDock() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);
  const parseFn = useServerFn(parseDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cmd/Ctrl+J focus + lắng nghe openAskAi(prefill) từ các nơi khác
  useEffect(() => {
    const focusInput = () => {
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        focusInput();
      }
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string }>).detail;
      if (detail?.prefill) setInput(detail.prefill);
      focusInput();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("app:open-ai", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-ai", onOpen as EventListener);
    };
  }, []);

  const submit = async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const thread = await createFn({ data: { title: q.slice(0, 60) } });
      await appendFn({
        data: {
          threadId: thread.id,
          role: "user",
          content: q,
          updateTitleIfBlank: true,
        },
      });
      setInput("");
      navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
        search: { autostart: "1" },
      });
    } catch (e: any) {
      toast.error(e?.message || "Không gửi được");
    } finally {
      setLoading(false);
    }
  };

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
      setInput((finalText + interim).trim());
    };
    r.onerror = (e: any) => {
      toast.error(`Lỗi ghi âm: ${e.error || "unknown"}`);
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      recogRef.current = null;
      if (finalText.trim()) setTimeout(() => submit(finalText.trim()), 100);
    };
    recogRef.current = r;
    setRecording(true);
    r.start();
  };

  const handleUploadBatch = async (files: File[], kind: ImportKind) => {
    if (!files.length || uploading) return;
    const valid = files.filter((f) => {
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
    if (!valid.length) return;
    setUploading(true);
    const toastId = toast.loading(`Đang xử lý ${valid.length} file…`);

    const items: Array<{ filename: string; kind: ImportKind; parsed: any; error?: string }> = [];
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      try {
        toast.loading(`(${i + 1}/${valid.length}) ${file.name}`, { id: toastId });
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const s = String(reader.result || "");
            resolve(s.split(",")[1] || s);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res: any = await parseFn({
          data: { fileBase64: base64, mimeType: file.type, filename: file.name, kind },
        });
        items.push({ filename: file.name, kind, parsed: res?.parsed ?? {} });
      } catch (e: any) {
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
      toast.error(`Không xử lý được file nào (${failed.length} lỗi)`, { id: toastId });
      return;
    }
    toast.success(
      `${ok.length}/${items.length} file đã xử lý — mở trang xem trước`,
      { id: toastId },
    );
    if (kind === "bank_statement") {
      navigate({ to: "/bank/import-statement" });
    } else {
      navigate({ to: "/import/preview" });
    }
  };

  const openPicker = (kind: ImportKind) => {
    if (!fileRef.current) return;
    fileRef.current.dataset.kind = kind;
    fileRef.current.click();
  };

  return (
    <div className="pointer-events-none sticky bottom-0 z-30 px-4 pb-4">
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
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={uploading || loading}
              className="h-11 w-11 shrink-0 rounded-xl border-white/10 bg-background/70 backdrop-blur-xl"
              title="Đính kèm chứng từ"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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

        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          size="icon"
          onClick={toggleVoice}
          disabled={uploading || loading}
          className="h-11 w-11 shrink-0 rounded-xl border-white/10 bg-background/70 backdrop-blur-xl"
          title={recording ? "Dừng ghi âm" : "Nói (Web Speech)"}
        >
          {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>

        <div className="flex-1">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => submit()}
            loading={loading}
            placeholder={
              recording ? "Đang nghe…" : "Hỏi trợ lý AI bất cứ điều gì…"
            }
            compact
          />
        </div>
        <Button
          asChild
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl border-white/10 bg-background/70 backdrop-blur-xl"
          title="Lịch sử hội thoại"
        >
          <Link to="/chat" aria-label="Lịch sử hội thoại">
            <History className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

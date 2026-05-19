import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, User, Command as CommandIcon, Paperclip, Loader2, Mic, MicOff } from "lucide-react";
import { askAccountingStream } from "@/lib/chat.functions";
import { parseDocument } from "@/lib/ai/parse-document.functions";
import { PendingActions } from "@/components/ai/PendingActions";
import { toast } from "sonner";

const QUICK_CHIPS = [
  "Doanh thu hôm nay",
  "Công nợ quá hạn",
  "Tồn kho sắp hết",
  "Báo cáo tháng",
];


type Msg = { role: "user" | "assistant"; content: string };

/**
 * Global AI copilot panel. Opens with Cmd/Ctrl+J anywhere in the app.
 * Sends the current route as pageContext so the AI can answer in context.
 */
export function AskAiSheet() {
  const askFn = useServerFn(askAccountingStream);
  const parseFn = useServerFn(parseDocument);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const location = useLocation();
  const params = useParams({ strict: false }) as Record<string, string | undefined>;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<any>(null);
  const [recording, setRecording] = useState(false);

  // Keyboard shortcut: Cmd/Ctrl + J
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };

    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("app:open-ai", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("app:open-ai", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const pageContext = (() => {
    const path = location.pathname;
    const idParts = Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`);
    return `Route: ${path}${idParts.length ? ` | Params: ${idParts.join(", ")}` : ""}`;
  })();

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput("");
    const history = messages;
    setMessages([...history, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setLoading(true);
    try {
      const stream = await askFn({ data: { question, history, pageContext } });
      for await (const chunk of stream as AsyncIterable<{ delta: string }>) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk.delta,
          };
          return copy;
        });
      }
    } catch (e: any) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `Lỗi: ${e.message}` };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file || uploading) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("File quá lớn (tối đa 12MB)");
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = String(reader.result || "");
          resolve(s.split(",")[1] || s);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      // Choose kind from mime: pdf/image → purchase_invoice by default
      const isImg = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImg && !isPdf) {
        toast.error("Chỉ hỗ trợ PDF hoặc ảnh");
        setUploading(false);
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "user", content: `📎 Đã upload: **${file.name}** — đang trích xuất dữ liệu…` },
        { role: "assistant", content: "" },
      ]);
      const res: any = await parseFn({
        data: { fileBase64: base64, mimeType: file.type, filename: file.name, kind: "purchase_invoice" },
      });
      const parsed = res?.parsed ?? {};
      const summary = [
        `**Đã trích xuất hoá đơn mua:**`,
        parsed.vendor_name ? `• NCC: ${parsed.vendor_name}` : "",
        parsed.invoice_no ? `• Số HĐ: ${parsed.invoice_no}` : "",
        parsed.issue_date ? `• Ngày: ${parsed.issue_date}` : "",
        parsed.total != null ? `• Tổng: ${Number(parsed.total).toLocaleString("vi-VN")} ₫` : "",
        parsed.lines?.length ? `• Số dòng: ${parsed.lines.length}` : "",
        ``,
        `Bạn muốn tôi tạo hoá đơn mua nháp từ dữ liệu này? Trả lời "Có" để tôi đề xuất.`,
      ].filter(Boolean).join("\n");
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: summary };
        return copy;
      });
      // Stash parsed data into next prompt context
      (window as any).__lastParsedDoc = parsed;
    } catch (e: any) {
      toast.error(`Lỗi parse: ${e.message}`);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleVoice = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      if (finalText.trim()) setTimeout(() => send(finalText.trim()), 100);
    };
    recogRef.current = r;
    setRecording(true);
    r.start();
  };

  return (
    <>
      {/* Floating trigger button — visible on every page */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Mở trợ lý AI (Cmd+J)"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 transition-transform hover:scale-110 active:scale-95"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>

        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border bg-card px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Trợ lý AI
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2 text-xs">
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                <CommandIcon className="inline h-3 w-3" />+J
              </span>
              <span>để mở/đóng — đang ở: <code className="text-foreground">{location.pathname}</code></span>
            </SheetDescription>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-auto p-4">
            {messages.length === 0 ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Hỏi bất cứ điều gì về dữ liệu kế toán/ERP. Một vài gợi ý:</p>
                {[
                  "Tóm tắt tình hình tài chính tháng này",
                  "Top 5 khách hàng nợ lâu nhất",
                  "Tồn kho mặt hàng nào sắp hết?",
                  "Doanh thu tuần này so với tuần trước",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary hover:bg-accent/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "assistant" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border"
                      }`}
                    >
                      {m.content ||
                        (loading && i === messages.length - 1 ? (
                          <span className="text-muted-foreground">Đang truy vấn dữ liệu…</span>
                        ) : null)}
                    </div>
                    {m.role === "user" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <User className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <PendingActions />

          <div className="border-t border-border bg-card p-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || loading}
                title="Upload PDF/ảnh hoá đơn"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Input
                ref={inputRef}
                placeholder="Hỏi AI hoặc upload hoá đơn (PDF/ảnh)…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={loading || uploading}
              />
              <Button onClick={() => send()} disabled={loading || uploading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function openAskAi() {
  window.dispatchEvent(new Event("app:open-ai"));
}

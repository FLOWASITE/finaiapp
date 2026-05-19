import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, User, Command as CommandIcon, Paperclip, Loader2, Mic, MicOff } from "lucide-react";
import { askAccountingStream } from "@/lib/chat.functions";
import { parseDocument } from "@/lib/ai/parse-document.functions";
import { PendingActions } from "@/components/ai/PendingActions";
import { ChartBlock, parseChartBlocks } from "@/components/ai/ChartBlock";
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
  type Stage = "queued" | "reading" | "ocr" | "matching" | "done" | "error";
  const [batchProgress, setBatchProgress] = useState<Array<{ filename: string; stage: Stage; note?: string }>>([]);

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

  const summarize = (kind: string, parsed: any, filename: string) => {
    if (kind === "purchase_invoice") {
      return [
        `**${filename}** — Hoá đơn mua`,
        parsed.vendor_name ? `  • NCC: ${parsed.vendor_name}` : "",
        parsed.invoice_no ? `  • Số HĐ: ${parsed.invoice_no}` : "",
        parsed.issue_date ? `  • Ngày: ${parsed.issue_date}` : "",
        parsed.total != null ? `  • Tổng: ${Number(parsed.total).toLocaleString("vi-VN")} ₫` : "",
        parsed.lines?.length ? `  • ${parsed.lines.length} dòng` : "",
      ].filter(Boolean).join("\n");
    }
    if (kind === "bank_statement") {
      const txns = Array.isArray(parsed?.transactions) ? parsed.transactions : [];
      return `**${filename}** — Sao kê${txns.length ? ` (${txns.length} giao dịch)` : ""}${parsed?.account_no ? ` • TK ${parsed.account_no}` : ""}`;
    }
    return `**${filename}** — Phiếu thu/chi${parsed?.amount ? ` • ${Number(parsed.amount).toLocaleString("vi-VN")} ₫` : ""}`;
  };

  const handleUploadBatch = async (
    files: File[],
    kind: "purchase_invoice" | "bank_statement" | "cash_voucher" = "purchase_invoice",
  ) => {
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
    const kindLabel = kind === "bank_statement" ? "sao kê" : kind === "cash_voucher" ? "phiếu thu/chi" : "hoá đơn mua";
    setMessages((m) => [
      ...m,
      { role: "user", content: `📎 Nhập hàng loạt ${valid.length} ${kindLabel}:\n${valid.map((f) => `• ${f.name}`).join("\n")}` },
      { role: "assistant", content: `Đang trích xuất 0/${valid.length}…` },
    ]);

    const items: Array<{ filename: string; kind: string; parsed: any; error?: string }> = [];
    let done = 0;
    for (const file of valid) {
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
        const res: any = await parseFn({
          data: { fileBase64: base64, mimeType: file.type, filename: file.name, kind },
        });
        items.push({ filename: file.name, kind, parsed: res?.parsed ?? {} });
      } catch (e: any) {
        items.push({ filename: file.name, kind, parsed: null, error: e?.message || "lỗi" });
      }
      done++;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `Đang trích xuất ${done}/${valid.length}…` };
        return copy;
      });
    }

    const ok = items.filter((i) => !i.error);
    const failed = items.filter((i) => i.error);
    const lines: string[] = [
      `**Phiên nhập #${Date.now().toString(36).slice(-5).toUpperCase()}** — ${ok.length}/${items.length} file thành công`,
      ``,
      ...ok.map((i) => summarize(i.kind, i.parsed, i.filename)),
    ];
    if (failed.length) {
      lines.push(``, `**Lỗi (${failed.length}):**`, ...failed.map((i) => `• ${i.filename}: ${i.error}`));
    }
    if (kind === "purchase_invoice") {
      const totalSum = ok.reduce((s, i) => s + (Number(i.parsed?.total) || 0), 0);
      lines.push(``, `**Tổng cộng: ${totalSum.toLocaleString("vi-VN")} ₫**`);
      lines.push(``, `Trả lời "tạo tất cả" để tôi tạo hoá đơn nháp cho ${ok.length} file, hoặc "tạo #1, #3" để chọn.`);
    } else if (kind === "bank_statement") {
      const totalTxns = ok.reduce((s, i) => s + (Array.isArray(i.parsed?.transactions) ? i.parsed.transactions.length : 0), 0);
      lines.push(``, `**Tổng giao dịch: ${totalTxns}**`, `Nói "nhập tất cả" để gộp vào sổ đối soát ngân hàng.`);
    } else {
      lines.push(``, `Nói "tạo phiếu tất cả" để tạo phiếu thu/chi nháp.`);
    }

    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { role: "assistant", content: lines.join("\n") };
      return copy;
    });
    (window as any).__lastBatchImport = { kind, items: ok, failed, createdAt: Date.now() };
    if (ok.length) (window as any).__lastParsedDoc = { kind, parsed: ok[0].parsed };
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
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

        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg max-sm:!w-screen max-sm:!max-w-none max-sm:inset-0"
        >
          <SheetHeader className="border-b border-border bg-card px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Trợ lý AI
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline-flex rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                <CommandIcon className="inline h-3 w-3" />+J
              </span>
              <span>đang ở: <code className="text-foreground">{location.pathname}</code></span>
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
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                          : "bg-card border border-border"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        m.content ? (
                          parseChartBlocks(m.content).map((part, idx) =>
                            part.type === "chart" ? (
                              <ChartBlock key={idx} spec={part.spec} />
                            ) : (
                              <div key={idx} className="whitespace-pre-wrap">{part.value}</div>
                            )
                          )
                        ) : loading && i === messages.length - 1 ? (
                          <span className="text-muted-foreground">Đang truy vấn dữ liệu…</span>
                        ) : null
                      ) : (
                        m.content
                      )}
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

          <div className="border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {/* Quick chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
              {QUICK_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={loading || uploading}
                  className="shrink-0 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs hover:bg-accent hover:border-primary disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              data-kind="purchase_invoice"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const k = (e.target.dataset.kind as any) || "purchase_invoice";
                if (files.length) handleUploadBatch(files, k);
              }}
            />
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" disabled={uploading || loading} title="Upload chứng từ">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.dataset.kind = "purchase_invoice"; fileRef.current.click(); } }}>
                    Hoá đơn mua (PDF/ảnh)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.dataset.kind = "bank_statement"; fileRef.current.click(); } }}>
                    Sao kê ngân hàng
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { if (fileRef.current) { fileRef.current.dataset.kind = "cash_voucher"; fileRef.current.click(); } }}>
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
                title={recording ? "Dừng ghi âm" : "Nói (Web Speech)"}
              >
                {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Input
                ref={inputRef}
                placeholder={recording ? "Đang nghe…" : "Hỏi AI hoặc upload hoá đơn…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={loading || uploading}
                className="h-11 text-base sm:h-10 sm:text-sm"
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

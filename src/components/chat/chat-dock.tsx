import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Composer } from "@/components/chat/composer";
import { createThread, appendMessage } from "@/lib/chat-threads.functions";

/**
 * Khung chat dock ở footer các trang trong Mode AI.
 * Khi gửi: tạo thread mới + lưu tin nhắn đầu, rồi điều hướng sang
 * /chat/$threadId?autostart=1 để trang chat tự stream phản hồi.
 */
export function ChatDock() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const createFn = useServerFn(createThread);
  const appendFn = useServerFn(appendMessage);

  const submit = async () => {
    const q = input.trim();
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

  return (
    <div className="pointer-events-none sticky bottom-0 z-30 px-4 pb-4">
      <div className="pointer-events-auto mx-auto max-w-3xl">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          loading={loading}
          placeholder="Hỏi trợ lý AI bất cứ điều gì…"
          compact
        />
      </div>
    </div>
  );
}

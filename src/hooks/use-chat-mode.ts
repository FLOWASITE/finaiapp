import { useEffect, useState } from "react";

export type ChatMode = "accounting" | "ai";

const KEY = "fin:chat-mode";
const EVENT = "fin-chat-mode-change";

function read(): ChatMode {
  if (typeof window === "undefined") return "accounting";
  try {
    return (localStorage.getItem(KEY) as ChatMode) === "ai" ? "ai" : "accounting";
  } catch {
    return "accounting";
  }
}

export function useChatMode(): [ChatMode, (m: ChatMode) => void] {
  const [mode, setModeState] = useState<ChatMode>(read);

  useEffect(() => {
    const sync = () => setModeState(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setMode = (m: ChatMode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {}
    setModeState(m);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENT));
    }
  };

  return [mode, setMode];
}

export function getChatMode(): ChatMode {
  return read();
}

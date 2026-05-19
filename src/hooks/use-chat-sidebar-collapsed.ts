import { useEffect, useState } from "react";

const KEY = "chat:sidebar-collapsed";
const EVENT = "chat-sidebar-toggle";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useChatSidebarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    setCollapsed(read());
    const sync = () => setCollapsed(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return collapsed;
}

export function emitChatSidebarToggle() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

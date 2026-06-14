import { useSyncExternalStore } from "react";

export type ChatMode = "accounting" | "ai";

const KEY = "fin:chat-mode";
const EVENT = "fin-chat-mode-change";
const DEFAULT: ChatMode = "accounting";

function readFromStorage(): ChatMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return (localStorage.getItem(KEY) as ChatMode) === "ai" ? "ai" : "accounting";
  } catch {
    return DEFAULT;
  }
}

// Module-level cache so getSnapshot returns a stable reference between calls
// (required by useSyncExternalStore to avoid infinite re-renders).
let cached: ChatMode = DEFAULT;
let initialized = false;

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  cached = readFromStorage();
  initialized = true;
}

function subscribe(onChange: () => void): () => void {
  const sync = () => {
    const next = readFromStorage();
    if (next !== cached) {
      cached = next;
    }
    onChange();
  };
  window.addEventListener(EVENT, sync);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(EVENT, sync);
    window.removeEventListener("storage", sync);
  };
}

function getSnapshot(): ChatMode {
  ensureInit();
  return cached;
}

function getServerSnapshot(): ChatMode {
  return DEFAULT;
}

function setModeGlobal(m: ChatMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {}
  cached = m;
  initialized = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

export function useChatMode(): [ChatMode, (m: ChatMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [mode, setModeGlobal];
}

export function getChatMode(): ChatMode {
  ensureInit();
  return cached;
}

import { useEffect, useState } from "react";

const KEY = "inbox:ai-dock-hidden";
const EVENT = "inbox-ai-dock-toggle";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useInboxDockHidden() {
  const [hidden, setHidden] = useState<boolean>(false);

  useEffect(() => {
    setHidden(read());
    const sync = () => setHidden(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = () => {
    const next = !read();
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENT));
    }
    setHidden(next);
  };

  return { hidden, toggle };
}

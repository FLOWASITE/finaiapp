import { createContext, useContext } from "react";

export type ChatLayoutCtx = {
  /** Mở Sheet danh sách hội thoại trên mobile, hoặc toggle sidebar trên desktop. */
  onMenu: () => void;
};

export const ChatLayoutContext = createContext<ChatLayoutCtx | null>(null);

export function useChatLayout(): ChatLayoutCtx {
  return (
    useContext(ChatLayoutContext) ?? {
      onMenu: () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("chat-sidebar-toggle"));
        }
      },
    }
  );
}

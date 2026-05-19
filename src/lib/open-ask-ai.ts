/**
 * Mở ChatDock với prefill (tương thích ngược với API openAskAi cũ).
 * ChatDock lắng nghe event "app:open-ai" để focus ô nhập + điền prefill.
 */
export function openAskAi(prefill?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app:open-ai", { detail: prefill ? { prefill } : undefined }),
  );
}

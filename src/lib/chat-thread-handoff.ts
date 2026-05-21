/**
 * Tracks in-flight background thread creation when ChatDock navigates
 * optimistically before the server has actually inserted the thread row.
 * The thread page awaits this before persisting assistant messages so
 * appendMessage doesn't 404 on a not-yet-created thread.
 */
const STORE = "__chatThreadCreationPromises";

type Store = Map<string, Promise<void>>;

function getStore(): Store | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!(w[STORE] instanceof Map)) w[STORE] = new Map<string, Promise<void>>();
  return w[STORE] as Store;
}

export function registerThreadCreation(threadId: string, promise: Promise<unknown>) {
  const store = getStore();
  if (!store) return;
  const p = promise.then(
    () => {
      store.delete(threadId);
    },
    () => {
      // Keep the rejection visible so awaiters can react, but also clear it.
      store.delete(threadId);
    },
  );
  store.set(threadId, p);
}

/** Resolves immediately if no pending creation; otherwise waits for it. */
export async function awaitThreadCreation(threadId: string): Promise<void> {
  const store = getStore();
  const p = store?.get(threadId);
  if (p) {
    try {
      await p;
    } catch {
      // Swallow — caller will hit the server error on its own request.
    }
  }
}

export function isThreadPending(threadId: string): boolean {
  return !!getStore()?.has(threadId);
}

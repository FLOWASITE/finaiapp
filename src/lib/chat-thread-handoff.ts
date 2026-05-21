/**
 * Tracks in-flight background thread creation when ChatDock navigates
 * optimistically before the server has actually inserted the thread row.
 * The thread page awaits this before persisting assistant messages so
 * appendMessage doesn't 404 on a not-yet-created thread.
 *
 * Also remembers the LAST result of each creation (ok/error) for a short
 * window so the thread page can render a meaningful retry UI when the
 * background insert failed instead of crashing with "Không tìm thấy
 * cuộc trò chuyện".
 */
const PROMISE_STORE = "__chatThreadCreationPromises";
const RESULT_STORE = "__chatThreadCreationResults";
const RETRY_STORE = "__chatThreadCreationRetries";

type PromiseStore = Map<string, Promise<void>>;
type CreationResult = { ok: true } | { ok: false; error: Error };
type ResultStore = Map<string, CreationResult>;
type RetryStore = Map<string, () => Promise<void>>;

function getPromiseStore(): PromiseStore | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!(w[PROMISE_STORE] instanceof Map)) w[PROMISE_STORE] = new Map();
  return w[PROMISE_STORE] as PromiseStore;
}

function getResultStore(): ResultStore | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!(w[RESULT_STORE] instanceof Map)) w[RESULT_STORE] = new Map();
  return w[RESULT_STORE] as ResultStore;
}

function getRetryStore(): RetryStore | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!(w[RETRY_STORE] instanceof Map)) w[RETRY_STORE] = new Map();
  return w[RETRY_STORE] as RetryStore;
}

/** Register a creation attempt. Optionally pass a `retry` factory that
 *  re-runs the same insert (with same threadId + payload) — used by the
 *  thread page to show a "Thử lại" button when creation fails. */
export function registerThreadCreation(
  threadId: string,
  promise: Promise<unknown>,
  retry?: () => Promise<void>,
) {
  const promises = getPromiseStore();
  const results = getResultStore();
  const retries = getRetryStore();
  if (!promises || !results) return;
  // A new attempt clears any previous error for this threadId.
  results.delete(threadId);
  if (retries && retry) retries.set(threadId, retry);
  const p = promise.then(
    () => {
      promises.delete(threadId);
      results.set(threadId, { ok: true });
    },
    (error: unknown) => {
      promises.delete(threadId);
      results.set(threadId, {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    },
  );
  promises.set(threadId, p);
}

/** Resolves immediately if no pending creation; otherwise waits for it.
 *  Never throws — inspect the result via getThreadCreationResult. */
export async function awaitThreadCreation(threadId: string): Promise<void> {
  const p = getPromiseStore()?.get(threadId);
  if (p) {
    try {
      await p;
    } catch {
      // Swallow — caller inspects getThreadCreationResult.
    }
  }
}

export function getThreadCreationResult(threadId: string): CreationResult | null {
  return getResultStore()?.get(threadId) ?? null;
}

export function getThreadCreationRetry(threadId: string): (() => Promise<void>) | null {
  return getRetryStore()?.get(threadId) ?? null;
}

export function clearThreadCreationResult(threadId: string) {
  getResultStore()?.delete(threadId);
  getRetryStore()?.delete(threadId);
}

export function isThreadPending(threadId: string): boolean {
  return !!getPromiseStore()?.has(threadId);
}

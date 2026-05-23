/**
 * Race a promise against a timeout. Resolves to `fallback` if the promise
 * does not settle within `ms`. Dùng để tránh việc Supabase auth refresh
 * hỏng làm treo UI login.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, ms);
    promise.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Race a promise against a timeout. Rejects với Error("timeout") nếu quá hạn.
 */
export function withTimeoutReject<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function removeAuthKeys(storage: Storage | undefined) {
  if (!storage) return;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const explicitKeys = [
    projectId ? `sb-${projectId}-auth-token` : undefined,
    "supabase.auth.token",
  ].filter(Boolean) as string[];

  const keys = new Set<string>(explicitKeys);
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (
      key.startsWith("supabase.auth.") ||
      key.includes("supabase.auth.token") ||
      (key.startsWith("sb-") && key.endsWith("-auth-token"))
    ) {
      keys.add(key);
    }
  }

  keys.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // Bỏ qua storage bị khóa/quota lỗi; login vẫn tiếp tục với các key còn lại.
    }
  });
}

/**
 * Dọn session auth hỏng ở trình duyệt mà không gọi network.
 * Dùng khi refresh token cũ làm mọi request auth trả về "Failed to fetch".
 */
export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  removeAuthKeys(window.localStorage);
  removeAuthKeys(window.sessionStorage);
}

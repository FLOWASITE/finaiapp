const STORE_NAME = "__chatAttachmentHandoffs";

type HandoffStore = Map<string, any[]>;

function getStore(): HandoffStore | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (!(w[STORE_NAME] instanceof Map)) {
    w[STORE_NAME] = new Map<string, any[]>();
  }
  return w[STORE_NAME] as HandoffStore;
}

function tryReadStorage(key: string): any[] | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function tryRemoveStorage(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

export function stashChatAttachments(
  handoffId: string,
  payloads: any[],
  storageKey = `__attach:h:${handoffId}`,
) {
  getStore()?.set(handoffId, payloads);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(payloads));
  } catch {
    // File base64 can exceed browser storage quota; memory store remains primary.
  }
}

export function takeChatAttachments(
  handoffId?: string | null,
  storageKeys: string[] = [],
): any[] | undefined {
  const candidates = [
    ...(handoffId ? [`__attach:h:${handoffId}`] : []),
    ...storageKeys,
  ];
  if (handoffId) {
    const store = getStore();
    const value = store?.get(handoffId);
    if (value?.length) {
      store?.delete(handoffId);
      candidates.forEach(tryRemoveStorage);
      return value;
    }
  }
  for (const key of candidates) {
    const value = tryReadStorage(key);
    if (value?.length) {
      tryRemoveStorage(key);
      return value;
    }
  }
  return undefined;
}

export function takeAnyChatAttachmentHandoff(): any[] | undefined {
  const store = getStore();
  if (store?.size) {
    const first = store.entries().next().value as [string, any[]] | undefined;
    if (first?.[1]?.length) {
      store.delete(first[0]);
      tryRemoveStorage(`__attach:h:${first[0]}`);
      return first[1];
    }
  }
  try {
    const handoffKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("__attach:h:")) handoffKeys.push(key);
    }
    if (handoffKeys.length === 1) {
      const value = tryReadStorage(handoffKeys[0]);
      if (value?.length) {
        tryRemoveStorage(handoffKeys[0]);
        return value;
      }
    }
  } catch {}
  return undefined;
}
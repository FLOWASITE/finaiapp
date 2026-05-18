const NOISE_FIELDS = new Set(["updated_at", "created_at"]);

export type DiffEntry = {
  key: string;
  before: unknown;
  after: unknown;
  kind: "added" | "removed" | "changed";
};

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function diffJsonb(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): DiffEntry[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: DiffEntry[] = [];
  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;
    const hasB = key in b;
    const hasA = key in a;
    if (hasB && hasA) {
      if (!eq(b[key], a[key])) out.push({ key, before: b[key], after: a[key], kind: "changed" });
    } else if (hasA) {
      out.push({ key, before: undefined, after: a[key], kind: "added" });
    } else {
      out.push({ key, before: b[key], after: undefined, kind: "removed" });
    }
  }
  return out.sort((x, y) => x.key.localeCompare(y.key));
}

export function formatDiffValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

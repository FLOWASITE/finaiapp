// Client + server safe text normalization for vendor item names.

export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeName(s).split(/\s+/).filter(Boolean);
}

// Jaccard similarity over token sets — cheap, robust to word order.
export function jaccard(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Levenshtein ratio (normalized 0..1) on normalized strings.
export function levRatio(a: string, b: string): number {
  const A = normalizeName(a);
  const B = normalizeName(b);
  if (!A && !B) return 1;
  if (!A || !B) return 0;
  const m = A.length;
  const n = B.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = A[i - 1] === B[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  const dist = dp[n];
  const max = Math.max(m, n);
  return 1 - dist / max;
}

// Combined text similarity = max(jaccard, lev) — picks whichever fits.
export function textSim(a: string, b: string): number {
  return Math.max(jaccard(a, b), levRatio(a, b));
}

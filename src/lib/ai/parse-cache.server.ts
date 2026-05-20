/**
 * SHA-256 + Supabase-backed cache for parsed documents.
 * Keyed by (file_hash, kind). Best-effort: errors are swallowed.
 */

export async function hashBase64(fileBase64: string): Promise<string> {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readParseCache(
  supabase: any,
  hash: string,
  kind: string,
): Promise<{ parsed: any; parser_used: string | null; pages: number | null } | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("ai_parse_cache")
      .select("id, parsed, parser_used, pages")
      .eq("file_hash", hash)
      .eq("kind", kind)
      .maybeSingle();
    if (!data) return null;
    // bump hit counter (best-effort, fire-and-forget)
    supabase
      .from("ai_parse_cache")
      .update({ hit_count: (data as any).hit_count != null ? undefined : undefined, last_hit_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {})
      .catch(() => {});
    return { parsed: data.parsed, parser_used: data.parser_used ?? null, pages: data.pages ?? null };
  } catch {
    return null;
  }
}

export async function writeParseCache(
  supabase: any,
  hash: string,
  kind: string,
  parsed: any,
  parser_used: string | null,
  pages: number | null,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from("ai_parse_cache")
      .upsert(
        { file_hash: hash, kind, parsed, parser_used, pages },
        { onConflict: "file_hash,kind" },
      );
  } catch {
    // best-effort
  }
}

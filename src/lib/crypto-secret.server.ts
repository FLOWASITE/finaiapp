/**
 * AES-GCM encrypt/decrypt cho secrets lưu trong DB.
 * Dùng chung khoá EINVOICE_ENC_KEY (đã có trong project).
 *
 * Token format: `${ivBase64}:${ctBase64}`
 */

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.EINVOICE_ENC_KEY;
  if (!raw) throw new Error("Thiếu EINVOICE_ENC_KEY trên server");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain),
  );
  return `${b64encode(iv)}:${b64encode(ct)}`;
}

export async function decryptSecret(token: string): Promise<string> {
  const [ivB64, ctB64] = token.split(":");
  if (!ivB64 || !ctB64) throw new Error("Định dạng secret không hợp lệ");
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(ctB64) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

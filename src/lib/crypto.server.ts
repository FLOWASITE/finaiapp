import { createCipheriv, createDecipheriv, createHash, randomBytes, createHmac, timingSafeEqual } from "crypto";

/**
 * AES-256-GCM encrypt/decrypt for storing sensitive secrets (e.g. MB Bank passwords).
 * Key is derived from EINVOICE_ENC_KEY via SHA-256.
 */
function getKey(): Buffer {
  const raw = process.env.EINVOICE_ENC_KEY;
  if (!raw) throw new Error("EINVOICE_ENC_KEY chưa được cấu hình");
  return createHash("sha256").update(raw).digest();
}

export function encryptAesGcm(plain: string): { cipher: string; iv: string } {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store ct + tag together (base64), iv separately
  return {
    cipher: Buffer.concat([ct, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptAesGcm(cipherB64: string, ivB64: string): string {
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const buf = Buffer.from(cipherB64, "base64");
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * HMAC-SHA256 over `${timestamp}.${body}` for webhook auth.
 * Header format: `t=<unix>,v1=<hex>`
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  maxAgeSec = 300,
): { ok: true } | { ok: false; reason: string } {
  if (!signatureHeader) return { ok: false, reason: "missing signature" };
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: "bad signature format" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > maxAgeSec) return { ok: false, reason: "stale signature" };
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

export function signHmac(rawBody: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

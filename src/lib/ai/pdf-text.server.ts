/**
 * Server-only PDF text-layer extraction via `unpdf`.
 * Worker-safe (pure JS). Returns the concatenated text plus a heuristic
 * estimate of whether the PDF has a usable text layer.
 */
import { extractText, getDocumentProxy } from "unpdf";

export type PdfTextResult = {
  text: string;
  pages: number;
  /** Heuristic: text layer is "rich" enough that we can skip OCR/LlamaParse. */
  rich: boolean;
};

export async function extractPdfText(fileBase64: string): Promise<PdfTextResult> {
  const buf = Buffer.from(fileBase64, "base64");
  // unpdf accepts Uint8Array
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const pdf = await getDocumentProxy(u8);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text || "";

  // Heuristic: rich if avg chars/page >= 200 AND ratio of digit-rich lines is high enough
  // (sao kê / hoá đơn luôn có nhiều số). Falls back to LlamaParse otherwise.
  const trimmed = merged.trim();
  const avgPerPage = totalPages > 0 ? trimmed.length / totalPages : 0;
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const numericLines = lines.filter((l) => (l.match(/\d/g) || []).length >= 3).length;
  const numericRatio = lines.length > 0 ? numericLines / lines.length : 0;

  const rich = avgPerPage >= 200 && (numericRatio >= 0.2 || trimmed.length >= 4000);

  return { text: merged, pages: totalPages, rich };
}

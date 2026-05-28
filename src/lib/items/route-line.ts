/**
 * Phân luồng line item: dịch vụ rõ bản chất (typeA) vs chưa rõ (unknown).
 *
 * Hoá đơn vận chuyển/điện/nước/internet/thuê/bảo hiểm KHÔNG nên bị đẩy vào
 * luồng "chọn mục đích chi" (Loại B). File này là nguồn sự thật để chặn ở
 * server trước khi tính floating match.
 *
 * Client + server safe. Không phụ thuộc DB.
 */
import { normalizeName } from "./normalize";

/**
 * Các phrase mô tả dịch vụ rõ bản chất. Tất cả lưu ở dạng ĐÃ normalize
 * (lowercase, không dấu, đ→d) để khớp với `normalizeName(hay)`.
 *
 * Khi thêm phrase mới, viết ở dạng đã normalize sẵn (không dấu).
 */
export const CLEAR_SERVICE_PATTERNS: string[] = [
  // Vận tải / logistics
  "van chuyen",
  "van tai",
  "cuoc van chuyen",
  "cuoc van tai",
  "logistics",
  "giao hang",
  "ship",
  // Tiện ích
  "tien dien",
  "hoa don dien",
  "dien nang",
  "tien nuoc sach",
  "nuoc sach",
  "hoa don nuoc",
  "internet",
  "cap quang",
  "vien thong",
  "duong truyen",
  // Thuê
  "thue mat bang",
  "thue nha",
  "thue van phong",
  "thue kho",
  "thue xe",
  // Tài chính
  "phi ngan hang",
  "lai vay",
  // Đi lại
  "grab",
  "taxi",
  "gojek",
  // Bảo hiểm, lệ phí nhà nước
  "bao hiem",
  "le phi",
  "phi nha nuoc",
];

/** Whitelist token ngắn được phép match dù ≤3 ký tự. */
export const SHORT_TOKEN_WHITELIST = new Set(["bia", "ruou"]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Kiểm tra haystack (đã normalize) chứa phrase (chưa normalize) với
 * word-boundary `\b...\b` — tránh substring nhặt nhầm (vd "nuoc" trong
 * "nuocngot" sẽ không match, nhưng nuôi nguyên cụm "nuoc ngot" thì match).
 */
export function containsPhrase(haystackNorm: string, phrase: string): boolean {
  const p = normalizeName(phrase);
  if (!p) return false;
  // Token ngắn (≤2 ký tự) bỏ qua hoàn toàn để tránh false positive.
  if (p.length < 2) return false;
  if (p.length <= 3 && !SHORT_TOKEN_WHITELIST.has(p)) return false;
  const re = new RegExp(`\\b${escapeRegex(p)}\\b`, "u");
  return re.test(haystackNorm);
}

export type RouteResult = {
  route: "typeA" | "unknown";
  matched?: string;
  reason?: string;
};

/**
 * Phân luồng dựa trên mô tả + tên các line. Nếu khớp 1 phrase rõ bản chất →
 * typeA (không hỏi mục đích chi). Ngược lại → unknown (để bước sau xử lý).
 */
export function classifyRoute(input: {
  description?: string | null;
  itemNames?: Array<string | null | undefined>;
}): RouteResult {
  const parts: string[] = [];
  if (input.description) parts.push(String(input.description));
  for (const n of input.itemNames ?? []) {
    if (n) parts.push(String(n));
  }
  const hay = normalizeName(parts.join(" "));
  if (!hay) return { route: "unknown" };
  for (const pat of CLEAR_SERVICE_PATTERNS) {
    if (containsPhrase(hay, pat)) {
      return {
        route: "typeA",
        matched: pat,
        reason: `Dịch vụ rõ bản chất: ${pat}`,
      };
    }
  }
  return { route: "unknown" };
}

// Tách tên mặt hàng dài thành canonical_name (ổn định, để match) + line_note (metadata chuyến/kỳ).
//
// Áp dụng trước khi fuzzy match với product catalog, để cùng 1 dịch vụ (vd "Cước vận chuyển")
// luôn được cache rule, không bị mỗi chuyến mỗi tên khác làm hỏng matcher.

export type SplitItemNameResult = {
  raw_name: string;
  canonical_name: string;
  line_note: string;        // các phần metadata, nối bằng ' · '
  note_parts: string[];     // phần đã trích, theo thứ tự xuất hiện
};

// Quy cách SP — KHÔNG tách (vd "thùng 24", "hộp 12"): giữ trong canonical_name.
const SPEC_IN_PAREN = /^\s*(thung|hop|set|combo|pack|goi|chai|lon|bich|tui|cay|cuon|cuoc|kg|g|ml|l)\b/i;

// Helper: xoá dấu để test (đơn giản — đủ cho whitelist).
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d");
}

// Pattern phải sắp theo độ ưu tiên: dài/cụ thể trước, ngắn/chung sau.
// Mỗi pattern khi match sẽ:
//   - đẩy match[0] vào note_parts (giữ nguyên text gốc)
//   - thay thế bằng " " trong working string
type RuleFn = (s: string, push: (note: string) => void) => string;

const RULES: RuleFn[] = [
  // 1) "biển số xe <PLATE>" — bắt cả cụm filler + plate (đặt TRƯỚC rule plate trần)
  (s, push) =>
    s.replace(
      /\b(?:biển\s*số\s*xe?|biển\s*số|bks?|biển\s*kiểm\s*soát)\s*[:#-]?\s*([0-9]{2}\s*[A-Za-zĐ]{1,2}\s*[-–]?\s*\d{3,5}(?:[.,]\d{1,3})?)\b/giu,
      (_m, plate: string) => { push(plate.trim()); return " "; },
    ),

  // 2) Biển số xe trần (không có "biển số xe" đứng trước)
  (s, push) =>
    s.replace(/\b(\d{2}\s*[A-Za-zĐ]{1,2}\s*[-–]?\s*\d{3,5}(?:[.,]\d{1,3})?)\b/g, (m) => {
      push(m.trim()); return " ";
    }),

  // 3) Khoảng NGÀY: "từ 01/01 đến 31/01"
  (s, push) =>
    s.replace(
      /\btừ\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*(?:đến|tới|-|–)\s*\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // 4) Tuyến mô tả dài: "từ <địa danh> đến <địa danh>" — bắt tới dấu phẩy / hết chuỗi.
  //    Đặt SAU rule "từ ngày đến ngày" để không nuốt khoảng ngày.
  (s, push) =>
    s.replace(
      /\btừ\s+([^,.;]{2,80}?)\s+(?:đến|tới)\s+([^,.;]{2,80}?)(?=[,.;]|$)/giu,
      (m) => { push(m.replace(/\s+/g, " ").trim()); return " "; },
    ),

  // 5) Ngày đơn lẻ
  (s, push) =>
    s.replace(
      /\b(?:ngày\s*)?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // 6) Kỳ tháng
  (s, push) =>
    s.replace(
      /\b(?:kỳ\s*)?tháng\s*\d{1,2}(?:[/-]\d{2,4})?\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),
  (s, push) =>
    s.replace(/\bkỳ\s*\d{1,2}(?:[/-]\d{2,4})?\b/giu, (m) => { push(m.trim()); return " "; }),

  // 7) Tuyến mã địa danh viết hoa: "HCM-HN", "HN → ĐN"
  (s, push) =>
    s.replace(
      /\b([A-ZĐ]{2,4})\s*(?:-|–|→|đến|tới)\s*([A-ZĐ]{2,4})\b/gu,
      (m) => { push(m.trim()); return " "; },
    ),

  // 8) Số HĐ/lệnh: bắt buộc CÓ ký số phía sau để không nuốt "số xe ABC"
  (s, push) =>
    s.replace(/\b(?:số|so)\s*[:#]?\s*[A-Za-z]*\d[A-Za-z0-9-]*\b/giu, (m) => {
      push(m.trim()); return " ";
    }),
  (s, push) =>
    s.replace(/\b(?:s\/?n|sn|imei)\s*[:#]?\s*[A-Za-z0-9-]{2,}\b/giu, (m) => {
      push(m.trim()); return " ";
    }),
  (s, push) =>
    s.replace(/\b(?:LĐX|BL|BK|PO|DO)\s*[:#-]?\s*[A-Za-z0-9-]{2,}\b/giu, (m) => {
      push(m.trim()); return " ";
    }),

  // 9) Cụm trong ngoặc (loại trừ quy cách SP)
  (s, push) =>
    s.replace(/[(\[]\s*([^)\]]{2,})\s*[)\]]/gu, (m, inner: string) => {
      if (SPEC_IN_PAREN.test(stripDiacritics(inner))) return m;
      push(`(${inner.trim()})`);
      return " ";
    }),
];

// Từ nối thừa cần dọn ở cuối canonical: "Cước vận chuyển ngày" → "Cước vận chuyển".
const TRAILING_FILLER = /\b(ngày|ngay|số|so|xe|tuyến|tuyen|từ|tu|đến|den|tới|toi|kỳ|ky|tháng|thang|cho|của|cua)\b/giu;

export function splitItemName(raw: string | null | undefined): SplitItemNameResult {
  const original = (raw ?? "").toString();
  const note_parts: string[] = [];
  const push = (n: string) => {
    if (!n) return;
    // Loại trùng (so sánh lowercase)
    const key = n.toLowerCase();
    if (note_parts.some((p) => p.toLowerCase() === key)) return;
    note_parts.push(n);
  };

  let work = original;
  for (const rule of RULES) work = rule(work, push);

  // Dọn từ nối thừa LẶP cho tới khi không còn (vd "ngày Số" sau khi bóc ngày + số)
  let prev = "";
  let canonical = work;
  while (prev !== canonical) {
    prev = canonical;
    canonical = canonical
      .replace(/\s+/g, " ")
      .replace(/(?:^|\s)(?:[-–·,.;:])+(?=\s|$)/g, " ")
      .trim();
    // Dọn filler ở 2 đầu (không động vào giữa, vì giữa có thể vẫn cần)
    const tokens = canonical.split(/\s+/);
    while (tokens.length && TRAILING_FILLER.test(tokens[tokens.length - 1])) tokens.pop();
    while (tokens.length && TRAILING_FILLER.test(tokens[0])) tokens.shift();
    // reset lastIndex cho regex /g
    TRAILING_FILLER.lastIndex = 0;
    canonical = tokens.join(" ").trim();
  }

  // An toàn: nếu canonical bị rút quá ngắn → giữ nguyên raw
  if (canonical.length < 3) {
    return {
      raw_name: original,
      canonical_name: original.trim(),
      line_note: "",
      note_parts: [],
    };
  }

  return {
    raw_name: original,
    canonical_name: canonical,
    line_note: note_parts.join(" · "),
    note_parts,
  };
}

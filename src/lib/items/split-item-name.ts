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
const SPEC_IN_PAREN = /^\s*(thung|hop|set|combo|pack|goi|chai|lon|bich|tui|cay|cuon|cuoc|kg|g|ml|l|vi|khay|block|ream|kien|xap|tep|bo|cap|doi)\b/i;

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
  // ===== A. Định danh có prefix (đặt SỚM, trước rule plate/date) =====

  // A1) "biển số xe <PLATE>" — bắt cả filler + plate
  (s, push) =>
    s.replace(
      /\b(?:biển\s*số\s*xe?|biển\s*số|bks?|biển\s*kiểm\s*soát)\s*[:#-]?\s*([0-9]{2}\s*[A-Za-zĐ]{1,2}\s*[-–]?\s*\d{3,5}(?:[.,]\d{1,3})?)\b/giu,
      (_m, plate: string) => { push(plate.trim()); return " "; },
    ),

  // A2) Công tơ / đồng hồ điện-nước
  (s, push) =>
    s.replace(
      /\b(?:công\s*tơ|đồng\s*hồ|đh)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{1,}\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // A3) Mã KH / CT / MKH có giá trị mã định danh
  (s, push) =>
    s.replace(
      /\b(?:MKH|MaKH|KH|CT)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{2,}\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // A4) MSNV / MNV / NV (lương)
  (s, push) =>
    s.replace(
      /\b(?:MSNV|MNV)\s*[:#-]?\s*[A-Z0-9-]{2,}\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // A5) Trạm BOT — "trạm + Tên Riêng Hoa"
  (s, push) =>
    s.replace(
      /\btrạm\s+[A-ZĐ][\p{L}]{1,20}(?:\s+[A-ZĐ][\p{L}]{1,20}){0,2}\b/gu,
      (m) => { push(m.trim()); return " "; },
    ),

  // A6) Trụ bơm xăng
  (s, push) =>
    s.replace(/\btrụ\s*\d+\b/giu, (m) => { push(m.trim()); return " "; }),

  // A7) Ghế / toa / khoang
  (s, push) =>
    s.replace(/\b(?:ghế|toa|khoang)\s*\d+\b/giu, (m) => { push(m.trim()); return " "; }),

  // A8) Tầng / phòng / căn / lô / block (kèm mã — bắt buộc CÓ ký số để không nuốt "phòng tháng")
  (s, push) =>
    s.replace(
      /\b(?:tầng|phòng|căn|lô|block)\s*[A-Z]?\d[A-Z0-9-]{0,5}\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // A9) Gói cước viễn thông: "gói F8", "gói M120"
  (s, push) =>
    s.replace(/\bgói\s+[A-Z]\d+\b/giu, (m) => { push(m.trim()); return " "; }),

  // A10) Chu kỳ N tháng/năm (đăng kiểm, bảo hiểm)
  (s, push) =>
    s.replace(/\bchu\s*kỳ\s*\d+\s*(?:tháng|năm)\b/giu, (m) => { push(m.trim()); return " "; }),

  // ===== B. Biển số / số điện thoại trần =====

  // B1) Biển số xe trần
  (s, push) =>
    s.replace(/\b(\d{2}\s*[A-Za-zĐ]{1,2}\s*[-–]?\s*\d{3,5}(?:[.,]\d{1,3})?)\b/g, (m) => {
      push(m.trim()); return " ";
    }),

  // B2) Số điện thoại VN
  (s, push) =>
    s.replace(/\b0\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g, (m) => { push(m.trim()); return " "; }),

  // ===== C. Thời gian =====

  // C1) Khoảng NGÀY: "từ 01/01 đến 31/01" hoặc "01/04/2026 - 31/03/2027"
  (s, push) =>
    s.replace(
      /\btừ\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*(?:đến|tới|-|–)\s*\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?/giu,
      (m) => { push(m.trim()); return " "; },
    ),
  (s, push) =>
    s.replace(
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*[-–]\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
      (m) => { push(m.trim()); return " "; },
    ),

  // C2) Tuyến mô tả dài: "từ <địa danh> đến <địa danh>"
  (s, push) =>
    s.replace(
      /\btừ\s+([^,.;]{2,80}?)\s+(?:đến|tới)\s+([^,.;]{2,80}?)(?=[,.;]|$)/giu,
      (m) => { push(m.replace(/\s+/g, " ").trim()); return " "; },
    ),

  // C3) Ngày đơn lẻ
  (s, push) =>
    s.replace(
      /\b(?:ngày\s*)?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // C4) Quý
  (s, push) =>
    s.replace(
      /\bquý\s*(?:IV|I{1,3}|[1-4])(?:[/-]\d{2,4})?\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // C5) Kỳ tháng / kỳ N tháng MM/YYYY / kỳ MM-MM/YYYY
  (s, push) =>
    s.replace(
      /\bkỳ\s*\d{1,2}\s*[-–]\s*\d{1,2}(?:[/-]\d{2,4})?\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),
  (s, push) =>
    s.replace(
      /\b(?:kỳ\s*\d{0,2}\s*)?tháng\s*\d{1,2}(?:[/-]\d{2,4})?\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),
  (s, push) =>
    s.replace(/\bkỳ\s*\d{1,2}(?:[/-]\d{2,4})?\b/giu, (m) => { push(m.trim()); return " "; }),

  // ===== D. Tuyến mã địa danh viết hoa =====
  (s, push) =>
    s.replace(
      /\b([A-ZĐ]{2,4})\s*(?:-|–|→|đến|tới)\s*([A-ZĐ]{2,4})\b/gu,
      (m) => { push(m.trim()); return " "; },
    ),

  // ===== E. Số chuyến bay / hợp đồng / phiếu =====

  // E1) Chuyến bay (VN1234, VJ142) — tránh nuốt mã spec ngắn (R15, V70) vì có chữ số liền nhau,
  //     yêu cầu đứng riêng giữa whitespace.
  (s, push) =>
    s.replace(/(?<=\s|^)([A-Z]{2}\d{2,4})(?=\s|$)/g, (m) => { push(m.trim()); return " "; }),

  // E2) Số HĐ/lệnh — phải CÓ ký số phía sau
  (s, push) =>
    s.replace(/\b(?:số|so)\s*[:#]?\s*[A-Za-z]*\d[A-Za-z0-9./-]*\b/giu, (m) => {
      push(m.trim()); return " ";
    }),
  (s, push) =>
    s.replace(/\b(?:s\/?n|sn|imei|serial)\s*[:#-]?\s*[A-Za-z0-9-]{4,}\b/giu, (m) => {
      push(m.trim()); return " ";
    }),
  (s, push) =>
    s.replace(
      /\b(?:LĐX|BL|BK|PO|DO|HĐ|HD|HĐT|HĐTD|HĐVV|HĐMB|HĐKT|INET|VETC)\s*[:#-]?\s*[A-Za-z0-9./-]{2,}\b/giu,
      (m) => { push(m.trim()); return " "; },
    ),

  // ===== F. Cụm trong ngoặc (loại trừ quy cách SP) =====
  (s, push) =>
    s.replace(/[(\[]\s*([^)\]]{2,})\s*[)\]]/gu, (m, inner: string) => {
      if (SPEC_IN_PAREN.test(stripDiacritics(inner))) return m;
      push(`(${inner.trim()})`);
      return " ";
    }),

  // ===== G. Km hiện tại (sửa chữa xe) =====
  (s, push) =>
    s.replace(/\bkm\s*(?:hiện\s*tại)?\s*[:#-]?\s*[\d.,]+\b/giu, (m) => {
      push(m.trim()); return " ";
    }),
];

// Từ nối thừa cần dọn ở 2 đầu canonical.
const TRAILING_FILLER = /^(ngày|ngay|số|so|xe|tuyến|tuyen|từ|tu|đến|den|tới|toi|kỳ|ky|tháng|thang|quý|quy|cho|của|cua|trạm|tram|trụ|tru|ghế|ghe|toa|tầng|tang|phòng|phong|gói|goi|chu|kỳ)$/iu;

export function splitItemName(raw: string | null | undefined): SplitItemNameResult {
  const original = (raw ?? "").toString();
  const note_parts: string[] = [];
  const push = (n: string) => {
    if (!n) return;
    const key = n.toLowerCase();
    if (note_parts.some((p) => p.toLowerCase() === key)) return;
    note_parts.push(n);
  };

  // Pre-clean: strip prefix STT "1.", "01)", "- " và ký tự nhiễu
  let work = original
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^[\s\-*•·|=>→]*(?:\d{1,3}[.)\]]\s*)+/u, "")
    .trim();

  for (const rule of RULES) work = rule(work, push);

  // Dọn filler / ký tự nhiễu ở 2 đầu cho tới khi ổn định
  let prev = "";
  let canonical = work;
  while (prev !== canonical) {
    prev = canonical;
    canonical = canonical
      .replace(/\s+/g, " ")
      .replace(/(?:^|\s)(?:[-–·,.;:*•|=>→])+(?=\s|$)/g, " ")
      .trim();
    canonical = canonical.replace(/^[-–·,.;:*•|=>→\s]+|[-–·,.;:*•|=>→\s]+$/g, "").trim();
    const tokens = canonical.split(/\s+/).filter(Boolean);
    while (tokens.length && TRAILING_FILLER.test(stripDiacritics(tokens[tokens.length - 1]))) tokens.pop();
    while (tokens.length && TRAILING_FILLER.test(stripDiacritics(tokens[0]))) tokens.shift();
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

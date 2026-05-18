// Shared list of common Vietnamese units of measure (client + server safe).
export const COMMON_UNITS: { code: string; name: string; note?: string }[] = [
  { code: "Cái", name: "Cái" },
  { code: "Chiếc", name: "Chiếc" },
  { code: "Bộ", name: "Bộ" },
  { code: "Hộp", name: "Hộp" },
  { code: "Thùng", name: "Thùng" },
  { code: "Gói", name: "Gói" },
  { code: "Túi", name: "Túi" },
  { code: "Chai", name: "Chai" },
  { code: "Lọ", name: "Lọ" },
  { code: "Lon", name: "Lon" },
  { code: "Bao", name: "Bao" },
  { code: "Kiện", name: "Kiện" },
  { code: "Cuộn", name: "Cuộn" },
  { code: "Tờ", name: "Tờ" },
  { code: "Quyển", name: "Quyển" },
  { code: "Tập", name: "Tập" },
  { code: "Đôi", name: "Đôi" },
  { code: "Cặp", name: "Cặp" },
  { code: "Tá", name: "Tá", note: "12 cái" },
  { code: "Vỉ", name: "Vỉ" },
  { code: "Khay", name: "Khay" },
  { code: "Ống", name: "Ống" },
  { code: "Viên", name: "Viên" },
  { code: "Gram", name: "Gam" },
  { code: "kg", name: "Ki-lô-gam" },
  { code: "g", name: "Gam" },
  { code: "mg", name: "Mi-li-gam" },
  { code: "tấn", name: "Tấn" },
  { code: "tạ", name: "Tạ" },
  { code: "yến", name: "Yến" },
  { code: "lít", name: "Lít" },
  { code: "ml", name: "Mi-li-lít" },
  { code: "m3", name: "Mét khối" },
  { code: "m", name: "Mét" },
  { code: "cm", name: "Xăng-ti-mét" },
  { code: "mm", name: "Mi-li-mét" },
  { code: "m2", name: "Mét vuông" },
  { code: "km", name: "Ki-lô-mét" },
  { code: "Giờ", name: "Giờ" },
  { code: "Phút", name: "Phút" },
  { code: "Ngày", name: "Ngày" },
  { code: "Tuần", name: "Tuần" },
  { code: "Tháng", name: "Tháng" },
  { code: "Năm", name: "Năm" },
  { code: "Lần", name: "Lần" },
  { code: "Suất", name: "Suất" },
  { code: "Phần", name: "Phần" },
  { code: "Dịch vụ", name: "Dịch vụ" },
  { code: "Người", name: "Người" },
  { code: "Khoá", name: "Khoá học" },
  { code: "Buổi", name: "Buổi" },
];

// Normalize a string for fuzzy matching (lowercase, strip Vietnamese diacritics).
export function normalizeUnit(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

export function findCommonUnit(query: string): { code: string; name: string; note?: string } | undefined {
  const q = normalizeUnit(query);
  if (!q) return undefined;
  return COMMON_UNITS.find((u) => normalizeUnit(u.code) === q || normalizeUnit(u.name) === q);
}

export function suggestCommonUnits(query: string, limit = 8): typeof COMMON_UNITS {
  const q = normalizeUnit(query);
  if (!q) return COMMON_UNITS.slice(0, limit);
  return COMMON_UNITS
    .filter((u) => normalizeUnit(u.code).includes(q) || normalizeUnit(u.name).includes(q))
    .slice(0, limit);
}

// Vietnamese-style date range presets for list/report filters.
export type PresetKey =
  | "today" | "yesterday"
  | "thisWeek" | "lastWeek"
  | "thisMonth" | "lastMonth"
  | "thisQuarter" | "lastQuarter"
  | "thisYear" | "lastYear"
  | "m1" | "m2" | "m3" | "m4" | "m5" | "m6"
  | "m7" | "m8" | "m9" | "m10" | "m11" | "m12"
  | "custom";

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  return x;
};

export function getPresetRange(key: PresetKey, ref: Date = new Date()): { from: string; to: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const today = new Date(y, m, day);

  switch (key) {
    case "today":      return { from: iso(today), to: iso(today) };
    case "yesterday": { const d = new Date(y, m, day - 1); return { from: iso(d), to: iso(d) }; }
    case "thisWeek":  { const s = startOfWeek(today); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: iso(s), to: iso(e) }; }
    case "lastWeek":  { const s = startOfWeek(today); s.setDate(s.getDate() - 7); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: iso(s), to: iso(e) }; }
    case "thisMonth": return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "lastMonth": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "thisQuarter": { const q = Math.floor(m / 3); return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }; }
    case "lastQuarter": { const q = Math.floor(m / 3) - 1; const yy = q < 0 ? y - 1 : y; const qq = (q + 4) % 4; return { from: iso(new Date(yy, qq * 3, 1)), to: iso(new Date(yy, qq * 3 + 3, 0)) }; }
    case "thisYear":  return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "lastYear":  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "custom":    return { from: iso(today), to: iso(today) };
    default: {
      // m1..m12
      const mm = parseInt(key.slice(1), 10) - 1;
      return { from: iso(new Date(y, mm, 1)), to: iso(new Date(y, mm + 1, 0)) };
    }
  }
}

export const PRESET_OPTIONS: { value: PresetKey; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "thisWeek", label: "Tuần này" },
  { value: "lastWeek", label: "Tuần trước" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "lastMonth", label: "Tháng trước" },
  { value: "thisQuarter", label: "Quý này" },
  { value: "lastQuarter", label: "Quý trước" },
  { value: "thisYear", label: "Năm này" },
  { value: "lastYear", label: "Năm trước" },
  { value: "m1", label: "Tháng 1" }, { value: "m2", label: "Tháng 2" },
  { value: "m3", label: "Tháng 3" }, { value: "m4", label: "Tháng 4" },
  { value: "m5", label: "Tháng 5" }, { value: "m6", label: "Tháng 6" },
  { value: "m7", label: "Tháng 7" }, { value: "m8", label: "Tháng 8" },
  { value: "m9", label: "Tháng 9" }, { value: "m10", label: "Tháng 10" },
  { value: "m11", label: "Tháng 11" }, { value: "m12", label: "Tháng 12" },
  { value: "custom", label: "Tùy chọn" },
];

export function detectPreset(from: string, to: string, ref: Date = new Date()): PresetKey {
  for (const opt of PRESET_OPTIONS) {
    if (opt.value === "custom") continue;
    const r = getPresetRange(opt.value, ref);
    if (r.from === from && r.to === to) return opt.value;
  }
  return "custom";
}

export function formatVN(isoStr: string): string {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-");
  return `${d}/${m}/${y}`;
}

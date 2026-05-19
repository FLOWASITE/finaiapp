// Simple CSV export helper used by management reports.
export type CsvColumn<T> = {
  key: keyof T | string;
  header: string;
  accessor?: (row: T) => string | number | null | undefined;
  numeric?: boolean;
};

function escape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : String(v);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const head = columns.map((c) => escape(c.header)).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = c.accessor ? c.accessor(r) : (r as any)[c.key];
          return escape(v);
        })
        .join(","),
    )
    .join("\n");
  // BOM for Excel UTF-8
  const blob = new Blob(["\uFEFF" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import { fmtVN } from "./report-shell";

export type Col<T> = {
  key: string;
  header: string;
  accessor: (r: T) => any;
  align?: "left" | "right" | "center";
  numeric?: boolean;
  className?: string;
  footer?: any;
};

export function ReportTable<T>({
  columns,
  rows,
  totals,
  emptyText = "Không có dữ liệu",
  isLoading,
}: {
  columns: Col<T>[];
  rows: T[];
  totals?: Record<string, any>;
  emptyText?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 text-${c.align ?? (c.numeric ? "right" : "left")} font-medium text-muted-foreground border-b ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                Đang tải...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-muted/30">
                {columns.map((c) => {
                  const v = c.accessor(r);
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-1.5 text-${c.align ?? (c.numeric ? "right" : "left")} ${c.numeric ? "font-mono tabular-nums" : ""} ${c.className ?? ""}`}
                    >
                      {c.numeric ? fmtVN(v) : v}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot className="bg-muted/60 font-semibold">
            <tr>
              {columns.map((c, idx) => {
                const v = c.footer !== undefined ? c.footer : totals[c.key];
                const isFirst = idx === 0;
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-${c.align ?? (c.numeric ? "right" : "left")} ${c.numeric ? "font-mono tabular-nums" : ""}`}
                  >
                    {isFirst && v === undefined ? "Tổng cộng" : c.numeric && v !== undefined ? fmtVN(v) : v ?? ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

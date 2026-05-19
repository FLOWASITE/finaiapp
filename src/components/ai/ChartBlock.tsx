import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type ChartSeries = { key: string; label?: string; color?: string };

export type ChartSpec = {
  type: "bar" | "line" | "area" | "pie" | "scatter" | "radar";
  title?: string;
  description?: string;
  /** Field danh mục/thời gian (hoặc trục X với scatter, nameKey với pie/radar) */
  xKey?: string;
  /** Format mới (tool renderChart). */
  series?: ChartSeries[];
  /** Format cũ (markdown ```chart). Backward compat. */
  yKeys?: string[];
  data: Array<Record<string, any>>;
  stacked?: boolean;
  xLabel?: string;
  yLabel?: string;
};

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--chart-3, 200 70% 50%))",
  "hsl(var(--chart-4, 30 80% 55%))",
  "hsl(var(--chart-5, 280 60% 55%))",
  "hsl(var(--chart-6, 160 65% 45%))",
  "hsl(var(--chart-7, 340 70% 55%))",
  "hsl(var(--chart-8, 50 85% 55%))",
];

const nfVN = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function formatValue(v: any): string {
  if (v == null) return "—";
  if (typeof v === "number" && Number.isFinite(v)) {
    return `${nfVN.format(v)} ₫`;
  }
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== "") return `${nfVN.format(n)} ₫`;
  return String(v);
}

const tooltipFormatter = (value: any, name: any) => [formatValue(value), String(name)];
const tooltipContentStyle = { fontSize: 12 } as const;

function normalizeSeries(spec: ChartSpec): ChartSeries[] {
  if (spec.series?.length) return spec.series;
  const keys = spec.yKeys?.length ? spec.yKeys : ["value"];
  return keys.map((k) => ({ key: k }));
}

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) return null;
  const series = normalizeSeries(spec);
  const xKey = spec.xKey ?? "name";
  const showLegend = series.length > 1;
  const colorOf = (s: ChartSeries, i: number) => s.color || PALETTE[i % PALETTE.length];

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-3">
      {spec.title && (
        <div className="mb-1 text-xs font-medium text-foreground">{spec.title}</div>
      )}
      {spec.description && (
        <div className="mb-2 text-[11px] text-muted-foreground">{spec.description}</div>
      )}
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "bar" ? (
            <BarChart data={spec.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  fill={colorOf(s, i)}
                  stackId={spec.stacked ? "stack" : undefined}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          ) : spec.type === "line" ? (
            <LineChart data={spec.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={colorOf(s, i)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : spec.type === "area" ? (
            <AreaChart data={spec.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={colorOf(s, i)}
                  fill={colorOf(s, i)}
                  fillOpacity={0.25}
                  stackId={spec.stacked ? "stack" : undefined}
                />
              ))}
            </AreaChart>
          ) : spec.type === "pie" ? (
            <PieChart>
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Pie
                data={spec.data}
                dataKey={series[0].key}
                nameKey={xKey}
                outerRadius={90}
                label={{ fontSize: 11 }}
              >
                {spec.data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            </PieChart>
          ) : spec.type === "scatter" ? (
            <ScatterChart margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" dataKey={xKey} tick={{ fontSize: 11 }} name={spec.xLabel ?? xKey} />
              <YAxis tick={{ fontSize: 11 }} />
              <ZAxis range={[40, 200]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ fontSize: 12 }} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Scatter
                  key={s.key}
                  data={spec.data}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  fill={colorOf(s, i)}
                />
              ))}
            </ScatterChart>
          ) : (
            <RadarChart data={spec.data} outerRadius={90}>
              <PolarGrid />
              <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Radar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label ?? s.key}
                  stroke={colorOf(s, i)}
                  fill={colorOf(s, i)}
                  fillOpacity={0.3}
                />
              ))}
            </RadarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Parse assistant message and split into text + chart specs.
 * Looks for fenced blocks: ```chart\n{json}\n```
 */
export function parseChartBlocks(
  content: string,
): Array<{ type: "text"; value: string } | { type: "chart"; spec: ChartSpec }> {
  if (!content) return [{ type: "text", value: "" }];
  const re = /```chart\s*\n([\s\S]*?)\n```/g;
  const out: Array<{ type: "text"; value: string } | { type: "chart"; spec: ChartSpec }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) out.push({ type: "text", value: content.slice(last, m.index) });
    try {
      const spec = JSON.parse(m[1]) as ChartSpec;
      out.push({ type: "chart", spec });
    } catch {
      out.push({ type: "text", value: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ type: "text", value: content.slice(last) });
  return out;
}

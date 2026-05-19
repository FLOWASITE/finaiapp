import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartSpec = {
  type: "bar" | "line" | "pie";
  title?: string;
  xKey?: string;
  yKeys?: string[];
  data: Array<Record<string, any>>;
};

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--chart-3, 200 70% 50%))",
  "hsl(var(--chart-4, 30 80% 55%))",
  "hsl(var(--chart-5, 280 60% 55%))",
];

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) return null;
  const yKeys = spec.yKeys?.length ? spec.yKeys : ["value"];
  const xKey = spec.xKey ?? "name";

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-3">
      {spec.title && <div className="mb-2 text-xs font-medium text-muted-foreground">{spec.title}</div>}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "bar" ? (
            <BarChart data={spec.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {yKeys.map((k, i) => (
                <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          ) : spec.type === "line" ? (
            <LineChart data={spec.data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {yKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Pie data={spec.data} dataKey={yKeys[0]} nameKey={xKey} outerRadius={80} label={{ fontSize: 11 }}>
                {spec.data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
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
export function parseChartBlocks(content: string): Array<{ type: "text"; value: string } | { type: "chart"; spec: ChartSpec }> {
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

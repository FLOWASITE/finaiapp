import { tool } from "ai";
import { z } from "zod";

const MAX_POINTS = 500;
const MAX_SERIES = 8;

const SeriesSchema = z.object({
  key: z.string().min(1).describe("Tên field trong data dùng làm trị số (hoặc trục Y với scatter)."),
  label: z.string().optional(),
  color: z.string().optional().describe("CSS color. Bỏ trống để dùng palette mặc định."),
});

const ChartSpecSchema = z.object({
  type: z.enum(["bar", "line", "area", "pie", "scatter", "radar"]),
  title: z.string().optional(),
  description: z.string().optional(),
  xKey: z.string().min(1).describe("Field danh mục/thời gian (hoặc trục X với scatter, nameKey với pie/radar)."),
  series: z.array(SeriesSchema).min(1).max(MAX_SERIES),
  data: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
    .min(1)
    .max(MAX_POINTS),
  stacked: z.boolean().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export function makeRenderChartTool() {
  return tool({
    description:
      "Vẽ biểu đồ trong chat. Hỗ trợ bar, line, area, pie, scatter, radar. " +
      "Truyền `data` là mảng object, `xKey` là field danh mục/thời gian, `series` liệt kê các field số cần vẽ. " +
      "Với `pie`: chỉ dùng 1 series (value), `xKey` là tên slice. " +
      "Với `scatter`: `xKey` là số (trục X), mỗi series là 1 chuỗi điểm theo trục Y. " +
      "Nếu cần dữ liệu thật, hãy gọi `runQuery` trước rồi map kết quả vào `data`.",
    inputSchema: ChartSpecSchema,
    execute: async (input) => {
      // Chỉ là payload spec — frontend tự render. Không side-effect.
      return { ok: true as const, spec: input };
    },
  });
}

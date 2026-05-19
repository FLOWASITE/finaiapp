## Mục tiêu
Cho phép AI trả lời kèm biểu đồ (bar, line, area, pie, scatter, radar) bằng cơ chế **tool call**. AI có thể tự sinh dữ liệu từ ngữ cảnh chat hoặc truy vấn DB qua `runQuery` rồi vẽ. Frontend render bằng Recharts (đã có `src/components/ui/chart.tsx`).

## Thiết kế tổng quan

### 1. Tool mới: `renderChart`
File: `src/lib/ai/tools/chart.tool.ts`

- AI SDK `tool()` với Zod schema:
  - `type`: enum `bar | line | area | pie | scatter | radar`
  - `title`, `description?`
  - `data`: array of records `{ [key: string]: string | number }`
  - `xKey`: string (trục danh mục / thời gian; với pie là tên slice)
  - `series`: array `{ key: string; label?: string; color?: string }` (với pie chỉ cần 1 series là value)
  - `stacked?`, `xLabel?`, `yLabel?`
- `execute`: chỉ validate + trả lại payload đã chuẩn hoá (không side-effect). Output là spec biểu đồ — frontend tự render. Giới hạn an toàn: ≤500 điểm dữ liệu, ≤8 series, từ chối nếu vượt.
- Đăng ký trong `src/lib/chat.functions.ts` cùng `runQuery`, `proposeAction`.

### 2. System prompt
Bổ sung 1 đoạn ngắn vào `src/lib/ai/system-prompt.ts`:
> Khi user yêu cầu trực quan hoá / so sánh / xu hướng / cơ cấu, hãy gọi `renderChart`. Nếu cần dữ liệu thật, gọi `runQuery` trước rồi dùng kết quả làm `data`. Chọn `type` phù hợp: xu hướng → line/area, so sánh → bar, cơ cấu → pie, phân bố → scatter, đa chiều → radar.

### 3. Renderer phía client
File mới: `src/components/chat/chart-render.tsx`
- Nhận `spec` từ `tool-result.output`.
- Dùng `ChartContainer/ChartTooltip` từ `@/components/ui/chart` + Recharts (`BarChart`, `LineChart`, `AreaChart`, `PieChart`, `ScatterChart`, `RadarChart`).
- Auto màu: nếu `series.color` thiếu → dùng token `hsl(var(--chart-1..8))` (đã có sẵn trong chart.tsx).
- Responsive, chiều cao mặc định 280px.

Cập nhật `src/components/chat/tool-calls.tsx`:
- Thêm meta cho `renderChart` (icon `BarChart3` từ lucide).
- Khi `toolName === "renderChart"` và có `output` không lỗi → render `<ChartRender spec={output} />` thay vì JSON accordion. Vẫn cho expand xem input/spec thô.

### 4. Persistence
Tool spec đã nằm trong `tool-result` event → lưu vào `chat_messages.tool_calls` (đã có cơ chế persist hiện tại). Reload thread sẽ replay đúng.

## Files thay đổi
- `src/lib/ai/tools/chart.tool.ts` (new)
- `src/lib/chat.functions.ts` (đăng ký tool)
- `src/lib/ai/system-prompt.ts` (thêm hướng dẫn ngắn)
- `src/components/chat/chart-render.tsx` (new)
- `src/components/chat/tool-calls.tsx` (route renderChart sang ChartRender)

## Kiểm thử
1. "Vẽ biểu đồ cột doanh thu 6 tháng gần nhất" → AI gọi `runQuery` lấy số liệu rồi `renderChart` type=bar.
2. "Vẽ pie cơ cấu chi phí Q1 với data: A 30, B 50, C 20" → AI gọi thẳng `renderChart` không qua DB.
3. "So sánh xu hướng tồn kho 2 kho theo tuần" → line, 2 series.
4. Reload thread vẫn thấy biểu đồ.
5. Spec lỗi (vd quá 500 điểm) → hiển thị error message thay vì crash.

## Lưu ý kỹ thuật
- KHÔNG dùng màu hard-code; lấy từ design tokens `--chart-1..8`.
- Tool `execute` không gọi DB → giữ phản hồi nhanh. Nếu cần data thật, AI tự chain `runQuery` trước.
- Output size sau truncate 4000 chars có thể cắt mất data lớn — sẽ nâng giới hạn riêng cho `renderChart` lên ~32KB trong `truncateOutput` (theo tool name).
import { tool } from "ai";
import { z } from "zod";
import { ACTION_HANDLERS } from "@/lib/ai/action-handlers.server";

/**
 * AI tool: propose a write action that requires user approval.
 * Does NOT execute; only inserts a pending row in `ai_actions`.
 * The UI polls/realtime-subscribes and shows the action card with Approve/Cancel.
 */
export function makeProposeActionTool(supabase: any, userId: string) {
  return tool({
    description: [
      "Đề xuất một hành động ghi dữ liệu (tạo hoá đơn, thu tiền...) để user xác nhận.",
      "Tool này KHÔNG thực thi ngay — chỉ ghi vào hàng chờ duyệt.",
      "Sau khi gọi, hãy thông báo cho user biết đã tạo đề xuất và yêu cầu họ bấm Duyệt.",
      "Tool name hợp lệ: createInvoiceFromSO, recordCustomerReceipt.",
    ].join(" "),
    inputSchema: z.object({
      tool_name: z.enum(["createInvoiceFromSO", "recordCustomerReceipt"]),
      input: z
        .record(z.string(), z.any())
        .describe(
          "Tham số tool. createInvoiceFromSO: {orderId, issueDate?, lines:[{soLineId, qty}]}. recordCustomerReceipt: {invoice_id, pay_date, method:'cash'|'bank'|'card'|'other', amount, reference?, notes?}",
        ),
    }),
    execute: async (data) => {
      const handler = ACTION_HANDLERS[data.tool_name];
      if (!handler) return { error: `Tool không hỗ trợ: ${data.tool_name}` };
      try {
        const parsed = handler.schema.parse(data.input);
        const summary = await handler.preview(parsed, { supabase, userId });
        const { data: row, error } = await supabase
          .from("ai_actions")
          .insert({
            user_id: userId,
            tool_name: data.tool_name,
            input: parsed,
            summary,
            status: "pending",
          })
          .select("id, summary")
          .single();
        if (error) return { error: error.message };
        return {
          action_id: row.id,
          summary: row.summary,
          message: "Đã tạo đề xuất. Vui lòng bấm 'Duyệt' bên dưới để thực thi.",
        };
      } catch (e: any) {
        return { error: e?.message ?? String(e) };
      }
    },
  });
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel, resolveAgentModel } from "@/lib/ai-gateway.server";
import { resolveLineKind } from "@/lib/items/resolve-line-kind.server";

const SuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        debit_account: z.string().describe("Mã TK ghi Nợ (VD: 156, 1331, 6422)"),
        credit_account: z.string().describe("Mã TK ghi Có (VD: 111, 112, 331)"),
        amount: z.number().describe("Số tiền cho cặp bút toán này (VNĐ)"),
        description: z.string().describe("Diễn giải ngắn gọn bằng tiếng Việt"),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().describe("Lý do chọn cặp TK này"),
      }),
    )
    .length(3)
    .describe("Đúng 3 phương án định khoản, xếp theo độ phù hợp giảm dần"),
});

const COA_HINT = `Hệ thống TK TT133 thường dùng:
- 111/1111 Tiền mặt — 112/1121 TGNH
- 131 Phải thu khách hàng — 331 Phải trả người bán
- 133/1331 Thuế GTGT được khấu trừ HHDV — 1332 GTGT TSCĐ
- 152 NVL — 153 CCDC — 156 Hàng hóa — 211 TSCĐ
- 511 Doanh thu — 632 Giá vốn
- 642/6421 CP bán hàng — 6422 CP QLDN
- 334 Phải trả NLĐ — 3331 GTGT phải nộp

Quy tắc định khoản phổ biến:
- Mua hàng hóa trả sau: Nợ 156, Nợ 1331 / Có 331
- Mua hàng hóa trả ngay: Nợ 156, Nợ 1331 / Có 111 hoặc 112
- Mua dịch vụ (điện, nước, văn phòng phẩm): Nợ 6422, Nợ 1331 / Có 331 hoặc 111
- Mua TSCĐ: Nợ 211, Nợ 1332 / Có 331 hoặc 112
- Chi phí bán hàng (vận chuyển, quảng cáo): Nợ 6421, Nợ 1331 / Có 111 hoặc 331
- Trả lương: Nợ 6422 / Có 334`;

export const suggestJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { model } = await resolveAgentModel("journal", "google/gemini-3-flash-preview");

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, supplier_name, supplier_tax_id, subtotal, vat_amount, total, user_id")
      .eq("id", data.invoiceId)
      .single();
    if (error || !invoice) throw new Error("Không tìm thấy hóa đơn");
    if (invoice.user_id !== userId) throw new Error("Không có quyền");

    const { data: lines } = await supabase
      .from("invoice_lines")
      .select("description, amount, vat_rate")
      .eq("invoice_id", invoice.id);

    // Few-shot từ 5 bút toán gần nhất cùng NCC
    const { data: recent } = await supabase
      .from("journal_entries")
      .select("description, journal_lines(account_code, debit, credit)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    const fewShot =
      recent && recent.length > 0
        ? `\n\nMột số bút toán gần đây của user này (làm tham khảo phong cách):\n${JSON.stringify(recent, null, 2)}`
        : "";

    const { experimental_output } = await generateText({
      model,
      experimental_output: Output.object({ schema: SuggestionSchema }),
      messages: [
        {
          role: "system",
          content: `Bạn là kế toán trưởng VN, định khoản theo Thông tư 133/2016.\n\n${COA_HINT}${fewShot}\n\nLuôn trả đúng 3 phương án, xếp theo confidence giảm dần. Confidence là số 0-1.`,
        },
        {
          role: "user",
          content: `Hãy gợi ý định khoản cho hóa đơn mua vào sau:
- Nhà cung cấp: ${invoice.supplier_name ?? "?"} (MST: ${invoice.supplier_tax_id ?? "?"})
- Tổng tiền hàng (chưa VAT): ${invoice.subtotal}
- VAT: ${invoice.vat_amount}
- Tổng thanh toán: ${invoice.total}
- Mặt hàng/dịch vụ:
${(lines ?? []).map((l) => `  • ${l.description} — ${l.amount} (VAT ${l.vat_rate}%)`).join("\n")}

Giả định: chưa thanh toán (công nợ qua TK 331). Mỗi phương án phải gồm các cặp Nợ/Có chính (gồm dòng giá trị hàng và dòng thuế GTGT nếu có).`,
        },
      ],
    });

    // Lưu lại để feedback sau
    await supabase.from("ai_suggestions").insert({
      invoice_id: invoice.id,
      user_id: userId,
      suggestions: experimental_output,
    });

    return experimental_output;
  });

export const approveJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    invoiceId: string;
    description: string;
    entry_date: string;
    lines: Array<{ account_code: string; debit: number; credit: number }>;
  }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const totalDebit = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Bút toán không cân: Nợ ${totalDebit} ≠ Có ${totalCredit}`);
    }

    // Check kỳ kế toán đã khoá
    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: data.entry_date,
    });
    if (locked === true) {
      throw new Error("Kỳ kế toán đã khoá, không thể ghi sổ vào ngày này");
    }

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        invoice_id: data.invoiceId,
        entry_date: data.entry_date,
        description: data.description,
      })
      .select("id")
      .single();
    if (error || !entry) throw new Error(error?.message || "Không tạo được bút toán");

    await supabase.from("journal_lines").insert(
      data.lines.map((l, i) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );

    // Tự sinh phiếu nhập kho / tài sản từ dòng hoá đơn
    const { data: invLines } = await supabase
      .from("invoice_lines")
      .select("description, qty, unit_price, amount, product_id, line_type")
      .eq("invoice_id", data.invoiceId);

    for (const line of invLines ?? []) {
      // Hàng hoá có gắn product → nhập kho + bình quân gia quyền
      if (line.line_type === "goods" && line.product_id) {
        const qty = Number(line.qty || 0);
        const unitCost = qty > 0 ? Number(line.amount || 0) / qty : Number(line.unit_price || 0);
        const { data: prod } = await supabase
          .from("products")
          .select("on_hand, unit_cost")
          .eq("id", line.product_id)
          .single();
        if (prod) {
          const oldQty = Number(prod.on_hand);
          const oldCost = Number(prod.unit_cost);
          const newQty = oldQty + qty;
          const newCost = newQty > 0 ? (oldQty * oldCost + qty * unitCost) / newQty : unitCost;
          await supabase.from("stock_movements").insert({
            user_id: userId,
            product_id: line.product_id,
            movement_type: "in",
            qty,
            unit_cost: unitCost,
            movement_date: data.entry_date,
            ref_type: "invoice",
            ref_id: data.invoiceId,
            note: `Nhập từ HĐ — ${line.description}`,
          });
          await supabase
            .from("products")
            .update({ on_hand: newQty, unit_cost: newCost })
            .eq("id", line.product_id);
        }
      }

      // Tài sản → tự tạo TSCĐ (chờ kế toán bổ sung thời gian khấu hao)
      if (line.line_type === "asset") {
        await supabase.from("fixed_assets").insert({
          user_id: userId,
          code: `TS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: line.description ?? "Tài sản",
          cost: Number(line.amount || 0),
          useful_life_months: 60,
          start_date: data.entry_date,
        });
      }
    }

    await supabase
      .from("invoices")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", data.invoiceId);

    return { ok: true, entryId: entry.id };
  });

/**
 * Layer 3 LLM fallback — "Nhờ Fin gợi ý" khi resolver không tự khớp được.
 *
 * Pipeline:
 *  1) Lấy top ~40 product ứng viên từ catalog của tenant (active),
 *     ưu tiên trùng từ khoá trong raw_name (ilike OR) → fallback alphabet.
 *  2) Đưa raw line + đơn vị + giá + ngữ cảnh tài khoản (152/153/156/...) cho LLM.
 *  3) LLM trả 1 trong 2:
 *     - match: chọn product_id từ danh sách + reason.
 *     - create: gợi ý code/name/unit + item_type + stock_account.
 *
 *  Backend dùng agent key "classify_file" (cùng model lite) để không phát sinh
 *  cấu hình mới ở UI agent settings — KTV có thể đổi sau.
 */

import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { resolveAgentModel } from "@/lib/ai-gateway.server";

const StockAccount = z.enum(["152", "153", "156", "211", "213", "242", "642"]);

const Suggestion = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("match"),
    product_id: z.string().uuid(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("create"),
    suggested_code: z.string().min(1).max(64),
    suggested_name: z.string().min(1).max(255),
    suggested_unit: z.string().min(1).max(64),
    item_type: z.enum(["goods", "service"]),
    stock_account: StockAccount,
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200),
  }),
  z.object({
    kind: z.literal("unsure"),
    reason: z.string().max(200),
  }),
]);

export type ItemSuggestion = z.infer<typeof Suggestion>;

const Input = z.object({
  raw_name: z.string().min(1).max(500),
  raw_unit: z.string().max(64).optional().nullable(),
  unit_price: z.number().optional().nullable(),
  supplier_name: z.string().max(255).optional().nullable(),
});

function tokensFromName(name: string): string[] {
  const norm = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9À-ỹ\s]/g, " ")
    .toLowerCase();
  return norm
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

const SYSTEM_PROMPT = `Bạn là kế toán Việt Nam, giúp khớp tên mặt hàng trên hoá đơn NCC với mã hàng trong hệ thống.

Quy tắc:
- Nếu thấy product khớp >= 80% ý nghĩa (cùng mặt hàng, kể cả khác đơn vị) → trả "match" với product_id từ danh sách.
- Nếu KHÔNG có gì khớp → trả "create" với gợi ý mã + loại + tài khoản:
  • 152 = Nguyên vật liệu (vật tư đầu vào sản xuất, hoá chất, bao bì)
  • 153 = Công cụ dụng cụ (dụng cụ tái sử dụng, văn phòng phẩm dùng nhiều lần)
  • 156 = Hàng hoá (mua về để bán lại)
  • 211 = TSCĐ hữu hình (máy móc, xe, có giá trị lớn dùng nhiều năm)
  • 213 = TSCĐ vô hình (phần mềm bản quyền, giấy phép)
  • 242 = Chi phí trả trước (bảo hiểm, thuê dài hạn)
  • 642 = Dịch vụ
- Nếu mơ hồ, không đủ ngữ cảnh → trả "unsure".
- Mã gợi ý: viết hoa, không dấu, ngắn (vd "DAU-AN-1L", "GIAY-A4").`;

export const suggestItemMappingWithLLM = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, tenantId } = context;

    // 1) Lấy ứng viên trong catalog
    const tokens = tokensFromName(data.raw_name).slice(0, 4);
    let q = supabase
      .from("products")
      .select("id, code, name, unit, item_type, stock_account")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .limit(40);

    if (tokens.length) {
      const orExpr = tokens
        .map((t) => `name.ilike.%${t.replace(/[,]/g, " ")}%`)
        .join(",");
      q = q.or(orExpr);
    }
    const { data: candidates, error } = await q;
    if (error) throw new Error(error.message);

    let pool = (candidates ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      unit: string | null;
      item_type: string | null;
      stock_account: string | null;
    }>;

    // Nếu rỗng (không có từ khoá khớp), lấy 30 sản phẩm theo alphabet để LLM
    // ít nhất biết tenant đang có danh mục gì.
    if (pool.length === 0) {
      const { data: fallback } = await supabase
        .from("products")
        .select("id, code, name, unit, item_type, stock_account")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("code")
        .limit(30);
      pool = (fallback ?? []) as typeof pool;
    }

    const catalogText = pool.length
      ? pool
          .map(
            (p) =>
              `- id=${p.id} | code=${p.code} | ${p.name}${p.unit ? ` (${p.unit})` : ""}${p.stock_account ? ` [TK ${p.stock_account}]` : ""}`,
          )
          .join("\n")
      : "(Danh mục trống — chắc chắn phải tạo mới)";

    const userPrompt = [
      `**Dòng hoá đơn NCC cần khớp:**`,
      `- Tên: ${data.raw_name}`,
      data.raw_unit ? `- ĐVT: ${data.raw_unit}` : null,
      data.unit_price ? `- Đơn giá: ${data.unit_price.toLocaleString("vi-VN")}đ` : null,
      data.supplier_name ? `- NCC: ${data.supplier_name}` : null,
      ``,
      `**Danh mục sản phẩm hiện có của doanh nghiệp:**`,
      catalogText,
      ``,
      `Hãy quyết định: match (chọn id từ danh sách trên) / create (gợi ý mới) / unsure.`,
    ]
      .filter(Boolean)
      .join("\n");

    let model;
    try {
      ({ model } = await resolveAgentModel(
        "classify_file",
        "google/gemini-3.1-flash-lite-preview",
      ));
    } catch {
      ({ model } = await resolveAgentModel(
        "classify_file",
        "google/gemini-3-flash-preview",
      ));
    }

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: Suggestion }),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      // Nếu match: enrich thêm code/name từ pool để UI hiển thị ngay
      if (output.kind === "match") {
        const picked = pool.find((p) => p.id === output.product_id);
        if (!picked) {
          // LLM bịa product_id → coi như unsure
          return {
            kind: "unsure" as const,
            reason: "Fin chọn mã không có trong danh mục — vui lòng chọn tay.",
          };
        }
        return {
          kind: "match" as const,
          product_id: output.product_id,
          confidence: output.confidence,
          reason: output.reason,
          product: {
            id: picked.id,
            code: picked.code,
            name: picked.name,
            unit: picked.unit,
          },
        };
      }
      return output;
    } catch (e: any) {
      console.error("[suggestItemMappingWithLLM]", e?.message ?? e);
      return {
        kind: "unsure" as const,
        reason: "Fin tạm thời không phản hồi — vui lòng chọn tay hoặc thử lại sau.",
      };
    }

  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText, stepCountIs } from "ai";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "@/lib/ai-gateway.server";
import { makeRunQueryTool, SCHEMA_HINT } from "@/lib/ai/tools/query.tool";
import { makeProposeActionTool } from "@/lib/ai/tools/propose-action.tool";
import { makeRenderChartTool } from "@/lib/ai/tools/chart.tool";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { parseFileCore } from "@/lib/ai/parse-document.functions";
import { buildBulkPlan } from "@/lib/ai/bulk-intake.server";
import { loadUploadAsBase64 } from "@/lib/ai/upload-fetch.server";
import { ACTION_HANDLERS } from "@/lib/ai/action-handlers.server";

const AttachmentSchema = z.object({
  name: z.string(),
  mime: z.string(),
  base64: z.string(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "auto"]).default("auto"),
});

const BulkRunItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  uploadId: z.string().nullable(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "auto"]),
  bucket: z.enum(["auto", "review", "ask"]),
});

const askInput = z.object({
  question: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
  /** Optional page context — route path + a short JSON snapshot of relevant ids. */
  pageContext: z.string().optional(),
  /** Files attached to the user message — parsed inline before the LLM runs. */
  attachments: z.array(AttachmentSchema).optional(),
  /** Bulk-run trigger: when present, server executes a previously-approved BulkPlan
   *  instead of going through the LLM. */
  bulkRun: z.object({ items: z.array(BulkRunItemSchema) }).optional(),
});

/** When ≥ this many files arrive in one message, switch to bulk intake mode. */
const BULK_THRESHOLD = 3;

export type AskStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: any }
  | { type: "tool-result"; toolCallId: string; output: any; isError?: boolean };

function truncateOutput(v: any, max = 4000): any {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s.length <= max) return v;
    return { _truncated: true, length: s.length, preview: s.slice(0, max) };
  } catch {
    return { _truncated: true, value: String(v).slice(0, max) };
  }
}

/**
 * Streaming server function. Yields incremental events to the client:
 *  - { type: "text", delta }
 *  - { type: "tool-call", toolCallId, toolName, input }
 *  - { type: "tool-result", toolCallId, output, isError? }
 */
export const askAccountingStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof askInput>) => askInput.parse(i))
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context as { supabase: any; userId: string };
    let abortSignal: AbortSignal | undefined;
    try {
      abortSignal = getRequest()?.signal;
    } catch {}

    let model: any;
    try {
      const r = await resolveActiveModel("chat", "google/gemini-3-flash-preview");
      model = r.model;
    } catch (e: any) {
      yield { type: "text", delta: `Lỗi: ${e?.message || "Không khởi tạo được AI model"}` } as AskStreamEvent;
      return;
    }

    // Personalization: load profile + active tenant + roles to give the AI
    // who-it-is-talking-to context.
    let userContextBlock = "";
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "display_name, email, job_title, language, timezone, date_format, number_format, accounting_standard, base_currency, active_tenant_id"
          )
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      const p: any = profileRes.data ?? {};
      const roles = (rolesRes.data ?? []).map((r: any) => r.role).join(", ") || "user";
      let tenantLine = "";
      if (p.active_tenant_id) {
        const { data: t } = await supabase
          .from("tenants")
          .select(
            "name, company_name, tax_id, address, industry_name, accounting_standard, base_currency, fiscal_year_start"
          )
          .eq("id", p.active_tenant_id)
          .maybeSingle();
        if (t) {
          tenantLine = [
            `- Doanh nghiệp: ${t.company_name || t.name}${t.tax_id ? ` (MST ${t.tax_id})` : ""}`,
            t.industry_name ? `- Ngành: ${t.industry_name}` : "",
            t.address ? `- Địa chỉ: ${t.address}` : "",
            `- Chế độ KT: ${t.accounting_standard} · Tiền tệ gốc: ${t.base_currency} · Năm tài chính bắt đầu tháng ${t.fiscal_year_start}`,
          ].filter(Boolean).join("\n");
        }
      }
      const today = new Date().toLocaleDateString("vi-VN", {
        timeZone: p.timezone || "Asia/Ho_Chi_Minh",
      });
      userContextBlock = [
        "## Hồ sơ người dùng (cá nhân hóa)",
        `- Tên: ${p.display_name || p.email || "Người dùng"}${p.job_title ? ` — ${p.job_title}` : ""}`,
        `- Email: ${p.email || "n/a"}`,
        `- Vai trò: ${roles}`,
        `- Ngôn ngữ: ${p.language || "vi"} · Múi giờ: ${p.timezone || "Asia/Ho_Chi_Minh"} · Hôm nay: ${today}`,
        `- Định dạng ngày: ${p.date_format || "dd/MM/yyyy"} · Số: ${p.number_format || "vi-VN"}`,
        tenantLine,
        "",
        "Hãy xưng hô thân thiện bằng tên người dùng khi phù hợp. Trả lời theo ngôn ngữ/múi giờ/định dạng trên. Mọi số liệu phải scope theo doanh nghiệp đang hoạt động ở trên.",
      ].filter(Boolean).join("\n");
    } catch {
      // Best-effort — không chặn chat nếu lookup lỗi.
    }

    // ----- Parse attachments INLINE before LLM, surfacing as tool-call events -----
    const parsedAttachments: Array<{ name: string; kind: string; parsed: any }> = [];
    if (data.attachments && data.attachments.length > 0) {
      for (const att of data.attachments) {
        const callId = `parse_${Math.random().toString(36).slice(2, 10)}`;
        yield {
          type: "tool-call",
          toolCallId: callId,
          toolName: "parseDocument",
          input: { filename: att.name, kind: att.kind, mime: att.mime },
        } as AskStreamEvent;
        try {
          const r = await parseFileCore({
            fileBase64: att.base64,
            mimeType: att.mime,
            filename: att.name,
            kind: att.kind,
            supabase,
            userId,
          });
          parsedAttachments.push({ name: att.name, kind: att.kind, parsed: r.parsed });
          const t = (r as any).timings ?? {};
          const phases = [
            { name: "ocr", label: "OCR & đọc nội dung", ms: t.parserMs ?? null },
            { name: "extract", label: "Trích xuất trường thông tin", ms: t.structurerMs ?? null },
            { name: "partner_match", label: "Khớp đối tác với danh bạ", ms: null },
            { name: "rules_check", label: "Đối chiếu với quy tắc trong Trí nhớ AI", ms: null },
          ];
          yield {
            type: "tool-result",
            toolCallId: callId,
            output: truncateOutput(
              {
                filename: att.name,
                kind: (r as any).kind ?? att.kind,
                uploadId: (r as any).uploadId ?? null,
                parsed: r.parsed,
                parser: (r as any).parser ?? null,
                cached: (r as any).cached ?? false,
                phases,
              },
              16000,
            ),
          } as AskStreamEvent;
        } catch (e: any) {
          yield {
            type: "tool-result",
            toolCallId: callId,
            output: { error: e?.message || "parse error", filename: att.name },
            isError: true,
          } as AskStreamEvent;
        }
        if (abortSignal?.aborted) return;
      }
    }

    const attachmentBlock = parsedAttachments.length
      ? "\n\n## Chứng từ vừa đính kèm (đã trích xuất)\n" +
        parsedAttachments
          .map(
            (a, i) =>
              `### ${i + 1}. ${a.name} (${a.kind})\n\`\`\`json\n${JSON.stringify(a.parsed, null, 2)}\n\`\`\``,
          )
          .join("\n\n") +
        "\n\nNếu là **purchase_invoice** và dữ liệu trông hợp lý: hãy tóm tắt ngắn (NCC, số HĐ, ngày, tổng) rồi gọi ngay `proposeAction` với `tool_name='createPurchaseInvoice'` và `input` đã map sẵn (lines: description/qty/unit_price/amount/vat_rate). Nếu là **bank_statement**: tóm tắt số giao dịch + tổng thu/chi và đề nghị user chọn TK để import. Nếu là **cash_voucher**: gọi `proposeAction` createBankVoucher hoặc thông báo cần thêm thông tin."
      : "";

    const systemParts = [
      SYSTEM_PROMPT,
      userContextBlock,
      SCHEMA_HINT,
      data.pageContext ? `\n## Ngữ cảnh trang hiện tại\n${data.pageContext}` : "",
    ].filter(Boolean);

    const result = streamText({
      model,
      tools: {
        runQuery: makeRunQueryTool(supabase, userId),
        proposeAction: makeProposeActionTool(supabase, userId),
        renderChart: makeRenderChartTool(),
      },
      stopWhen: stepCountIs(50),
      system: systemParts.join("\n\n"),
      messages: [
        ...((data.history ?? []).map((m) => ({ role: m.role, content: m.content }))),
        { role: "user" as const, content: data.question + attachmentBlock },
      ],
      abortSignal,
    });

    try {
      for await (const part of result.fullStream) {
        if (abortSignal?.aborted) break;
        switch (part.type) {
          case "text-delta": {
            const delta = (part as any).text ?? (part as any).textDelta ?? "";
            if (delta) yield { type: "text", delta } as AskStreamEvent;
            break;
          }
          case "tool-call":
            yield {
              type: "tool-call",
              toolCallId: (part as any).toolCallId,
              toolName: (part as any).toolName,
              input: (part as any).input ?? (part as any).args,
            } as AskStreamEvent;
            break;
          case "tool-result": {
            const output = (part as any).output ?? (part as any).result;
            const isError =
              output && typeof output === "object" && "error" in output ? true : false;
            const toolName = (part as any).toolName as string | undefined;
            const cap =
              toolName === "renderChart"
                ? 64000
                : toolName === "parseDocument" || toolName === "proposeAction"
                  ? 16000
                  : 4000;
            yield {
              type: "tool-result",
              toolCallId: (part as any).toolCallId,
              output: truncateOutput(output, cap),
              isError,
            } as AskStreamEvent;
            break;
          }
          case "error": {
            const msg = (part as any).error?.message ?? String((part as any).error ?? "stream error");
            yield { type: "text", delta: `\n\n[Lỗi: ${msg}]` } as AskStreamEvent;
            break;
          }
          default:
            break;
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError" || abortSignal?.aborted) return;
      yield { type: "text", delta: `\n\n[Lỗi: ${e?.message ?? "stream error"}]` } as AskStreamEvent;
    }
  });

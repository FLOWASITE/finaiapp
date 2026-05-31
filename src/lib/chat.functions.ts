import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText, stepCountIs } from "ai";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel, resolveAgentModel } from "@/lib/ai-gateway.server";
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
  base64: z.string().optional(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "auto"]).default("auto"),
  uploadId: z.string().uuid().nullable().optional(),
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
  /** Conversation mode. "accounting" (default) enables tools + accounting context;
   *  "ai" is a plain LLM chat without any internal tool registry. */
  mode: z.enum(["accounting", "ai"]).optional(),
});


/** When ≥ this many files arrive in one message, switch to bulk intake mode. */
const BULK_THRESHOLD = 3;

export type AskStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: any }
  | { type: "tool-progress"; toolCallId: string; phase: { name: string; status: "start" | "done"; ms?: number | null } }
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

    let hydratedAttachments: Array<{
      name: string;
      mime: string;
      base64: string;
      kind: "purchase_invoice" | "bank_statement" | "cash_voucher" | "auto";
      uploadId?: string | null;
    }> | null = null;
    const getHydratedAttachments = async () => {
      if (hydratedAttachments) return hydratedAttachments;
      hydratedAttachments = [];
      for (const att of data.attachments ?? []) {
        if (att.base64) {
          hydratedAttachments.push({ ...att, base64: att.base64 });
          continue;
        }
        if (!att.uploadId) throw new Error(`Mất nội dung file ${att.name}`);
        const loaded = await loadUploadAsBase64(supabase, userId, att.uploadId);
        if (!loaded?.base64) throw new Error(`Không đọc lại được file ${att.name}`);
        hydratedAttachments.push({
          ...att,
          base64: loaded.base64,
          mime: att.mime || loaded.mime,
          name: att.name || loaded.filename,
          kind: att.kind,
        });
      }
      return hydratedAttachments;
    };

    // ===== BRANCH A: Bulk intake (≥ N attachments in one message) =====
    // Skip LLM entirely. Build a BulkPlan and yield ONE summary event +
    // a deterministic 3-paragraph text. The UI gates execution behind
    // a "Chạy kế hoạch" button.
    if (data.attachments && data.attachments.length >= BULK_THRESHOLD && !data.bulkRun) {
      const callId = `bulk_${Math.random().toString(36).slice(2, 10)}`;
      yield {
        type: "tool-call",
        toolCallId: callId,
        toolName: "bulkIntake",
        input: { fileCount: data.attachments.length },
      } as AskStreamEvent;

      try {
        const attachments = await getHydratedAttachments();
        const plan = await buildBulkPlan({
          supabase,
          userId,
          attachments,
        });

        yield {
          type: "tool-result",
          toolCallId: callId,
          output: truncateOutput(plan, 32000),
        } as AskStreamEvent;

        // Build deterministic 3-paragraph reply.
        const auto = plan.items.filter((i) => i.bucket === "auto");
        const review = plan.items.filter((i) => i.bucket === "review");
        const ask = plan.items.filter((i) => i.bucket === "ask");
        const dupCount = plan.duplicates.length;
        const askFirst = ask[0];

        const para1 = `Nhận đủ **${data.attachments.length} files**${dupCount ? `, đã bỏ ${dupCount} file trùng` : ""}. Đã phân loại xong — xem bảng phía trên.`;
        const para2 = `Đây là kế hoạch của tôi cho **${plan.items.length} mục** — sếp duyệt thì tôi chạy: **${auto.length}** mục tự hạch toán, **${review.length}** mục cần xem lại, **${ask.length}** mục cần hỏi sếp.`;
        const para3 = askFirst
          ? `\n\nTrước khi chạy, sếp giúp tôi xác nhận **${askFirst.filename}**: ${askFirst.reason ?? "tôi chưa chắc về file này"}. Sếp có thể bỏ qua, đánh dấu là loại khác, hoặc gửi lại file rõ hơn.`
          : "";

        yield { type: "text", delta: `${para1}\n\n${para2}${para3}` } as AskStreamEvent;
      } catch (e: any) {
        yield {
          type: "tool-result",
          toolCallId: callId,
          output: { error: e?.message || "bulk intake error" },
          isError: true,
        } as AskStreamEvent;
        yield {
          type: "text",
          delta: `Lỗi khi phân loại file: ${e?.message ?? "unknown"}`,
        } as AskStreamEvent;
      }
      return;
    }

    // ===== BRANCH B: Bulk run (executes a previously approved BulkPlan) =====
    if (data.bulkRun && data.bulkRun.items.length > 0) {
      yield* runBulkPlanStream({
        supabase,
        userId,
        items: data.bulkRun.items,
        abortSignal,
      });
      return;
    }



    let model: any;
    let temperature: number | null = null;
    let maxOutputTokens: number | null = null;
    try {
      const r = await resolveAgentModel("chat", "google/gemini-3-flash-preview");
      model = r.model;
      temperature = r.temperature;
      maxOutputTokens = r.maxOutputTokens;
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
        // Xác thực user là thành viên active của tenant trước khi đọc dữ liệu tenant
        const { data: mem } = await supabase
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", p.active_tenant_id)
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle();
        if (mem) {
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

    // Bối cảnh doanh nghiệp do user tự nhập (ai_memory_context) — AI đọc trước khi suy luận.
    let memoryContextBlock = "";
    try {
      const { data: ctxRows } = await supabase
        .from("ai_memory_context")
        .select("category,label,value_text,order_index")
        .order("category", { ascending: true })
        .order("order_index", { ascending: true });
      if (ctxRows && ctxRows.length > 0) {
        const CATEGORY_LABEL: Record<string, string> = {
          org: "Tổ chức",
          accounting: "Kế toán",
          tax: "Thuế",
          revenue: "Doanh thu",
          banking: "Ngân hàng",
          departments: "Phòng ban",
          business_model: "Mô hình KD",
          einvoice: "HĐ điện tử",
          other: "Khác",
        };
        const grouped = new Map<string, Array<{ label: string; value_text: string }>>();
        for (const r of ctxRows as Array<{ category: string; label: string; value_text: string }>) {
          const arr = grouped.get(r.category) ?? [];
          arr.push({ label: r.label, value_text: r.value_text });
          grouped.set(r.category, arr);
        }
        const parts: string[] = ["## Bối cảnh doanh nghiệp (user tự khai báo — ưu tiên cao)"];
        for (const [cat, items] of grouped.entries()) {
          parts.push(`\n### ${CATEGORY_LABEL[cat] ?? cat}`);
          for (const it of items) parts.push(`- **${it.label}**: ${it.value_text}`);
        }
        parts.push(
          "\nKhi user hỏi/nhập liệu, BẮT BUỘC tuân thủ các quy tắc bối cảnh trên. Nếu mâu thuẫn với mặc định của bạn, ưu tiên bối cảnh user.",
        );
        memoryContextBlock = parts.join("\n");
      }
    } catch {
      // Best-effort.
    }


    // ----- Parse attachments INLINE before LLM, surfacing as tool-call events -----
    const parsedAttachments: Array<{ name: string; kind: string; parsed: any }> = [];
    if (data.attachments && data.attachments.length > 0) {
      const attachments = await getHydratedAttachments();
      for (const att of attachments) {
        const callId = `parse_${Math.random().toString(36).slice(2, 10)}`;
        yield {
          type: "tool-call",
          toolCallId: callId,
          toolName: "parseDocument",
          input: { filename: att.name, kind: att.kind, mime: att.mime },
        } as AskStreamEvent;

        // Phase event queue: parseFileCore.onPhase() pushes here, this loop
        // drains and yields them as `tool-progress` events to the client.
        const phaseQueue: Array<{ name: string; status: "start" | "done"; ms?: number | null }> = [];
        let phaseResolve: (() => void) | null = null;
        let finished: { ok?: any; err?: any } | null = null as { ok?: any; err?: any } | null;

        const parsePromise = parseFileCore({
          fileBase64: att.base64,
          mimeType: att.mime,
          filename: att.name,
          kind: att.kind,
          supabase,
          userId,
          onPhase: (p) => {
            phaseQueue.push(p);
            phaseResolve?.();
            phaseResolve = null;
          },
        })
          .then((r) => {
            finished = { ok: r };
            phaseResolve?.();
            phaseResolve = null;
          })
          .catch((e) => {
            finished = { err: e };
            phaseResolve?.();
            phaseResolve = null;
          });

        // Drain phase events until parse settles
        while (!finished || phaseQueue.length > 0) {
          while (phaseQueue.length > 0) {
            const phase = phaseQueue.shift()!;
            yield {
              type: "tool-progress",
              toolCallId: callId,
              phase,
            } as AskStreamEvent;
          }
          if (!finished) {
            await new Promise<void>((res) => {
              phaseResolve = res;
            });
          }
        }
        await parsePromise; // ensure settled
        const settled = finished as { ok?: any; err?: any };

        if (settled.err) {
          yield {
            type: "tool-result",
            toolCallId: callId,
            output: { error: settled.err?.message || "parse error", filename: att.name },
            isError: true,
          } as AskStreamEvent;
        } else {
          const r = settled.ok;
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
      memoryContextBlock,
      SCHEMA_HINT,
      data.pageContext ? `\n## Ngữ cảnh trang hiện tại\n${data.pageContext}` : "",
    ].filter(Boolean);


    const isAiMode = data.mode === "ai";
    const result = streamText({
      model,
      ...(temperature != null ? { temperature } : {}),
      ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
      ...(isAiMode
        ? {}
        : {
            tools: {
              runQuery: makeRunQueryTool(supabase, userId),
              proposeAction: makeProposeActionTool(supabase, userId),
              renderChart: makeRenderChartTool(),
            },
            stopWhen: stepCountIs(50),
          }),
      system: isAiMode
        ? "Bạn là Fin — trợ lý AI hội thoại đa năng. Trả lời tự nhiên, ngắn gọn, bằng tiếng Việt. Không truy vấn dữ liệu doanh nghiệp ở chế độ này."
        : systemParts.join("\n\n"),
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

// ===== Bulk plan executor (no LLM) =====

type BulkRunItem = z.infer<typeof BulkRunItemSchema>;

async function* runBulkPlanStream(opts: {
  supabase: any;
  userId: string;
  items: BulkRunItem[];
  abortSignal?: AbortSignal;
}): AsyncGenerator<AskStreamEvent, void, unknown> {
  const { supabase, userId, items, abortSignal } = opts;
  const autoItems = items.filter((it) => it.bucket === "auto");
  const reviewItems = items.filter((it) => it.bucket === "review");

  const total = autoItems.length + reviewItems.length;
  const callId = `bulkrun_${Math.random().toString(36).slice(2, 10)}`;

  yield {
    type: "tool-call",
    toolCallId: callId,
    toolName: "bulkRun",
    input: { total },
  } as AskStreamEvent;

  let done = 0;
  let posted = 0;
  let failed = 0;
  const recent: { filename: string; status: "ok" | "fail" | "review"; message?: string }[] = [];
  const postedItems: { filename: string; refTable?: string; refId?: string }[] = [];
  const startedAt = Date.now();

  const pushUpdate = (finished = false) => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const perItem = done > 0 ? elapsed / done : 12;
    const etaSec = finished ? 0 : Math.max(0, Math.round((total - done) * perItem));
    return {
      type: "tool-result",
      toolCallId: callId,
      output: {
        total,
        done,
        posted,
        failed,
        recent: recent.slice(-5),
        etaSec,
        finished,
      },
    } as AskStreamEvent;
  };

  for (const item of [...autoItems, ...reviewItems]) {
    if (abortSignal?.aborted) break;

    let parsed: any = null;
    let parseKind: string = item.kind;
    let parseErr: string | null = null;

    if (item.uploadId) {
      try {
        const loaded = await loadUploadAsBase64(supabase, userId, item.uploadId);
        if (!loaded) throw new Error("Không tải được file gốc");
        const r = await parseFileCore({
          fileBase64: loaded.base64,
          mimeType: loaded.mime,
          filename: loaded.filename,
          kind: item.kind as any,
          supabase,
          userId,
        });
        parsed = r.parsed;
        parseKind = (r as any).kind ?? item.kind;
      } catch (e: any) {
        parseErr = e?.message ?? "parse error";
      }
    } else {
      parseErr = "Không có upload id";
    }

    if (parseErr) {
      failed++;
      recent.push({ filename: item.filename, status: "fail", message: parseErr });
      done++;
      yield pushUpdate();
      continue;
    }

    // For "auto" bucket + recognized invoice → auto-create + execute
    if (item.bucket === "auto" && parseKind === "purchase_invoice" && parsed) {
      const handler = ACTION_HANDLERS.createPurchaseInvoice;
      try {
        const lines = (parsed.lines ?? []).map((l: any) => ({
          description: l.description ?? "Hàng hoá / dịch vụ",
          qty: Number(l.qty ?? 1) || 1,
          unit_price: Number(l.unit_price ?? l.amount ?? 0) || 0,
          amount: Number(l.amount ?? 0) || 0,
          vat_rate: Number(l.vat_rate ?? 0) || 0,
        }));
        if (!lines.length) {
          const total = Number(parsed.subtotal ?? parsed.total ?? 0);
          lines.push({
            description: "Hàng hoá / dịch vụ",
            qty: 1,
            unit_price: total,
            amount: total,
            vat_rate: 0,
          });
        }
        const input = handler.schema.parse({
          supplier_name: parsed.vendor_name ?? undefined,
          supplier_tax_id: parsed.vendor_tax_id ?? undefined,
          invoice_no: parsed.invoice_no ?? undefined,
          issue_date: parsed.issue_date ?? new Date().toISOString().slice(0, 10),
          notes: parsed.notes ?? undefined,
          lines,
        });
        const summary = await handler.preview(input, { supabase, userId });

        const { data: row, error: insErr } = await supabase
          .from("ai_actions")
          .insert({
            user_id: userId,
            tool_name: "createPurchaseInvoice",
            input,
            summary,
            status: "approved",
            approved_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);

        const result = await handler.execute(input, { supabase, userId });
        await supabase
          .from("ai_actions")
          .update({
            status: "executed",
            executed_at: new Date().toISOString(),
            result: result as any,
            result_ref_table: result.ref_table ?? null,
            result_ref_id: result.ref_id ?? null,
          })
          .eq("id", row.id);

        posted++;
        postedItems.push({
          filename: item.filename,
          refTable: result.ref_table,
          refId: result.ref_id,
        });
        recent.push({ filename: item.filename, status: "ok" });
      } catch (e: any) {
        failed++;
        recent.push({ filename: item.filename, status: "fail", message: e?.message ?? "post error" });
      }
    } else if (item.bucket === "review" && parseKind === "purchase_invoice" && parsed) {
      // Create a pending ai_action so user can review later.
      try {
        const handler = ACTION_HANDLERS.createPurchaseInvoice;
        const lines = (parsed.lines ?? []).map((l: any) => ({
          description: l.description ?? "Hàng hoá / dịch vụ",
          qty: Number(l.qty ?? 1) || 1,
          unit_price: Number(l.unit_price ?? l.amount ?? 0) || 0,
          amount: Number(l.amount ?? 0) || 0,
          vat_rate: Number(l.vat_rate ?? 0) || 0,
        }));
        if (lines.length) {
          const input = handler.schema.parse({
            supplier_name: parsed.vendor_name ?? undefined,
            supplier_tax_id: parsed.vendor_tax_id ?? undefined,
            invoice_no: parsed.invoice_no ?? undefined,
            issue_date: parsed.issue_date ?? new Date().toISOString().slice(0, 10),
            notes: parsed.notes ?? undefined,
            lines,
          });
          const summary = await handler.preview(input, { supabase, userId });
          await supabase.from("ai_actions").insert({
            user_id: userId,
            tool_name: "createPurchaseInvoice",
            input,
            summary,
            status: "pending",
          });
        }
        recent.push({ filename: item.filename, status: "review" });
      } catch (e: any) {
        failed++;
        recent.push({ filename: item.filename, status: "fail", message: e?.message ?? "review error" });
      }
    } else {
      // Bank statements + others: leave for dedicated flow, just mark reviewed
      recent.push({ filename: item.filename, status: "review", message: "Cần xử lý riêng" });
    }

    done++;
    yield pushUpdate();
  }

  // Final summary event
  const summaryCallId = `bulksum_${Math.random().toString(36).slice(2, 10)}`;
  yield {
    type: "tool-call",
    toolCallId: summaryCallId,
    toolName: "bulkSummary",
    input: {},
  } as AskStreamEvent;
  yield {
    type: "tool-result",
    toolCallId: summaryCallId,
    output: {
      posted,
      review: reviewItems.length,
      ask: 0,
      postedItems,
    },
  } as AskStreamEvent;

  yield {
    type: "text",
    delta: `Xong rồi sếp.\n\n- **${posted}** mục đã ghi sổ\n- **${reviewItems.length}** mục chờ sếp ở "Cần xem lại"${failed ? `\n- ${failed} mục lỗi` : ""}`,
  } as AskStreamEvent;
}


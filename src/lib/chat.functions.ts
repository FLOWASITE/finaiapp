import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText, stepCountIs } from "ai";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "@/lib/ai-gateway.server";
import { makeRunQueryTool, SCHEMA_HINT } from "@/lib/ai/tools/query.tool";
import { makeProposeActionTool } from "@/lib/ai/tools/propose-action.tool";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

const askInput = z.object({
  question: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional(),
  /** Optional page context — route path + a short JSON snapshot of relevant ids. */
  pageContext: z.string().optional(),
});

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

    const systemParts = [
      SYSTEM_PROMPT,
      SCHEMA_HINT,
      data.pageContext ? `\n## Ngữ cảnh trang hiện tại\n${data.pageContext}` : "",
    ].filter(Boolean);

    const result = streamText({
      model,
      tools: {
        runQuery: makeRunQueryTool(supabase, userId),
        proposeAction: makeProposeActionTool(supabase, userId),
      },
      stopWhen: stepCountIs(50),
      system: systemParts.join("\n\n"),
      messages: [
        ...((data.history ?? []).map((m) => ({ role: m.role, content: m.content }))),
        { role: "user" as const, content: data.question },
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
            yield {
              type: "tool-result",
              toolCallId: (part as any).toolCallId,
              output: truncateOutput(output),
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

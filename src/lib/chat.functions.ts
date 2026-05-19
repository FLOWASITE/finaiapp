import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText, stepCountIs } from "ai";
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

/**
 * Streaming server function. Yields incremental text deltas to the client.
 * Use with `for await (const chunk of await askAccountingStream({...}))`.
 */
export const askAccountingStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof askInput>) => askInput.parse(i))
  .handler(async function* ({ data, context }) {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      yield { delta: "Lỗi: Thiếu LOVABLE_API_KEY trên server." };
      return;
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

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
    });

    try {
      for await (const delta of result.textStream) {
        if (delta) yield { delta };
      }
    } catch (e: any) {
      yield { delta: `\n\n[Lỗi: ${e?.message ?? "stream error"}]` };
    }
  });

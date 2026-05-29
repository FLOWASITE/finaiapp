import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveDocumentUrl } from "./document-url.server";

/**
 * getDocumentUrl(docId) — trả signed URL (mặc định 5 phút) cho file gốc của
 * document. Tự gunzip nếu file đã nén, tự đọc từ bucket archive nếu cần.
 */
export const getDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        docId: z.string().uuid(),
        expiresIn: z.number().int().min(30).max(3600).default(300),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    return resolveDocumentUrl(
      context.supabase,
      context.userId,
      data.docId,
      data.expiresIn,
    );
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiSidebarCounts = {
  inbox: number;
  review: number;
  documents: number;
  taxDaysLeft: number | null;
  alerts: number;
};

function nextGtgtDeadlineDays(today = new Date()): number {
  // Khai GTGT theo tháng: hạn nộp là ngày 20 của tháng kế tiếp.
  // Trả số ngày từ hôm nay tới hạn gần nhất (>= 0).
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  let deadline = new Date(Date.UTC(y, m + 1, 20));
  if (today.getUTCDate() > 20 && today.getUTCMonth() === m) {
    // qua hạn tháng này → đã tính tháng sau (deadline đúng rồi)
  }
  if (deadline.getTime() < today.getTime()) {
    deadline = new Date(Date.UTC(y, m + 2, 20));
  }
  const ms = deadline.getTime() - today.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

async function safeCount(
  promise: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await promise;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export const getAiSidebarCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSidebarCounts> => {
    const { supabase } = context;

    const [inbox, review, documents, alerts] = await Promise.all([
      // Inbox AI: tài liệu đã OCR xong, chưa được gắn vào hoá đơn nào
      safeCount(
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("ocr_status", "done")
          .is("invoice_id", null)
          .is("sales_invoice_id", null),
      ),
      // Cần xem lại: OCR failed hoặc chưa review
      safeCount(
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .in("ocr_status", ["failed", "processing"]),
      ),
      // Tổng số tài liệu
      safeCount(
        supabase.from("documents").select("id", { count: "exact", head: true }),
      ),
      // Cảnh báo: ai_insights chưa dismiss
      safeCount(
        supabase
          .from("ai_insights")
          .select("id", { count: "exact", head: true })
          .is("dismissed_at", null),
      ),
    ]);

    return {
      inbox,
      review,
      documents,
      alerts,
      taxDaysLeft: nextGtgtDeadlineDays(),
    };
  });

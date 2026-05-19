/**
 * Pure logic for building & posting a daily digest message into a user's
 * "Daily Digest" chat thread. Server-only (no React, no client client).
 *
 * Used by:
 *  - src/lib/digest-prefs.functions.ts (sendDigestNow — uses user-scoped supabase)
 *  - src/routes/api/public/hooks/daily-digest.ts (cron — uses supabaseAdmin)
 */

type AnyClient = {
  from: (table: string) => any;
};

const DIGEST_TITLE = "📅 Daily Digest";
const DIGEST_KIND = "digest";

function fmtVND(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function todayVN(): string {
  // YYYY-MM-DD in Asia/Ho_Chi_Minh
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function yesterdayVN(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - 1);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(t);
}

export async function generateAndPostDigest(opts: {
  userId: string;
  tenantId: string;
  supabase: AnyClient;
  force?: boolean;
}): Promise<{ thread_id: string; message_id: string }> {
  const { userId, tenantId, supabase, force } = opts;
  const today = todayVN();
  const yday = yesterdayVN();

  // 1) Pull insights (top 5)
  const { data: insights } = await supabase
    .from("ai_insights")
    .select("severity,title,body,action_url")
    .eq("tenant_id", tenantId)
    .is("dismissed_at", null)
    .order("severity", { ascending: true })
    .limit(5);

  // 2) KPIs yesterday
  const [revRes, recvRes, payRes, invRes] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select("total")
      .eq("tenant_id", tenantId)
      .neq("status", "void")
      .gte("issue_date", yday)
      .lte("issue_date", yday),
    supabase
      .from("customer_receipts")
      .select("amount")
      .eq("tenant_id", tenantId)
      .gte("pay_date", yday)
      .lte("pay_date", yday),
    supabase
      .from("supplier_payments")
      .select("amount")
      .eq("tenant_id", tenantId)
      .gte("pay_date", yday)
      .lte("pay_date", yday),
    supabase
      .from("invoices")
      .select("total")
      .eq("tenant_id", tenantId)
      .neq("status", "void")
      .gte("issue_date", yday)
      .lte("issue_date", yday),
  ]);

  const revenue = (revRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
  const revenueCount = (revRes.data ?? []).length;
  const collected = (recvRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const paid = (payRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const purchase = (invRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
  const purchaseCount = (invRes.data ?? []).length;

  // 3) Inbox pending — documents uploaded/ai_read awaiting review
  const { count: inboxPending } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["uploaded", "ai_read"]);

  // 4) Build markdown
  const ydayDisplay = new Date(yday).toLocaleDateString("vi-VN");
  const todayDisplay = new Date(today).toLocaleDateString("vi-VN");
  const lines: string[] = [];
  lines.push(`## 📅 Tóm tắt ngày ${todayDisplay}`);
  lines.push("");
  lines.push(`### 📊 KPI hôm qua (${ydayDisplay})`);
  lines.push(`- 💰 **Doanh thu**: ${fmtVND(revenue)} ₫ (${revenueCount} hoá đơn bán)`);
  lines.push(`- 🛒 **Mua hàng**: ${fmtVND(purchase)} ₫ (${purchaseCount} hoá đơn mua)`);
  lines.push(`- ⬇️ **Thu**: ${fmtVND(collected)} ₫`);
  lines.push(`- ⬆️ **Chi**: ${fmtVND(paid)} ₫`);
  lines.push("");

  if ((insights ?? []).length > 0) {
    lines.push(`### ⚠️ Cảnh báo`);
    for (const it of insights!) {
      const icon = it.severity === "critical" ? "🔴" : it.severity === "warn" ? "🟠" : "ℹ️";
      lines.push(`- ${icon} **${it.title}**${it.body ? ` — ${it.body}` : ""}${it.action_url ? ` ([xem](${it.action_url}))` : ""}`);
    }
    lines.push("");
  }

  if ((inboxPending ?? 0) > 0) {
    lines.push(`### 📥 Inbox`);
    lines.push(`- Có **${inboxPending}** chứng từ chờ xử lý → [Mở Inbox](/inbox)`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`_Bạn có thể tắt/đổi giờ gửi trong **Cài đặt → Tóm tắt hàng ngày**._`);
  const content = lines.join("\n");

  // 5) Find or create the digest thread (one per user/tenant)
  let threadId: string | null = null;
  const { data: existing } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("kind", DIGEST_KIND)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    threadId = existing.id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from("chat_threads")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        title: DIGEST_TITLE,
        kind: DIGEST_KIND,
        pinned_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (cErr) throw new Error(`create thread: ${cErr.message}`);
    threadId = created.id;
  }

  // 6) Insert assistant message
  const { data: msg, error: mErr } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId!,
      tenant_id: tenantId,
      user_id: userId,
      role: "assistant",
      content,
      metadata: { kind: "daily_digest", date: today, force: !!force },
    })
    .select("id")
    .single();
  if (mErr) throw new Error(`insert message: ${mErr.message}`);

  // 7) Bump thread timestamp + mark sent
  await supabase
    .from("chat_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId!);

  await supabase
    .from("user_digest_prefs")
    .upsert(
      { user_id: userId, tenant_id: tenantId, last_sent_date: today },
      { onConflict: "user_id,tenant_id" },
    );

  return { thread_id: threadId!, message_id: msg.id };
}

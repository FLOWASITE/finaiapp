/**
 * Pure logic for building & posting a daily digest message into a user's
 * "Daily Digest" chat thread. Server-only (no React, no client client).
 */

type AnyClient = {
  from: (table: string) => any;
};

export type DigestTemplate = "short" | "standard" | "detailed";

const DIGEST_TITLE = "📅 Daily Digest";
const DIGEST_KIND = "digest";

function fmtVND(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function todayVN(): string {
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

function topN<T>(arr: T[], n: number, keyFn: (t: T) => string, valFn: (t: T) => number) {
  const map = new Map<string, number>();
  for (const it of arr) {
    const k = keyFn(it);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + valFn(it));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export async function generateAndPostDigest(opts: {
  userId: string;
  tenantId: string;
  supabase: AnyClient;
  force?: boolean;
  template?: DigestTemplate;
}): Promise<{ thread_id: string; message_id: string }> {
  const { userId, tenantId, supabase, force } = opts;
  const template: DigestTemplate = opts.template ?? "standard";
  const today = todayVN();
  const yday = yesterdayVN();

  // Pull insights (top 5 / top 10 for detailed)
  const insightLimit = template === "detailed" ? 10 : 5;
  const { data: insights } = await supabase
    .from("ai_insights")
    .select("severity,title,body,action_url")
    .eq("tenant_id", tenantId)
    .is("dismissed_at", null)
    .order("severity", { ascending: true })
    .limit(insightLimit);

  // KPIs yesterday
  const [revRes, recvRes, payRes, invRes] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select("total,customer_id")
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
      .select("amount,supplier_id")
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

  const revRows = (revRes.data ?? []) as any[];
  const payRows = (payRes.data ?? []) as any[];
  const revenue = revRows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const revenueCount = revRows.length;
  const collected = (recvRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const paid = payRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const purchase = (invRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
  const purchaseCount = (invRes.data ?? []).length;

  // Inbox pending
  const { count: inboxPending } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["uploaded", "ai_read"]);

  // Detailed-only enrichments
  let topCustomers: Array<[string, number]> = [];
  let topSuppliers: Array<[string, number]> = [];
  let arTotal = 0;
  let apTotal = 0;
  let custNames = new Map<string, string>();
  let supNames = new Map<string, string>();
  if (template === "detailed") {
    topCustomers = topN(revRows, 3, (r) => String(r.customer_id ?? ""), (r) => Number(r.total ?? 0));
    topSuppliers = topN(payRows, 3, (r) => String(r.supplier_id ?? ""), (r) => Number(r.amount ?? 0));

    // Resolve names
    const custIds = topCustomers.map(([id]) => id).filter(Boolean);
    const supIds = topSuppliers.map(([id]) => id).filter(Boolean);
    const [custRes, supRes, arRes, apRes] = await Promise.all([
      custIds.length
        ? supabase.from("customers").select("id,name").in("id", custIds)
        : Promise.resolve({ data: [] }),
      supIds.length
        ? supabase.from("suppliers").select("id,name").in("id", supIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("sales_invoices")
        .select("total,paid_amount")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .in("payment_status", ["unpaid", "partial", "overdue"]),
      supabase
        .from("invoices")
        .select("total,paid_amount")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .in("payment_status", ["unpaid", "partial"]),
    ]);
    for (const c of (custRes.data ?? []) as any[]) custNames.set(c.id, c.name);
    for (const s of (supRes.data ?? []) as any[]) supNames.set(s.id, s.name);
    arTotal = ((arRes.data ?? []) as any[]).reduce(
      (s, r) => s + Math.max(0, Number(r.total ?? 0) - Number(r.paid_amount ?? 0)),
      0,
    );
    apTotal = ((apRes.data ?? []) as any[]).reduce(
      (s, r) => s + Math.max(0, Number(r.total ?? 0) - Number(r.paid_amount ?? 0)),
      0,
    );
  }

  // Build markdown
  const ydayDisplay = new Date(yday).toLocaleDateString("vi-VN");
  const todayDisplay = new Date(today).toLocaleDateString("vi-VN");
  const lines: string[] = [];

  if (template === "short") {
    lines.push(`**📅 ${todayDisplay}** — Doanh thu ${ydayDisplay}: **${fmtVND(revenue)} ₫** (${revenueCount} HĐ)`);
    const bits: string[] = [];
    if ((insights ?? []).length > 0) bits.push(`⚠️ ${insights!.length} cảnh báo`);
    if ((inboxPending ?? 0) > 0) bits.push(`📥 ${inboxPending} chứng từ chờ`);
    if (bits.length) lines.push(bits.join(" · "));
  } else {
    lines.push(`## 📅 Tóm tắt ngày ${todayDisplay}`);
    lines.push("");
    lines.push(`### 📊 KPI hôm qua (${ydayDisplay})`);
    lines.push(`- 💰 **Doanh thu**: ${fmtVND(revenue)} ₫ (${revenueCount} hoá đơn bán)`);
    lines.push(`- 🛒 **Mua hàng**: ${fmtVND(purchase)} ₫ (${purchaseCount} hoá đơn mua)`);
    lines.push(`- ⬇️ **Thu**: ${fmtVND(collected)} ₫`);
    lines.push(`- ⬆️ **Chi**: ${fmtVND(paid)} ₫`);
    lines.push("");

    if (template === "detailed") {
      if (topCustomers.length > 0) {
        lines.push(`### 🏆 Top khách hàng (doanh thu hôm qua)`);
        for (const [id, v] of topCustomers) {
          lines.push(`- ${custNames.get(id) ?? id.slice(0, 8)}: **${fmtVND(v)} ₫**`);
        }
        lines.push("");
      }
      if (topSuppliers.length > 0) {
        lines.push(`### 🏭 Top nhà cung cấp (chi hôm qua)`);
        for (const [id, v] of topSuppliers) {
          lines.push(`- ${supNames.get(id) ?? id.slice(0, 8)}: **${fmtVND(v)} ₫**`);
        }
        lines.push("");
      }
      lines.push(`### 💳 Công nợ hiện tại`);
      lines.push(`- AR (phải thu): **${fmtVND(arTotal)} ₫**`);
      lines.push(`- AP (phải trả): **${fmtVND(apTotal)} ₫**`);
      lines.push("");
    }

    if ((insights ?? []).length > 0) {
      lines.push(`### ⚠️ Cảnh báo`);
      for (const it of insights!) {
        const icon = it.severity === "critical" ? "🔴" : it.severity === "warn" ? "🟠" : "ℹ️";
        const body = template === "detailed" && it.body ? ` — ${it.body}` : "";
        lines.push(`- ${icon} **${it.title}**${body}${it.action_url ? ` ([xem](${it.action_url}))` : ""}`);
      }
      lines.push("");
    }

    if ((inboxPending ?? 0) > 0) {
      lines.push(`### 📥 Inbox`);
      lines.push(`- Có **${inboxPending}** chứng từ chờ xử lý → [Mở Inbox](/inbox)`);
      lines.push("");
    }

    lines.push(`---`);
    lines.push(`_Bạn có thể tắt/đổi giờ gửi & mẫu trong **Cài đặt → Tóm tắt hàng ngày**._`);
  }

  const content = lines.join("\n");

  // Find or create the digest thread
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

  // Insert assistant message
  const { data: msg, error: mErr } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId!,
      tenant_id: tenantId,
      user_id: userId,
      role: "assistant",
      content,
      metadata: { kind: "daily_digest", date: today, force: !!force, template },
    })
    .select("id")
    .single();
  if (mErr) throw new Error(`insert message: ${mErr.message}`);

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

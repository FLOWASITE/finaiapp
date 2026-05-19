import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InboxRow = {
  id: string;
  ref: string;
  title: string;
  partner: string;
  date: string; // YYYY-MM-DD
  amount: number;
  status: string;
  severity?: "low" | "medium" | "high";
  href?: string;
  meta?: Record<string, string | number | null>;
};

const LaneEnum = z.enum(["approve", "overdue", "reconcile", "deadline", "anomaly"]);

const InputSchema = z
  .object({
    lane: LaneEnum,
    search: z.string().max(200).optional().default(""),
    statusFilter: z.string().max(80).optional().default(""),
    rangeFilter: z.string().max(40).optional().default(""),
    limit: z.number().int().min(1).max(200).optional().default(50),
    offset: z.number().int().min(0).max(10_000).optional().default(0),
  })
  .strict();

function fmtDate(d?: string | null): string {
  if (!d) return "";
  return d.length >= 10 ? d.slice(0, 10) : d;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

export const getInboxLane = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    const q = data.search.trim().toLowerCase();
    const wantStatus = data.statusFilter && data.statusFilter !== "Tất cả"
      ? data.statusFilter.toLowerCase()
      : "";

    const matchSearch = (r: InboxRow) =>
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.partner.toLowerCase().includes(q) ||
      r.ref.toLowerCase().includes(q);

    // ============ APPROVE — Tài liệu/nháp do AI tạo ============
    if (data.lane === "approve") {
      const from = data.offset;
      const to = data.offset + data.limit - 1;
      let qb = supabase
        .from("documents")
        .select("id, original_filename, doc_kind, ocr_status, created_at, ocr_extracted")
        .order("created_at", { ascending: false })
        .range(from, to);
      // status chip → ocr_status hoặc trạng thái nháp
      if (wantStatus.includes("ai")) qb = qb.eq("ocr_status", "done");
      else if (wantStatus.includes("chờ")) qb = qb.eq("ocr_status", "processing");
      else if (wantStatus.includes("bổ sung")) qb = qb.eq("ocr_status", "failed");

      if (data.rangeFilter) {
        const cutoff = new Date(today);
        if (data.rangeFilter.includes("Hôm nay")) cutoff.setDate(today.getDate());
        else if (data.rangeFilter.includes("7")) cutoff.setDate(today.getDate() - 7);
        else if (data.rangeFilter.includes("Tháng")) cutoff.setDate(1);
        qb = qb.gte("created_at", cutoff.toISOString().slice(0, 10));
      }

      const { data: docs, error } = await qb;
      if (error) throw new Error(error.message);

      const rows: InboxRow[] = (docs ?? []).map((d: any) => {
        const ext = d.ocr_extracted ?? {};
        const amount = Number(ext.total ?? ext.amount ?? 0);
        const partner = String(ext.supplier_name ?? ext.customer_name ?? "—");
        const statusLabel =
          d.ocr_status === "done" ? "AI đề xuất"
          : d.ocr_status === "processing" ? "Chờ duyệt"
          : d.ocr_status === "failed" ? "Cần bổ sung" : "Mới";
        return {
          id: d.id,
          ref: String(d.original_filename ?? d.id).slice(0, 24),
          title: d.original_filename ?? "Tài liệu",
          partner,
          date: fmtDate(d.created_at),
          amount,
          status: statusLabel,
          severity: d.ocr_status === "failed" ? "high" : d.ocr_status === "processing" ? "medium" : "low",
          href: `/documents`,
          meta: { doc_kind: d.doc_kind ?? null },
        };
      });
      const filtered = rows.filter(matchSearch);
      const nextOffset = (docs?.length ?? 0) === data.limit ? data.offset + data.limit : null;
      return { rows: filtered, source: "documents" as const, nextOffset };
    }

    // ============ OVERDUE — Phải thu/phải trả quá hạn ============
    if (data.lane === "overdue") {
      const kindFilter = wantStatus.includes("trả") ? "AP"
        : wantStatus.includes("thu") ? "AR" : "BOTH";

      async function aging(kind: "AR" | "AP") {
        const account = kind === "AR" ? "131" : "331";
        const { data: lines, error } = await supabase
          .from("journal_lines")
          .select("debit, credit, journal_entries!inner(user_id, entry_date, description)")
          .eq("account_code", account)
          .eq("journal_entries.user_id", userId);
        if (error) throw new Error(error.message);
        const byParty = new Map<string, { balance: number; lastDate: string; maxDays: number }>();
        for (const r of lines ?? []) {
          const e: any = r.journal_entries;
          const party = (e.description ?? "Không rõ").split("—")[0].trim().slice(0, 80) || "Không rõ";
          const signed = kind === "AR"
            ? Number(r.debit) - Number(r.credit)
            : Number(r.credit) - Number(r.debit);
          const d = daysBetween(today, new Date(e.entry_date));
          const cur = byParty.get(party) ?? { balance: 0, lastDate: e.entry_date, maxDays: 0 };
          cur.balance += signed;
          if (e.entry_date > cur.lastDate) cur.lastDate = e.entry_date;
          if (d > cur.maxDays) cur.maxDays = d;
          byParty.set(party, cur);
        }
        return Array.from(byParty.entries())
          .filter(([, v]) => v.balance > 0.5)
          .map(([party, v]) => ({ party, ...v, kind }));
      }

      const overdueDaysCutoff = data.rangeFilter.includes("> 30") ? 31
        : data.rangeFilter.includes("8") ? 8
        : data.rangeFilter.includes("≤ 7") ? 0
        : 1; // mặc định: chỉ lấy > 0 ngày
      const overdueDaysMax = data.rangeFilter.includes("≤ 7") ? 7
        : data.rangeFilter.includes("8") ? 30 : 99999;

      const parts: InboxRow[] = [];
      if (kindFilter !== "AP") {
        for (const r of await aging("AR")) {
          if (r.maxDays < overdueDaysCutoff || r.maxDays > overdueDaysMax) continue;
          parts.push({
            id: `AR-${r.party}`,
            ref: "AR",
            title: `Công nợ phải thu`,
            partner: r.party,
            date: fmtDate(r.lastDate),
            amount: r.balance,
            status: `Quá hạn ${r.maxDays} ngày`,
            severity: r.maxDays > 60 ? "high" : r.maxDays > 30 ? "medium" : "low",
            href: "/receivables",
          });
        }
      }
      if (kindFilter !== "AR") {
        for (const r of await aging("AP")) {
          if (r.maxDays < overdueDaysCutoff || r.maxDays > overdueDaysMax) continue;
          parts.push({
            id: `AP-${r.party}`,
            ref: "AP",
            title: `Phải trả nhà cung cấp`,
            partner: r.party,
            date: fmtDate(r.lastDate),
            amount: r.balance,
            status: `Quá hạn ${r.maxDays} ngày`,
            severity: r.maxDays > 60 ? "high" : r.maxDays > 30 ? "medium" : "low",
            href: "/payables",
          });
        }
      }
      parts.sort((a, b) => b.amount - a.amount);
      return { rows: parts.filter(matchSearch).slice(0, data.limit), source: "ledger" as const };
    }

    // ============ RECONCILE — Giao dịch ngân hàng chưa khớp ============
    if (data.lane === "reconcile") {
      const { data: accts } = await supabase
        .from("bank_accounts")
        .select("id, name, bank_name, account_no");
      const acctMap = new Map((accts ?? []).map((a: any) => [a.id, a]));

      let qb = supabase
        .from("bank_transactions")
        .select("id, bank_account_id, txn_date, description, amount, counterparty, status")
        .order("txn_date", { ascending: false })
        .limit(data.limit);
      // mặc định: status = unmatched. Chip "Có gợi ý AI"/"Chưa có gợi ý" — coi như đều unmatched
      qb = qb.eq("status", "unmatched");
      if (data.rangeFilter) {
        const from = new Date(today);
        if (data.rangeFilter.includes("7")) from.setDate(today.getDate() - 7);
        else if (data.rangeFilter.includes("Tháng")) from.setDate(1);
        else if (data.rangeFilter.includes("Quý")) from.setMonth(today.getMonth() - 3);
        qb = qb.gte("txn_date", from.toISOString().slice(0, 10));
      }
      const { data: txns, error } = await qb;
      if (error) throw new Error(error.message);

      const rows: InboxRow[] = (txns ?? []).map((t: any) => {
        const acct: any = acctMap.get(t.bank_account_id);
        const acctLabel = acct ? `${acct.bank_name ?? acct.name} ${acct.account_no ? "··" + String(acct.account_no).slice(-4) : ""}`.trim() : "—";
        const amt = Number(t.amount);
        return {
          id: t.id,
          ref: String(t.id).slice(0, 8).toUpperCase(),
          title: t.description ?? (amt >= 0 ? "Tiền vào" : "Tiền ra"),
          partner: t.counterparty ?? acctLabel,
          date: fmtDate(t.txn_date),
          amount: amt,
          status: amt >= 0 ? "Tiền vào · chưa khớp" : "Tiền ra · chưa khớp",
          severity: "medium",
          href: "/bank/reconcile",
          meta: { bank_account_id: t.bank_account_id },
        };
      });
      return { rows: rows.filter(matchSearch), source: "bank_transactions" as const };
    }

    // ============ DEADLINE — Công nợ/HĐ sắp đến hạn ============
    if (data.lane === "deadline") {
      const daysAhead =
        data.rangeFilter.includes("Hôm nay") ? 1
        : data.rangeFilter.includes("3") ? 3
        : 7;

      const wantTaxes = !wantStatus || wantStatus.includes("thuế") || wantStatus.includes("tất cả");
      const wantPayables = !wantStatus || wantStatus.includes("công nợ") || wantStatus.includes("tất cả");

      const rows: InboxRow[] = [];

      if (wantPayables) {
        // HĐ mua chưa thanh toán hết, tính theo ngày phát hành + 30 (heuristic — schema không có due_date)
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, supplier_name, invoice_no, issue_date, total")
          .order("issue_date", { ascending: false })
          .limit(200);
        const { data: payments } = await supabase
          .from("supplier_payments")
          .select("invoice_id, amount");
        const paidByInv = new Map<string, number>();
        (payments ?? []).forEach((p: any) => {
          if (!p.invoice_id) return;
          paidByInv.set(p.invoice_id, (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount));
        });
        for (const inv of invoices ?? []) {
          const paid = paidByInv.get(inv.id) ?? 0;
          const remaining = Number(inv.total ?? 0) - paid;
          if (remaining <= 0.5 || !inv.issue_date) continue;
          const due = new Date(inv.issue_date);
          due.setDate(due.getDate() + 30);
          const daysLeft = daysBetween(due, today);
          if (daysLeft < 0 || daysLeft > daysAhead) continue;
          rows.push({
            id: inv.id,
            ref: inv.invoice_no ?? inv.id.slice(0, 6),
            title: `Đến hạn trả NCC`,
            partner: inv.supplier_name ?? "—",
            date: due.toISOString().slice(0, 10),
            amount: remaining,
            status: daysLeft === 0 ? "Đến hạn hôm nay" : `Còn ${daysLeft} ngày`,
            severity: daysLeft <= 1 ? "high" : daysLeft <= 3 ? "medium" : "low",
            href: "/payables",
          });
        }
      }

      if (wantTaxes) {
        // Hạn khai GTGT tháng: 20 của tháng sau
        const monthDeadline = new Date(today.getFullYear(), today.getMonth() + 1, 20);
        const taxDays = daysBetween(monthDeadline, today);
        if (taxDays >= 0 && taxDays <= daysAhead) {
          rows.push({
            id: `tax-vat-${today.getFullYear()}-${today.getMonth() + 1}`,
            ref: "GTGT",
            title: `Khai GTGT tháng ${today.getMonth() + 1}`,
            partner: "Cơ quan thuế",
            date: monthDeadline.toISOString().slice(0, 10),
            amount: 0,
            status: taxDays === 0 ? "Đến hạn hôm nay" : `Còn ${taxDays} ngày`,
            severity: taxDays <= 1 ? "high" : taxDays <= 3 ? "medium" : "low",
            href: "/tax/gtgt",
          });
        }
      }

      rows.sort((a, b) => a.date.localeCompare(b.date));
      return { rows: rows.filter(matchSearch).slice(0, data.limit), source: "deadlines" as const };
    }

    // ============ ANOMALY — AI insights ============
    if (data.lane === "anomaly") {
      const { data: insights, error } = await supabase
        .from("ai_insights")
        .select("id, title, body, severity, created_at, metadata, category, action_url")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error) throw new Error(error.message);
      const sevMap = (s: string): "low" | "medium" | "high" =>
        s === "critical" ? "high" : s === "warn" ? "medium" : "low";
      const rows: InboxRow[] = (insights ?? []).map((i: any) => {
        const md = i.metadata ?? {};
        const amount = Number(md.amount ?? md.total ?? 0);
        return {
          id: i.id,
          ref: String(i.category ?? "AI").toUpperCase().slice(0, 8),
          title: i.title ?? "Cảnh báo",
          partner: String(md.partner ?? md.party ?? "—"),
          date: fmtDate(i.created_at),
          amount,
          status: i.body ?? i.category ?? "Cần xem",
          severity: sevMap(String(i.severity ?? "info")),
          href: i.action_url ?? "/chat",
        };
      });
      const filtered = rows.filter(matchSearch).filter((r) => {
        if (!wantStatus) return true;
        return r.status.toLowerCase().includes(wantStatus) || r.ref.toLowerCase().includes(wantStatus);
      });
      return { rows: filtered, source: "ai_insights" as const };
    }

    return { rows: [], source: "none" as const };
  });

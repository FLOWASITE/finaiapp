import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveTenantId } from "@/lib/auth/active-tenant.server";

const activeTenant = (supabase: any, userId: string) =>
  resolveActiveTenantId(supabase, userId);

/** Sinh đề xuất bút toán + cache vào ai_journal_proposals. */
export const proposeJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        invoice_kind: z.enum(["purchase", "sales"]).default("purchase"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    const t0 = Date.now();
    let dto;
    if (data.invoice_kind === "sales") {
      const { proposeJournalForSalesInvoice } = await import("./categorize/sales-engine.server");
      dto = await proposeJournalForSalesInvoice(supabase, data.invoice_id);
    } else {
      const { proposeJournalForInvoice } = await import("./categorize/engine.server");
      dto = await proposeJournalForInvoice(supabase, data.invoice_id);
    }
    const duration = Date.now() - t0;

    await supabase
      .from("ai_journal_proposals")
      .upsert(
        {
          tenant_id: tenantId,
          invoice_id: data.invoice_id,
          invoice_kind: data.invoice_kind,
          dto: dto as any,
          confidence: dto.confidence,
          source: dto.source,
          warnings: dto.warnings as any,
          signals: (dto.signal_features ?? {}) as any,
          status: "pending",
        },
        { onConflict: "invoice_kind,invoice_id" },
      );

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Đề xuất bút toán ${data.invoice_kind === "sales" ? "(bán)" : "(mua)"} (${dto.source}, ${Math.round(dto.confidence * 100)}%)`,
        result: dto.warnings.some((w) => w.severity === "error") ? "warning" : "success",
        duration_ms: duration,
        metadata: { invoice_id: data.invoice_id, invoice_kind: data.invoice_kind, entries: dto.entries.length },
      });
    } catch {}

    return dto;
  });

/** List proposal đang chờ + dữ liệu invoice meta để render UI hàng đợi. */
export const listProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "skipped", "auto_posted", "failed", "all"]).default("pending"),
        min_confidence: z.number().min(0).max(1).optional(),
        source: z.enum(["vendor_template", "learned_lines", "classify_rule", "ai_fallback", "manual"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { items: [], stats: { pending: 0, auto_today: 0, accuracy_7d: null } };

    let q = supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, invoice_kind, dto, confidence, source, status, warnings, auto_posted, journal_entry_id, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.source) q = q.eq("source", data.source);
    if (data.min_confidence != null) q = q.gte("confidence", data.min_confidence);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const purchaseIds = ((rows ?? []) as any[]).filter((r) => (r.invoice_kind ?? "purchase") === "purchase").map((r) => r.invoice_id);
    const salesIds = ((rows ?? []) as any[]).filter((r) => r.invoice_kind === "sales").map((r) => r.invoice_id);
    const invMap = new Map<string, any>();
    if (purchaseIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, supplier_name, supplier_tax_id, total, invoice_no, issue_date, status, file_path")
        .in("id", purchaseIds);
      for (const i of (invs ?? []) as any[]) invMap.set(i.id, { ...i, invoice_kind: "purchase" });
    }
    if (salesIds.length > 0) {
      const { data: sinvs } = await supabase
        .from("sales_invoices")
        .select("id, customer_name, customer_tax_id, total, invoice_no, issue_date, status, payment_status")
        .in("id", salesIds);
      for (const i of (sinvs ?? []) as any[])
        invMap.set(i.id, {
          ...i,
          supplier_name: i.customer_name,
          supplier_tax_id: i.customer_tax_id,
          invoice_kind: "sales",
        });
    }

    const items = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      invoice_id: r.invoice_id,
      invoice_kind: r.invoice_kind ?? "purchase",
      invoice: invMap.get(r.invoice_id) ?? null,
      dto: r.dto,
      confidence: Number(r.confidence),
      source: r.source,
      status: r.status,
      warnings: r.warnings,
      journal_entry_id: r.journal_entry_id,
      created_at: r.created_at,
    }));

    // stats
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count: autoToday } = await supabase
      .from("ai_journal_proposals")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "auto_posted")
      .gte("created_at", since);

    return {
      items,
      stats: {
        pending: items.filter((x) => x.status === "pending").length,
        auto_today: autoToday ?? 0,
        accuracy_7d: null as number | null,
      },
    };
  });

/** Duyệt proposal → ghi sổ + học vendor template. */
export const approveProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        proposal_id: z.string().uuid(),
        entry_index: z.number().int().min(0).default(0),
        edits: z
          .object({
            description: z.string().max(500).optional(),
            entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            lines: z
              .array(
                z.object({
                  account_code: z.string().min(2).max(16),
                  debit: z.number().min(0),
                  credit: z.number().min(0),
                  memo: z.string().max(200).optional(),
                }),
              )
              .min(2)
              .optional(),
          })
          .optional(),
        tscd_confirm: z
          .object({
            useful_life_years: z.number().int().min(1).max(50),
            asset_kind: z.enum(["tangible", "intangible"]),
          })
          .optional(),
        allocate_242: z
          .object({
            months: z.number().int().min(1).max(60),
          })
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");

    const { data: p } = await supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, invoice_kind, dto, status")
      .eq("id", data.proposal_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!p) throw new Error("Không tìm thấy đề xuất");
    if (p.status !== "pending") throw new Error(`Đề xuất đã ${p.status}`);

    const entry = data.edits?.lines
      ? {
          description: data.edits.description ?? (p.dto as any).entries[data.entry_index].description,
          entry_date: data.edits.entry_date ?? (p.dto as any).entries[data.entry_index].entry_date,
          lines: data.edits.lines,
        }
      : (p.dto as any).entries[data.entry_index];

    const totalD = entry.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const totalC = entry.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalD - totalC) > 0.5) throw new Error(`Bút toán không cân: Nợ ${totalD} ≠ Có ${totalC}`);

    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: entry.entry_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    const isSales = p.invoice_kind === "sales";
    const { data: je, error: je_err } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        // journal_entries.invoice_id chỉ FK tới invoices (mua); với sales để null và liên kết qua sales_invoices.journal_entry_id
        invoice_id: isSales ? null : p.invoice_id,
        entry_date: entry.entry_date,
        description: entry.description,
      })
      .select("id")
      .single();
    if (je_err || !je) throw new Error(je_err?.message || "Không tạo được bút toán");

    const { error: jl_err } = await supabase.from("journal_lines").insert(
      entry.lines.map((l: any, i: number) => ({
        entry_id: je.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    if (jl_err) throw new Error(jl_err.message);

    // ====== Tạo Fixed Asset nếu KTT xác nhận TSCĐ ======
    let fixedAssetId: string | null = null;
    if (data.tscd_confirm) {
      const accPattern = data.tscd_confirm.asset_kind === "intangible" ? /^213/ : /^21[12]/;
      const faLine =
        (entry.lines as any[]).find((l) => accPattern.test(l.account_code) && Number(l.debit) > 0) ??
        (entry.lines as any[]).find((l) => /^21[1-8]/.test(l.account_code) && Number(l.debit) > 0);
      if (faLine) {
        let supplierId: string | null = null;
        if (!isSales) {
          const { data: inv } = await supabase
            .from("invoices")
            .select("supplier_id")
            .eq("id", p.invoice_id)
            .maybeSingle();
          supplierId = inv?.supplier_id ?? null;
        }
        const { data: cat } = await supabase
          .from("fa_categories")
          .select("id, default_asset_account, default_accumulated_account, default_expense_account")
          .eq("tenant_id", tenantId)
          .eq("asset_kind", data.tscd_confirm.asset_kind)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const code = `FA-${Date.now().toString().slice(-8)}`;
        const usefulLifeMonths = data.tscd_confirm.useful_life_years * 12;
        const { data: faRow, error: fa_err } = await supabase
          .from("fixed_assets")
          .insert({
            user_id: userId,
            tenant_id: tenantId,
            category_id: cat?.id ?? null,
            asset_kind: data.tscd_confirm.asset_kind,
            code,
            name: (faLine.memo ?? entry.description ?? "TSCĐ").slice(0, 200),
            cost: Number(faLine.debit),
            useful_life_months: usefulLifeMonths,
            start_date: entry.entry_date,
            method: "straight_line",
            asset_account: cat?.default_asset_account ?? faLine.account_code,
            accumulated_account:
              cat?.default_accumulated_account ??
              (data.tscd_confirm.asset_kind === "intangible" ? "2143" : "2141"),
            expense_account: cat?.default_expense_account ?? "6422",
            status: "active",
            supplier_id: supplierId,
            notes: `Tự tạo từ duyệt bút toán: ${entry.description.slice(0, 100)}`,
          })
          .select("id")
          .single();
        if (fa_err) {
          console.error("[approveProposal] insert fixed_assets failed:", fa_err.message);
        } else {
          fixedAssetId = faRow?.id ?? null;
        }
      }
    }

    // ====== Tạo allocated_assets (242) pending nếu có line 242 ======
    let allocatedAssetId: string | null = null;
    const line242 = (entry.lines as any[]).find(
      (l) => String(l.account_code).startsWith("242") && Number(l.debit) > 0,
    );
    if (line242) {
      const dtoEntry: any = (p.dto as any).entries?.[data.entry_index];
      const dtoMonths = dtoEntry?.amortize_months;
      const months = data.allocate_242?.months ?? dtoMonths ?? 12;
      const { data: t } = await supabase
        .from("tenants")
        .select("default_cost_center")
        .eq("id", tenantId)
        .maybeSingle();
      const dcc = (t?.default_cost_center as string) ?? "642";
      const expenseAccount = dcc === "627" ? "6273" : dcc === "641" ? "6413" : "6423";
      const code = `AA-${Date.now().toString().slice(-8)}`;
      const { data: aaRow, error: aa_err } = await supabase
        .from("allocated_assets")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          code,
          name: (line242.memo ?? entry.description ?? "Chi phí trả trước").slice(0, 200),
          category: "prepaid",
          source_type: "from_invoice",
          source_doc_table: isSales ? "sales_invoices" : "invoices",
          source_doc_id: p.invoice_id,
          quantity: 1,
          cost: Number(line242.debit),
          periods_total: months,
          periods_done: 0,
          period_unit: "month",
          start_date: entry.entry_date,
          method: "straight_line",
          prepaid_account: "242",
          expense_account: expenseAccount,
          status: "pending",
          notes: `Tự tạo từ duyệt bút toán — chờ KTT duyệt phân bổ từng kỳ`,
        })
        .select("id")
        .single();
      if (aa_err) {
        console.error("[approveProposal] insert allocated_assets failed:", aa_err.message);
      } else {
        allocatedAssetId = aaRow?.id ?? null;
      }
    }

    await supabase
      .from("ai_journal_proposals")
      .update({
        status: "approved",
        journal_entry_id: je.id,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", data.proposal_id);

    if (isSales) {
      await supabase
        .from("sales_invoices")
        .update({ journal_entry_id: je.id, status: "posted" })
        .eq("id", p.invoice_id);
    } else {
      await supabase.from("invoices").update({ status: "approved" }).eq("id", p.invoice_id);
    }

    // ====== Promote kind_v2 vào ai_line_classifications (chỉ cho hóa đơn mua) ======
    if (!isSales) {
      try {
        const { learnLineClassificationsFromApproval } = await import("./categorize/learn-line-classifications.server");
        await learnLineClassificationsFromApproval(supabase, {
          tenantId,
          userId,
          invoiceId: p.invoice_id,
          lines: entry.lines as any[],
        });
      } catch (e) {
        console.error("[approveProposal] learnLineClassifications failed:", (e as Error).message);
      }
    }

    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      if (!isSales) {
        const { learnVendorTemplate } = await import("./categorize/templates.server");
        const learn = await learnVendorTemplate(supabase, tenantId, p.invoice_id);
        await tryLogAgentActivity(supabase, userId, {
          agent_id: "categorize",
          action: learn.learned
            ? `Học template NCC (mẫu thứ ${learn.sample_count})`
            : `Duyệt bút toán mua — ${entry.description.slice(0, 80)}`,
          result: "success",
          metadata: {
            entry_id: je.id,
            invoice_id: p.invoice_id,
            learned: learn.learned,
            fixed_asset_id: fixedAssetId,
            allocated_asset_id: allocatedAssetId,
          },
        });
      } else {
        await tryLogAgentActivity(supabase, userId, {
          agent_id: "categorize",
          action: `Duyệt bút toán bán — ${entry.description.slice(0, 80)}`,
          result: "success",
          metadata: { entry_id: je.id, sales_invoice_id: p.invoice_id },
        });
      }
    } catch {}

    try {
      const { invalidateCategorizeCache } = await import("./categorize/cache.server");
      invalidateCategorizeCache(tenantId);
    } catch {}

    return {
      ok: true,
      journal_entry_id: je.id,
      fixed_asset_id: fixedAssetId,
      allocated_asset_id: allocatedAssetId,
    };
  });

export const skipProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ proposal_id: z.string().uuid(), reason: z.string().max(300).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");
    await supabase
      .from("ai_journal_proposals")
      .update({ status: "skipped", resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("id", data.proposal_id)
      .eq("tenant_id", tenantId);
    try {
      const { invalidateCategorizeCache } = await import("./categorize/cache.server");
      invalidateCategorizeCache(tenantId);
    } catch {}
    return { ok: true };
  });

/** Lấy proposal hiện tại theo invoice_id (dùng trong Sheet tài liệu). */
export const getProposalByInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        invoice_kind: z.enum(["purchase", "sales"]).default("purchase"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { proposal: null };
    const { data: row } = await supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, invoice_kind, dto, confidence, source, status, warnings, journal_entry_id, auto_posted, created_at, resolved_at")
      .eq("tenant_id", tenantId)
      .eq("invoice_id", data.invoice_id)
      .eq("invoice_kind", data.invoice_kind)
      .maybeSingle();
    return { proposal: row ?? null };
  });

/** Wrapper gọi từ parse-document: nếu agent.mode=auto + conf đủ thì auto-post luôn. (chỉ áp dụng cho HĐ mua) */
export const autoPostIfEligible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId) return { auto_posted: false };
    const { proposeJournalForInvoice } = await import("./categorize/engine.server");
    const dto = await proposeJournalForInvoice(supabase, data.invoice_id);

    await supabase
      .from("ai_journal_proposals")
      .upsert(
        {
          tenant_id: tenantId,
          invoice_id: data.invoice_id,
          invoice_kind: "purchase",
          dto: dto as any,
          confidence: dto.confidence,
          source: dto.source,
          warnings: dto.warnings as any,
          signals: (dto.signal_features ?? {}) as any,
          status: "pending",
        },
        { onConflict: "invoice_kind,invoice_id" },
      );

    if (!dto.recommend_auto_post) return { auto_posted: false, confidence: dto.confidence };

    // Ghi sổ entry đầu (vendor template hoặc entry duy nhất)
    const entry = dto.entries[0];
    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        invoice_id: data.invoice_id,
        entry_date: entry.entry_date,
        description: `[Auto] ${entry.description}`,
      })
      .select("id")
      .single();
    if (!je) return { auto_posted: false };

    await supabase.from("journal_lines").insert(
      entry.lines.map((l, i) => ({
        entry_id: je.id,
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    await supabase
      .from("ai_journal_proposals")
      .update({
        status: "auto_posted",
        auto_posted: true,
        journal_entry_id: je.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("invoice_id", data.invoice_id)
      .eq("invoice_kind", "purchase");
    await supabase.from("invoices").update({ status: "approved" }).eq("id", data.invoice_id);


    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "categorize",
        action: `Auto-post HĐ (${dto.source}, ${Math.round(dto.confidence * 100)}%)`,
        result: "success",
        metadata: { invoice_id: data.invoice_id, entry_id: je.id },
      });
    } catch {}

    return { auto_posted: true, journal_entry_id: je.id, confidence: dto.confidence };
  });

/** Danh sách bút toán Fin đã tự duyệt N ngày qua (mặc định 7) — cho KTT audit nhanh. */
export const getAutoPostedRecent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        days: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const tenantId = await activeTenant(supabase, userId);
    if (!tenantId)
      return { items: [], count_7d: 0, sum_amount_7d: 0, days: data.days };

    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const { data: rows, error } = await supabase
      .from("ai_journal_proposals")
      .select("id, invoice_id, invoice_kind, confidence, journal_entry_id, resolved_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "auto_posted")
      .gte("resolved_at", since)
      .order("resolved_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as any[];
    const purchaseIds = list.filter((r) => (r.invoice_kind ?? "purchase") === "purchase").map((r) => r.invoice_id);
    const salesIds = list.filter((r) => r.invoice_kind === "sales").map((r) => r.invoice_id);
    const invMap = new Map<string, any>();
    if (purchaseIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, supplier_name, total, invoice_no, issue_date")
        .in("id", purchaseIds);
      for (const i of (invs ?? []) as any[])
        invMap.set(i.id, { party_name: i.supplier_name, total: i.total, invoice_no: i.invoice_no, issue_date: i.issue_date });
    }
    if (salesIds.length > 0) {
      const { data: sinvs } = await supabase
        .from("sales_invoices")
        .select("id, customer_name, total, invoice_no, issue_date")
        .in("id", salesIds);
      for (const i of (sinvs ?? []) as any[])
        invMap.set(i.id, { party_name: i.customer_name, total: i.total, invoice_no: i.invoice_no, issue_date: i.issue_date });
    }

    const items = list.map((r) => {
      const inv = invMap.get(r.invoice_id) ?? {};
      return {
        id: r.id,
        invoice_id: r.invoice_id,
        invoice_kind: (r.invoice_kind ?? "purchase") as "purchase" | "sales",
        party_name: (inv.party_name ?? null) as string | null,
        invoice_no: (inv.invoice_no ?? null) as string | null,
        issue_date: (inv.issue_date ?? null) as string | null,
        total: Number(inv.total ?? 0),
        confidence: Number(r.confidence ?? 0),
        journal_entry_id: (r.journal_entry_id ?? null) as string | null,
        resolved_at: (r.resolved_at ?? r.created_at) as string,
      };
    });

    const sum_amount_7d = items.reduce((s, x) => s + (x.total || 0), 0);
    return { items, count_7d: items.length, sum_amount_7d, days: data.days };
  });



/**
 * Engine đề xuất bút toán — server-only.
 * Single source of truth: thay cho cả 2 builder hiện tại (inbox-reason
 * buildDocumentItem + journal suggestJournalEntry AI).
 *
 * Pipeline 6 bước, mỗi bước có thể trả early với source khác nhau.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyLine,
  normalizeLineName,
  type LineKind,
  type RawLine,
} from "@/lib/ai/classify-line";
import {
  classifyLineV2,
  type LineKindV2,
} from "@/lib/ai/classify-line-v2";
import {
  getTenantClassifyContext,
  getVendorRolesAndVsic,
  buildClassifyContextV2,
} from "./classify-context.server";
import {
  getTenantMemory,
  getTenantVendorTemplates,
  getSupplierIndustryCached,
  getVendorHistoryDistCached,
  getVendorHistoryDistV2Cached,
  pickMemoryMap,
  pickVendorTemplate,
} from "./cache.server";
import {
  applyCalibratedConfidence,
  decideBand,
  effectiveAutoThreshold,
  getCalibration,
  type SignalFeatures,
} from "./calibration.server";
import type {
  JournalProposalDTO,
  ProposalEntry,
  ProposalLine,
  ProposalSignal,
  ProposalWarning,
  ProposalAlternative,
} from "./types";
import {
  ACCOUNT_BANK,
  ACCOUNT_CASH,
  ACCOUNT_PAYABLE,
  ACCOUNT_VAT_FIXED,
  ACCOUNT_VAT_INPUT,
  applyNonDeductibleAccount,
  checkVatDeductibility,
  defaultAccountFor,
  detectAdjustmentInvoice,
  entryFingerprint,
  entryMatchesTemplate,
  isBalanced,
  splitByNature,
} from "./rules";

/** Map nhãn v2 (7 loại) → nhãn legacy (4 loại) để splitByNature/composeEntries dùng được. */
function v2ToLegacyKind(k: LineKindV2): LineKind {
  switch (k) {
    case "service":
    case "prepaid":
      return "service";
    case "raw_material":
    case "goods_for_resale":
      return "goods";
    case "tools":
      return "ccdc";
    case "fixed_asset_tangible":
    case "fixed_asset_intangible":
      return "fixed_asset";
  }
}

type AgentSettings = {
  enabled: boolean;
  mode: "auto" | "suggest" | "learn_only" | "disabled";
  confidence_threshold: number;
};

async function getCategorizeAgent(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AgentSettings> {
  const { data } = await supabase
    .from("ai_agents")
    .select("enabled, mode, confidence_threshold")
    .eq("tenant_id", tenantId)
    .eq("agent_id", "categorize")
    .maybeSingle();
  return {
    enabled: data?.enabled ?? true,
    mode: (data?.mode as AgentSettings["mode"]) ?? "suggest",
    confidence_threshold: Number(data?.confidence_threshold ?? 0.85),
  };
}

type AutoPostSettings = {
  enabled: boolean;
  min_confidence: number; // 0..1
  max_amount: number; // VND
};

async function getTenantAutoPostSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AutoPostSettings> {
  const { data } = await supabase
    .from("tenants")
    .select("auto_post_enabled, auto_post_min_confidence, auto_post_max_amount")
    .eq("id", tenantId)
    .maybeSingle();
  return {
    enabled: Boolean(data?.auto_post_enabled ?? false),
    min_confidence: Number(data?.auto_post_min_confidence ?? 0.95),
    max_amount: Number(data?.auto_post_max_amount ?? 5_000_000),
  };
}

type LoadedInvoice = {
  id: string;
  tenant_id: string;
  supplier_name: string | null;
  supplier_tax_id: string | null;
  supplier_id: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_status: string;
  expense_account: string | null;
  issue_date: string | null;
  notes: string | null;
  raw_ocr: Record<string, unknown> | null;
  lines: Array<RawLine & { id: string; vat_rate: number; line_type: string; idx: number }>;
};

async function loadInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<LoadedInvoice | null> {
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, tenant_id, supplier_id, supplier_name, supplier_tax_id, subtotal, vat_amount, total, payment_status, expense_account, issue_date, notes, raw_ocr",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return null;
  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("id, description, qty, unit_price, amount, vat_rate, line_type")
    .eq("invoice_id", invoiceId);
  return {
    id: inv.id,
    tenant_id: inv.tenant_id ?? "",
    supplier_id: inv.supplier_id ?? null,
    supplier_name: inv.supplier_name ?? null,
    supplier_tax_id: inv.supplier_tax_id ?? null,
    subtotal: Number(inv.subtotal ?? 0),
    vat_amount: Number(inv.vat_amount ?? 0),
    total: Number(inv.total ?? 0),
    payment_status: inv.payment_status ?? "unpaid",
    expense_account: inv.expense_account ?? null,
    issue_date: inv.issue_date ?? null,
    notes: inv.notes ?? null,
    raw_ocr: (inv.raw_ocr as any) ?? null,
    lines: (lines ?? []).map((l, idx) => ({
      id: l.id,
      idx,
      description: l.description,
      qty: l.qty,
      unit_price: l.unit_price,
      amount: l.amount,
      vat_rate: Number(l.vat_rate ?? 0),
      line_type: l.line_type ?? "goods",
    })),
  };
}

/** TK đối ứng theo payment_status (đã thanh toán → 111/112; chưa → 331). */
function pickPaymentAccount(inv: LoadedInvoice): string {
  if (inv.payment_status === "paid_cash") return ACCOUNT_CASH;
  if (inv.payment_status === "paid_bank" || inv.payment_status === "paid") return ACCOUNT_BANK;
  return ACCOUNT_PAYABLE;
}

// ============================================================
// Step 2: Vendor template
// ============================================================
async function tryVendorTemplate(
  supabase: SupabaseClient,
  inv: LoadedInvoice,
): Promise<{ entries: ProposalEntry[]; signals: ProposalSignal[]; rule: string } | null> {
  if (!inv.supplier_name && !inv.supplier_tax_id) return null;
  const templates = await getTenantVendorTemplates(supabase, inv.tenant_id);
  const row = pickVendorTemplate(templates, inv.supplier_name);
  if (!row) return null;

  // Scale template về tổng = inv.total
  const tplLines: ProposalLine[] = row.template_lines as ProposalLine[];
  const tplTotal = tplLines.reduce((s, l) => s + Math.max(l.debit || 0, l.credit || 0), 0) || 1;
  const factor = inv.total / tplTotal;
  const scaled: ProposalLine[] = tplLines.map((l) => ({
    account_code: l.account_code,
    debit: Math.round(Number(l.debit || 0) * factor),
    credit: Math.round(Number(l.credit || 0) * factor),
    memo: l.memo,
  }));
  // Fix rounding: cộng/trừ vào dòng cuối để cân
  const sumD = scaled.reduce((s, l) => s + l.debit, 0);
  const sumC = scaled.reduce((s, l) => s + l.credit, 0);
  const diff = sumD - sumC;
  if (Math.abs(diff) > 0 && scaled.length > 0) {
    const last = scaled[scaled.length - 1];
    if (last.credit > 0) last.credit += diff;
    else last.debit -= diff;
  }

  return {
    entries: [
      {
        description: `Mua hàng/dịch vụ ${inv.supplier_name ?? "—"} (template ${row.display_name})`,
        entry_date: inv.issue_date ?? new Date().toISOString().slice(0, 10),
        lines: scaled,
      },
    ],
    signals: [
      { label: `Template NCC "${row.display_name}" đã học ${row.sample_count} lần`, weight: 40, ok: true },
      { label: `Cấu trúc ${tplLines.length} dòng, scale theo tổng ${inv.total.toLocaleString("vi-VN")}đ`, weight: 25, ok: true },
    ],
    rule: `vendor-template:${row.id}`,
  };
}

// ============================================================
// Step 3: classify per line + memory
// ============================================================
async function classifyLines(
  supabase: SupabaseClient,
  inv: LoadedInvoice,
): Promise<{
  classified: Array<{
    idx: number;
    description: string;
    amount: number;
    kind: LineKind;
    kind_v2?: LineKindV2;
    account: string;
    confidence: number;
    from_memory: boolean;
    amortize_months?: number | null;
    need_useful_life_confirm?: boolean;
  }>;
  signals: ProposalSignal[];
  warnings: ProposalWarning[];
  usedV2: boolean;
}> {
  const signals: ProposalSignal[] = [];
  const warnings: ProposalWarning[] = [];

  // Memory lookup — load 1 lần toàn bộ tenant (cached), filter trong RAM
  const norms = inv.lines.map((l) => normalizeLineName(l.description));
  const taxId = inv.supplier_tax_id ?? null;
  const allMemory = await getTenantMemory(supabase, inv.tenant_id);
  const memoryMap = pickMemoryMap(allMemory, norms, taxId);

  // Supplier industry hint (cached)
  const industryHint = await getSupplierIndustryCached(supabase, inv.supplier_id);

  // History distribution per vendor (12 tháng) — cached
  const historyDist = await getVendorHistoryDistCached(
    supabase,
    inv.tenant_id,
    taxId,
    inv.supplier_id,
  );

  // V2 context — chỉ kích hoạt nếu tenant đã cấu hình business_types
  const tenantCfg = await getTenantClassifyContext(supabase, inv.tenant_id);
  const usedV2 = tenantCfg.business_types.length > 0;
  const vendorInfo = usedV2
    ? await getVendorRolesAndVsic(supabase, inv.supplier_id)
    : null;
  const historyDistV2 = usedV2
    ? await getVendorHistoryDistV2Cached(supabase, inv.tenant_id, taxId, inv.supplier_id)
    : null;
  const ctxV2 = usedV2
    ? buildClassifyContextV2(tenantCfg, vendorInfo ?? undefined, historyDistV2)
    : null;

  let memoryHits = 0;
  let v2Hits = 0;
  const classified = inv.lines.map((l) => {
    const norm = normalizeLineName(l.description);
    const mem = norm ? memoryMap.get(norm) : null;
    if (mem) {
      memoryHits++;
      return {
        idx: l.idx,
        description: String(l.description ?? ""),
        amount: Number(l.amount ?? 0),
        kind: mem.kind,
        account: mem.account,
        confidence: Math.min(0.98, 0.7 + Math.min(0.25, mem.hit_count * 0.05)),
        from_memory: true,
      };
    }
    if (ctxV2) {
      const r = classifyLineV2(l, ctxV2);
      v2Hits++;
      return {
        idx: l.idx,
        description: String(l.description ?? ""),
        amount: Number(l.amount ?? 0),
        kind: v2ToLegacyKind(r.kind),
        kind_v2: r.kind,
        account: r.account,
        confidence: r.confidence / 100,
        from_memory: false,
        amortize_months: r.amortize_months ?? null,
        need_useful_life_confirm: r.need_useful_life_confirm ?? false,
      };
    }
    const c = classifyLine(l, {
      industryHint: industryHint?.kind ?? null,
      industryLabel: industryHint?.label ?? null,
      historyDist,
    });
    return {
      idx: l.idx,
      description: String(l.description ?? ""),
      amount: Number(l.amount ?? 0),
      kind: c.kind,
      account: c.account,
      confidence: c.confidence / 100,
      from_memory: false,
    };
  });

  if (memoryHits > 0) {
    signals.push({
      label: `${memoryHits}/${inv.lines.length} dòng khớp memory đã học`,
      weight: 30,
      ok: true,
    });
  }
  if (v2Hits > 0) {
    signals.push({
      label: `Phân loại theo bối cảnh DN (${tenantCfg.business_types.join("+") || "—"}, ${tenantCfg.accounting_standard})`,
      weight: 18,
      ok: true,
    });
  }
  if (industryHint) {
    signals.push({ label: industryHint.label, weight: 15, ok: true });
  }
  if (historyDist) {
    signals.push({ label: `Có lịch sử ${Object.keys(historyDist).length} loại với NCC này`, weight: 12, ok: true });
  }

  // Cảnh báo TSCĐ — yêu cầu KTT xác nhận thời gian sử dụng > 1 năm
  for (const c of classified) {
    if (c.need_useful_life_confirm) {
      warnings.push({
        code: "cat-tscd-confirm",
        severity: "info",
        message: `"${c.description.slice(0, 50)}" được nhận diện là TSCĐ (TK ${c.account}) — cần KTT xác nhận thời gian sử dụng > 1 năm`,
      });
    }
    if (c.kind_v2 === "prepaid" && c.amortize_months) {
      warnings.push({
        code: "cat-242-allocate",
        severity: "info",
        message: `"${c.description.slice(0, 50)}" → 242, phân bổ ${c.amortize_months} kỳ`,
      });
    }
  }

  return { classified, signals, warnings, usedV2 };
}

// ============================================================
// Step 5: compose bút toán cân bằng
// ============================================================
function composeEntries(
  inv: LoadedInvoice,
  classified: Awaited<ReturnType<typeof classifyLines>>["classified"],
  paymentAccount: string,
): { entries: ProposalEntry[]; warnings: ProposalWarning[] } {
  const warnings: ProposalWarning[] = [];
  const entryDate = inv.issue_date ?? new Date().toISOString().slice(0, 10);
  const supplierLabel = inv.supplier_name ?? "NCC";

  // cat-009: tách theo kind
  const { groups, mixed } = splitByNature(classified);
  if (mixed) {
    warnings.push({
      code: "cat-009",
      severity: "info",
      message: `Hoá đơn có ${groups.length} bản chất khác nhau — tách thành ${groups.length} bút toán`,
    });
  }

  // cat-001: VAT khả khấu trừ?
  const vatCheck = checkVatDeductibility({
    supplier_tax_id: inv.supplier_tax_id,
    total: inv.total,
    vat_amount: inv.vat_amount,
    payment_account: paymentAccount,
  });
  if (vatCheck.warning) warnings.push(vatCheck.warning);

  const totalSubtotal = classified.reduce((s, l) => s + l.amount, 0) || inv.subtotal || 1;

  const entries: ProposalEntry[] = groups.map((group, gi) => {
    const groupAmount = group.reduce((s, l) => s + l.amount, 0);
    const groupRatio = groupAmount / totalSubtotal;
    const groupVat = Math.round(inv.vat_amount * groupRatio);
    const groupCredit = Math.round(inv.total * groupRatio);

    // 1 dòng debit per line (giữ chi tiết) — gom nếu cùng account
    const debitMap = new Map<string, { amount: number; memo: string }>();
    for (const l of group) {
      const cur = debitMap.get(l.account) ?? { amount: 0, memo: "" };
      cur.amount += l.amount;
      cur.memo = cur.memo
        ? `${cur.memo}; ${l.description.slice(0, 40)}`
        : l.description.slice(0, 60);
      debitMap.set(l.account, cur);
    }
    const lines: ProposalLine[] = [];
    for (const [acc, info] of debitMap) {
      lines.push({ account_code: acc, debit: info.amount, credit: 0, memo: info.memo });
    }
    // VAT
    if (groupVat > 0 && vatCheck.deductible) {
      const vatAcc = group[0]?.kind === "fixed_asset" ? ACCOUNT_VAT_FIXED : ACCOUNT_VAT_INPUT;
      lines.push({ account_code: vatAcc, debit: groupVat, credit: 0, memo: "Thuế GTGT được khấu trừ" });
    } else if (groupVat > 0 && !vatCheck.deductible) {
      // VAT không khấu trừ → cộng vào chi phí dòng đầu (cat-001)
      if (lines[0]) lines[0].debit += groupVat;
    }
    // Có — bên đối ứng
    const credit = vatCheck.deductible ? groupCredit : groupCredit; // tổng vẫn = inv.total * ratio
    lines.push({
      account_code: paymentAccount,
      debit: 0,
      credit,
      memo: `${paymentAccount === ACCOUNT_PAYABLE ? "Phải trả" : "Đã thanh toán"} ${supplierLabel}`,
    });

    // cat-008 dummy hook: nếu chi không hợp lệ → swap dòng debit đầu. Hiện chỉ trigger khi MST sai + amount lớn.
    const isNonDeductible = !vatCheck.deductible && inv.total >= 5_000_000 && (inv.supplier_tax_id ?? "").length < 10;
    if (isNonDeductible && lines[0]) {
      const swap = applyNonDeductibleAccount(lines[0], true);
      lines[0] = swap.line;
      if (swap.warning) warnings.push(swap.warning);
    }

    // Sửa lệch nhỏ do làm tròn
    const d = lines.reduce((s, l) => s + l.debit, 0);
    const c = lines.reduce((s, l) => s + l.credit, 0);
    if (d !== c && lines.length > 0) {
      const diff = d - c;
      const target = lines.find((l) => l.credit > 0);
      if (target) target.credit += diff;
    }

    const kindLabels: Record<LineKind, ProposalEntry["nature"]> = {
      goods: "goods",
      service: "service",
      fixed_asset: "fixed_asset",
      ccdc: "ccdc",
    };

    return {
      description: mixed
        ? `Mua ${kindLabels[group[0].kind]} ${supplierLabel} (phần ${gi + 1}/${groups.length})`
        : `Mua hàng/dịch vụ ${supplierLabel}`,
      entry_date: entryDate,
      lines,
      nature: kindLabels[group[0].kind],
    };
  });

  // cat-013: hoá đơn điều chỉnh → thêm warning, chưa tự đảo bút toán cũ
  const adj = detectAdjustmentInvoice({ notes: inv.notes, raw_ocr: inv.raw_ocr });
  if (adj.is_adjustment) {
    warnings.push({
      code: "cat-013",
      severity: "warn",
      message: `HĐ điều chỉnh ${adj.direction === "decrease" ? "giảm" : "tăng"}${adj.original_no ? ` cho HĐ ${adj.original_no}` : ""} — kiểm tra cần tạo bút toán đảo cho HĐ cũ`,
    });
  }

  // Validate balanced
  for (let i = 0; i < entries.length; i++) {
    if (!isBalanced(entries[i].lines)) {
      warnings.push({
        code: "balance",
        severity: "error",
        message: `Bút toán ${i + 1} không cân — engine sẽ không auto-post`,
      });
    }
  }

  return { entries, warnings };
}

/**
 * MAIN: đề xuất bút toán cho 1 hoá đơn.
 * Side-effect free (không ghi DB) — caller chịu trách nhiệm persist DTO.
 */
export async function proposeJournalForInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  preloaded?: LoadedInvoice,
): Promise<JournalProposalDTO> {
  const inv = preloaded ?? (await loadInvoice(supabase, invoiceId));
  if (!inv) throw new Error(`Không tìm thấy hoá đơn ${invoiceId}`);
  if (!inv.tenant_id) throw new Error("Hoá đơn không có tenant_id");

  const agent = await getCategorizeAgent(supabase, inv.tenant_id);
  const cal = await getCalibration(supabase, inv.tenant_id);
  const paymentAccount = pickPaymentAccount(inv);
  const signals: ProposalSignal[] = [];
  const warnings: ProposalWarning[] = [];
  const appliedRules: string[] = [];
  const alternatives: ProposalAlternative[] = [];

  const finalize = (
    base: number,
    features: SignalFeatures,
    source: JournalProposalDTO["source"],
    entries: ProposalEntry[],
    hasError: boolean,
  ): JournalProposalDTO => {
    if (warnings.some((w) => w.severity === "error" || w.code === "balance")) {
      features.has_warning = 1;
    }
    if (!inv.supplier_tax_id) features.missing_partner = 1;
    const confidence = applyCalibratedConfidence(base, features, cal.signal_weights);
    const band = decideBand(confidence, cal);
    const threshold = effectiveAutoThreshold(agent.confidence_threshold, cal.auto_threshold);
    return {
      invoice_id: invoiceId,
      source,
      entries,
      confidence,
      base_confidence: base,
      warnings,
      signals,
      signal_features: features as Record<string, number>,
      band,
      alternatives,
      applied_rules: appliedRules,
      recommend_auto_post:
        agent.enabled && agent.mode === "auto" && confidence >= threshold && !hasError,
      generated_at: new Date().toISOString(),
    };
  };

  // Step 2: vendor template
  const tpl = await tryVendorTemplate(supabase, inv);
  if (tpl) {
    appliedRules.push(tpl.rule);
    signals.push(...tpl.signals);
    return finalize(0.92, { vendor_template: 1, vat_match: 1 }, "vendor_template", tpl.entries, false);
  }

  // Step 3 + 4 + 5
  if (inv.lines.length === 0) {
    const fallbackEntry: ProposalEntry = {
      description: `Mua hàng/dịch vụ ${inv.supplier_name ?? "—"}`,
      entry_date: inv.issue_date ?? new Date().toISOString().slice(0, 10),
      lines: [
        { account_code: "6422", debit: inv.subtotal || inv.total, credit: 0, memo: "Chi phí QLDN (chưa có chi tiết dòng)" },
        ...(inv.vat_amount > 0 ? [{ account_code: ACCOUNT_VAT_INPUT, debit: inv.vat_amount, credit: 0, memo: "Thuế GTGT" }] : []),
        { account_code: paymentAccount, debit: 0, credit: inv.total, memo: `Phải trả ${inv.supplier_name ?? ""}` },
      ],
    };
    warnings.push({ code: "no-lines", severity: "warn", message: "Hoá đơn không có chi tiết dòng — engine dùng 6422 mặc định" });
    signals.push({ label: "Không có chi tiết dòng", weight: 0, ok: false });
    return finalize(0.5, { ai_fallback: 1 }, "ai_fallback", [fallbackEntry], false);
  }

  const { classified, signals: clsSignals, warnings: clsWarnings, usedV2 } =
    await classifyLines(supabase, inv);
  signals.push(...clsSignals);
  warnings.push(...clsWarnings);
  const memoryHits = classified.filter((c) => c.from_memory).length;
  const source: JournalProposalDTO["source"] = memoryHits > 0 ? "learned_lines" : "classify_rule";
  appliedRules.push(usedV2 ? "classify-line-v2" : "classify-line-v1");
  if (memoryHits > 0) appliedRules.push(`ai_line_classifications:${memoryHits}`);

  const { entries, warnings: composeWarnings } = composeEntries(inv, classified, paymentAccount);
  warnings.push(...composeWarnings);

  const minLineConf = classified.reduce((m, c) => Math.min(m, c.confidence), 1);
  const hasError = warnings.some((w) => w.severity === "error");
  let base = minLineConf;
  if (memoryHits === classified.length) base = Math.max(base, 0.9);
  if (hasError) base = Math.min(base, 0.4);
  if (warnings.some((w) => w.code === "cat-001")) base = Math.min(base, 0.7);

  const features: SignalFeatures = {
    learned_memory: classified.length > 0 ? memoryHits / classified.length : 0,
    classify_rule: memoryHits === 0 ? 1 : 0,
    partner_history: signals.some((s) => s.label.startsWith("Có lịch sử")) ? 1 : 0,
    vat_match: warnings.some((w) => w.code === "cat-001") ? 0 : 1,
  };

  return finalize(base, features, source, entries, hasError);
}


export { entryFingerprint, entryMatchesTemplate };

// ============================================================
// BATCH API — dùng cho listInboxAi để tránh N+1
// ============================================================

/** Load nhiều invoice + lines trong 2 query. */
async function loadInvoicesBatch(
  supabase: SupabaseClient,
  invoiceIds: string[],
): Promise<Map<string, LoadedInvoice>> {
  const result = new Map<string, LoadedInvoice>();
  if (invoiceIds.length === 0) return result;
  const { data: invs } = await supabase
    .from("invoices")
    .select(
      "id, tenant_id, supplier_id, supplier_name, supplier_tax_id, subtotal, vat_amount, total, payment_status, expense_account, issue_date, notes, raw_ocr",
    )
    .in("id", invoiceIds);
  const { data: allLines } = await supabase
    .from("invoice_lines")
    .select("id, invoice_id, description, qty, unit_price, amount, vat_rate, line_type")
    .in("invoice_id", invoiceIds);
  const linesByInvoice = new Map<string, any[]>();
  for (const l of (allLines ?? []) as any[]) {
    const arr = linesByInvoice.get(l.invoice_id) ?? [];
    arr.push(l);
    linesByInvoice.set(l.invoice_id, arr);
  }
  for (const inv of (invs ?? []) as any[]) {
    const lines = linesByInvoice.get(inv.id) ?? [];
    result.set(inv.id, {
      id: inv.id,
      tenant_id: inv.tenant_id ?? "",
      supplier_id: inv.supplier_id ?? null,
      supplier_name: inv.supplier_name ?? null,
      supplier_tax_id: inv.supplier_tax_id ?? null,
      subtotal: Number(inv.subtotal ?? 0),
      vat_amount: Number(inv.vat_amount ?? 0),
      total: Number(inv.total ?? 0),
      payment_status: inv.payment_status ?? "unpaid",
      expense_account: inv.expense_account ?? null,
      issue_date: inv.issue_date ?? null,
      notes: inv.notes ?? null,
      raw_ocr: (inv.raw_ocr as any) ?? null,
      lines: lines.map((l: any, idx: number) => ({
        id: l.id,
        idx,
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
        amount: l.amount,
        vat_rate: Number(l.vat_rate ?? 0),
        line_type: l.line_type ?? "goods",
      })),
    });
  }
  return result;
}

/**
 * Đề xuất bút toán cho NHIỀU hoá đơn 1 lần.
 * Tối ưu: 2 query load invoices+lines + prewarm cache, sau đó loop đọc từ cache.
 * Returns Map<invoice_id, DTO>; bỏ qua những invoice lỗi.
 */
export async function proposeJournalBatch(
  supabase: SupabaseClient,
  invoiceIds: string[],
): Promise<Map<string, JournalProposalDTO>> {
  const out = new Map<string, JournalProposalDTO>();
  if (invoiceIds.length === 0) return out;

  const loaded = await loadInvoicesBatch(supabase, invoiceIds);

  // Prewarm cache theo tenant (mỗi tenant 1 lần)
  const tenants = new Set<string>();
  for (const inv of loaded.values()) if (inv.tenant_id) tenants.add(inv.tenant_id);
  await Promise.all(
    Array.from(tenants).map(async (t) => {
      const { prewarmCategorizeCache } = await import("./cache.server");
      await prewarmCategorizeCache(supabase, t);
    }),
  );

  // Loop từng invoice — pipeline đọc từ cache
  for (const id of invoiceIds) {
    try {
      const dto = await proposeJournalForInvoice(supabase, id, loaded.get(id));
      out.set(id, dto);
    } catch {
      // skip — invoice lỗi không kéo theo cả batch
    }
  }
  return out;
}


import type { Rule } from "@/types/rule";
import type { VendorEntity, AccountEntity, ItemEntity } from "@/data/sampleEntities";
import type { GraphDbData, GraphRuleRow } from "./memory-graph.functions";
import { VAS_ACCOUNTS, accountName } from "./vas-accounts";
import { VSIC } from "@/lib/vsic";
import { vsicToKindHint, type LineKind } from "@/lib/ai/classify-line";
import type { VendorEnrichment } from "./build-graph";

const ACCOUNT_CODE_RE = /\b([1-9][0-9]{2,3})\b/g;

function extractAccountCodes(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const re = new RegExp(ACCOUNT_CODE_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const code = m[1];
    if (VAS_ACCOUNTS[code]) {
      out.add(code);
      continue;
    }
    const start = Math.max(0, m.index - 6);
    const prefix = text.slice(start, m.index).toLowerCase();
    if (/tk|nợ|no|có|co|account/i.test(prefix)) out.add(code);
  }
  return Array.from(out);
}

function rowToRule(r: GraphRuleRow): Rule {
  const mode: Rule["mode"] =
    r.type === "active" ? "auto" : r.type === "suggestion" ? "suggest" : "disabled";
  const status: Rule["status"] = r.type === "disabled" ? "paused" : "active";
  return {
    id: r.id,
    name: r.title,
    description: [r.when_text, r.then_text].filter(Boolean).join(" → "),
    conditions: Array.isArray(r.conditions) ? r.conditions : [],
    actions: Array.isArray(r.actions) ? r.actions : [],
    confidence_threshold: 0.8,
    mode,
    applies_to: "future",
    enabled: r.type !== "disabled",
    source: r.source === "user-taught" ? "user_taught" : "ai_learned",
    created_by: "system",
    created_at: new Date().toISOString(),
    applied_count: r.applied_count ?? 0,
    correct_count: r.accuracy_correct ?? 0,
    last_used: r.last_used_at ?? undefined,
    status,
    version: r.schema_version ?? 1,
  };
}

function extractAccountsFromActions(actions: GraphRuleRow["actions"]): string[] {
  if (!Array.isArray(actions)) return [];
  const out = new Set<string>();
  for (const a of actions) {
    if (a?.type === "book") {
      const d = a.params?.account_debit;
      const c = a.params?.account_credit;
      if (typeof d === "string" && d) out.add(d);
      if (typeof c === "string" && c) out.add(c);
    }
  }
  return Array.from(out);
}

function extractVendorTermsFromConditions(conditions: GraphRuleRow["conditions"]): string[] {
  if (!Array.isArray(conditions)) return [];
  const out: string[] = [];
  for (const c of conditions) {
    if (c?.field !== "vendor.name") continue;
    const v = c.value;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") out.push(x);
  }
  return out;
}

export type ExtraEdge = {
  id: string;
  source: string;
  target: string;
  kind: "partner-default" | "classification" | "vendor-item" | "item-account";
  label?: string;
  weight: number;
};

export type AdaptedGraphInput = {
  rules: Rule[];
  vendors: VendorEntity[];
  accounts: AccountEntity[];
  items: ItemEntity[];
  extraEdges: ExtraEdge[];
  ruleAccountHints: Map<string, string[]>;
  ruleVendorHints: Map<string, string[]>;
  vendorEnrichment: Map<string, VendorEnrichment>;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function slugify(s: string): string {
  return normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";
}

export function adaptDbToGraph(input: GraphDbData): AdaptedGraphInput {
  const rules = input.rules.map(rowToRule);

  const vendors: VendorEntity[] = input.suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    tax_id: s.tax_id ?? undefined,
    industry: s.industry_code ?? undefined,
  }));

  const accountSet = new Set<string>();
  for (const s of input.suppliers) {
    if (s.default_expense_account) accountSet.add(s.default_expense_account);
  }
  for (const p of input.partners) {
    if (p.default_account) accountSet.add(p.default_account);
  }
  for (const c of input.classifications) {
    if (c.account) accountSet.add(c.account);
  }

  const ruleAccountHints = new Map<string, string[]>();
  for (const r of input.rules) {
    const fromV2 = extractAccountsFromActions(r.actions);
    const codes = fromV2.length
      ? fromV2
      : [
          ...extractAccountCodes(r.when_text),
          ...extractAccountCodes(r.then_text),
        ];
    for (const c of codes) accountSet.add(c);
    if (codes.length) ruleAccountHints.set(r.id, Array.from(new Set(codes)));
  }

  const accounts: AccountEntity[] = Array.from(accountSet)
    .sort()
    .map((code) => ({ id: `a-${code}`, code, name: accountName(code) }));

  const vendorIndex = vendors.map((v) => ({ v, norm: normalize(v.name) }));
  const ruleVendorHints = new Map<string, string[]>();
  for (const r of input.rules) {
    const terms = extractVendorTermsFromConditions(r.conditions);
    const matched = new Set<string>();
    if (terms.length) {
      for (const t of terms) {
        const n = normalize(t);
        if (n.length < 3) continue;
        for (const { v, norm } of vendorIndex) {
          if (norm && (norm.includes(n) || n.includes(norm))) matched.add(v.id);
        }
      }
    }
    if (matched.size === 0) {
      const hay = normalize(`${r.title} ${r.when_text}`);
      for (const { v, norm } of vendorIndex) {
        if (!norm || norm.length < 3) continue;
        if (hay.includes(norm)) matched.add(v.id);
      }
    }
    if (matched.size) ruleVendorHints.set(r.id, Array.from(matched));
  }

  // --- Items (hàng hoá / dịch vụ) derived from ai_line_classifications ---
  const itemsMap = new Map<string, ItemEntity>();
  type ItemLink = { vendorId: string | null; itemId: string; account: string; hits: number; label?: string };
  const itemLinks: ItemLink[] = [];

  for (const c of input.classifications) {
    const trimmed = c.line_name?.trim();
    if (!trimmed) continue;
    const kind = (c.kind ?? "goods") as ItemEntity["kind"];
    const key = `${slugify(trimmed)}::${kind}`;
    let it = itemsMap.get(key);
    if (!it) {
      it = {
        id: key,
        name: trimmed,
        kind,
        hitCount: 0,
        defaultAccount: c.account,
      };
      itemsMap.set(key, it);
    }
    it.hitCount += c.hit_count ?? 1;
    if (!it.defaultAccount && c.account) it.defaultAccount = c.account;
    itemLinks.push({
      vendorId: c.supplier_id ?? null,
      itemId: key,
      account: c.account,
      hits: c.hit_count ?? 1,
      label: trimmed.length > 24 ? `${trimmed.slice(0, 22)}…` : trimmed,
    });
  }

  const items = Array.from(itemsMap.values());

  // Extra edges: partner-default (vendor→account), and item routing (vendor→item, item→account)
  const extraEdges: ExtraEdge[] = [];
  const seen = new Set<string>();

  for (const p of input.partners) {
    if (!p.party_id || !p.default_account) continue;
    const id = `partner:${p.party_id}->${p.default_account}`;
    if (seen.has(id)) continue;
    seen.add(id);
    extraEdges.push({
      id,
      source: `vendor:${p.party_id}`,
      target: `account:a-${p.default_account}`,
      kind: "partner-default",
      label: "mặc định",
      weight: 2,
    });
  }

  // Aggregate vendor→item edges so duplicates collapse
  const vendorItemAgg = new Map<string, number>();
  const itemAccountAgg = new Map<string, { hits: number; account: string; itemId: string }>();
  for (const link of itemLinks) {
    if (link.vendorId) {
      const k = `vi:${link.vendorId}->${link.itemId}`;
      vendorItemAgg.set(k, (vendorItemAgg.get(k) ?? 0) + link.hits);
    }
    const ka = `ia:${link.itemId}->${link.account}`;
    const prev = itemAccountAgg.get(ka);
    itemAccountAgg.set(ka, {
      hits: (prev?.hits ?? 0) + link.hits,
      account: link.account,
      itemId: link.itemId,
    });
  }

  for (const [key, hits] of vendorItemAgg) {
    const [, rest] = key.split(":");
    const [vendorId, itemId] = rest.split("->");
    extraEdges.push({
      id: key,
      source: `vendor:${vendorId}`,
      target: `item:${itemId}`,
      kind: "vendor-item",
      weight: Math.min(3, 1 + Math.log10(1 + hits)),
    });
  }
  for (const [key, info] of itemAccountAgg) {
    extraEdges.push({
      id: key,
      source: `item:${info.itemId}`,
      target: `account:a-${info.account}`,
      kind: "item-account",
      label: `→ ${info.account}`,
      weight: Math.min(3, 1 + Math.log10(1 + info.hits)),
    });
  }

  // --- Vendor enrichment: industry label + 12-month history dist ---
  const vendorEnrichment = new Map<string, VendorEnrichment>();
  const vsicByCode = new Map(VSIC.map((v) => [v.code, v.name]));
  for (const s of input.suppliers) {
    const code = s.industry_code ?? null;
    const dist = input.supplierHistory?.[s.id] ?? null;
    const total = dist
      ? (Object.values(dist) as number[]).reduce((acc, v) => acc + (v || 0), 0)
      : 0;
    let label: string | null = null;
    if (code) {
      const name = vsicByCode.get(code);
      label = name ? `${code} — ${name}` : code;
    }
    vendorEnrichment.set(s.id, {
      industryCode: code,
      industryLabel: label,
      historyDist: dist as Partial<Record<LineKind, number>> | null,
      historyTotal: total,
    });
  }

  return {
    rules,
    vendors,
    accounts,
    items,
    extraEdges,
    ruleAccountHints,
    ruleVendorHints,
    vendorEnrichment,
  };
}

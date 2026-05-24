import type { Rule, RuleCondition, RuleAction } from "@/types/rule";
import type { VendorEntity, AccountEntity, ItemEntity } from "@/data/sampleEntities";

export type NodeKind = "rule" | "vendor" | "account" | "item";

export type GraphNodeData = {
  kind: NodeKind;
  label: string;
  sub?: string;
  rule?: Rule;
  vendor?: VendorEntity;
  account?: AccountEntity;
  item?: ItemEntity;
  ruleCount?: number;
  // For rule nodes
  mode?: Rule["mode"];
  status?: Rule["status"];
  accuracy?: number | null;
  appliedCount?: number;
};

export type GraphEdgeData = {
  kind:
    | "rule-vendor"
    | "rule-account-debit"
    | "rule-account-credit"
    | "partner-default"
    | "classification"
    | "vendor-item"
    | "item-account";
  ruleStatus: Rule["status"];
  ruleMode: Rule["mode"];
  weight: number;
  label?: string;
};

export type ExtraGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "partner-default" | "classification" | "vendor-item" | "item-account";
  label?: string;
  weight: number;
};

export type GraphBuildInput = {
  rules: Rule[];
  vendors: VendorEntity[];
  accounts: AccountEntity[];
  items?: ItemEntity[];
  extraEdges?: ExtraGraphEdge[];
  ruleAccountHints?: Map<string, string[]>;
  ruleVendorHints?: Map<string, string[]>;
};

export type GraphBuildOutput = {
  nodes: Array<{ id: string; data: GraphNodeData; type: NodeKind }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    data: GraphEdgeData;
  }>;
};

const VENDOR_FIELDS = new Set(["vendor.name", "vendor.tax_id", "vendor.industry_code"]);

function extractVendorMentions(conds: RuleCondition[], vendors: VendorEntity[]): string[] {
  const hits = new Set<string>();
  for (const c of conds) {
    if (!VENDOR_FIELDS.has(c.field)) continue;
    const values: string[] = Array.isArray(c.value)
      ? (c.value as unknown[]).map((v) => String(v))
      : [String(c.value)];
    for (const raw of values) {
      const needle = raw.toLowerCase();
      for (const v of vendors) {
        if (
          v.name.toLowerCase().includes(needle) ||
          needle.includes(v.name.toLowerCase()) ||
          (v.tax_id && needle.includes(v.tax_id))
        ) {
          hits.add(v.id);
        }
      }
    }
  }
  return Array.from(hits);
}

function extractAccountMentions(
  actions: RuleAction[],
  accounts: AccountEntity[],
): Array<{ accountId: string; side: "debit" | "credit" }> {
  const out: Array<{ accountId: string; side: "debit" | "credit" }> = [];
  for (const a of actions) {
    if (a.type !== "book") continue;
    const debit = a.params.account_debit;
    const credit = a.params.account_credit;
    if (debit) {
      const acc = accounts.find((x) => x.code === debit);
      if (acc) out.push({ accountId: acc.id, side: "debit" });
    }
    if (credit) {
      const acc = accounts.find((x) => x.code === credit);
      if (acc) out.push({ accountId: acc.id, side: "credit" });
    }
  }
  return out;
}

export function buildGraph({
  rules,
  vendors,
  accounts,
  items = [],
  extraEdges = [],
  ruleAccountHints,
  ruleVendorHints,
}: GraphBuildInput): GraphBuildOutput {
  const nodes: GraphBuildOutput["nodes"] = [];
  const edges: GraphBuildOutput["edges"] = [];

  const vendorRuleCount = new Map<string, number>();
  const accountRuleCount = new Map<string, number>();
  const itemRuleCount = new Map<string, number>();

  for (const r of rules) {
    const accuracy =
      r.applied_count > 0 ? r.correct_count / r.applied_count : null;
    nodes.push({
      id: `rule:${r.id}`,
      type: "rule",
      data: {
        kind: "rule",
        label: r.name,
        sub: r.description,
        rule: r,
        mode: r.mode,
        status: r.status,
        accuracy,
        appliedCount: r.applied_count,
      },
    });

    // Vendor edges — structured conditions OR fuzzy hints
    const vIds = new Set<string>(extractVendorMentions(r.conditions, vendors));
    const hints = ruleVendorHints?.get(r.id) ?? [];
    for (const h of hints) vIds.add(h);
    for (const vid of vIds) {
      vendorRuleCount.set(vid, (vendorRuleCount.get(vid) ?? 0) + 1);
      edges.push({
        id: `e:${r.id}->${vid}`,
        source: `vendor:${vid}`,
        target: `rule:${r.id}`,
        data: {
          kind: "rule-vendor",
          ruleStatus: r.status,
          ruleMode: r.mode,
          weight: Math.min(4, 1 + Math.log10(1 + r.applied_count)),
        },
      });
    }

    // Account edges — structured actions OR text hints
    const accs = extractAccountMentions(r.actions, accounts);
    for (const { accountId, side } of accs) {
      accountRuleCount.set(accountId, (accountRuleCount.get(accountId) ?? 0) + 1);
      edges.push({
        id: `e:${r.id}->${accountId}:${side}`,
        source: `rule:${r.id}`,
        target: `account:${accountId}`,
        data: {
          kind: side === "debit" ? "rule-account-debit" : "rule-account-credit",
          ruleStatus: r.status,
          ruleMode: r.mode,
          weight: Math.min(4, 1 + Math.log10(1 + r.applied_count)),
        },
      });
    }
    const hintedCodes = ruleAccountHints?.get(r.id) ?? [];
    for (const code of hintedCodes) {
      const acc = accounts.find((a) => a.code === code);
      if (!acc) continue;
      const edgeId = `e:${r.id}->${acc.id}:hint`;
      if (edges.some((e) => e.id === edgeId)) continue;
      accountRuleCount.set(acc.id, (accountRuleCount.get(acc.id) ?? 0) + 1);
      edges.push({
        id: edgeId,
        source: `rule:${r.id}`,
        target: `account:${acc.id}`,
        data: {
          kind: "rule-account-debit",
          ruleStatus: r.status,
          ruleMode: r.mode,
          weight: Math.min(4, 1 + Math.log10(1 + r.applied_count)),
        },
      });
    }
  }

  // Extra edges (partner default / classifications / item links)
  const accountIdSet = new Set(accounts.map((a) => a.id));
  const vendorIdSet = new Set(vendors.map((v) => v.id));
  const itemIdSet = new Set(items.map((i) => i.id));
  for (const ee of extraEdges) {
    const srcKind = ee.source.split(":")[0];
    const tgtKind = ee.target.split(":")[0];
    const srcId = ee.source.replace(/^[^:]+:/, "");
    const tgtId = ee.target.replace(/^[^:]+:/, "");
    const srcOk =
      (srcKind === "vendor" && vendorIdSet.has(srcId)) ||
      (srcKind === "item" && itemIdSet.has(srcId)) ||
      (srcKind === "account" && accountIdSet.has(srcId));
    const tgtOk =
      (tgtKind === "vendor" && vendorIdSet.has(tgtId)) ||
      (tgtKind === "item" && itemIdSet.has(tgtId)) ||
      (tgtKind === "account" && accountIdSet.has(tgtId));
    if (!srcOk || !tgtOk) continue;
    edges.push({
      id: ee.id,
      source: ee.source,
      target: ee.target,
      data: {
        kind: ee.kind,
        ruleStatus: "active",
        ruleMode: "auto",
        weight: ee.weight,
        label: ee.label,
      },
    });
    if (srcKind === "vendor") vendorRuleCount.set(srcId, (vendorRuleCount.get(srcId) ?? 0) + 1);
    if (tgtKind === "account") accountRuleCount.set(tgtId, (accountRuleCount.get(tgtId) ?? 0) + 1);
    if (srcKind === "item" || tgtKind === "item") {
      const iid = srcKind === "item" ? srcId : tgtId;
      itemRuleCount.set(iid, (itemRuleCount.get(iid) ?? 0) + 1);
    }
  }

  for (const v of vendors) {
    nodes.push({
      id: `vendor:${v.id}`,
      type: "vendor",
      data: {
        kind: "vendor",
        label: v.name,
        sub: v.industry,
        vendor: v,
        ruleCount: vendorRuleCount.get(v.id) ?? 0,
      },
    });
  }

  for (const a of accounts) {
    nodes.push({
      id: `account:${a.id}`,
      type: "account",
      data: {
        kind: "account",
        label: a.code,
        sub: a.name,
        account: a,
        ruleCount: accountRuleCount.get(a.id) ?? 0,
      },
    });
  }

  for (const it of items) {
    nodes.push({
      id: `item:${it.id}`,
      type: "item",
      data: {
        kind: "item",
        label: it.name,
        sub: kindLabel(it.kind),
        item: it,
        ruleCount: itemRuleCount.get(it.id) ?? 0,
      },
    });
  }

  return { nodes, edges };
}

function kindLabel(k: ItemEntity["kind"]): string {
  switch (k) {
    case "goods":
      return "Hàng hoá";
    case "service":
      return "Dịch vụ";
    case "fixed_asset":
      return "TSCĐ";
    case "ccdc":
      return "CCDC";
  }
}

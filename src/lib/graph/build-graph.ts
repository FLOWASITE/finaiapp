import type { Rule, RuleCondition, RuleAction } from "@/types/rule";
import type { VendorEntity, AccountEntity } from "@/data/sampleEntities";

export type NodeKind = "rule" | "vendor" | "account";

export type GraphNodeData = {
  kind: NodeKind;
  label: string;
  sub?: string;
  rule?: Rule;
  vendor?: VendorEntity;
  account?: AccountEntity;
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
    | "classification";
  ruleStatus: Rule["status"];
  ruleMode: Rule["mode"];
  weight: number;
  label?: string;
};

export type ExtraGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "partner-default" | "classification";
  label?: string;
  weight: number;
};

export type GraphBuildInput = {
  rules: Rule[];
  vendors: VendorEntity[];
  accounts: AccountEntity[];
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

export function buildGraph({ rules, vendors, accounts }: GraphBuildInput): GraphBuildOutput {
  const nodes: GraphBuildOutput["nodes"] = [];
  const edges: GraphBuildOutput["edges"] = [];

  const vendorRuleCount = new Map<string, number>();
  const accountRuleCount = new Map<string, number>();

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

    const vIds = extractVendorMentions(r.conditions, vendors);
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

  return { nodes, edges };
}

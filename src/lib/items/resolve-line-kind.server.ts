/**
 * Quyết định "loại dòng" (LineKind) của một dòng hoá đơn theo thứ tự ưu tiên:
 *   L0 — KTV ghi đè thủ công (user_override_kind)
 *   L1 — Product đã link (products.item_type → kind)
 *   L2 — classify-line heuristics (text + amount + unit + industry)
 *
 * LineKind hẹp hơn ItemType:
 *   - goods : 152/156/155  (NVL, hàng hoá, thành phẩm)
 *   - ccdc  : 153          (Công cụ dụng cụ)  ← tách riêng để journal không nhập kho 156
 *   - asset : 211/213      (TSCĐ hữu hình / vô hình)
 *   - service: 6xx / 242   (Dịch vụ, trả trước phân bổ)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyLine, type LineKind as ClassifyKind, type RawLine } from "@/lib/ai/classify-line";

export type LineKind = "goods" | "ccdc" | "asset" | "service";
export type ResolutionSource = "manual" | "product" | "classify" | "none";

export type ResolveInput = RawLine & {
  product_id?: string | null;
  user_override_kind?: LineKind | null;
};

export type ResolveLineKindResult = {
  kind: LineKind;
  source: ResolutionSource;
  confidence: number; // 0..100
  account: string;
  reason: string;
};

const DEFAULT_ACCOUNT: Record<LineKind, string> = {
  goods: "156",
  ccdc: "153",
  asset: "211",
  service: "6422",
};

export function defaultAccountForKind(k: LineKind): string {
  return DEFAULT_ACCOUNT[k];
}

/** Map products.item_type → LineKind. */
export function mapItemTypeToLineKind(itemType: string | null | undefined): LineKind {
  switch (itemType) {
    case "material":
      return "goods"; // 152
    case "ccdc":
      return "ccdc"; // 153
    case "goods":
      return "goods"; // 156
    case "fixed_asset":
      return "asset"; // 211/213
    case "prepaid":
      return "service"; // 242 — tạm gom vào service cho tới khi có cron amortization
    case "service":
      return "service";
    case "combo":
      return "goods";
    default:
      return "goods";
  }
}

function mapClassifyKind(k: ClassifyKind): LineKind {
  switch (k) {
    case "fixed_asset":
      return "asset";
    case "ccdc":
      return "ccdc";
    case "service":
      return "service";
    case "goods":
    default:
      return "goods";
  }
}

/**
 * Resolve LineKind + account theo cascade L0 → L1 → L2.
 * KHÔNG ghi DB — caller tự persist (resolved_kind, resolved_account, ...).
 */
export async function resolveLineKind(
  supabase: SupabaseClient,
  line: ResolveInput,
): Promise<ResolveLineKindResult> {
  // L0 — KTV ghi đè
  if (line.user_override_kind) {
    return {
      kind: line.user_override_kind,
      source: "manual",
      confidence: 100,
      account: DEFAULT_ACCOUNT[line.user_override_kind],
      reason: "KTV chọn thủ công",
    };
  }

  // L1 — Product knowledge
  if (line.product_id) {
    const { data: p } = await supabase
      .from("products")
      .select("item_type, stock_account, expense_account")
      .eq("id", line.product_id)
      .maybeSingle();
    if (p) {
      const kind = mapItemTypeToLineKind(p.item_type);
      const account =
        (kind === "service" ? p.expense_account : p.stock_account) ??
        p.stock_account ??
        p.expense_account ??
        DEFAULT_ACCOUNT[kind];
      return {
        kind,
        source: "product",
        confidence: 95,
        account,
        reason: `Sản phẩm đã liên kết · item_type=${p.item_type}`,
      };
    }
  }

  // L2 — classify-line fallback
  const c = classifyLine(line);
  return {
    kind: mapClassifyKind(c.kind),
    source: "classify",
    confidence: c.confidence,
    account: c.account,
    reason: `Heuristic: ${c.label}`,
  };
}

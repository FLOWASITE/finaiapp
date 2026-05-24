import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Pencil, ArrowRight, Package, Wrench, Boxes, Hammer, Tag } from "lucide-react";
import type { GraphNodeData } from "@/lib/graph/build-graph";
import type { Rule } from "@/types/rule";
import type { VendorEntity, AccountEntity, ItemEntity } from "@/data/sampleEntities";
import type { LineKind } from "@/lib/ai/classify-line";
import { kindMeta } from "@/lib/ai/classify-line";
import { EditIndustryDialog } from "./EditIndustryDialog";

type ItemNeighbors = { vendors: VendorEntity[]; accounts: AccountEntity[] };

export function GraphSidebar({
  node,
  onClose,
  onEditRule,
  onJumpTo,
  relatedRules,
  itemNeighbors,
}: {
  node: GraphNodeData | null;
  onClose: () => void;
  onEditRule: (rule: Rule) => void;
  onJumpTo: (nodeId: string) => void;
  relatedRules: Rule[];
  itemNeighbors?: ItemNeighbors;
}) {
  if (!node) return null;

  const kindLabel =
    node.kind === "rule"
      ? "Quy tắc"
      : node.kind === "vendor"
        ? "Đối tác"
        : node.kind === "item"
          ? "Hàng hoá/Dịch vụ"
          : "Tài khoản";

  return (
    <div className="flex h-full w-[320px] flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {kindLabel}
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 text-[12.5px]">
        {node.kind === "rule" && node.rule && (
          <RuleDetail rule={node.rule} onEdit={() => onEditRule(node.rule!)} />
        )}
        {node.kind === "vendor" && node.vendor && (
          <VendorDetail
            vendor={node.vendor}
            relatedRules={relatedRules}
            onJumpTo={(id) => onJumpTo(`rule:${id}`)}
          />
        )}
        {node.kind === "account" && node.account && (
          <AccountDetail
            account={node.account}
            relatedRules={relatedRules}
            onJumpTo={(id) => onJumpTo(`rule:${id}`)}
          />
        )}
        {node.kind === "item" && node.item && (
          <ItemDetail
            item={node.item}
            neighbors={itemNeighbors ?? { vendors: [], accounts: [] }}
            onJumpToVendor={(id) => onJumpTo(`vendor:${id}`)}
            onJumpToAccount={(id) => onJumpTo(`account:${id}`)}
          />
        )}
      </div>
    </div>
  );
}

function RuleDetail({ rule, onEdit }: { rule: Rule; onEdit: () => void }) {
  const accuracy =
    rule.applied_count > 0
      ? `${rule.correct_count}/${rule.applied_count} (${((rule.correct_count / rule.applied_count) * 100).toFixed(0)}%)`
      : "—";
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-semibold leading-snug">{rule.name}</div>
        {rule.description && (
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">{rule.description}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {rule.mode}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {rule.source}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          v{rule.version}
        </Badge>
      </div>

      {rule.conditions.length === 0 && rule.actions.length === 0 ? (
        <Section title="Mô tả">
          <div className="whitespace-pre-line rounded-md border bg-muted/30 p-2 text-[11.5px] leading-relaxed text-foreground">
            {rule.description || "(không có nội dung)"}
          </div>
        </Section>
      ) : (
        <>
          <Section title="Điều kiện">
            <ul className="space-y-1">
              {rule.conditions.map((c, i) => (
                <li key={c.id} className="text-[11.5px]">
                  {i > 0 && (
                    <span className="mr-1 font-bold text-[#4F46C7]">{c.logic ?? "AND"}</span>
                  )}
                  <span className="text-muted-foreground">{c.field}</span>{" "}
                  <span className="text-foreground">{c.operator}</span>{" "}
                  <span className="font-medium">
                    {Array.isArray(c.value) ? c.value.join(", ") : String(c.value)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Hành động">
            <ul className="space-y-1">
              {rule.actions.map((a) => (
                <li key={a.id} className="text-[11.5px]">
                  <span className="font-bold text-[#0F6E56]">{a.type.toUpperCase()}</span>{" "}
                  {a.type === "book" && (
                    <span>
                      Nợ <b>{a.params.account_debit}</b> / Có <b>{a.params.account_credit}</b>
                    </span>
                  )}
                  {a.type === "tag" && (
                    <span>
                      {a.params.department && `dept=${a.params.department} `}
                      {a.params.custom_tags?.join(", ")}
                    </span>
                  )}
                  {a.type === "flag" && <span>{a.params.note}</span>}
                  {a.type === "notify" && (
                    <span>
                      {a.params.channel} → {a.params.target}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-2 text-[11px]">
        <Stat label="Áp dụng" value={String(rule.applied_count)} />
        <Stat label="Chính xác" value={accuracy} />
        <Stat label="Ngưỡng tin" value={`${(rule.confidence_threshold * 100).toFixed(0)}%`} />
        <Stat label="Lần cuối" value={rule.last_used ? new Date(rule.last_used).toLocaleDateString("vi-VN") : "—"} />
      </div>

      <Button onClick={onEdit} size="sm" className="w-full gap-1.5">
        <Pencil className="h-3.5 w-3.5" />
        Sửa quy tắc
      </Button>
    </div>
  );
}

function VendorDetail({
  vendor,
  relatedRules,
  onJumpTo,
}: {
  vendor: { id: string; name: string; tax_id?: string; industry?: string };
  relatedRules: Rule[];
  onJumpTo: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-semibold">{vendor.name}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
          {vendor.industry && <>Ngành: {vendor.industry} · </>}
          {vendor.tax_id && <>MST: {vendor.tax_id}</>}
        </div>
      </div>

      <Section title={`Quy tắc liên quan (${relatedRules.length})`}>
        {relatedRules.length === 0 ? (
          <div className="rounded-md border border-dashed bg-amber-50 p-2 text-[11.5px] text-amber-900">
            Chưa có quy tắc nào áp dụng cho đối tác này. AI sẽ học khi có giao dịch.
          </div>
        ) : (
          <ul className="space-y-1">
            {relatedRules.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onJumpTo(r.id)}
                  className="group flex w-full items-center justify-between rounded-md border bg-card px-2 py-1.5 text-left text-[11.5px] hover:border-[#4F46C7]"
                >
                  <span className="line-clamp-1">{r.name}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-[#4F46C7]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function AccountDetail({
  account,
  relatedRules,
  onJumpTo,
}: {
  account: { code: string; name: string };
  relatedRules: Rule[];
  onJumpTo: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-bold tabular-nums">{account.code}</span>
          <span className="text-[12px] text-muted-foreground">{account.name}</span>
        </div>
      </div>

      <Section title={`Quy tắc dùng TK này (${relatedRules.length})`}>
        {relatedRules.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/40 p-2 text-[11.5px] text-muted-foreground">
            Chưa có quy tắc nào dùng tài khoản này.
          </div>
        ) : (
          <ul className="space-y-1">
            {relatedRules.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onJumpTo(r.id)}
                  className="group flex w-full items-center justify-between rounded-md border bg-card px-2 py-1.5 text-left text-[11.5px] hover:border-[#BA7517]"
                >
                  <span className="line-clamp-1">{r.name}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-[#BA7517]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

const ITEM_ICONS = {
  goods: Package,
  service: Wrench,
  fixed_asset: Boxes,
  ccdc: Hammer,
} as const;

const ITEM_KIND_LABEL = {
  goods: "Hàng hoá",
  service: "Dịch vụ",
  fixed_asset: "Tài sản cố định",
  ccdc: "Công cụ dụng cụ",
} as const;

function ItemDetail({
  item,
  neighbors,
  onJumpToVendor,
  onJumpToAccount,
}: {
  item: ItemEntity;
  neighbors: ItemNeighbors;
  onJumpToVendor: (id: string) => void;
  onJumpToAccount: (id: string) => void;
}) {
  const Icon = ITEM_ICONS[item.kind] ?? Package;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#0891B2]">
          <Icon className="h-3 w-3" />
          {ITEM_KIND_LABEL[item.kind]}
        </div>
        <div className="mt-0.5 text-[13px] font-semibold leading-snug">{item.name}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            ×{item.hitCount} lần xuất hiện
          </Badge>
          {item.defaultAccount && (
            <Badge variant="outline" className="text-[10px]">
              Mặc định TK {item.defaultAccount}
            </Badge>
          )}
        </div>
      </div>

      <Section title={`Nhà cung cấp liên quan (${neighbors.vendors.length})`}>
        {neighbors.vendors.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11.5px] text-muted-foreground">
            Chưa gắn với nhà cung cấp cụ thể.
          </div>
        ) : (
          <ul className="space-y-1">
            {neighbors.vendors.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => onJumpToVendor(v.id)}
                  className="group flex w-full items-center justify-between rounded-md border bg-card px-2 py-1.5 text-left text-[11.5px] hover:border-[#0F6E56]"
                >
                  <span className="line-clamp-1">{v.name}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-[#0F6E56]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Tài khoản hạch toán (${neighbors.accounts.length})`}>
        {neighbors.accounts.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/30 p-2 text-[11.5px] text-muted-foreground">
            Chưa có tài khoản nào liên kết.
          </div>
        ) : (
          <ul className="space-y-1">
            {neighbors.accounts.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onJumpToAccount(a.id)}
                  className="group flex w-full items-center justify-between rounded-md border bg-card px-2 py-1.5 text-left text-[11.5px] hover:border-[#BA7517]"
                >
                  <span>
                    <b className="tabular-nums">{a.code}</b>{" "}
                    <span className="text-muted-foreground">{a.name}</span>
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-[#BA7517]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

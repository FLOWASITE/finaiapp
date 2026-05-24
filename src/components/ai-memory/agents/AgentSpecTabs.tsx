import type { AgentSpec } from "@/types/agent";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookCheck, Building2, Landmark } from "lucide-react";

const SEVERITY_STYLES: Record<string, string> = {
  mandatory: "bg-red-50 text-red-700 border-red-200",
  recommended: "bg-amber-50 text-amber-700 border-amber-200",
  advisory: "bg-slate-50 text-slate-600 border-slate-200",
};

const STATUS_STYLES: Record<string, string> = {
  covered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  planned: "bg-slate-50 text-slate-600 border-slate-200",
};

export function SpecBusinessTab({ spec }: { spec: AgentSpec }) {
  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
          <BookCheck className="h-3.5 w-3.5" /> Cây quyết định
        </h4>
        <div className="space-y-2">
          {spec.decision_tree.map((node) => (
            <DecisionTreeNode key={node.id} node={node} depth={0} />
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2">
          Quy tắc nghiệp vụ ({spec.rules.length})
        </h4>
        <div className="space-y-1.5">
          {spec.rules.map((r) => (
            <div key={r.id} className="rounded border p-2.5 text-[12px]">
              <div className="flex items-start gap-2">
                <code className="shrink-0 text-[10px] text-muted-foreground mt-0.5">{r.id}</code>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-[12.5px]">{r.title}</span>
                    <Badge variant="outline" className={`${SEVERITY_STYLES[r.severity]} text-[10px] h-4 px-1.5`}>
                      {r.severity === "mandatory" ? "Bắt buộc" : r.severity === "recommended" ? "Khuyến nghị" : "Tham khảo"}
                    </Badge>
                    {r.reference && (
                      <span className="text-[10px] text-muted-foreground">· {r.reference}</span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5">{r.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2">Trường hợp ngoại lệ</h4>
        <div className="space-y-1.5">
          {spec.exceptions.map((e) => (
            <div key={e.id} className="rounded border bg-amber-50/40 p-2.5 text-[12px]">
              <div className="font-medium">{e.scenario}</div>
              <div className="text-muted-foreground mt-0.5 flex gap-1">
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" /> <span>{e.handling}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DecisionTreeNode({ node, depth }: { node: AgentSpec["decision_tree"][number]; depth: number }) {
  return (
    <div className="text-[12px]" style={{ marginLeft: depth * 12 }}>
      <div className="rounded border p-2 bg-muted/30">
        <div className="font-medium">{node.condition}</div>
        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="flex-1">{node.outcome}</span>
          {node.confidence !== undefined && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 tabular-nums">
              {Math.round(node.confidence * 100)}%
            </Badge>
          )}
        </div>
      </div>
      {node.children && (
        <div className="mt-1 space-y-1 border-l-2 border-dashed pl-3">
          {node.children.map((c) => (
            <DecisionTreeNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecIntegrationTab({ spec }: { spec: AgentSpec }) {
  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Đầu vào
        </h4>
        <ul className="space-y-1.5">
          {spec.inputs.map((io, i) => (
            <li key={i} className="rounded border p-2 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{io.name}</span>
                <code className="text-[10px] text-muted-foreground">{io.format}</code>
              </div>
              {io.notes && <p className="text-muted-foreground text-[11px] mt-0.5">{io.notes}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5" /> Đầu ra
        </h4>
        <ul className="space-y-1.5">
          {spec.outputs.map((io, i) => (
            <li key={i} className="rounded border p-2 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{io.name}</span>
                <code className="text-[10px] text-muted-foreground">{io.format}</code>
              </div>
              {io.notes && <p className="text-muted-foreground text-[11px] mt-0.5">{io.notes}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
          <Landmark className="h-3.5 w-3.5" /> Tích hợp hệ thống
        </h4>
        <ul className="space-y-1.5">
          {spec.integrations.map((i, idx) => (
            <li key={idx} className="rounded border p-2 text-[12px] flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">{i.name}</div>
                {i.notes && <div className="text-muted-foreground text-[11px]">{i.notes}</div>}
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">{i.kind.replace("_", " ")} · {i.direction}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2">Tuân thủ pháp luật</h4>
        <ul className="space-y-1.5">
          {spec.compliance.map((c) => (
            <li key={c.id} className="rounded border p-2 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.requirement}</span>
                <Badge variant="outline" className={`${STATUS_STYLES[c.status]} text-[10px] h-4 px-1.5`}>
                  {c.status === "covered" ? "Đã đáp ứng" : c.status === "partial" ? "Một phần" : "Kế hoạch"}
                </Badge>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{c.reference}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function SpecSlaAuditTab({ spec }: { spec: AgentSpec }) {
  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-[13px] font-semibold mb-2">SLA hiệu năng</h4>
        <div className="grid grid-cols-2 gap-2">
          <SlaCard label="P50 latency" value={`${spec.sla.p50_ms}ms`} />
          <SlaCard label="P95 latency" value={`${spec.sla.p95_ms}ms`} />
          <SlaCard label="Số lần retry tối đa" value={String(spec.sla.max_retry)} />
          <SlaCard label="Timeout" value={`${(spec.sla.timeout_ms / 1000).toFixed(0)}s`} />
        </div>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2">Ma trận tin cậy theo profile</h4>
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <SlaCard label="Strict" value={`${Math.round(spec.confidence_matrix.strict * 100)}%`} />
          <SlaCard label="Balanced" value={`${Math.round(spec.confidence_matrix.balanced * 100)}%`} />
          <SlaCard label="Flexible" value={`${Math.round(spec.confidence_matrix.flexible * 100)}%`} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Khi confidence thấp hơn ngưỡng → <strong>{labelFallback(spec.confidence_matrix.fallback_action)}</strong>
        </p>
      </section>

      <section>
        <h4 className="text-[13px] font-semibold mb-2">Trường audit ghi lại</h4>
        <div className="flex flex-wrap gap-1.5">
          {spec.audit_fields.map((f) => (
            <code key={f} className="text-[11px] rounded bg-muted px-1.5 py-0.5">{f}</code>
          ))}
        </div>
      </section>
    </div>
  );
}

function SlaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[14px] font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function labelFallback(a: AgentSpec["confidence_matrix"]["fallback_action"]): string {
  switch (a) {
    case "queue_human": return "Đẩy vào hàng đợi cho người duyệt";
    case "suggest": return "Chỉ đề xuất, không tự ghi sổ";
    case "reject": return "Từ chối và yêu cầu nhập lại";
    case "log_only": return "Chỉ log để phân tích, không hành động";
  }
}

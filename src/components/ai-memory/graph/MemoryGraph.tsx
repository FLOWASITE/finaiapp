import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useRuleStore } from "@/lib/rules/rule-store";
import { sampleVendors, sampleAccounts } from "@/data/sampleEntities";
import { buildGraph, type GraphNodeData, type GraphEdgeData } from "@/lib/graph/build-graph";
import { layoutGraph } from "@/lib/graph/layout";
import { RuleNode } from "./nodes/RuleNode";
import { VendorNode } from "./nodes/VendorNode";
import { AccountNode } from "./nodes/AccountNode";
import { GraphLegend } from "./GraphLegend";
import { GraphFilters, type GraphFilterState } from "./GraphFilters";
import { GraphSidebar } from "./GraphSidebar";
import { RuleEditor } from "@/components/ai-memory/rules-v2/RuleEditor";
import type { Rule } from "@/types/rule";
import { AlertTriangle, Sparkles } from "lucide-react";

const nodeTypes = {
  rule: RuleNode,
  vendor: VendorNode,
  account: AccountNode,
} as any;

const initialFilters: GraphFilterState = {
  search: "",
  nodeKinds: new Set(["rule", "vendor", "account"]),
  modes: new Set(["auto", "suggest", "disabled"]),
  showOrphans: false,
};

function edgeStyle(data: GraphEdgeData) {
  const disabled = data.ruleStatus !== "active";
  const suggest = data.ruleMode === "suggest";
  const color = disabled ? "#DC2626" : suggest ? "#A3A3A3" : "#0F6E56";
  return {
    stroke: color,
    strokeWidth: data.weight,
    strokeDasharray: disabled ? "2 3" : suggest ? "5 4" : undefined,
    opacity: 0.85,
  };
}

function InnerGraph() {
  const rules = useRuleStore((s) => s.rules);
  const [filters, setFilters] = useState<GraphFilterState>(initialFilters);
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const built = useMemo(
    () => buildGraph({ rules, vendors: sampleVendors, accounts: sampleAccounts }),
    [rules],
  );

  const initialNodes = useMemo<Node<GraphNodeData>[]>(() => {
    const raw: Node<GraphNodeData>[] = built.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      position: { x: 0, y: 0 },
    }));
    const rawEdges: Edge[] = built.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    return layoutGraph(raw, rawEdges, "LR");
  }, [built]);

  const initialEdges = useMemo<Edge[]>(
    () =>
      built.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.data.ruleStatus === "active" && e.data.ruleMode === "auto",
        style: edgeStyle(e.data),
        data: e.data,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeStyle(e.data).stroke,
        },
      })),
    [built],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Compute neighborhood for hover highlight
  const neighbors = useMemo(() => {
    if (!hoverId) return null;
    const ns = new Set<string>([hoverId]);
    const es = new Set<string>();
    for (const e of edges) {
      if (e.source === hoverId || e.target === hoverId) {
        ns.add(e.source);
        ns.add(e.target);
        es.add(e.id);
      }
    }
    return { ns, es };
  }, [hoverId, edges]);

  // Apply filters + hover to compute visibility/opacity
  const displayed = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const visibleNodes = nodes.map((n) => {
      const d = n.data;
      let visible = filters.nodeKinds.has(d.kind);
      if (d.kind === "rule" && d.mode) {
        const modeKey = d.mode === "learn_only" ? "suggest" : d.mode;
        if (!filters.modes.has(modeKey as any)) visible = false;
      }
      if (filters.showOrphans && d.kind !== "rule" && (d.ruleCount ?? 0) > 0) {
        visible = false;
      }
      if (q) {
        const hay = `${d.label} ${d.sub ?? ""}`.toLowerCase();
        if (!hay.includes(q)) visible = false;
      }
      const dimmed = neighbors && !neighbors.ns.has(n.id);
      return {
        ...n,
        hidden: !visible,
        style: {
          ...(n.style || {}),
          opacity: dimmed ? 0.2 : 1,
          transition: "opacity 0.15s",
        },
      };
    });
    const visibleIds = new Set(visibleNodes.filter((n) => !n.hidden).map((n) => n.id));
    const visibleEdges = edges.map((e) => {
      const visible = visibleIds.has(e.source) && visibleIds.has(e.target);
      const dimmed = neighbors && !neighbors.es.has(e.id);
      return {
        ...e,
        hidden: !visible,
        style: { ...(e.style || {}), opacity: dimmed ? 0.1 : (e.style as any)?.opacity ?? 0.85 },
      };
    });
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, filters, neighbors]);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedNode((node.data as GraphNodeData) ?? null);
  }, []);

  const onNodeDoubleClick = useCallback<NodeMouseHandler>((_, node) => {
    const d = node.data as GraphNodeData;
    if (d.kind === "rule" && d.rule) setEditingRule(d.rule);
  }, []);

  const onNodeMouseEnter = useCallback<NodeMouseHandler>((_, node) => {
    setHoverId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setHoverId(null), []);

  // Related rules for sidebar
  const relatedRules = useMemo<Rule[]>(() => {
    if (!selectedNode) return [];
    if (selectedNode.kind === "vendor" && selectedNode.vendor) {
      const vid = `vendor:${selectedNode.vendor.id}`;
      const ruleIds = edges.filter((e) => e.source === vid).map((e) => e.target);
      return rules.filter((r) => ruleIds.includes(`rule:${r.id}`));
    }
    if (selectedNode.kind === "account" && selectedNode.account) {
      const aid = `account:${selectedNode.account.id}`;
      const ruleIds = edges.filter((e) => e.target === aid).map((e) => e.source);
      return rules.filter((r) => ruleIds.includes(`rule:${r.id}`));
    }
    return [];
  }, [selectedNode, edges, rules]);

  // Insights banner
  const insights = useMemo(() => {
    const orphanVendors = built.nodes.filter(
      (n) => n.type === "vendor" && (n.data.ruleCount ?? 0) === 0,
    ).length;
    const deadRules = rules.filter((r) => r.applied_count === 0).length;
    const pausedConflicts = rules.filter((r) => r.status === "paused").length;
    return { orphanVendors, deadRules, pausedConflicts };
  }, [built.nodes, rules]);

  const handleJumpTo = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) setSelectedNode(node.data as GraphNodeData);
    },
    [nodes],
  );

  return (
    <div className="flex h-full flex-col">
      <GraphFilters
        state={filters}
        onChange={setFilters}
        onReset={() => setFilters(initialFilters)}
      />

      {(insights.orphanVendors > 0 || insights.deadRules > 0 || insights.pausedConflicts > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50/60 px-3 py-1.5 text-[11.5px] text-amber-900">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-semibold">Phát hiện:</span>
          {insights.orphanVendors > 0 && (
            <button
              onClick={() => setFilters((f) => ({ ...f, showOrphans: true }))}
              className="rounded-full border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100"
            >
              <AlertTriangle className="-mt-0.5 mr-0.5 inline h-3 w-3" />
              {insights.orphanVendors} đối tác chưa có quy tắc
            </button>
          )}
          {insights.deadRules > 0 && (
            <span className="rounded-full bg-white px-2 py-0.5 border border-amber-300">
              {insights.deadRules} quy tắc chưa từng dùng
            </span>
          )}
          {insights.pausedConflicts > 0 && (
            <span className="rounded-full bg-white px-2 py-0.5 border border-amber-300">
              {insights.pausedConflicts} quy tắc đang tắt
            </span>
          )}
        </div>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ReactFlow
            nodes={displayed.nodes}
            edges={displayed.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="#E5E5E5" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const k = (n.data as GraphNodeData)?.kind;
                return k === "rule" ? "#4F46C7" : k === "vendor" ? "#0F6E56" : "#BA7517";
              }}
              maskColor="rgba(0,0,0,0.06)"
            />
          </ReactFlow>

          <div className="absolute right-3 top-3 z-10">
            <GraphLegend />
          </div>
        </div>

        {selectedNode && (
          <GraphSidebar
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onEditRule={(r) => setEditingRule(r)}
            onJumpTo={handleJumpTo}
            relatedRules={relatedRules}
          />
        )}
      </div>

      {editingRule && (
        <RuleEditor
          rule={editingRule}
          open={!!editingRule}
          onOpenChange={(o) => {
            if (!o) setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}

export function MemoryGraph() {
  return (
    <ReactFlowProvider>
      <InnerGraph />
    </ReactFlowProvider>
  );
}

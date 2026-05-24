import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getMemoryGraphData,
  saveGraphLayout,
} from "@/lib/graph/memory-graph.functions";
import { adaptDbToGraph } from "@/lib/graph/adapt-db";
import {
  buildGraph,
  type GraphNodeData,
  type GraphEdgeData,
} from "@/lib/graph/build-graph";
import { layoutGraph } from "@/lib/graph/layout";
import { RuleNode } from "./nodes/RuleNode";
import { VendorNode } from "./nodes/VendorNode";
import { AccountNode } from "./nodes/AccountNode";
import { ItemNode } from "./nodes/ItemNode";
import { GraphLegend } from "./GraphLegend";
import { GraphFilters, type GraphFilterState } from "./GraphFilters";
import { GraphSidebar } from "./GraphSidebar";
import type { Rule } from "@/types/rule";
import { AlertTriangle, Sparkles, Brain, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const nodeTypes = {
  rule: RuleNode,
  vendor: VendorNode,
  account: AccountNode,
  item: ItemNode,
} as any;

const initialFilters: GraphFilterState = {
  search: "",
  nodeKinds: new Set(["rule", "vendor", "account", "item"]),
  modes: new Set(["auto", "suggest", "disabled"]),
  showOrphans: false,
};

function edgeStyle(data: GraphEdgeData) {
  if (data.kind === "partner-default") {
    return { stroke: "#0EA5A4", strokeWidth: data.weight, opacity: 0.7 };
  }
  if (data.kind === "classification") {
    return {
      stroke: "#94A3B8",
      strokeWidth: data.weight,
      strokeDasharray: "3 3",
      opacity: 0.6,
    };
  }
  if (data.kind === "vendor-item") {
    return { stroke: "#0891B2", strokeWidth: data.weight, opacity: 0.75 };
  }
  if (data.kind === "item-account") {
    return {
      stroke: "#0891B2",
      strokeWidth: data.weight,
      strokeDasharray: "4 3",
      opacity: 0.7,
    };
  }
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
  const fetchGraph = useServerFn(getMemoryGraphData);
  const saveLayout = useServerFn(saveGraphLayout);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["memory-graph"],
    queryFn: () => fetchGraph(),
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: (positions: Record<string, { x: number; y: number }>) =>
      saveLayout({ data: { positions } }),
  });

  const [filters, setFilters] = useState<GraphFilterState>(initialFilters);
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const adapted = useMemo(
    () => (data ? adaptDbToGraph(data) : null),
    [data],
  );

  const built = useMemo(() => {
    if (!adapted) return { nodes: [], edges: [] };
    return buildGraph({
      rules: adapted.rules,
      vendors: adapted.vendors,
      accounts: adapted.accounts,
      items: adapted.items,
      extraEdges: adapted.extraEdges,
      ruleAccountHints: adapted.ruleAccountHints,
      ruleVendorHints: adapted.ruleVendorHints,
      vendorEnrichment: adapted.vendorEnrichment,
    });
  }, [adapted]);

  const initialNodes = useMemo<Node<GraphNodeData>[]>(() => {
    const savedPositions = data?.positions ?? {};
    const raw: Node<GraphNodeData>[] = built.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      position: savedPositions[n.id] ?? { x: 0, y: 0 },
    }));
    const rawEdges: Edge[] = built.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    // For nodes without saved positions, run dagre on the full set; then
    // overlay saved positions afterwards so user adjustments win.
    const laid = layoutGraph(raw, rawEdges, "LR");
    return laid.map((n) =>
      savedPositions[n.id] ? { ...n, position: savedPositions[n.id] } : n,
    );
  }, [built, data?.positions]);

  const initialEdges = useMemo<Edge[]>(
    () =>
      built.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated:
          e.data.kind.startsWith("rule-") &&
          e.data.ruleStatus === "active" &&
          e.data.ruleMode === "auto",
        style: edgeStyle(e.data),
        data: e.data,
        label: e.data.label,
        labelStyle: { fontSize: 10, fill: "#475569" },
        labelBgStyle: { fill: "white", fillOpacity: 0.9 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeStyle(e.data).stroke,
        },
      })),
    [built],
  );

  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<GraphNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Persist positions, debounced
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNodeDragStop = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) positions[n.id] = { x: n.position.x, y: n.position.y };
      saveMut.mutate(positions);
    }, 600);
  }, [nodes, saveMut]);

  // Realtime: invalidate when rules change
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ["memory-graph"] });
    window.addEventListener("ai-memory:invalidate", handler);
    return () => window.removeEventListener("ai-memory:invalidate", handler);
  }, [queryClient]);

  // Hover neighborhood
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
        style: {
          ...(e.style || {}),
          opacity: dimmed ? 0.1 : (e.style as any)?.opacity ?? 0.85,
        },
      };
    });
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, filters, neighbors]);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedNode((node.data as GraphNodeData) ?? null);
  }, []);

  const onNodeMouseEnter = useCallback<NodeMouseHandler>((_, node) => {
    setHoverId(node.id);
  }, []);
  const onNodeMouseLeave = useCallback(() => setHoverId(null), []);

  const rules = adapted?.rules ?? [];
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

  const itemNeighbors = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "item" || !selectedNode.item) {
      return { vendors: [], accounts: [] };
    }
    const iid = `item:${selectedNode.item.id}`;
    const vendorIds = edges
      .filter((e) => e.target === iid && e.source.startsWith("vendor:"))
      .map((e) => e.source.replace("vendor:", ""));
    const accountIds = edges
      .filter((e) => e.source === iid && e.target.startsWith("account:"))
      .map((e) => e.target.replace("account:", ""));
    const vendors = (adapted?.vendors ?? []).filter((v) => vendorIds.includes(v.id));
    const accounts = (adapted?.accounts ?? []).filter((a) => accountIds.includes(a.id));
    return { vendors, accounts };
  }, [selectedNode, edges, adapted]);

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

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Skeleton className="col-span-2 h-full" />
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
          <div className="mt-2 text-sm font-medium">Không tải được sơ đồ trí nhớ</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {(error as Error)?.message}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty =
    rules.length === 0 &&
    (adapted?.vendors.length ?? 0) === 0 &&
    (adapted?.items.length ?? 0) === 0;
  if (isEmpty) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center">
        <div className="max-w-md">
          <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
          <div className="mt-3 text-base font-semibold">Chưa có dữ liệu trí nhớ</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Bắt đầu chat với AI hoặc thêm nhà cung cấp để hệ thống học và xây sơ đồ
            quy tắc cho bạn.
          </div>
        </div>
      </div>
    );
  }

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
          {saveMut.isPending && (
            <span className="ml-auto flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang lưu layout…
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
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onNodeDragStop={onNodeDragStop}
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
                if (k === "rule") return "#4F46C7";
                if (k === "vendor") return "#0F6E56";
                if (k === "item") return "#0891B2";
                return "#BA7517";
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
            onEditRule={() => {
              window.dispatchEvent(new CustomEvent("ai-memory:go-rules"));
            }}
            onJumpTo={handleJumpTo}
            relatedRules={relatedRules}
            itemNeighbors={itemNeighbors}
          />
        )}
      </div>
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

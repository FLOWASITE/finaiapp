import dagre from "@dagrejs/dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

export function layoutGraph<NData extends Record<string, unknown>>(
  nodes: Node<NData>[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): Node<NData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 90, marginx: 30, marginy: 30 });

  const W = 200;
  const H = 76;

  for (const n of nodes) g.setNode(n.id, { width: W, height: H });
  for (const e of edges) g.setEdge(e.source, e.target);

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - W / 2, y: p.y - H / 2 },
      sourcePosition: direction === "LR" ? Position.Right : Position.Bottom,
      targetPosition: direction === "LR" ? Position.Left : Position.Top,
    };
  });
}

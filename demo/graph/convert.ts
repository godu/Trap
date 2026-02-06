import type { Node, Edge } from "../../src/types";
import type { GraphStep } from "./types";
import { TYPE_ICON_INDEX } from "../icons/index";
import {
  TYPE_COLORS,
  DEFAULT_NODE_COLOR,
  EDGE_TYPE_COLORS,
  DEFAULT_EDGE_COLOR,
  NODE_RADIUS,
  SELECTED_NODE_RADIUS,
} from "../settings";

/** Convert a GraphStep's nodes to renderer Node[] with ids. */
export function toRenderNodes(step: GraphStep): Node[] {
  const nodes: Node[] = [];
  for (const [id, gNode] of step.nodes) {
    const [r, g, b] = TYPE_COLORS[gNode.type] ?? DEFAULT_NODE_COLOR;
    nodes.push({
      id,
      x: gNode.x,
      y: gNode.y,
      r,
      g,
      b,
      radius: gNode.selected ? SELECTED_NODE_RADIUS : NODE_RADIUS,
      opacity: 1.0,
      icon: TYPE_ICON_INDEX[gNode.type] ?? 0,
      label: gNode.label,
    });
  }
  return nodes;
}

/** Convert a GraphStep's edges to Edge object array for the renderer. */
export function toEdges(step: GraphStep): Edge[] {
  const edges: Edge[] = [];

  for (const [srcId, targets] of step.edges) {
    if (!step.nodes.has(srcId)) continue;
    for (const [tgtId, edge] of targets) {
      if (!step.nodes.has(tgtId)) continue;
      const [r, g, b, a] = EDGE_TYPE_COLORS[edge.type] ?? DEFAULT_EDGE_COLOR;
      edges.push({
        id: `${srcId}->${tgtId}`,
        source: srcId,
        target: tgtId,
        r,
        g,
        b,
        a,
        zIndex: edge.type === "escalation" ? 1 : 0,
      });
    }
  }

  return edges;
}

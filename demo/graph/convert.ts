import type { Node, Edge } from "../../src/types";
import type { GraphStep } from "./types";
import { TYPE_ICON_INDEX } from "../icons/index";

const NODE_TYPE_COLORS: Record<string, [number, number, number]> = {
  "aws:dynamodb:table": [0.29, 0.47, 0.82],
  "aws:ec2:instance": [0.95, 0.77, 0.06],
  "aws:iam:role": [0.86, 0.21, 0.27],
  "aws:iam:user": [0.72, 0.15, 0.22],
  "aws:lambda:function": [0.95, 0.61, 0.07],
};

const DEFAULT_NODE_COLOR: [number, number, number] = [0.6, 0.6, 0.6];

const EDGE_TYPE_COLORS: Record<string, [number, number, number, number]> = {
  privilege: [0.3, 0.55, 0.75, 0.4],
  escalation: [0.9, 0.25, 0.2, 0.6],
};

const DEFAULT_EDGE_COLOR: [number, number, number, number] = [
  0.5, 0.5, 0.5, 0.3,
];

const DEFAULT_RADIUS = 2.0;
const SELECTED_RADIUS = 3.0;

/** Convert a GraphStep's nodes to renderer Node[] with ids. */
export function toRenderNodes(step: GraphStep): Node[] {
  const nodes: Node[] = [];
  for (const [id, gNode] of step.nodes) {
    const [r, g, b] = NODE_TYPE_COLORS[gNode.type] ?? DEFAULT_NODE_COLOR;
    nodes.push({
      id,
      x: gNode.x,
      y: gNode.y,
      r,
      g,
      b,
      radius: gNode.selected ? SELECTED_RADIUS : DEFAULT_RADIUS,
      opacity: 1.0,
      icon: TYPE_ICON_INDEX[gNode.type] ?? 0,
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

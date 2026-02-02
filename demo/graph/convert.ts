import type { Node } from "../../src/types";
import type { GraphStep } from "./types";

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

const DEFAULT_EDGE_COLOR: [number, number, number, number] = [0.5, 0.5, 0.5, 0.3];

const DEFAULT_RADIUS = 2.0;
const SELECTED_RADIUS = 3.0;

/** Pack premultiplied RGBA into a uint32 (little-endian: R | G<<8 | B<<16 | A<<24) */
export function packPremultiplied(r: number, g: number, b: number, a: number): number {
  return (
    ((r * a * 255 + 0.5) | 0) |
    (((g * a * 255 + 0.5) | 0) << 8) |
    (((b * a * 255 + 0.5) | 0) << 16) |
    (((a * 255 + 0.5) | 0) << 24)
  );
}

/** Convert a GraphStep's nodes to renderer Node[] using positions from the nodes themselves. */
export function toRenderNodes(step: GraphStep): Node[] {
  const nodes: Node[] = [];
  for (const [, gNode] of step.nodes) {
    const [r, g, b] = NODE_TYPE_COLORS[gNode.type] ?? DEFAULT_NODE_COLOR;
    nodes.push({
      x: gNode.x,
      y: gNode.y,
      r,
      g,
      b,
      radius: gNode.selected ? SELECTED_RADIUS : DEFAULT_RADIUS,
    });
  }
  return nodes;
}

const BYTES_PER_EDGE = 20;

/** Convert a GraphStep's edges to binary edge buffer for the renderer. */
export function toEdgeBuffer(step: GraphStep): { buffer: Uint8Array; count: number } {
  // Count max possible edges
  let maxEdges = 0;
  for (const targets of step.edges.values()) maxEdges += targets.size;

  const arrayBuf = new ArrayBuffer(maxEdges * BYTES_PER_EDGE);
  const f32 = new Float32Array(arrayBuf);
  const u32 = new Uint32Array(arrayBuf);
  let count = 0;

  for (const [srcId, targets] of step.edges) {
    const srcNode = step.nodes.get(srcId);
    if (!srcNode) continue;
    for (const [tgtId, edge] of targets) {
      const tgtNode = step.nodes.get(tgtId);
      if (!tgtNode) continue;
      const slot = count * 5; // 20 bytes / 4 = 5 uint32-slots per edge
      f32[slot] = srcNode.x;
      f32[slot + 1] = srcNode.y;
      f32[slot + 2] = tgtNode.x;
      f32[slot + 3] = tgtNode.y;
      const [r, g, b, a] = EDGE_TYPE_COLORS[edge.type] ?? DEFAULT_EDGE_COLOR;
      u32[slot + 4] = packPremultiplied(r, g, b, a);
      count++;
    }
  }

  return { buffer: new Uint8Array(arrayBuf, 0, count * BYTES_PER_EDGE), count };
}

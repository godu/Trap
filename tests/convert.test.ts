import { describe, it, expect } from "vitest";
import { toRenderNodes, toEdges } from "../demo/graph/convert";
import type { GraphStep } from "../demo/graph/types";

function makeStep(
  nodes: [string, string, number, number, boolean?][],
  edges: [string, string, string][] = [],
): GraphStep {
  const nodeMap = new Map(
    nodes.map(([id, type, x, y, selected]) => [
      id,
      { label: id, type, x, y, ...(selected !== undefined ? { selected } : {}) },
    ]),
  );
  const edgeMap = new Map<string, Map<string, { type: string }>>();
  for (const [src, tgt, edgeType] of edges) {
    if (!edgeMap.has(src)) edgeMap.set(src, new Map());
    edgeMap.get(src)!.set(tgt, { type: edgeType });
  }
  return { nodes: nodeMap, edges: edgeMap };
}

describe("toRenderNodes", () => {
  it("returns correct count", () => {
    const step = makeStep([
      ["a", "aws:iam:role", 10, 20],
      ["b", "aws:ec2:instance", -5, 15],
    ]);
    const nodes = toRenderNodes(step);
    expect(nodes).toHaveLength(2);
  });

  it("includes node id", () => {
    const step = makeStep([["myId", "aws:iam:role", 0, 0]]);
    const nodes = toRenderNodes(step);
    expect(nodes[0].id).toBe("myId");
  });

  it("includes opacity", () => {
    const step = makeStep([["a", "aws:iam:role", 0, 0]]);
    const nodes = toRenderNodes(step);
    expect(nodes[0].opacity).toBe(1.0);
  });

  it("maps node types to correct RGB colors", () => {
    const step = makeStep([
      ["a", "aws:dynamodb:table", 0, 0],
      ["b", "aws:ec2:instance", 1, 1],
      ["c", "aws:iam:role", 2, 2],
      ["d", "aws:iam:user", 3, 3],
      ["e", "aws:lambda:function", 4, 4],
    ]);
    const nodes = toRenderNodes(step);

    // dynamodb:table → blue
    expect(nodes[0].r).toBeCloseTo(0.29);
    expect(nodes[0].g).toBeCloseTo(0.47);
    expect(nodes[0].b).toBeCloseTo(0.82);

    // ec2:instance → yellow
    expect(nodes[1].r).toBeCloseTo(0.95);
    expect(nodes[1].g).toBeCloseTo(0.77);
    expect(nodes[1].b).toBeCloseTo(0.06);

    // iam:role → red
    expect(nodes[2].r).toBeCloseTo(0.86);
    expect(nodes[2].g).toBeCloseTo(0.21);
    expect(nodes[2].b).toBeCloseTo(0.27);

    // iam:user → dark red
    expect(nodes[3].r).toBeCloseTo(0.72);
    expect(nodes[3].g).toBeCloseTo(0.15);
    expect(nodes[3].b).toBeCloseTo(0.22);

    // lambda:function → orange
    expect(nodes[4].r).toBeCloseTo(0.95);
    expect(nodes[4].g).toBeCloseTo(0.61);
    expect(nodes[4].b).toBeCloseTo(0.07);
  });

  it("uses default color for unknown types", () => {
    const step = makeStep([["a", "aws:unknown:thing", 0, 0]]);
    const nodes = toRenderNodes(step);

    expect(nodes[0].r).toBeCloseTo(0.6);
    expect(nodes[0].g).toBeCloseTo(0.6);
    expect(nodes[0].b).toBeCloseTo(0.6);
  });

  it("applies positions from node data", () => {
    const step = makeStep([["a", "aws:iam:role", 42.5, -17.3]]);
    const nodes = toRenderNodes(step);

    expect(nodes[0].x).toBe(42.5);
    expect(nodes[0].y).toBe(-17.3);
  });

  it("selected nodes get larger radius", () => {
    const step = makeStep([
      ["a", "aws:iam:role", 0, 0, true],
      ["b", "aws:iam:role", 1, 1, false],
      ["c", "aws:iam:role", 2, 2],
    ]);
    const nodes = toRenderNodes(step);

    expect(nodes[0].radius).toBe(3.0);
    expect(nodes[1].radius).toBe(2.0);
    expect(nodes[2].radius).toBe(2.0);
  });
});

describe("toEdges", () => {
  it("returns correct count", () => {
    const step = makeStep(
      [
        ["a", "aws:iam:role", 10, 20],
        ["b", "aws:ec2:instance", 30, 40],
      ],
      [["a", "b", "privilege"]],
    );
    const edges = toEdges(step);
    expect(edges).toHaveLength(1);
  });

  it("generates edge id from source->target", () => {
    const step = makeStep(
      [
        ["a", "test", 0, 0],
        ["b", "test", 1, 1],
      ],
      [["a", "b", "privilege"]],
    );
    const edges = toEdges(step);
    expect(edges[0].id).toBe("a->b");
  });

  it("sets source and target node ids", () => {
    const step = makeStep(
      [
        ["a", "test", 0, 0],
        ["b", "test", 1, 1],
      ],
      [["a", "b", "privilege"]],
    );
    const edges = toEdges(step);
    expect(edges[0].source).toBe("a");
    expect(edges[0].target).toBe("b");
  });

  it("maps privilege edges to correct RGBA", () => {
    const step = makeStep(
      [
        ["a", "test", 0, 0],
        ["b", "test", 1, 1],
      ],
      [["a", "b", "privilege"]],
    );
    const edges = toEdges(step);
    expect(edges[0].r).toBeCloseTo(0.3);
    expect(edges[0].g).toBeCloseTo(0.55);
    expect(edges[0].b).toBeCloseTo(0.75);
    expect(edges[0].a).toBeCloseTo(0.4);
  });

  it("maps escalation edges to correct RGBA", () => {
    const step = makeStep(
      [
        ["a", "test", 0, 0],
        ["b", "test", 1, 1],
      ],
      [["a", "b", "escalation"]],
    );
    const edges = toEdges(step);
    expect(edges[0].r).toBeCloseTo(0.9);
    expect(edges[0].g).toBeCloseTo(0.25);
    expect(edges[0].b).toBeCloseTo(0.2);
    expect(edges[0].a).toBeCloseTo(0.6);
  });

  it("skips edges with missing source node", () => {
    const step = makeStep([["b", "test", 1, 1]], [["a", "b", "privilege"]]);
    const edges = toEdges(step);
    expect(edges).toHaveLength(0);
  });

  it("skips edges with missing target node", () => {
    const step = makeStep([["a", "test", 1, 1]], [["a", "b", "privilege"]]);
    const edges = toEdges(step);
    expect(edges).toHaveLength(0);
  });

  it("handles multiple edges from multiple sources", () => {
    const step = makeStep(
      [
        ["a", "test", 0, 0],
        ["b", "test", 10, 10],
        ["c", "test", 20, 20],
      ],
      [
        ["a", "b", "privilege"],
        ["a", "c", "escalation"],
        ["b", "c", "privilege"],
      ],
    );
    const edges = toEdges(step);
    expect(edges).toHaveLength(3);
  });
});

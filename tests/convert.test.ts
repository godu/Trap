import { describe, it, expect } from "vitest";
import { toRenderNodes, toEdgeBuffer, packPremultiplied } from "../src/graph/convert";
import type { GraphStep, LayoutResult } from "../src/graph/types";

function makeLayout(entries: [string, number, number][]): LayoutResult {
  return new Map(entries.map(([id, x, y]) => [id, { x, y }]));
}

function makeStep(
  nodes: [string, string, boolean?][],
  edges: [string, string, string][] = [],
): GraphStep {
  const nodeMap = new Map(
    nodes.map(([id, type, selected]) => [
      id,
      { label: id, type, ...(selected !== undefined ? { selected } : {}) },
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
      ["a", "aws:iam:role"],
      ["b", "aws:ec2:instance"],
    ]);
    const layout = makeLayout([["a", 10, 20], ["b", -5, 15]]);
    const nodes = toRenderNodes(step, layout);
    expect(nodes).toHaveLength(2);
  });

  it("maps node types to correct RGB colors", () => {
    const step = makeStep([
      ["a", "aws:dynamodb:table"],
      ["b", "aws:ec2:instance"],
      ["c", "aws:iam:role"],
      ["d", "aws:iam:user"],
      ["e", "aws:lambda:function"],
    ]);
    const layout = makeLayout([
      ["a", 0, 0], ["b", 1, 1], ["c", 2, 2], ["d", 3, 3], ["e", 4, 4],
    ]);
    const nodes = toRenderNodes(step, layout);

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
    const step = makeStep([["a", "aws:unknown:thing"]]);
    const layout = makeLayout([["a", 0, 0]]);
    const nodes = toRenderNodes(step, layout);

    expect(nodes[0].r).toBeCloseTo(0.6);
    expect(nodes[0].g).toBeCloseTo(0.6);
    expect(nodes[0].b).toBeCloseTo(0.6);
  });

  it("applies positions from layout", () => {
    const step = makeStep([["a", "aws:iam:role"]]);
    const layout = makeLayout([["a", 42.5, -17.3]]);
    const nodes = toRenderNodes(step, layout);

    expect(nodes[0].x).toBe(42.5);
    expect(nodes[0].y).toBe(-17.3);
  });

  it("selected nodes get larger radius", () => {
    const step = makeStep([
      ["a", "aws:iam:role", true],
      ["b", "aws:iam:role", false],
      ["c", "aws:iam:role"],
    ]);
    const layout = makeLayout([["a", 0, 0], ["b", 1, 1], ["c", 2, 2]]);
    const nodes = toRenderNodes(step, layout);

    expect(nodes[0].radius).toBe(3.0);
    expect(nodes[1].radius).toBe(2.0);
    expect(nodes[2].radius).toBe(2.0);
  });

  it("skips nodes without layout positions", () => {
    const step = makeStep([
      ["a", "aws:iam:role"],
      ["b", "aws:iam:role"],
    ]);
    const layout = makeLayout([["a", 0, 0]]); // missing "b"
    const nodes = toRenderNodes(step, layout);
    expect(nodes).toHaveLength(1);
  });
});

describe("toEdgeBuffer", () => {
  it("returns correct byte length (count * 20)", () => {
    const step = makeStep(
      [["a", "aws:iam:role"], ["b", "aws:ec2:instance"]],
      [["a", "b", "privilege"]],
    );
    const layout = makeLayout([["a", 10, 20], ["b", 30, 40]]);
    const { buffer, count } = toEdgeBuffer(step, layout);

    expect(count).toBe(1);
    expect(buffer.byteLength).toBe(20);
  });

  it("encodes positions correctly as Float32", () => {
    const step = makeStep(
      [["a", "test"], ["b", "test"]],
      [["a", "b", "privilege"]],
    );
    const layout = makeLayout([["a", 10, 20], ["b", 30, 40]]);
    const { buffer } = toEdgeBuffer(step, layout);

    const f32 = new Float32Array(buffer.buffer, buffer.byteOffset, 4);
    expect(f32[0]).toBeCloseTo(10); // srcX
    expect(f32[1]).toBeCloseTo(20); // srcY
    expect(f32[2]).toBeCloseTo(30); // tgtX
    expect(f32[3]).toBeCloseTo(40); // tgtY
  });

  it("packs RGBA correctly for privilege edges", () => {
    const step = makeStep(
      [["a", "test"], ["b", "test"]],
      [["a", "b", "privilege"]],
    );
    const layout = makeLayout([["a", 0, 0], ["b", 1, 1]]);
    const { buffer } = toEdgeBuffer(step, layout);

    const u32 = new Uint32Array(buffer.buffer, buffer.byteOffset, 5);
    const expected = packPremultiplied(0.3, 0.55, 0.75, 0.4);
    // packPremultiplied returns signed int32, Uint32Array stores unsigned
    expect(u32[4]).toBe(expected >>> 0);
  });

  it("packs RGBA correctly for escalation edges", () => {
    const step = makeStep(
      [["a", "test"], ["b", "test"]],
      [["a", "b", "escalation"]],
    );
    const layout = makeLayout([["a", 0, 0], ["b", 1, 1]]);
    const { buffer } = toEdgeBuffer(step, layout);

    const u32 = new Uint32Array(buffer.buffer, buffer.byteOffset, 5);
    const expected = packPremultiplied(0.9, 0.25, 0.2, 0.6);
    expect(u32[4]).toBe(expected >>> 0);
  });

  it("skips edges with missing source positions", () => {
    const step = makeStep(
      [["a", "test"], ["b", "test"]],
      [["a", "b", "privilege"]],
    );
    const layout = makeLayout([["b", 1, 1]]); // missing "a"
    const { count } = toEdgeBuffer(step, layout);
    expect(count).toBe(0);
  });

  it("skips edges with missing target positions", () => {
    const step = makeStep(
      [["a", "test"], ["b", "test"]],
      [["a", "b", "privilege"]],
    );
    const layout = makeLayout([["a", 1, 1]]); // missing "b"
    const { count } = toEdgeBuffer(step, layout);
    expect(count).toBe(0);
  });

  it("handles multiple edges from multiple sources", () => {
    const step = makeStep(
      [["a", "test"], ["b", "test"], ["c", "test"]],
      [
        ["a", "b", "privilege"],
        ["a", "c", "escalation"],
        ["b", "c", "privilege"],
      ],
    );
    const layout = makeLayout([["a", 0, 0], ["b", 10, 10], ["c", 20, 20]]);
    const { buffer, count } = toEdgeBuffer(step, layout);

    expect(count).toBe(3);
    expect(buffer.byteLength).toBe(60);
  });
});

describe("packPremultiplied", () => {
  it("packs fully opaque white correctly", () => {
    const packed = packPremultiplied(1, 1, 1, 1);
    expect(packed & 0xff).toBe(255);           // R
    expect((packed >> 8) & 0xff).toBe(255);    // G
    expect((packed >> 16) & 0xff).toBe(255);   // B
    expect((packed >>> 24) & 0xff).toBe(255);  // A
  });

  it("premultiplies alpha", () => {
    const packed = packPremultiplied(1, 1, 1, 0.5);
    const r = packed & 0xff;
    const g = (packed >> 8) & 0xff;
    const b = (packed >> 16) & 0xff;
    const a = (packed >>> 24) & 0xff;

    // 1.0 * 0.5 * 255 ≈ 128
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
    expect(a).toBe(128);
  });
});

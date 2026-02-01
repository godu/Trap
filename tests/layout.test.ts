import { describe, it, expect } from "vitest";
import { computeLayout } from "../src/graph/layout";
import type { GraphStep } from "../src/graph/types";

function makeStep(
  nodeIds: string[],
  edges: [string, string][] = [],
): GraphStep {
  const nodes = new Map(
    nodeIds.map((id) => [id, { label: id, type: "test" }]),
  );
  const edgeMap = new Map<string, Map<string, { type: string }>>();
  for (const [src, tgt] of edges) {
    if (!edgeMap.has(src)) edgeMap.set(src, new Map());
    edgeMap.get(src)!.set(tgt, { type: "test" });
  }
  return { nodes, edges: edgeMap };
}

describe("computeLayout", () => {
  it("returns positions for all unique nodes across steps", () => {
    const step1 = makeStep(["a", "b", "c"]);
    const step2 = makeStep(["b", "c", "d"]);
    const layout = computeLayout([step1, step2]);

    expect(layout.size).toBe(4);
    expect(layout.has("a")).toBe(true);
    expect(layout.has("b")).toBe(true);
    expect(layout.has("c")).toBe(true);
    expect(layout.has("d")).toBe(true);
  });

  it("all positions are finite numbers", () => {
    const step = makeStep(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    const layout = computeLayout([step]);

    for (const [, pos] of layout) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it("no two nodes overlap (minimum distance > 0)", () => {
    const step = makeStep(
      ["a", "b", "c", "d", "e"],
      [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]],
    );
    const layout = computeLayout([step]);
    const positions = Array.from(layout.values());

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic: same input produces same output", () => {
    const step = makeStep(["x", "y", "z"], [["x", "y"], ["y", "z"]]);
    const layout1 = computeLayout([step]);
    const layout2 = computeLayout([step]);

    for (const [id, pos1] of layout1) {
      const pos2 = layout2.get(id)!;
      expect(pos1.x).toBe(pos2.x);
      expect(pos1.y).toBe(pos2.y);
    }
  });

  it("handles a single node", () => {
    const step = makeStep(["solo"]);
    const layout = computeLayout([step]);

    expect(layout.size).toBe(1);
    const pos = layout.get("solo")!;
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it("handles disconnected graph", () => {
    const step = makeStep(["a", "b", "c"]); // no edges
    const layout = computeLayout([step]);

    expect(layout.size).toBe(3);
    for (const [, pos] of layout) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it("handles empty input", () => {
    const layout = computeLayout([]);
    expect(layout.size).toBe(0);
  });

  it("positions fit within [-80, 80] range", () => {
    const step = makeStep(
      ["a", "b", "c", "d", "e", "f"],
      [["a", "b"], ["b", "c"], ["d", "e"], ["e", "f"]],
    );
    const layout = computeLayout([step]);

    for (const [, pos] of layout) {
      expect(pos.x).toBeGreaterThanOrEqual(-80);
      expect(pos.x).toBeLessThanOrEqual(80);
      expect(pos.y).toBeGreaterThanOrEqual(-80);
      expect(pos.y).toBeLessThanOrEqual(80);
    }
  });
});

import { describe, it, expect } from "vitest";
import { Renderer, computeBounds } from "../src/index";
import type { Node } from "../src/index";

describe("webgl2-graph", () => {
  it("should export Renderer class", () => {
    expect(Renderer).toBeDefined();
    expect(typeof Renderer).toBe("function");
  });

  it("should export computeBounds", () => {
    expect(computeBounds).toBeDefined();
    expect(typeof computeBounds).toBe("function");
  });

  it("should compute bounds from nodes", () => {
    const nodes: Node[] = [
      { x: -10, y: -20, r: 1, g: 0, b: 0, radius: 1 },
      { x: 30, y: 40, r: 0, g: 1, b: 0, radius: 2 },
    ];
    const bounds = computeBounds(nodes);
    expect(bounds.minX).toBe(-11);
    expect(bounds.maxX).toBe(32);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  createTestRenderer,
  readPixelAt,
  assertNotBackground,
  assertIsBackground,
  nodeScreenPos,
  threeNodeGraph,
  singleNodeGraph,
  simulateClick,
} from "./helpers";
import type { Renderer } from "../../src/index";

describe("Rendering", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  describe("background", () => {
    it("clear color is dark gray", () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Corner far from node should be background
      const [r, g, b] = readPixelAt(canvas, 5, 5);
      expect(r).toBeGreaterThanOrEqual(14);
      expect(r).toBeLessThanOrEqual(20);
      expect(g).toBeGreaterThanOrEqual(14);
      expect(g).toBeLessThanOrEqual(20);
      expect(b).toBeGreaterThanOrEqual(14);
      expect(b).toBeLessThanOrEqual(20);
    });
  });

  describe("nodes", () => {
    it("renders a red node at center", () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Single node at (0,0) → screen center (200, 200)
      const [r, g, b] = readPixelAt(canvas, 200, 200);
      expect(r).toBeGreaterThan(200);
      expect(g).toBeLessThan(30);
      expect(b).toBeLessThan(30);
    });

    it("renders nodes with correct colors", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      renderer = createTestRenderer(canvas, nodes, { edges });
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      const posB = nodeScreenPos(nodes[1], nodes, canvas);
      const posC = nodeScreenPos(nodes[2], nodes, canvas);

      // Red node
      const [rA, gA, bA] = readPixelAt(canvas, posA.x, posA.y);
      expect(rA).toBeGreaterThan(200);
      expect(gA).toBeLessThan(30);
      expect(bA).toBeLessThan(30);

      // Green node
      const [rB, gB, bB] = readPixelAt(canvas, posB.x, posB.y);
      expect(rB).toBeLessThan(30);
      expect(gB).toBeGreaterThan(200);
      expect(bB).toBeLessThan(30);

      // Blue node
      const [rC, gC, bC] = readPixelAt(canvas, posC.x, posC.y);
      expect(rC).toBeLessThan(30);
      expect(gC).toBeLessThan(30);
      expect(bC).toBeGreaterThan(200);
    });

    it("renders nodes at correct screen positions", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      renderer = createTestRenderer(canvas, nodes, { edges });
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodes[0], nodes, canvas);

      // Node center should not be background
      assertNotBackground(canvas, posA.x, posA.y);

      // Far corner should be background
      assertIsBackground(canvas, 5, 5);
    });

    it("reflects opacity in rendered output", () => {
      canvas = createTestCanvas();
      const fullNode = {
        id: "full",
        x: -20,
        y: 0,
        r: 1,
        g: 0,
        b: 0,
        a: 1,
        s: 8,
        z: 0,
        i: 0,
        l: "",
      };
      const dimNode = { id: "dim", x: 20, y: 0, r: 1, g: 0, b: 0, a: 0.3, s: 8, z: 0, i: 0, l: "" };
      const nodes = [fullNode, dimNode];
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      const posFull = nodeScreenPos(fullNode, nodes, canvas);
      const posDim = nodeScreenPos(dimNode, nodes, canvas);

      // Blend mode ONE, ONE_MINUS_SRC_ALPHA means background bleeds through
      // for low-opacity nodes. The dim node's green channel should be higher
      // (dark gray background leaking through) than the full-opacity node.
      const [, gFull] = readPixelAt(canvas, posFull.x, posFull.y);
      const [, gDim] = readPixelAt(canvas, posDim.x, posDim.y);

      expect(gDim).toBeGreaterThan(gFull);
    });
  });

  describe("edges", () => {
    it("renders edges between connected nodes", () => {
      canvas = createTestCanvas();
      const nodeA = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
      const nodeB = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
      const nodes = [nodeA, nodeB];
      const edges = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 3, z: 0 }];
      renderer = createTestRenderer(canvas, nodes, { edges });
      renderer.setCurvature(0);
      renderer.fitToNodes(0);
      renderer.render();

      // Midpoint between the two nodes (on straight edge)
      const posA = nodeScreenPos(nodeA, nodes, canvas);
      const posB = nodeScreenPos(nodeB, nodes, canvas);
      const midX = (posA.x + posB.x) / 2;
      const midY = (posA.y + posB.y) / 2;

      assertNotBackground(canvas, midX, midY);
    });

    it("does not render edges where none exist", () => {
      canvas = createTestCanvas();
      const nodeA = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
      const nodeB = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
      // Far-apart node with no edge to a/b
      const nodeC = { id: "c", x: 0, y: -40, r: 0, g: 0, b: 1, a: 1, s: 5, z: 0, i: 0, l: "" };
      const nodes = [nodeA, nodeB, nodeC];
      const edges = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 2, z: 0 }];
      renderer = createTestRenderer(canvas, nodes, { edges });
      renderer.setCurvature(0);
      renderer.fitToNodes(0);
      renderer.render();

      // Midpoint between a and c (no edge) should be background
      const posA = nodeScreenPos(nodeA, nodes, canvas);
      const posC = nodeScreenPos(nodeC, nodes, canvas);
      const midX = (posA.x + posC.x) / 2;
      const midY = (posA.y + posC.y) / 2;

      assertIsBackground(canvas, midX, midY);
    });
  });

  describe("radius clamping", () => {
    it("clamps large world radius to maxScreenRadius", () => {
      canvas = createTestCanvas();
      // Single node with a huge world radius
      const nodes = [{ id: "big", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 500, z: 0, i: 0, l: "" }];
      // maxScreenRadius = 20px → node should not fill the whole canvas
      renderer = createTestRenderer(canvas, nodes, { maxScreenRadius: 20 });
      renderer.fitToNodes(0);
      renderer.render();

      // 80px from center should be background (node clamped to ~20 CSS px radius)
      assertIsBackground(canvas, 200 + 80, 200);
    });

    it("clamps small world radius to minScreenRadius", () => {
      canvas = createTestCanvas();
      // Two widely-spaced tiny nodes — fitToNodes will zoom way out
      const nodes = [
        { id: "a", x: -1000, y: 0, r: 1, g: 0, b: 0, a: 1, s: 0.1, z: 0, i: 0, l: "" },
        { id: "b", x: 1000, y: 0, r: 0, g: 1, b: 0, a: 1, s: 0.1, z: 0, i: 0, l: "" },
      ];
      // minScreenRadius = 4px → nodes should still be visible at center
      renderer = createTestRenderer(canvas, nodes, { minScreenRadius: 4 });
      renderer.fitToNodes(0);
      renderer.render();

      // Node centers should still be non-background despite tiny world radius
      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      const posB = nodeScreenPos(nodes[1], nodes, canvas);
      assertNotBackground(canvas, posA.x, posA.y);
      assertNotBackground(canvas, posB.x, posB.y);
    });

    it("hit test respects clamped radius", () => {
      canvas = createTestCanvas();
      // Single node with huge world radius, but clamped to 20px max
      const nodes = [{ id: "big", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 500, z: 0, i: 0, l: "" }];
      let clickedNode: string | null = null;
      renderer = createTestRenderer(canvas, nodes, {
        maxScreenRadius: 20,
        onNodeClick: (e) => {
          clickedNode = e.nodeId;
        },
      });
      renderer.fitToNodes(0);
      renderer.render();

      // Click at center → should hit the node
      simulateClick(canvas, 200, 200);
      expect(clickedNode).toBe("big");

      // Click far outside clamped radius → should miss
      clickedNode = null;
      simulateClick(canvas, 200 + 80, 200);
      expect(clickedNode).toBeNull();
    });
  });
});

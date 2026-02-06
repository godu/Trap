import { describe, it, expect, afterEach } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  createTestRenderer,
  readPixelAt,
  assertNotBackground,
  assertIsBackground,
  nodeScreenPos,
  singleNodeGraph,
  wait,
} from "./helpers";
import { Renderer } from "../../src/index";
import type { Node, Edge } from "../../src/index";

describe("Data Operations", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  describe("setNodes", () => {
    it("updates node positions on screen", () => {
      canvas = createTestCanvas();
      const nodeA: Node = {
        id: "a",
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
      const nodeB: Node = { id: "b", x: 20, y: 0, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" };
      const nodes = [nodeA, nodeB];
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Move node A to (20, 0) and node B to (-20, 0) (swap positions)
      const newA: Node = { ...nodeA, x: 20 };
      const newB: Node = { ...nodeB, x: -20 };
      const newNodes = [newA, newB];
      renderer.setNodes(newNodes);
      renderer.fitToNodes(0);
      renderer.render();

      // After swap, left position should be green (nodeB) and right should be red (nodeA)
      const posLeft = nodeScreenPos(newB, newNodes, canvas);
      const posRight = nodeScreenPos(newA, newNodes, canvas);

      const [rL, gL] = readPixelAt(canvas, posLeft.x, posLeft.y);
      expect(gL).toBeGreaterThan(rL); // green on left

      const [rR, gR] = readPixelAt(canvas, posRight.x, posRight.y);
      expect(rR).toBeGreaterThan(gR); // red on right
    });

    it("updates node colors", () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph(); // red node
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Verify red
      const [r0, g0] = readPixelAt(canvas, 200, 200);
      expect(r0).toBeGreaterThan(200);
      expect(g0).toBeLessThan(30);

      // Change to green
      renderer.setNodes([{ ...nodes[0], r: 0, g: 1, b: 0 }]);
      renderer.render();

      const [r1, g1] = readPixelAt(canvas, 200, 200);
      expect(r1).toBeLessThan(30);
      expect(g1).toBeGreaterThan(200);
    });
  });

  describe("setEdges", () => {
    it("updates rendered edges", () => {
      canvas = createTestCanvas();
      const nodeA: Node = {
        id: "a",
        x: -30,
        y: 0,
        r: 1,
        g: 0,
        b: 0,
        a: 1,
        s: 5,
        z: 0,
        i: 0,
        l: "",
      };
      const nodeB: Node = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
      const nodes = [nodeA, nodeB];
      // Start with no edges
      renderer = createTestRenderer(canvas, nodes);
      renderer.setCurvature(0);
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodeA, nodes, canvas);
      const posB = nodeScreenPos(nodeB, nodes, canvas);
      const midX = (posA.x + posB.x) / 2;
      const midY = (posA.y + posB.y) / 2;

      // Midpoint should be background (no edges)
      assertIsBackground(canvas, midX, midY);

      // Add an edge
      const edges: Edge[] = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 3, z: 0 }];
      renderer.setEdges(edges);
      renderer.render();

      // Midpoint should now have edge pixels
      assertNotBackground(canvas, midX, midY);
    });
  });

  describe("setCurvature", () => {
    it("setCurvature(0) makes edges straight", () => {
      canvas = createTestCanvas();
      const nodeA: Node = {
        id: "a",
        x: -30,
        y: 0,
        r: 1,
        g: 0,
        b: 0,
        a: 1,
        s: 5,
        z: 0,
        i: 0,
        l: "",
      };
      const nodeB: Node = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
      const nodes = [nodeA, nodeB];
      const edges: Edge[] = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 3, z: 0 }];
      renderer = createTestRenderer(canvas, nodes, { edges });
      renderer.setCurvature(0);
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodeA, nodes, canvas);
      const posB = nodeScreenPos(nodeB, nodes, canvas);
      const midX = (posA.x + posB.x) / 2;
      const midY = (posA.y + posB.y) / 2;

      // Straight edge midpoint should be on the line between nodes
      assertNotBackground(canvas, midX, midY);

      // A point perpendicular to the midpoint (offset Y by 15px) should be background
      assertIsBackground(canvas, midX, midY - 15);
    });
  });

  describe("fitToNodes", () => {
    it("frames all nodes in view", () => {
      canvas = createTestCanvas();
      // Widely spread nodes
      const nodes: Node[] = [
        { id: "a", x: -100, y: -100, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
        { id: "b", x: 100, y: 100, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
        { id: "c", x: -100, y: 100, r: 0, g: 0, b: 1, a: 1, s: 8, z: 0, i: 0, l: "" },
        { id: "d", x: 100, y: -100, r: 1, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      ];
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // All 4 nodes should be visible
      for (const node of nodes) {
        const pos = nodeScreenPos(node, nodes, canvas);
        assertNotBackground(canvas, pos.x, pos.y);
      }
    });

    it("works after node positions change", () => {
      canvas = createTestCanvas();
      const nodes: Node[] = [
        { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
        { id: "b", x: 10, y: 0, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      ];
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Move nodes far apart
      const newNodes: Node[] = [
        { id: "a", x: -200, y: 0, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
        { id: "b", x: 200, y: 0, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      ];
      renderer.setNodes(newNodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Both should be visible
      for (const node of newNodes) {
        const pos = nodeScreenPos(node, newNodes, canvas);
        assertNotBackground(canvas, pos.x, pos.y);
      }
    });
  });

  describe("animation", () => {
    it("completes to target state after animation duration", async () => {
      canvas = createTestCanvas();
      const nodes: Node[] = [
        { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" },
      ];
      // Use animationDuration > 0 for this test
      renderer = new Renderer({
        canvas,
        nodes,
        animationDuration: 200,
      });
      renderer.fitToNodes(0);
      renderer.render();

      // Change color from red to green
      renderer.setNodes([
        { id: "a", x: 0, y: 0, r: 0, g: 1, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" },
      ]);

      // Wait for animation to complete
      await wait(350);
      renderer.render();

      const [r, g] = readPixelAt(canvas, 200, 200);
      expect(g).toBeGreaterThan(r);
    });
  });
});

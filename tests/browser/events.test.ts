import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  createTestRenderer,
  nodeScreenPos,
  edgeMidpointScreenPos,
  simulateClick,
  simulateDblClick,
  simulateHover,
  threeNodeGraph,
} from "./helpers";
import type { Renderer } from "../../src/index";
import type { NodeEvent, EdgeEvent } from "../../src/index";

describe("Events", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  describe("node click", () => {
    it("onNodeClick fires with correct nodeId", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onNodeClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onNodeClick });
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      simulateClick(canvas, posA.x, posA.y);

      expect(onNodeClick).toHaveBeenCalledOnce();
      const event: NodeEvent = onNodeClick.mock.calls[0][0];
      expect(event.nodeId).toBe("a");
      expect(event.node).toBe(nodes[0]);
    });

    it("onNodeClick receives world coordinates close to node position", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onNodeClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onNodeClick });
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      simulateClick(canvas, posA.x, posA.y);

      const event: NodeEvent = onNodeClick.mock.calls[0][0];
      expect(event.worldX).toBeCloseTo(nodes[0].x, 0);
      expect(event.worldY).toBeCloseTo(nodes[0].y, 0);
    });

    it("onNodeClick is not called when clicking empty space", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onNodeClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onNodeClick });
      renderer.fitToNodes(0);
      renderer.render();

      simulateClick(canvas, 5, 5);
      expect(onNodeClick).not.toHaveBeenCalled();
    });
  });

  describe("edge click", () => {
    it("onEdgeClick fires with correct edgeId", () => {
      canvas = createTestCanvas();
      const nodeA = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, radius: 5 };
      const nodeB = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, radius: 5 };
      const nodes = [nodeA, nodeB];
      const edges = [{ id: "ab", source: "a", target: "b", r: 1, g: 1, b: 1, a: 1, width: 4 }];
      const onEdgeClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onEdgeClick });
      renderer.fitToNodes(0);
      renderer.render();

      // Hit test uses CURVATURE=0.4, compute actual curved midpoint
      const mid = edgeMidpointScreenPos(nodeA, nodeB, nodes, canvas);
      simulateClick(canvas, mid.x, mid.y);

      expect(onEdgeClick).toHaveBeenCalledOnce();
      const event: EdgeEvent = onEdgeClick.mock.calls[0][0];
      expect(event.edgeId).toBe("ab");
    });
  });

  describe("background click", () => {
    it("onBackgroundClick fires when clicking empty space", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onBackgroundClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onBackgroundClick });
      renderer.fitToNodes(0);
      renderer.render();

      // Click far corner (no nodes or edges)
      simulateClick(canvas, 5, 5);
      expect(onBackgroundClick).toHaveBeenCalledOnce();
    });
  });

  describe("double click", () => {
    it("onNodeDblClick fires on node", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onNodeDblClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onNodeDblClick });
      renderer.fitToNodes(0);
      renderer.render();

      const posB = nodeScreenPos(nodes[1], nodes, canvas);
      simulateDblClick(canvas, posB.x, posB.y);

      expect(onNodeDblClick).toHaveBeenCalledOnce();
      expect(onNodeDblClick.mock.calls[0][0].nodeId).toBe("b");
    });

    it("onBackgroundDblClick fires on background", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onBackgroundDblClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onBackgroundDblClick });
      renderer.fitToNodes(0);
      renderer.render();

      simulateDblClick(canvas, 5, 5);
      expect(onBackgroundDblClick).toHaveBeenCalledOnce();
    });
  });

  describe("hover", () => {
    it("onNodeHoverEnter fires when mouse enters a node", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onNodeHoverEnter = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { edges, onNodeHoverEnter });
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      simulateHover(posA.x, posA.y);

      expect(onNodeHoverEnter).toHaveBeenCalledOnce();
      expect(onNodeHoverEnter.mock.calls[0][0].nodeId).toBe("a");
    });

    it("onNodeHoverLeave fires when mouse leaves a node", () => {
      canvas = createTestCanvas();
      const { nodes, edges } = threeNodeGraph();
      const onNodeHoverEnter = vi.fn();
      const onNodeHoverLeave = vi.fn();
      renderer = createTestRenderer(canvas, nodes, {
        edges,
        onNodeHoverEnter,
        onNodeHoverLeave,
      });
      renderer.fitToNodes(0);
      renderer.render();

      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      // Enter the node
      simulateHover(posA.x, posA.y);
      expect(onNodeHoverEnter).toHaveBeenCalledOnce();

      // Leave the node
      simulateHover(5, 5);
      expect(onNodeHoverLeave).toHaveBeenCalledOnce();
    });

    it("onEdgeHoverEnter and Leave fire correctly", () => {
      canvas = createTestCanvas();
      const nodeA = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, radius: 5 };
      const nodeB = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, radius: 5 };
      const nodes = [nodeA, nodeB];
      const edges = [{ id: "ab", source: "a", target: "b", r: 1, g: 1, b: 1, a: 1, width: 4 }];
      const onEdgeHoverEnter = vi.fn();
      const onEdgeHoverLeave = vi.fn();
      renderer = createTestRenderer(canvas, nodes, {
        edges,
        onEdgeHoverEnter,
        onEdgeHoverLeave,
      });
      renderer.fitToNodes(0);
      renderer.render();

      // Hit test uses CURVATURE=0.4, compute actual curved midpoint
      const mid = edgeMidpointScreenPos(nodeA, nodeB, nodes, canvas);

      simulateHover(mid.x, mid.y);
      expect(onEdgeHoverEnter).toHaveBeenCalledOnce();

      simulateHover(5, 5);
      expect(onEdgeHoverLeave).toHaveBeenCalledOnce();
    });
  });
});

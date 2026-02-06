import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  createTestRenderer,
  nodeScreenPos,
  edgeMidpointScreenPos,
  simulateClick,
  threeNodeGraph,
} from "./helpers";
import type { Renderer } from "../../src/index";
import type { Node, Edge } from "../../src/index";

describe("Spatial grid hit testing", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  it("hits correct node among many spread-out nodes", () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        nodes.push({
          id: `n${row * 5 + col}`,
          x: col * 30,
          y: row * 30,
          r: 1,
          g: 0,
          b: 0,
          a: 1,
          s: 5,
          z: 0,
          i: 0,
          l: "",
        });
      }
    }
    const onNodeClick = vi.fn();
    renderer = createTestRenderer(canvas, nodes, { onNodeClick });
    renderer.fitToNodes(0);
    renderer.render();

    // Click on 3 non-adjacent nodes: first, middle, last
    const targets = [nodes[0], nodes[12], nodes[24]];
    for (const node of targets) {
      onNodeClick.mockClear();
      const pos = nodeScreenPos(node, nodes, canvas);
      simulateClick(canvas, pos.x, pos.y);
      expect(onNodeClick).toHaveBeenCalledOnce();
      expect(onNodeClick.mock.calls[0][0].nodeId).toBe(node.id);
    }
  });

  it("hits correct node among dense neighbors", () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [
      { id: "left", x: -8, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" },
      { id: "right", x: 8, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" },
    ];
    const onNodeClick = vi.fn();
    renderer = createTestRenderer(canvas, nodes, { onNodeClick });
    renderer.fitToNodes(0);
    renderer.render();

    const posLeft = nodeScreenPos(nodes[0], nodes, canvas);
    simulateClick(canvas, posLeft.x, posLeft.y);
    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodeClick.mock.calls[0][0].nodeId).toBe("left");

    onNodeClick.mockClear();
    const posRight = nodeScreenPos(nodes[1], nodes, canvas);
    simulateClick(canvas, posRight.x, posRight.y);
    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodeClick.mock.calls[0][0].nodeId).toBe("right");
  });

  it("returns background when clicking empty space", () => {
    canvas = createTestCanvas();
    const { nodes, edges } = threeNodeGraph();
    const onNodeClick = vi.fn();
    const onEdgeClick = vi.fn();
    const onBackgroundClick = vi.fn();
    renderer = createTestRenderer(canvas, nodes, {
      edges,
      onNodeClick,
      onEdgeClick,
      onBackgroundClick,
    });
    renderer.fitToNodes(0);
    renderer.render();

    // Click far corner — no entities
    simulateClick(canvas, 5, 5);
    expect(onNodeClick).not.toHaveBeenCalled();
    expect(onEdgeClick).not.toHaveBeenCalled();
    expect(onBackgroundClick).toHaveBeenCalledOnce();
  });

  it("hits edge at its curved midpoint", () => {
    canvas = createTestCanvas();
    const nodeA: Node = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodeB: Node = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodes = [nodeA, nodeB];
    const edges: Edge[] = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 4, z: 0 }];
    const onEdgeClick = vi.fn();
    renderer = createTestRenderer(canvas, nodes, { edges, onEdgeClick });
    renderer.fitToNodes(0);
    renderer.render();

    const mid = edgeMidpointScreenPos(nodeA, nodeB, nodes, canvas);
    simulateClick(canvas, mid.x, mid.y);

    expect(onEdgeClick).toHaveBeenCalledOnce();
    expect(onEdgeClick.mock.calls[0][0].edgeId).toBe("ab");
  });

  it("node takes priority over edge at endpoint", () => {
    canvas = createTestCanvas();
    const { nodes, edges } = threeNodeGraph();
    const onNodeClick = vi.fn();
    const onEdgeClick = vi.fn();
    renderer = createTestRenderer(canvas, nodes, { edges, onNodeClick, onEdgeClick });
    renderer.fitToNodes(0);
    renderer.render();

    // Click on node A which is an endpoint of edges AB and AC
    const posA = nodeScreenPos(nodes[0], nodes, canvas);
    simulateClick(canvas, posA.x, posA.y);

    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodeClick.mock.calls[0][0].nodeId).toBe("a");
    expect(onEdgeClick).not.toHaveBeenCalled();
  });

  it("grid rebuilds after setNodes moves a node", () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      { id: "b", x: 50, y: 0, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
    ];
    const onNodeClick = vi.fn();
    renderer = createTestRenderer(canvas, nodes, { onNodeClick });
    renderer.fitToNodes(0);
    renderer.render();

    // Move node A to (50, 50)
    const newNodes: Node[] = [
      { id: "a", x: 50, y: 50, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      { id: "b", x: -50, y: 0, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
    ];
    renderer.setNodes(newNodes);
    renderer.fitToNodes(0);
    renderer.render();

    const posA = nodeScreenPos(newNodes[0], newNodes, canvas);
    simulateClick(canvas, posA.x, posA.y);

    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodeClick.mock.calls[0][0].nodeId).toBe("a");
  });
});

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  readPixelAt,
  isBackground,
  nodeScreenPos,
  wait,
} from "./helpers";
import { Renderer } from "../../src/index";
import type { Node, Edge } from "../../src/index";

const ANIM_DURATION = 400;

describe("Fade-in animation", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  it("new edges are dimmer mid-animation", async () => {
    canvas = createTestCanvas();
    const nodeA: Node = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodeB: Node = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodeC: Node = { id: "c", x: 0, y: 30, r: 0, g: 0, b: 1, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodes = [nodeA, nodeB, nodeC];

    // Start with one existing edge so animation triggers on next setEdges
    const initialEdge: Edge[] = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 0, b: 0, a: 1, s: 3, z: 0 }];
    renderer = new Renderer({ canvas, nodes, edges: initialEdge, animationDuration: ANIM_DURATION });
    renderer.setCurvature(0);
    renderer.fitToNodes(0);
    renderer.render();

    // Add a NEW white edge (ac) — this one should fade in
    const edges: Edge[] = [
      { id: "ab", src: "a", tgt: "b", r: 1, g: 0, b: 0, a: 1, s: 3, z: 0 },
      { id: "ac", src: "a", tgt: "c", r: 1, g: 1, b: 1, a: 1, s: 3, z: 0 },
    ];
    renderer.setEdges(edges);

    // Mid-animation: new edge should be dimmer (fading in from alpha 0)
    await wait(100);
    renderer.render();
    const posA = nodeScreenPos(nodeA, nodes, canvas);
    const posC = nodeScreenPos(nodeC, nodes, canvas);
    const midX = (posA.x + posC.x) / 2;
    const midY = (posA.y + posC.y) / 2;
    const [rMid, gMid, bMid] = readPixelAt(canvas, midX, midY);
    const midBrightness = rMid + gMid + bMid;

    // Wait for animation to complete
    await wait(ANIM_DURATION + 150);
    renderer.render();
    const [rEnd, gEnd, bEnd] = readPixelAt(canvas, midX, midY);
    const endBrightness = rEnd + gEnd + bEnd;

    // Mid-animation brightness should be less than final
    expect(midBrightness).toBeLessThan(endBrightness);
  });

  it("edges reach full opacity after animation completes", async () => {
    canvas = createTestCanvas();
    const nodeA: Node = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodeB: Node = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodes = [nodeA, nodeB];

    renderer = new Renderer({ canvas, nodes, animationDuration: ANIM_DURATION });
    renderer.setCurvature(0);
    renderer.fitToNodes(0);
    renderer.render();

    const posA = nodeScreenPos(nodeA, nodes, canvas);
    const posB = nodeScreenPos(nodeB, nodes, canvas);
    const midX = (posA.x + posB.x) / 2;
    const midY = (posA.y + posB.y) / 2;

    // Add a white edge
    renderer.setEdges([{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 3, z: 0 }]);

    await wait(ANIM_DURATION + 150);
    renderer.render();
    const [r, g, b] = readPixelAt(canvas, midX, midY);

    // Should be bright white (not background)
    expect(isBackground(r, g, b)).toBe(false);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
  });

  it("existing edges interpolate color during animation", async () => {
    canvas = createTestCanvas();
    const nodeA: Node = { id: "a", x: -30, y: 0, r: 0.5, g: 0.5, b: 0.5, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodeB: Node = { id: "b", x: 30, y: 0, r: 0.5, g: 0.5, b: 0.5, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodes = [nodeA, nodeB];

    // Start with a red edge
    const redEdge: Edge[] = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 0, b: 0, a: 1, s: 3, z: 0 }];
    renderer = new Renderer({ canvas, nodes, edges: redEdge, animationDuration: ANIM_DURATION });
    renderer.setCurvature(0);
    renderer.fitToNodes(0);
    renderer.render();

    const posA = nodeScreenPos(nodeA, nodes, canvas);
    const posB = nodeScreenPos(nodeB, nodes, canvas);
    const midX = (posA.x + posB.x) / 2;
    const midY = (posA.y + posB.y) / 2;

    // Verify initially red
    const [rInit, gInit] = readPixelAt(canvas, midX, midY);
    expect(rInit).toBeGreaterThan(gInit);

    // Transition to green edge
    renderer.setEdges([{ id: "ab", src: "a", tgt: "b", r: 0, g: 1, b: 0, a: 1, s: 3, z: 0 }]);

    // After animation completes, should be green
    await wait(ANIM_DURATION + 150);
    renderer.render();
    const [rEnd, gEnd] = readPixelAt(canvas, midX, midY);
    expect(gEnd).toBeGreaterThan(rEnd);
  });

  it("new nodes fade in from transparent", async () => {
    canvas = createTestCanvas();
    const nodeA: Node = { id: "a", x: -20, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" };

    renderer = new Renderer({ canvas, nodes: [nodeA], animationDuration: ANIM_DURATION });
    renderer.fitToNodes(0);
    renderer.render();

    // Add a second green node
    const nodeB: Node = { id: "b", x: 20, y: 0, r: 0, g: 1, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" };
    const newNodes = [nodeA, nodeB];
    renderer.setNodes(newNodes);
    renderer.fitToNodes(0);

    // Mid-animation: new node should be dimmer
    await wait(100);
    renderer.render();
    const posBMid = nodeScreenPos(nodeB, newNodes, canvas);
    const [, gMid] = readPixelAt(canvas, posBMid.x, posBMid.y);

    // After animation: full green
    await wait(ANIM_DURATION + 150);
    renderer.render();
    const posBEnd = nodeScreenPos(nodeB, newNodes, canvas);
    const [, gEnd] = readPixelAt(canvas, posBEnd.x, posBEnd.y);

    expect(gMid).toBeLessThan(gEnd);
  });
});

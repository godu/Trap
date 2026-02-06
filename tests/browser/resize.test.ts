import { describe, it, expect, afterEach } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  createTestRenderer,
  assertNotBackground,
  nextFrame,
  worldToScreen,
} from "./helpers";
import type { Renderer } from "../../src/index";
import type { Node } from "../../src/index";

async function resizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): Promise<void> {
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  // ResizeObserver fires asynchronously — wait two frames
  await nextFrame();
  await nextFrame();
}

describe("Resize behavior", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  it("canvas buffer matches CSS dimensions * DPR after resize", async () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
    ];
    renderer = createTestRenderer(canvas, nodes);
    renderer.fitToNodes(0);
    renderer.render();

    await resizeCanvas(canvas, 600, 300);
    renderer.render();

    const dpr = window.devicePixelRatio || 1;
    expect(canvas.width).toBe(Math.round(600 * dpr));
    expect(canvas.height).toBe(Math.round(300 * dpr));
  });

  it("nodes remain visible after wide resize", async () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [
      { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
    ];
    renderer = createTestRenderer(canvas, nodes);
    renderer.fitToNodes(0);
    renderer.render();

    // Resize to wide aspect ratio
    await resizeCanvas(canvas, 800, 400);
    renderer.render();

    // Recompute screen positions after resize
    const cam = renderer.getCameraState();
    const posA = worldToScreen(nodes[0].x, nodes[0].y, cam.centerX, cam.centerY, cam.halfW, cam.halfH, 800, 400);
    const posB = worldToScreen(nodes[1].x, nodes[1].y, cam.centerX, cam.centerY, cam.halfW, cam.halfH, 800, 400);

    assertNotBackground(canvas, posA.x, posA.y);
    assertNotBackground(canvas, posB.x, posB.y);
  });

  it("nodes remain visible after tall resize", async () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [
      { id: "a", x: 0, y: -30, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
      { id: "b", x: 0, y: 30, r: 0, g: 1, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
    ];
    renderer = createTestRenderer(canvas, nodes);
    renderer.fitToNodes(0);
    renderer.render();

    // Resize to tall aspect ratio
    await resizeCanvas(canvas, 200, 600);
    renderer.render();

    const cam = renderer.getCameraState();
    const posA = worldToScreen(nodes[0].x, nodes[0].y, cam.centerX, cam.centerY, cam.halfW, cam.halfH, 200, 600);
    const posB = worldToScreen(nodes[1].x, nodes[1].y, cam.centerX, cam.centerY, cam.halfW, cam.halfH, 200, 600);

    assertNotBackground(canvas, posA.x, posA.y);
    assertNotBackground(canvas, posB.x, posB.y);
  });

  it("getCameraState reflects new dimensions after resize", async () => {
    canvas = createTestCanvas();
    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 8, z: 0, i: 0, l: "" },
    ];
    renderer = createTestRenderer(canvas, nodes);
    renderer.fitToNodes(0);
    renderer.render();

    const camBefore = renderer.getCameraState();
    expect(camBefore.clientWidth).toBe(400);
    expect(camBefore.clientHeight).toBe(400);

    await resizeCanvas(canvas, 600, 300);
    renderer.render();

    const camAfter = renderer.getCameraState();
    expect(camAfter.clientWidth).toBe(600);
    expect(camAfter.clientHeight).toBe(300);
    // Aspect is no longer 1:1
    expect(camAfter.halfW).not.toBe(camAfter.halfH);
  });
});

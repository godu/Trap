import { Renderer, computeBounds, computeFitView, sampleBezier } from "../../src/index";
import type { Node, Edge, RendererOptions } from "../../src/index";

/** The hit test curvature constant hardcoded in the renderer. */
const HIT_TEST_CURVATURE = 0.4;

// ── Canvas Setup ──────────────────────────────────────────

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;

/**
 * Create a 400x400 canvas at position:fixed top:0 left:0 so
 * getBoundingClientRect returns {left:0, top:0, width:400, height:400}
 * and clientX/clientY in events equals CSS pixel coordinates.
 */
export function createTestCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  document.body.appendChild(canvas);
  return canvas;
}

export function removeTestCanvas(canvas: HTMLCanvasElement): void {
  canvas.remove();
}

// ── Renderer Factory ──────────────────────────────────────

/**
 * Create a Renderer with animationDuration:0 so data updates apply
 * synchronously (no animation frames to wait for).
 */
export function createTestRenderer(
  canvas: HTMLCanvasElement,
  nodes: Node[],
  opts?: Partial<RendererOptions>,
): Renderer {
  return new Renderer({
    canvas,
    nodes,
    animationDuration: 0,
    ...opts,
  });
}

// ── Pixel Readback ────────────────────────────────────────

/**
 * Read a single pixel at CSS coordinates (x, y).
 * Must be called synchronously after render() — the renderer does not
 * set preserveDrawingBuffer so the buffer is cleared after compositing.
 */
export function readPixelAt(
  canvas: HTMLCanvasElement,
  cssX: number,
  cssY: number,
): [number, number, number, number] {
  const gl = canvas.getContext("webgl2")!;
  const dpr = window.devicePixelRatio || 1;
  const x = Math.round(cssX * dpr);
  const y = Math.round(canvas.height - cssY * dpr - 1);
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return [pixel[0], pixel[1], pixel[2], pixel[3]];
}

/** Background clear color is ~RGB(17, 17, 17). */
export function isBackground(r: number, g: number, b: number): boolean {
  return r < 25 && g < 25 && b < 25;
}

export function assertNotBackground(canvas: HTMLCanvasElement, cssX: number, cssY: number): void {
  const [r, g, b] = readPixelAt(canvas, cssX, cssY);
  if (isBackground(r, g, b)) {
    throw new Error(
      `Expected non-background pixel at (${cssX}, ${cssY}), got RGB(${r}, ${g}, ${b})`,
    );
  }
}

export function assertIsBackground(canvas: HTMLCanvasElement, cssX: number, cssY: number): void {
  const [r, g, b] = readPixelAt(canvas, cssX, cssY);
  if (!isBackground(r, g, b)) {
    throw new Error(`Expected background pixel at (${cssX}, ${cssY}), got RGB(${r}, ${g}, ${b})`);
  }
}

export function assertPixelColor(
  canvas: HTMLCanvasElement,
  cssX: number,
  cssY: number,
  expectedR: number,
  expectedG: number,
  expectedB: number,
  tolerance = 15,
): void {
  const [r, g, b] = readPixelAt(canvas, cssX, cssY);
  const dr = Math.abs(r - expectedR);
  const dg = Math.abs(g - expectedG);
  const db = Math.abs(b - expectedB);
  if (dr > tolerance || dg > tolerance || db > tolerance) {
    throw new Error(
      `Pixel at (${cssX}, ${cssY}): expected ~RGB(${expectedR}, ${expectedG}, ${expectedB}), ` +
        `got RGB(${r}, ${g}, ${b}) (delta: ${dr}, ${dg}, ${db})`,
    );
  }
}

// ── Coordinate Conversion ─────────────────────────────────

/**
 * Convert world coordinates to CSS pixel coordinates given the camera
 * state after fitToNodes(0).
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  centerX: number,
  centerY: number,
  halfW: number,
  halfH: number,
  canvasW = CANVAS_WIDTH,
  canvasH = CANVAS_HEIGHT,
): { x: number; y: number } {
  const nx = 0.5 + (worldX - centerX) / (2 * halfW);
  const ny = 0.5 - (worldY - centerY) / (2 * halfH);
  return { x: nx * canvasW, y: ny * canvasH };
}

/**
 * Compute the camera view for a set of nodes (same as the renderer does
 * internally in fitToNodes). Uses the actual canvas drawing buffer size.
 */
export function getCameraView(
  nodes: Node[],
  canvas: HTMLCanvasElement,
): { centerX: number; centerY: number; halfW: number; halfH: number } {
  const bounds = computeBounds(nodes);
  return computeFitView(bounds, canvas.width, canvas.height);
}

/**
 * Get the screen position of a node after fitToNodes(0).
 */
export function nodeScreenPos(
  node: Node,
  nodes: Node[],
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const view = getCameraView(nodes, canvas);
  return worldToScreen(node.x, node.y, view.centerX, view.centerY, view.halfW, view.halfH);
}

/**
 * Get the screen position of an edge's midpoint (t=0.5 on the Bezier curve).
 * Uses CURVATURE=0.4 which matches the renderer's hit detection constant.
 */
export function edgeMidpointScreenPos(
  src: Node,
  tgt: Node,
  allNodes: Node[],
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const mid = sampleBezier(src.x, src.y, tgt.x, tgt.y, HIT_TEST_CURVATURE, 0.5);
  const view = getCameraView(allNodes, canvas);
  return worldToScreen(mid.x, mid.y, view.centerX, view.centerY, view.halfW, view.halfH);
}

// ── Event Dispatch ────────────────────────────────────────

/**
 * Simulate a click: mousedown on canvas, mouseup on window (< 5px apart).
 */
export function simulateClick(canvas: HTMLCanvasElement, cssX: number, cssY: number): void {
  canvas.dispatchEvent(
    new MouseEvent("mousedown", { clientX: cssX, clientY: cssY, bubbles: true }),
  );
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: cssX, clientY: cssY, bubbles: true }));
}

export function simulateDblClick(canvas: HTMLCanvasElement, cssX: number, cssY: number): void {
  canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: cssX, clientY: cssY, bubbles: true }));
}

/**
 * Simulate a drag from (x1,y1) to (x2,y2). Must have distance > 5px
 * to avoid triggering click detection.
 */
export function simulateDrag(
  canvas: HTMLCanvasElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps = 5,
): void {
  canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: x1, clientY: y1, bubbles: true }));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: x1 + (x2 - x1) * t,
        clientY: y1 + (y2 - y1) * t,
        bubbles: true,
      }),
    );
  }
  window.dispatchEvent(new MouseEvent("mouseup", { clientX: x2, clientY: y2, bubbles: true }));
}

/** Hover: mousemove on window (renderer listens on window for hover). */
export function simulateHover(cssX: number, cssY: number): void {
  window.dispatchEvent(
    new MouseEvent("mousemove", { clientX: cssX, clientY: cssY, bubbles: true }),
  );
}

export function simulateWheel(
  canvas: HTMLCanvasElement,
  cssX: number,
  cssY: number,
  deltaY: number,
): void {
  canvas.dispatchEvent(
    new WheelEvent("wheel", {
      clientX: cssX,
      clientY: cssY,
      deltaY,
      bubbles: true,
      cancelable: true,
    }),
  );
}

// ── Wait Utilities ────────────────────────────────────────

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Test Fixtures ─────────────────────────────────────────

/** 3-node graph with well-separated positions and distinct colors. */
export function threeNodeGraph(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, radius: 5 },
      { id: "b", x: 50, y: 0, r: 0, g: 1, b: 0, radius: 5 },
      { id: "c", x: 0, y: 50, r: 0, g: 0, b: 1, radius: 5 },
    ],
    edges: [
      { id: "ab", source: "a", target: "b", r: 1, g: 1, b: 0, a: 1, width: 2 },
      { id: "ac", source: "a", target: "c", r: 1, g: 0, b: 1, a: 1, width: 2 },
    ],
  };
}

/** Single red node at origin for simple pixel tests. */
export function singleNodeGraph(): { nodes: Node[] } {
  return {
    nodes: [{ id: "solo", x: 0, y: 0, r: 1, g: 0, b: 0, radius: 10 }],
  };
}

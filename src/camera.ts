import type { Node } from "./types";

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CameraView {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

export function computeBounds(nodes: Node[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const r = node.radius;
    if (node.x - r < minX) minX = node.x - r;
    if (node.x + r > maxX) maxX = node.x + r;
    if (node.y - r < minY) minY = node.y - r;
    if (node.y + r > maxY) maxY = node.y + r;
  }

  return { minX, maxX, minY, maxY };
}

export function computeFitView(
  bounds: Bounds,
  canvasWidth: number,
  canvasHeight: number,
): CameraView {
  const padding = 0.1;
  const dataW = bounds.maxX - bounds.minX;
  const dataH = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  const aspect = canvasWidth / canvasHeight;
  const dataAspect = dataW / dataH;

  let halfW: number;
  let halfH: number;

  if (dataAspect > aspect) {
    halfW = (dataW * (1 + padding)) / 2;
    halfH = halfW / aspect;
  } else {
    halfH = (dataH * (1 + padding)) / 2;
    halfW = halfH * aspect;
  }

  return { centerX, centerY, halfW, halfH };
}

export function createProjectionFromView(view: CameraView): Float32Array {
  const left = view.centerX - view.halfW;
  const right = view.centerX + view.halfW;
  const bottom = view.centerY - view.halfH;
  const top = view.centerY + view.halfH;

  // Column-major orthographic projection matrix
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -1;
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[15] = 1;

  return m;
}

export function createProjectionMatrix(
  bounds: Bounds,
  canvasWidth: number,
  canvasHeight: number,
): Float32Array {
  return createProjectionFromView(computeFitView(bounds, canvasWidth, canvasHeight));
}

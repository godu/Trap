import type { Node, CameraState } from "./types";

export interface LabelOverlayOptions {
  /** Parent element to insert overlay div into (typically canvas's parent). */
  container: HTMLElement;
  /** Only show labels when node screen radius >= this (default: 8). */
  minScreenRadius?: number;
  /** Maximum visible labels (default: 200). */
  maxLabels?: number;
  /** CSS class added to each label element. */
  labelClass?: string;
}

/** World-to-screen projection. Exported for testing. */
export function worldToScreen(
  wx: number,
  wy: number,
  centerX: number,
  centerY: number,
  halfW: number,
  halfH: number,
  clientWidth: number,
  clientHeight: number,
): { sx: number; sy: number } {
  const sx = ((wx - centerX) / (2 * halfW)) * clientWidth + clientWidth * 0.5;
  const sy = ((centerY - wy) / (2 * halfH)) * clientHeight + clientHeight * 0.5;
  return { sx, sy };
}

/** Axis-aligned bbox overlap. Exported for testing. */
export function bboxOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Pre-allocated comparator — avoids closure allocation per sort call */
function compareSrDesc(a: { sr: number }, b: { sr: number }): number {
  return b.sr - a.sr;
}

interface LabelEntry {
  el: HTMLDivElement;
  active: boolean;
  key: string;
}

/**
 * DOM overlay that positions text labels over a WebGL canvas.
 * Uses element pooling, frustum culling, and collision detection.
 */
export class LabelOverlay {
  private overlay: HTMLDivElement;
  private pool: LabelEntry[] = [];
  private poolIndex = 0;
  private sizeCache = new Map<string, { w: number; h: number }>();
  private minScreenRadius: number;
  private maxLabels: number;
  private labelClass: string;

  // Reusable arrays to avoid per-frame allocation
  private candidates: { node: Node; sx: number; sy: number; sr: number }[] = [];
  // Pre-allocated collision arrays (reused across frames)
  private placedX = new Float64Array(256);
  private placedY = new Float64Array(256);
  private placedW = new Float64Array(256);
  private placedH = new Float64Array(256);

  // Cache key for skipping redundant updates
  private lastCenterX = NaN;
  private lastCenterY = NaN;
  private lastHalfW = NaN;
  private lastNodes: readonly Node[] | null = null;

  constructor(options: LabelOverlayOptions) {
    this.minScreenRadius = options.minScreenRadius ?? 8;
    this.maxLabels = options.maxLabels ?? 200;
    this.labelClass = options.labelClass ?? "";

    this.overlay = document.createElement("div");
    this.overlay.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
    options.container.appendChild(this.overlay);
  }

  private ensurePlacedArrays(n: number): void {
    if (this.placedX.length >= n) return;
    const size = Math.max(n, this.placedX.length * 2);
    this.placedX = new Float64Array(size);
    this.placedY = new Float64Array(size);
    this.placedW = new Float64Array(size);
    this.placedH = new Float64Array(size);
  }

  /** Call each frame after render to update label positions. */
  update(nodes: readonly Node[], camera: CameraState): void {
    const {
      centerX,
      centerY,
      halfW,
      halfH,
      clientWidth,
      clientHeight,
      minScreenRadius: nodeMinR,
      maxScreenRadius: nodeMaxR,
    } = camera;

    // Skip update when camera and data are unchanged
    if (
      centerX === this.lastCenterX &&
      centerY === this.lastCenterY &&
      halfW === this.lastHalfW &&
      nodes === this.lastNodes
    ) {
      return;
    }
    this.lastCenterX = centerX;
    this.lastCenterY = centerY;
    this.lastHalfW = halfW;
    this.lastNodes = nodes;

    // Precompute reciprocals to replace divisions with multiplications
    const invDoubleHalfW = 1 / (2 * halfW);
    const invDoubleHalfH = 1 / (2 * halfH);
    const pxPerWorld = clientWidth * invDoubleHalfW;
    const halfClientW = clientWidth * 0.5;
    const halfClientH = clientHeight * 0.5;

    // Frustum bounds in world space
    const vpLeft = centerX - halfW;
    const vpRight = centerX + halfW;
    const vpTop = centerY + halfH;
    const vpBottom = centerY - halfH;

    // Phase 1: filter + project
    const candidates = this.candidates;
    let count = 0;
    for (let i = 0, len = nodes.length; i < len; i++) {
      const node = nodes[i];
      if (!node.l) continue;

      const r = node.s;
      // Frustum cull (conservative — include radius margin)
      if (
        node.x + r < vpLeft ||
        node.x - r > vpRight ||
        node.y + r < vpBottom ||
        node.y - r > vpTop
      )
        continue;

      let sr = r * pxPerWorld;
      // Clamp to match the renderer's visual node radius
      if (sr < nodeMinR) sr = nodeMinR;
      else if (sr > nodeMaxR) sr = nodeMaxR;
      if (sr < this.minScreenRadius) continue;

      const sx = (node.x - centerX) * invDoubleHalfW * clientWidth + halfClientW;
      const sy = (centerY - node.y) * invDoubleHalfH * clientHeight + halfClientH;

      if (count < candidates.length) {
        const c = candidates[count];
        c.node = node;
        c.sx = sx;
        c.sy = sy;
        c.sr = sr;
      } else {
        candidates.push({ node, sx, sy, sr });
      }
      count++;
    }

    // Phase 2: sort by priority (larger screen radius first)
    // Truncate candidates array to actual count, sort in place
    candidates.length = count;
    candidates.sort(compareSrDesc);
    const cap = Math.min(count, this.maxLabels);

    // Phase 3: collision detection with bbox (reuse typed arrays)
    this.ensurePlacedArrays(cap);
    const placedX = this.placedX;
    const placedY = this.placedY;
    const placedW = this.placedW;
    const placedH = this.placedH;
    let placedCount = 0;

    this.poolIndex = 0;

    for (let i = 0; i < cap; i++) {
      const c = candidates[i];
      const label = c.node.l;

      // Get or measure label size
      let size = this.sizeCache.get(label);
      if (!size) {
        const el = this.acquireElement();
        el.el.textContent = label;
        el.el.style.opacity = "0";
        el.el.style.transform = "translate3d(-9999px,0,0)";
        el.active = true;
        // Force layout to measure
        const w = el.el.offsetWidth;
        const h = el.el.offsetHeight;
        size = { w, h };
        this.sizeCache.set(label, size);
        // Return element by decrementing index
        this.poolIndex--;
      }

      // Label positioned to the right of the node, vertically centered
      const lx = c.sx + c.sr + 4;
      const ly = c.sy - size.h * 0.5;
      const lw = size.w;
      const lh = size.h;

      // Check collision with already placed labels
      let collides = false;
      for (let j = 0; j < placedCount; j++) {
        if (
          lx < placedX[j] + placedW[j] &&
          lx + lw > placedX[j] &&
          ly < placedY[j] + placedH[j] &&
          ly + lh > placedY[j]
        ) {
          collides = true;
          break;
        }
      }
      if (collides) continue;

      // Place the label
      placedX[placedCount] = lx;
      placedY[placedCount] = ly;
      placedW[placedCount] = lw;
      placedH[placedCount] = lh;
      placedCount++;

      const entry = this.acquireElement();
      if (entry.key !== label) {
        entry.el.textContent = label;
        entry.key = label;
      }
      // Only update the two dynamic properties (static ones set in acquireElement)
      entry.el.style.transform = "translate3d(" + lx + "px," + ly + "px,0)";
      entry.el.style.opacity = "1";
      entry.active = true;
    }

    // Hide unused pool elements
    for (let i = this.poolIndex, len = this.pool.length; i < len; i++) {
      const entry = this.pool[i];
      if (entry.active) {
        entry.el.style.opacity = "0";
        entry.active = false;
      }
    }
  }

  private acquireElement(): LabelEntry {
    if (this.poolIndex < this.pool.length) {
      return this.pool[this.poolIndex++];
    }
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;top:0;left:0;white-space:nowrap;will-change:transform,opacity;transition:opacity 0.15s;opacity:0;";
    if (this.labelClass) el.className = this.labelClass;
    this.overlay.appendChild(el);
    const entry: LabelEntry = { el, active: false, key: "" };
    this.pool.push(entry);
    this.poolIndex++;
    return entry;
  }

  destroy(): void {
    this.overlay.remove();
    this.pool.length = 0;
    this.sizeCache.clear();
    this.candidates.length = 0;
    this.lastNodes = null;
  }
}

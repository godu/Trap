import type { GraphStep, LayoutResult } from "./types";

/** Deterministic hash for initial placement. FNV-1a 32-bit. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Compute a stable force-directed layout across all steps.
 * Uses the union of all node IDs and edges so positions stay consistent.
 */
export function computeLayout(steps: GraphStep[]): LayoutResult {
  // Collect union of all node IDs
  const nodeIds = new Set<string>();
  for (const step of steps) {
    for (const id of step.nodes.keys()) nodeIds.add(id);
  }
  const ids = Array.from(nodeIds);
  const n = ids.length;
  if (n === 0) return new Map();

  const idIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) idIndex.set(ids[i], i);

  // Collect union of all edges (deduplicated)
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const step of steps) {
    for (const [src, targets] of step.edges) {
      const si = idIndex.get(src);
      if (si === undefined) continue;
      for (const tgt of targets.keys()) {
        const ti = idIndex.get(tgt);
        if (ti === undefined) continue;
        const key = si < ti ? `${si}:${ti}` : `${ti}:${si}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push([si, ti]);
        }
      }
    }
  }

  // Deterministic initial placement on a circle
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);

  const radius = Math.max(10, n * 3);
  for (let i = 0; i < n; i++) {
    const hash = fnv1a(ids[i]);
    const angle = ((hash % 10000) / 10000) * Math.PI * 2;
    x[i] = Math.cos(angle) * radius;
    y[i] = Math.sin(angle) * radius;
  }

  // Force simulation
  const iterations = 300;
  const repulsionStrength = 500;
  const attractionStrength = 0.02;
  const damping = 0.9;
  let temperature = 1.0;
  const cooling = 0.98;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[j] - x[i];
        let dy = y[j] - y[i];
        let distSq = dx * dx + dy * dy;
        if (distSq < 0.01) {
          // Nudge overlapping nodes apart deterministically
          dx = 0.1 * (i - j);
          dy = 0.1 * (j - i);
          distSq = dx * dx + dy * dy;
        }
        const force = repulsionStrength / distSq;
        const fx = dx * force;
        const fy = dy * force;
        vx[i] -= fx;
        vy[i] -= fy;
        vx[j] += fx;
        vy[j] += fy;
      }
    }

    // Attraction along edges
    for (const [si, ti] of edges) {
      const dx = x[ti] - x[si];
      const dy = y[ti] - y[si];
      const fx = dx * attractionStrength;
      const fy = dy * attractionStrength;
      vx[si] += fx;
      vy[si] += fy;
      vx[ti] -= fx;
      vy[ti] -= fy;
    }

    // Apply velocity with damping and cooling
    for (let i = 0; i < n; i++) {
      vx[i] *= damping * temperature;
      vy[i] *= damping * temperature;
      x[i] += vx[i];
      y[i] += vy[i];
    }
    temperature *= cooling;
  }

  // Center at origin
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += x[i];
    cy += y[i];
  }
  cx /= n;
  cy /= n;

  // Find extent and scale to [-80, 80]
  let maxExtent = 0;
  for (let i = 0; i < n; i++) {
    x[i] -= cx;
    y[i] -= cy;
    maxExtent = Math.max(maxExtent, Math.abs(x[i]), Math.abs(y[i]));
  }

  const scale = maxExtent > 0 ? 80 / maxExtent : 1;
  const result: LayoutResult = new Map();
  for (let i = 0; i < n; i++) {
    result.set(ids[i], { x: x[i] * scale, y: y[i] * scale });
  }

  return result;
}

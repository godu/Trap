import { Renderer } from "../src/index";
import type { Node } from "../src/index";
import smallResources from "./small.minimal-resources.json";

interface Resource {
  InternalArn: string;
  InternalType: string;
  x: number;
  y: number;
}

interface EdgeData {
  PrincipalArn: string;
  PrincipalType: string;
  ResourceArn: string;
  ResourceType: string;
  HasPrivileges: string;
}

const TYPE_COLORS: Record<string, [number, number, number]> = {
  "aws:cloudformation:stack": [0.98, 0.51, 0.25],
  "aws:dynamodb:table": [0.29, 0.47, 0.82],
  "aws:ec2:instance": [0.95, 0.77, 0.06],
  "aws:ecs:task-definition": [0.95, 0.49, 0.13],
  "aws:iam:oidc-provider": [0.86, 0.21, 0.27],
  "aws:iam:role": [0.86, 0.21, 0.27],
  "aws:iam:saml-provider": [0.86, 0.21, 0.27],
  "aws:iam:user": [0.72, 0.15, 0.22],
  "aws:kms:key": [0.62, 0.31, 0.71],
  "aws:lambda:function": [0.95, 0.61, 0.07],
  "aws:s3:bucket": [0.22, 0.66, 0.36],
  "aws:sqs:queue": [0.95, 0.35, 0.53],
};

const PRIVILEGE_COLORS: Record<string, [number, number, number, number]> = {
  Direct: [0.3, 0.55, 0.75, 0.4],
  Escalation: [0.9, 0.25, 0.2, 0.6],
};

const DEFAULT_COLOR: [number, number, number] = [0.6, 0.6, 0.6];
const DEFAULT_PRIV_COLOR: [number, number, number, number] = [0.5, 0.5, 0.5, 0.3];

// Pre-compute premultiplied RGBA as packed uint32 (little-endian: R | G<<8 | B<<16 | A<<24)
function packPremultiplied(r: number, g: number, b: number, a: number): number {
  return (
    ((r * a * 255 + 0.5) | 0) |
    (((g * a * 255 + 0.5) | 0) << 8) |
    (((b * a * 255 + 0.5) | 0) << 16) |
    (((a * 255 + 0.5) | 0) << 24)
  );
}

const PRIVILEGE_U32: Record<string, number> = {};
for (const [key, [r, g, b, a]] of Object.entries(PRIVILEGE_COLORS)) {
  PRIVILEGE_U32[key] = packPremultiplied(r, g, b, a);
}
const DEFAULT_PRIV_U32 = packPremultiplied(...DEFAULT_PRIV_COLOR);

function toNodes(data: Resource[]): Node[] {
  return data.map((res) => {
    const [r, g, b] = TYPE_COLORS[res.InternalType] ?? DEFAULT_COLOR;
    return { x: res.x, y: res.y, r, g, b, radius: 2 };
  });
}

function buildPositionLookup(resources: Resource[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  for (const r of resources) {
    map.set(r.InternalArn, { x: r.x, y: r.y });
  }
  return map;
}

const BYTES_PER_EDGE = 28; // 4 floats pos (16) + 2 floats radii (8) + 4 uint8 rgba (4)
const NODE_RADIUS = 2;

function toEdgeBuffer(
  edgeData: EdgeData[],
  lookup: Map<string, { x: number; y: number }>,
): { buffer: Uint8Array; count: number } {
  const arrayBuf = new ArrayBuffer(edgeData.length * BYTES_PER_EDGE);
  const f32 = new Float32Array(arrayBuf);
  const u32 = new Uint32Array(arrayBuf);
  let count = 0;
  for (let i = 0; i < edgeData.length; i++) {
    const e = edgeData[i];
    const src = lookup.get(e.PrincipalArn);
    const tgt = lookup.get(e.ResourceArn);
    if (!src || !tgt) continue;
    const slot = count * 7; // 28 / 4 = 7 uint32-slots per edge
    f32[slot] = src.x;
    f32[slot + 1] = src.y;
    f32[slot + 2] = tgt.x;
    f32[slot + 3] = tgt.y;
    f32[slot + 4] = NODE_RADIUS;
    f32[slot + 5] = NODE_RADIUS;
    u32[slot + 6] = PRIVILEGE_U32[e.HasPrivileges] ?? DEFAULT_PRIV_U32;
    count++;
  }
  return { buffer: new Uint8Array(arrayBuf, 0, count * BYTES_PER_EDGE), count };
}

const loaders: Record<string, () => Promise<[Resource[], EdgeData[]]>> = {
  small: () =>
    Promise.all([
      Promise.resolve(smallResources as Resource[]),
      import("./small.minimal-edges.json").then((m) => m.default as EdgeData[]),
    ]),
  medium: () =>
    Promise.all([
      import("./medium.minimal-resources.json").then((m) => m.default as Resource[]),
      import("./medium.minimal-edges.json").then((m) => m.default as EdgeData[]),
    ]),
  large: () =>
    Promise.all([
      import("./large.minimal-resources.json").then((m) => m.default as Resource[]),
      import("./large.minimal-edges.json").then((m) => m.default as EdgeData[]),
    ]),
};

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new Renderer({ canvas, nodes: toNodes(smallResources as Resource[]) });

renderer.render();

// Load edges for initial small dataset
loaders.small().then(([resources, edgeData]) => {
  const lookup = buildPositionLookup(resources);
  const { buffer, count } = toEdgeBuffer(edgeData, lookup);
  renderer.setEdges(buffer, count);
});

document.getElementById("fit-btn")?.addEventListener("click", () => {
  renderer.fitToNodes();
});

document.getElementById("dataset-toggle")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-dataset]");
  if (!btn) return;

  const dataset = btn.dataset.dataset!;
  for (const b of btn.parentElement!.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b === btn));
  }

  loaders[dataset]().then(([resources, edgeData]) => {
    const lookup = buildPositionLookup(resources);
    renderer.setNodes(toNodes(resources));
    const { buffer, count } = toEdgeBuffer(edgeData, lookup);
    renderer.setEdges(buffer, count);
  });
});

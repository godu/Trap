import { Renderer } from "../src/index";
import type { Node, Edge } from "../src/index";
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

const DIM_OPACITY = 0.12;

function toNodes(data: Resource[]): Node[] {
  return data.map((res) => {
    const [r, g, b] = TYPE_COLORS[res.InternalType] ?? DEFAULT_COLOR;
    return { id: res.InternalArn, x: res.x, y: res.y, r, g, b, radius: 2, opacity: 1.0 };
  });
}

function toEdges(edgeData: EdgeData[], resources: Resource[]): Edge[] {
  const posMap = new Set(resources.map((r) => r.InternalArn));
  const edges: Edge[] = [];
  for (const e of edgeData) {
    if (!posMap.has(e.PrincipalArn) || !posMap.has(e.ResourceArn)) continue;
    const [r, g, b, a] = PRIVILEGE_COLORS[e.HasPrivileges] ?? DEFAULT_PRIV_COLOR;
    edges.push({
      id: `${e.PrincipalArn}->${e.ResourceArn}`,
      source: e.PrincipalArn,
      target: e.ResourceArn,
      r,
      g,
      b,
      a,
      zIndex: e.HasPrivileges === "Escalation" ? 1 : 0,
    });
  }
  return edges;
}

// Adjacency structures for highlighting
type Adjacency = Map<string, Set<string>>;
type EdgesByNode = Map<string, Set<string>>;

function buildAdjacency(edges: Edge[]): { adjacency: Adjacency; edgesByNode: EdgesByNode } {
  const adjacency: Adjacency = new Map();
  const edgesByNode: EdgesByNode = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);

    if (!edgesByNode.has(edge.source)) edgesByNode.set(edge.source, new Set());
    if (!edgesByNode.has(edge.target)) edgesByNode.set(edge.target, new Set());
    edgesByNode.get(edge.source)!.add(edge.id);
    edgesByNode.get(edge.target)!.add(edge.id);
  }
  return { adjacency, edgesByNode };
}

// Current state
let currentNodes: Node[] = toNodes(smallResources as Resource[]);
let currentEdges: Edge[] = [];
let adjacency: Adjacency = new Map();
let edgesByNode: EdgesByNode = new Map();
let edgeMap = new Map<string, Edge>();

function updateState(nodes: Node[], edges: Edge[]) {
  currentNodes = nodes;
  currentEdges = edges;
  const adj = buildAdjacency(edges);
  adjacency = adj.adjacency;
  edgesByNode = adj.edgesByNode;
  edgeMap.clear();
  for (const e of edges) edgeMap.set(e.id, e);
}

function highlightNode(nodeId: string) {
  const neighbors = adjacency.get(nodeId) ?? new Set<string>();
  const connectedEdges = edgesByNode.get(nodeId) ?? new Set<string>();

  const highlightedNodeIds = new Set([nodeId, ...neighbors]);

  const dimmedNodes = currentNodes.map((n) => ({
    ...n,
    opacity: highlightedNodeIds.has(n.id) ? 1.0 : DIM_OPACITY,
  }));

  const dimmedEdges = currentEdges.map((e) => ({
    ...e,
    a: connectedEdges.has(e.id) ? e.a : e.a * DIM_OPACITY,
  }));

  renderer.setNodes(dimmedNodes);
  renderer.setEdges(dimmedEdges);
}

function highlightEdge(edgeId: string) {
  const edge = edgeMap.get(edgeId);
  if (!edge) return;

  const highlightedNodeIds = new Set([edge.source, edge.target]);

  const dimmedNodes = currentNodes.map((n) => ({
    ...n,
    opacity: highlightedNodeIds.has(n.id) ? 1.0 : DIM_OPACITY,
  }));

  const dimmedEdges = currentEdges.map((e) => ({
    ...e,
    a: e.id === edgeId ? e.a : e.a * DIM_OPACITY,
  }));

  renderer.setNodes(dimmedNodes);
  renderer.setEdges(dimmedEdges);
}

function clearHighlight() {
  renderer.setNodes(currentNodes);
  renderer.setEdges(currentEdges);
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = new Renderer({
  canvas,
  nodes: currentNodes,
  animationDuration: 300,
  onNodeClick: (e) => highlightNode(e.nodeId),
  onEdgeClick: (e) => highlightEdge(e.edgeId),
  onBackgroundClick: () => clearHighlight(),
});

renderer.render();

// Load edges for initial small dataset
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

loaders.small().then(([resources, edgeData]) => {
  const nodes = toNodes(resources);
  const edges = toEdges(edgeData, resources);
  updateState(nodes, edges);
  renderer.setEdges(edges);
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
    const nodes = toNodes(resources);
    const edges = toEdges(edgeData, resources);
    updateState(nodes, edges);
    renderer.setNodes(nodes);
    renderer.setEdges(edges);
    renderer.fitToNodes();
  });
});

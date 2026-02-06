import { Renderer, LabelOverlay } from "../src/index";
import type { Node, Edge } from "../src/index";
import { initFpsCounter, countRenderFrame } from "./fps";
import smallResourcesUrl from "./small.minimal-resources.json?url";
import smallEdgesUrl from "./small.minimal-edges.json?url";
import mediumResourcesUrl from "./medium.minimal-resources.json?url";
import mediumEdgesUrl from "./medium.minimal-edges.json?url";
import largeResourcesUrl from "./large.minimal-resources.json?url";
import largeEdgesUrl from "./large.minimal-edges.json?url";
import { ICON_SVGS, TYPE_ICON_INDEX } from "./icons/index";
import {
  TYPE_COLORS,
  DEFAULT_NODE_COLOR,
  EDGE_TYPE_COLORS,
  DEFAULT_EDGE_COLOR,
  NODE_RADIUS,
  DIM_OPACITY,
} from "./settings";

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

function toNodes(data: Resource[]): Node[] {
  return data.map((res) => {
    const [r, g, b] = TYPE_COLORS[res.InternalType] ?? DEFAULT_NODE_COLOR;
    return {
      id: res.InternalArn,
      x: res.x,
      y: res.y,
      r,
      g,
      b,
      radius: NODE_RADIUS,
      opacity: 1.0,
      icon: TYPE_ICON_INDEX[res.InternalType] ?? 0,
      label: res.InternalArn,
    };
  });
}

function toEdges(edgeData: EdgeData[], resources: Resource[]): Edge[] {
  const posMap = new Set(resources.map((r) => r.InternalArn));
  const edges: Edge[] = [];
  for (const e of edgeData) {
    if (!posMap.has(e.PrincipalArn) || !posMap.has(e.ResourceArn)) continue;
    const [r, g, b, a] =
      EDGE_TYPE_COLORS[e.HasPrivileges] ?? DEFAULT_EDGE_COLOR;
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

function buildAdjacency(edges: Edge[]): {
  adjacency: Adjacency;
  edgesByNode: EdgesByNode;
} {
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json();
}

// Current state
let currentNodes: Node[] = [];
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

  const dimmedNodes = currentNodes.map((n) => {
    const lit = highlightedNodeIds.has(n.id);
    return { ...n, opacity: lit ? 1.0 : DIM_OPACITY, label: lit ? n.label : undefined };
  });

  const dimmedEdges = currentEdges.map((e) => ({
    ...e,
    a: connectedEdges.has(e.id) ? e.a : DIM_OPACITY,
  }));

  renderer.setNodes(dimmedNodes);
  renderer.setEdges(dimmedEdges);
}

function highlightEdge(edgeId: string) {
  const edge = edgeMap.get(edgeId);
  if (!edge) return;

  const highlightedNodeIds = new Set([edge.source, edge.target]);

  const dimmedNodes = currentNodes.map((n) => {
    const lit = highlightedNodeIds.has(n.id);
    return { ...n, opacity: lit ? 1.0 : DIM_OPACITY, label: lit ? n.label : undefined };
  });

  const dimmedEdges = currentEdges.map((e) => ({
    ...e,
    a: e.id === edgeId ? 1.0 : e.a * DIM_OPACITY,
  }));

  renderer.setNodes(dimmedNodes);
  renderer.setEdges(dimmedEdges);
}

function clearHighlight() {
  renderer.setNodes(currentNodes);
  renderer.setEdges(currentEdges);
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasContainer = document.getElementById("canvas-container")!;
const eventInfo = document.getElementById("event-info")!;

let labels!: LabelOverlay;

function showEvent(type: string, target: string, id?: string) {
  eventInfo.textContent = id ? `${type} ${target} ${id}` : `${type} ${target}`;
}

const renderer = new Renderer({
  canvas,
  nodes: [],
  animationDuration: 300,
  onNodeClick: (e) => {
    showEvent(e.type, "node", e.nodeId);
    highlightNode(e.nodeId);
  },
  onNodeDblClick: (e) => showEvent(e.type, "node", e.nodeId),
  onNodeHoverEnter: (e) => showEvent(e.type, "node", e.nodeId),
  onNodeHoverLeave: (e) => showEvent(e.type, "node", e.nodeId),
  onEdgeClick: (e) => {
    showEvent(e.type, "edge", e.edgeId);
    highlightEdge(e.edgeId);
  },
  onEdgeDblClick: (e) => showEvent(e.type, "edge", e.edgeId),
  onEdgeHoverEnter: (e) => showEvent(e.type, "edge", e.edgeId),
  onEdgeHoverLeave: (e) => showEvent(e.type, "edge", e.edgeId),
  onBackgroundClick: (e) => {
    showEvent(e.type, "background");
    clearHighlight();
  },
  onBackgroundDblClick: (e) => showEvent(e.type, "background"),
  onRender() {
    countRenderFrame();
    labels.update(renderer.getNodes(), renderer.getCameraState());
  },
});

labels = new LabelOverlay({
  container: canvasContainer,
  labelClass: "graph-label",
});

renderer.setIcons(ICON_SVGS);
renderer.render();

const cache = new Map<string, Promise<[Resource[], EdgeData[]]>>();

const loaders: Record<string, () => Promise<[Resource[], EdgeData[]]>> = {
  small: () =>
    Promise.all([
      fetchJson<Resource[]>(smallResourcesUrl),
      fetchJson<EdgeData[]>(smallEdgesUrl),
    ]),
  medium: () =>
    Promise.all([
      fetchJson<Resource[]>(mediumResourcesUrl),
      fetchJson<EdgeData[]>(mediumEdgesUrl),
    ]),
  large: () =>
    Promise.all([
      fetchJson<Resource[]>(largeResourcesUrl),
      fetchJson<EdgeData[]>(largeEdgesUrl),
    ]),
};

function loadRaw(name: string): Promise<[Resource[], EdgeData[]]> {
  let p = cache.get(name);
  if (!p) {
    p = loaders[name]();
    cache.set(name, p);
  }
  return p;
}

let loading = false;

function setButtonsDisabled(disabled: boolean) {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(
    "#dataset-toggle button, #fit-btn",
  )) {
    btn.disabled = disabled;
  }
}

async function loadDataset(name: string) {
  if (loading) return;
  loading = true;
  setButtonsDisabled(true);
  try {
    const [resources, edgeData] = await loadRaw(name);
    const nodes = toNodes(resources);
    const edges = toEdges(edgeData, resources);
    const firstLoad = currentNodes.length === 0;
    updateState(nodes, edges);
    renderer.setNodes(nodes);
    renderer.setEdges(edges);
    renderer.fitToNodes(firstLoad ? 0 : undefined);
  } finally {
    loading = false;
    setButtonsDisabled(false);
  }
}

loadDataset("small");

// Initialize FPS counter
initFpsCounter();

document.getElementById("fit-btn")?.addEventListener("click", () => {
  renderer.fitToNodes();
});

document.getElementById("dataset-toggle")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-dataset]",
  );
  if (!btn || btn.disabled) return;

  const dataset = btn.dataset.dataset!;
  for (const b of btn.parentElement!.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b === btn));
  }

  loadDataset(dataset);
});

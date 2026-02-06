import { Renderer, LabelOverlay } from "../src/index";
import { toRenderNodes, toEdges } from "./graph/convert";
import type { GraphStep } from "./graph/types";
import { ICON_SVGS } from "./icons/index";
import { initFpsCounter, countRenderFrame } from "./fps";
import {
  FIRST_STEP_NODES,
  FIRST_STEP_EDGES,
  SECOND_STEP_NODES,
  SECOND_STEP_EDGES,
  THIRD_STEP_NODES,
  THIRD_STEP_EDGES,
} from "./fixtures";

const steps: GraphStep[] = [
  { nodes: FIRST_STEP_NODES, edges: FIRST_STEP_EDGES },
  { nodes: SECOND_STEP_NODES, edges: SECOND_STEP_EDGES },
  { nodes: THIRD_STEP_NODES, edges: THIRD_STEP_EDGES },
];

// Initialize renderer with Step 1
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const canvasContainer = document.getElementById("canvas-container")!;
const eventInfo = document.getElementById("event-info")!;
const initialNodes = toRenderNodes(steps[0]);
const initialEdges = toEdges(steps[0]);

function showEvent(type: string, target: string, id?: string) {
  eventInfo.textContent = id ? `${type} ${target} ${id}` : `${type} ${target}`;
}

const renderer = new Renderer({
  canvas,
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick: (e) => showEvent(e.type, "node", e.nodeId),
  onNodeDblClick: (e) => showEvent(e.type, "node", e.nodeId),
  onNodeHoverEnter: (e) => showEvent(e.type, "node", e.nodeId),
  onNodeHoverLeave: (e) => showEvent(e.type, "node", e.nodeId),
  onEdgeClick: (e) => showEvent(e.type, "edge", e.edgeId),
  onEdgeDblClick: (e) => showEvent(e.type, "edge", e.edgeId),
  onEdgeHoverEnter: (e) => showEvent(e.type, "edge", e.edgeId),
  onEdgeHoverLeave: (e) => showEvent(e.type, "edge", e.edgeId),
  onBackgroundClick: (e) => showEvent(e.type, "background"),
  onBackgroundDblClick: (e) => showEvent(e.type, "background"),
  onRender() {
    countRenderFrame();
    labels.update(renderer.getNodes(), renderer.getCameraState());
  },
});

const labels = new LabelOverlay({
  container: canvasContainer,
  labelClass: "graph-label",
});

renderer.setIcons(ICON_SVGS);
renderer.render();
renderer.fitToNodes(0);

function showStep(index: number) {
  const step = steps[index];
  const nodes = toRenderNodes(step);
  const edges = toEdges(step);
  renderer.setNodes(nodes);
  renderer.setEdges(edges);
  renderer.fitToNodes();
}

document.getElementById("fit-btn")?.addEventListener("click", () => {
  renderer.fitToNodes();
});

document.getElementById("step-toggle")?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-step]");
  if (!btn) return;

  const stepIndex = Number(btn.dataset.step);
  for (const b of btn.parentElement!.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b === btn));
  }

  showStep(stepIndex);
});

// Initialize FPS counter
initFpsCounter();

import { Renderer } from "../src/index";
import { computeLayout, toRenderNodes, toEdgeBuffer } from "../src/graph/index";
import type { GraphStep } from "../src/graph/types";
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

// Compute layout once across all steps for consistent positions
const layout = computeLayout(steps);

// Initialize renderer with Step 1
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const initialNodes = toRenderNodes(steps[0], layout);
const initialEdges = toEdgeBuffer(steps[0], layout);

const renderer = new Renderer({ canvas, nodes: initialNodes, edgeBuffer: initialEdges.buffer, edgeCount: initialEdges.count });
renderer.render();
renderer.fitToNodes(0);

function showStep(index: number) {
  const step = steps[index];
  const nodes = toRenderNodes(step, layout);
  const { buffer, count } = toEdgeBuffer(step, layout);
  renderer.setNodes(nodes);
  renderer.setEdges(buffer, count);
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

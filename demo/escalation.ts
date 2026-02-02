import { Renderer } from "../src/index";
import { toRenderNodes, toEdges } from "./graph/convert";
import type { GraphStep } from "./graph/types";
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
const initialNodes = toRenderNodes(steps[0]);
const initialEdges = toEdges(steps[0]);

const renderer = new Renderer({ canvas, nodes: initialNodes, edges: initialEdges });
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

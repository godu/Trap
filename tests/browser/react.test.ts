import { describe, it, expect, afterEach, vi } from "vitest";
import { createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Graph, type GraphRef } from "../../src/react";
import type { Node, Edge } from "../../src/index";
import { readPixelAt, simulateClick, nextFrame } from "./helpers";

/**
 * Wait for React to commit + mount useEffect + renderer RAF.
 * React 19 batches renders. The mount useEffect (which creates the Renderer)
 * fires after the browser paints, so we need several frames.
 */
async function flushReact(): Promise<void> {
  // Wait for React microtask commit + deferred useEffect + renderer RAF
  await new Promise((r) => setTimeout(r, 50));
  await nextFrame();
  await nextFrame();
  await nextFrame();
}

function getCanvas(container: HTMLElement): HTMLCanvasElement {
  return container.querySelector("canvas")!;
}

describe("React <Graph> component", () => {
  let container: HTMLDivElement;
  let root: Root;
  let graphRef: React.RefObject<GraphRef | null>;

  function createContainer(): HTMLDivElement {
    const div = document.createElement("div");
    div.style.cssText = "position:fixed;top:0;left:0;width:400px;height:400px;";
    document.body.appendChild(div);
    return div;
  }

  function mount(props: Record<string, unknown>): void {
    root.render(createElement(Graph, { ...props, ref: graphRef } as never));
  }

  afterEach(() => {
    root?.unmount();
    container?.remove();
  });

  it("mounts and renders a canvas element", async () => {
    container = createContainer();
    root = createRoot(container);
    graphRef = createRef<GraphRef>();

    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" },
    ];
    mount({ nodes });
    await flushReact();

    const canvas = getCanvas(container);
    expect(canvas).toBeTruthy();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it("unmounts cleanly without errors", async () => {
    container = createContainer();
    root = createRoot(container);
    graphRef = createRef<GraphRef>();

    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" },
    ];
    mount({ nodes });
    await flushReact();
    expect(getCanvas(container)).toBeTruthy();

    root.unmount();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("node prop update re-renders with new color", async () => {
    container = createContainer();
    root = createRoot(container);
    graphRef = createRef<GraphRef>();

    const redNode: Node = { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" };
    mount({ nodes: [redNode], animationDuration: 0 });
    await flushReact();

    const canvas = getCanvas(container);
    // Force a synchronous render and read pixels immediately
    graphRef.current!.getRenderer()!.render();
    const [r0, g0] = readPixelAt(canvas, 200, 200);
    expect(r0).toBeGreaterThan(g0);

    // Update to green
    const greenNode: Node = {
      id: "a",
      x: 0,
      y: 0,
      r: 0,
      g: 1,
      b: 0,
      a: 1,
      s: 10,
      z: 0,
      i: 0,
      l: "",
    };
    mount({ nodes: [greenNode], animationDuration: 0 });
    await flushReact();

    graphRef.current!.getRenderer()!.render();
    const [r1, g1] = readPixelAt(canvas, 200, 200);
    expect(g1).toBeGreaterThan(r1);
  });

  it("edge prop update renders edge", async () => {
    container = createContainer();
    root = createRoot(container);
    graphRef = createRef<GraphRef>();

    const nodeA: Node = { id: "a", x: -30, y: 0, r: 1, g: 0, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodeB: Node = { id: "b", x: 30, y: 0, r: 0, g: 1, b: 0, a: 1, s: 5, z: 0, i: 0, l: "" };
    const nodes = [nodeA, nodeB];

    // Mount without edges
    mount({ nodes, animationDuration: 0, curvature: 0 });
    await flushReact();

    const canvas = getCanvas(container);

    // Add an edge
    const edges: Edge[] = [{ id: "ab", src: "a", tgt: "b", r: 1, g: 1, b: 1, a: 1, s: 3, z: 0 }];
    mount({ nodes, edges, animationDuration: 0, curvature: 0 });
    await flushReact();

    // Force render and read
    graphRef.current!.getRenderer()!.render();
    const [r, g, b] = readPixelAt(canvas, 200, 200);
    const isBg = r < 25 && g < 25 && b < 25;
    expect(isBg).toBe(false);
  });

  it("event callbacks are forwarded correctly", async () => {
    container = createContainer();
    root = createRoot(container);
    graphRef = createRef<GraphRef>();

    const onNodeClick = vi.fn();
    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" },
    ];
    mount({ nodes, onNodeClick, animationDuration: 0 });
    await flushReact();

    const canvas = getCanvas(container);
    simulateClick(canvas, 200, 200);

    expect(onNodeClick).toHaveBeenCalledOnce();
    expect(onNodeClick.mock.calls[0][0].nodeId).toBe("a");
  });

  it("imperative ref exposes methods", async () => {
    container = createContainer();
    root = createRoot(container);
    graphRef = createRef<GraphRef>();

    const nodes: Node[] = [
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "" },
    ];
    mount({ nodes, animationDuration: 0 });
    await flushReact();

    expect(graphRef.current).toBeTruthy();
    expect(typeof graphRef.current!.fitToNodes).toBe("function");
    expect(typeof graphRef.current!.setCurvature).toBe("function");
    expect(graphRef.current!.getRenderer()).toBeTruthy();

    const cam = graphRef.current!.getCameraState();
    expect(cam).toBeTruthy();
    expect(typeof cam!.centerX).toBe("number");
    expect(typeof cam!.halfW).toBe("number");
  });
});

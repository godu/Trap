import { describe, it, expect, afterEach } from "vitest";
import { createTestCanvas, createTestRenderer, nextFrame } from "./helpers";
import { LabelOverlay } from "../../src/index";
import type { Renderer } from "../../src/index";
import type { Node } from "../../src/index";

describe("Label overlay", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;
  let container: HTMLDivElement;
  let labels: LabelOverlay;

  function setup(nodes: Node[], labelOpts?: { minScreenRadius?: number; maxLabels?: number }) {
    canvas = createTestCanvas();
    // Wrap canvas in a positioned container for the overlay
    container = document.createElement("div");
    container.style.cssText = "position:fixed;top:0;left:0;width:400px;height:400px;";
    canvas.remove();
    container.appendChild(canvas);
    document.body.appendChild(container);

    labels = new LabelOverlay({
      container,
      minScreenRadius: labelOpts?.minScreenRadius ?? 8,
      maxLabels: labelOpts?.maxLabels ?? 200,
    });

    renderer = createTestRenderer(canvas, nodes);
    renderer.fitToNodes(0);
    renderer.render();
    labels.update(renderer.getNodes(), renderer.getCameraState());
  }

  afterEach(() => {
    labels?.destroy();
    renderer?.destroy();
    if (container) container.remove();
    else if (canvas) canvas.remove();
  });

  function visibleLabels(): HTMLDivElement[] {
    // The overlay div is appended by LabelOverlay as a direct child of container
    const overlay = container.querySelector(":scope > div") as HTMLDivElement;
    if (!overlay) return [];
    return Array.from(overlay.querySelectorAll<HTMLDivElement>(":scope > div")).filter(
      (el) => el.style.opacity === "1",
    );
  }

  it("renders visible labels for large nodes", () => {
    setup([
      { id: "a", x: -20, y: 0, r: 1, g: 0, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Node A" },
      { id: "b", x: 20, y: 0, r: 0, g: 1, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Node B" },
    ]);

    const visible = visibleLabels();
    const texts = visible.map((el) => el.textContent);
    expect(texts).toContain("Node A");
    expect(texts).toContain("Node B");
  });

  it("hides labels for tiny nodes below minScreenRadius", () => {
    // minScreenRadius=50 should hide these nodes whose screen radius is small
    setup(
      [
        { id: "a", x: -100, y: 0, r: 1, g: 0, b: 0, a: 1, s: 1, z: 0, i: 0, l: "Tiny A" },
        { id: "b", x: 100, y: 0, r: 0, g: 1, b: 0, a: 1, s: 1, z: 0, i: 0, l: "Tiny B" },
      ],
      { minScreenRadius: 50 },
    );

    const visible = visibleLabels();
    expect(visible).toHaveLength(0);
  });

  it("frustum culling hides off-screen labels", () => {
    setup([
      { id: "near", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Near" },
      { id: "far", x: 100000, y: 100000, r: 0, g: 1, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Far" },
    ]);

    // Fit to only the near node so the far one is off-screen
    renderer.setNodes([
      { id: "near", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Near" },
    ]);
    renderer.fitToNodes(0);
    renderer.render();
    // Re-add the far node but keep camera on the near one
    renderer.setNodes([
      { id: "near", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Near" },
      { id: "far", x: 100000, y: 100000, r: 0, g: 1, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Far" },
    ]);
    renderer.render();
    labels.update(renderer.getNodes(), renderer.getCameraState());

    const visible = visibleLabels();
    const texts = visible.map((el) => el.textContent);
    expect(texts).toContain("Near");
    expect(texts).not.toContain("Far");
  });

  it("maxLabels caps visible labels", () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 5; i++) {
      nodes.push({
        id: `n${i}`,
        x: i * 40 - 80,
        y: 0,
        r: 1,
        g: 0,
        b: 0,
        a: 1,
        s: 20,
        z: 0,
        i: 0,
        l: `Label ${i}`,
      });
    }
    setup(nodes, { maxLabels: 2 });

    const visible = visibleLabels();
    expect(visible.length).toBeLessThanOrEqual(2);
  });

  it("cache invalidates on viewport resize", async () => {
    setup([{ id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Test" }]);

    const visible1 = visibleLabels();
    expect(visible1.length).toBeGreaterThan(0);
    const transform1 = visible1[0].style.transform;

    // Resize the canvas
    canvas.style.width = "800px";
    canvas.style.height = "800px";
    await nextFrame();
    await nextFrame();
    renderer.render();
    labels.update(renderer.getNodes(), renderer.getCameraState());

    const visible2 = visibleLabels();
    expect(visible2.length).toBeGreaterThan(0);
    const transform2 = visible2[0].style.transform;

    // Label position should change after resize
    expect(transform2).not.toBe(transform1);
  });

  it("collision detection prevents overlapping labels", () => {
    // Two very close nodes — labels will overlap
    setup([
      { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Label Alpha" },
      { id: "b", x: 0, y: 1, r: 0, g: 1, b: 0, a: 1, s: 20, z: 0, i: 0, l: "Label Beta" },
    ]);

    const visible = visibleLabels();
    // At most one should be visible due to collision
    expect(visible.length).toBeLessThanOrEqual(1);
  });
});

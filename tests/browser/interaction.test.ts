import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createTestCanvas,
  removeTestCanvas,
  createTestRenderer,
  readPixelAt,
  isBackground,
  nodeScreenPos,
  simulateDrag,
  simulateWheel,
  singleNodeGraph,
  nextFrame,
} from "./helpers";
import type { Renderer } from "../../src/index";

describe("Interactions", () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  afterEach(() => {
    renderer?.destroy();
    if (canvas) removeTestCanvas(canvas);
  });

  describe("pan", () => {
    it("mouse drag moves the viewport", async () => {
      canvas = createTestCanvas();
      // Two spread-out small nodes — viewport is ~116 world units wide,
      // each node ~10px on screen, so a 200px drag clearly shifts them.
      const nodes = [
        { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, radius: 3 },
        { id: "b", x: 100, y: 0, r: 0, g: 1, b: 0, radius: 3 },
      ];
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Node A is near left edge of canvas
      const posA = nodeScreenPos(nodes[0], nodes, canvas);
      const ax = Math.round(posA.x);
      const ay = Math.round(posA.y);
      const [rBefore] = readPixelAt(canvas, ax, ay);
      expect(rBefore).toBeGreaterThan(100); // red node visible

      // Drag 200px right (pans camera left, node shifts right)
      simulateDrag(canvas, 100, 200, 300, 200);
      await nextFrame();
      renderer.render();

      // Node A's original screen position should now be background
      const [r1, g1, b1] = readPixelAt(canvas, ax, ay);
      expect(isBackground(r1, g1, b1)).toBe(true);
    });
  });

  describe("zoom", () => {
    it("wheel scroll zooms in (node appears larger)", async () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Read pixel slightly off-center — may or may not be node depending on radius
      const offsetX = 200;
      const offsetY = 170; // 30px above center
      const before = readPixelAt(canvas, offsetX, offsetY);

      // Zoom in (negative deltaY)
      for (let i = 0; i < 5; i++) {
        simulateWheel(canvas, 200, 200, -100);
      }
      await nextFrame();
      renderer.render();

      const after = readPixelAt(canvas, offsetX, offsetY);

      // After zooming in, the node should cover more area
      // If the offset point was background before, it should be colored now
      // or if it was already colored, it should remain colored
      const wasBg = isBackground(before[0], before[1], before[2]);
      const nowBg = isBackground(after[0], after[1], after[2]);

      if (wasBg) {
        expect(nowBg).toBe(false);
      } else {
        // Already covered — still covered after zoom in
        expect(after[0]).toBeGreaterThan(100);
      }
    });

    it("wheel scroll zooms out (node appears smaller)", async () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      renderer = createTestRenderer(canvas, nodes);
      renderer.fitToNodes(0);
      renderer.render();

      // Count non-background pixels in a small area around center before zoom
      let beforeCount = 0;
      for (let dx = -20; dx <= 20; dx += 5) {
        const [r, g, b] = readPixelAt(canvas, 200 + dx, 200);
        if (!isBackground(r, g, b)) beforeCount++;
      }

      // Zoom out (positive deltaY)
      for (let i = 0; i < 5; i++) {
        simulateWheel(canvas, 200, 200, 100);
      }
      await nextFrame();
      renderer.render();

      let afterCount = 0;
      for (let dx = -20; dx <= 20; dx += 5) {
        const [r, g, b] = readPixelAt(canvas, 200 + dx, 200);
        if (!isBackground(r, g, b)) afterCount++;
      }

      // After zooming out, fewer pixels should be covered by the node
      expect(afterCount).toBeLessThanOrEqual(beforeCount);
    });
  });

  describe("click vs drag discrimination", () => {
    it("movement < 5px triggers click callback", () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      const onNodeClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { onNodeClick });
      renderer.fitToNodes(0);
      renderer.render();

      // mousedown at center, mouseup 3px away (< 5px threshold)
      canvas.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 200, clientY: 200, bubbles: true }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 203, clientY: 200, bubbles: true }),
      );

      expect(onNodeClick).toHaveBeenCalledOnce();
    });

    it("movement >= 5px does NOT trigger click callback", () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      const onNodeClick = vi.fn();
      const onBackgroundClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { onNodeClick, onBackgroundClick });
      renderer.fitToNodes(0);
      renderer.render();

      // mousedown at center, mouseup 10px away (>= 5px threshold)
      canvas.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 200, clientY: 200, bubbles: true }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 210, clientY: 200, bubbles: true }),
      );

      expect(onNodeClick).not.toHaveBeenCalled();
      expect(onBackgroundClick).not.toHaveBeenCalled();
    });

    it("drag does not fire click even when ending on a node", () => {
      canvas = createTestCanvas();
      const { nodes } = singleNodeGraph();
      const onNodeClick = vi.fn();
      renderer = createTestRenderer(canvas, nodes, { onNodeClick });
      renderer.fitToNodes(0);
      renderer.render();

      // Start far away, end on node center, but distance > 5px
      simulateDrag(canvas, 100, 200, 200, 200);

      expect(onNodeClick).not.toHaveBeenCalled();
    });
  });
});

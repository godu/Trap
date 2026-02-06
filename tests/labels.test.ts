import { describe, it, expect } from "vitest";
import { worldToScreen, bboxOverlap } from "../src/labels";

describe("worldToScreen", () => {
  it("projects world origin to screen center", () => {
    const { sx, sy } = worldToScreen(0, 0, 0, 0, 100, 100, 800, 600);
    expect(sx).toBe(400);
    expect(sy).toBe(300);
  });

  it("projects top-right corner of view to top-right of screen", () => {
    // halfW=100, halfH=100, so world (100, 100) is at right edge, top edge
    const { sx, sy } = worldToScreen(100, 100, 0, 0, 100, 100, 800, 600);
    expect(sx).toBe(800);
    expect(sy).toBe(0);
  });

  it("handles non-zero camera center", () => {
    // Camera centered at (50, 50), looking at halfW=100, halfH=100
    // World (50, 50) should be at screen center
    const { sx, sy } = worldToScreen(50, 50, 50, 50, 100, 100, 800, 600);
    expect(sx).toBe(400);
    expect(sy).toBe(300);
  });

  it("projects bottom-left corner correctly", () => {
    // World (-100, -100) with camera at origin, halfW=100, halfH=100
    const { sx, sy } = worldToScreen(-100, -100, 0, 0, 100, 100, 800, 600);
    expect(sx).toBe(0);
    expect(sy).toBe(600);
  });
});

describe("bboxOverlap", () => {
  it("detects overlapping boxes", () => {
    expect(bboxOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  it("detects non-overlapping boxes (right)", () => {
    expect(bboxOverlap(0, 0, 10, 10, 20, 0, 10, 10)).toBe(false);
  });

  it("detects non-overlapping boxes (below)", () => {
    expect(bboxOverlap(0, 0, 10, 10, 0, 20, 10, 10)).toBe(false);
  });

  it("detects touching boxes as non-overlapping", () => {
    // Touching at edge (x=10) — not overlapping
    expect(bboxOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });

  it("detects contained box", () => {
    expect(bboxOverlap(0, 0, 20, 20, 5, 5, 5, 5)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { sampleBezier } from "../src/renderer";

describe("sampleBezier", () => {
  it("returns source at t=0", () => {
    const pt = sampleBezier(0, 0, 10, 0, 0.4, 0);
    expect(pt.x).toBeCloseTo(0);
    expect(pt.y).toBeCloseTo(0);
  });

  it("returns target at t=1", () => {
    const pt = sampleBezier(0, 0, 10, 0, 0.4, 1);
    expect(pt.x).toBeCloseTo(10);
    expect(pt.y).toBeCloseTo(0);
  });

  it("returns midpoint with curve offset at t=0.5", () => {
    const pt = sampleBezier(0, 0, 10, 0, 0.4, 0.5);
    // x midpoint should be 5
    expect(pt.x).toBeCloseTo(5);
    // right = (-fwdY, fwdX) = (0, 1) for left-to-right edge
    // curveDist = 10 * 0.4 = 4, ctrl = (5, 4)
    // At t=0.5: 0.25*0 + 0.5*4 + 0.25*0 = 2
    expect(pt.y).toBeCloseTo(2);
  });

  it("returns straight midpoint when curvature is 0", () => {
    const pt = sampleBezier(0, 0, 10, 0, 0, 0.5);
    expect(pt.x).toBeCloseTo(5);
    expect(pt.y).toBeCloseTo(0);
  });

  it("handles degenerate (overlapping) points", () => {
    const pt = sampleBezier(5, 5, 5, 5, 0.4, 0.5);
    expect(pt.x).toBe(5);
    expect(pt.y).toBe(5);
  });

  it("works with vertical edges", () => {
    const pt = sampleBezier(0, 0, 0, 10, 0.4, 0);
    expect(pt.x).toBeCloseTo(0);
    expect(pt.y).toBeCloseTo(0);

    const pt2 = sampleBezier(0, 0, 0, 10, 0.4, 1);
    expect(pt2.x).toBeCloseTo(0);
    expect(pt2.y).toBeCloseTo(10);
  });

  it("works with negative curvature", () => {
    const pt = sampleBezier(0, 0, 10, 0, -0.4, 0.5);
    expect(pt.x).toBeCloseTo(5);
    // Negative curvature should curve in opposite direction
    expect(pt.y).toBeCloseTo(-2);
  });
});

import { describe, it, expect } from "vitest";
import { sampleBezier, distSqToBezier } from "../src/renderer";

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

describe("distSqToBezier", () => {
  // Horizontal edge (0,0)→(10,0), curvature 0.4 → ctrl (5,4)
  const p0x = 0, p0y = 0, p2x = 10, p2y = 0;
  const p1x = 5, p1y = 4; // control point

  it("returns 0 for point exactly on the curve", () => {
    // Midpoint of curve is at (5, 2)
    const dSq = distSqToBezier(5, 2, p0x, p0y, p1x, p1y, p2x, p2y);
    expect(dSq).toBeCloseTo(0, 6);
  });

  it("returns 0 at endpoints", () => {
    expect(distSqToBezier(0, 0, p0x, p0y, p1x, p1y, p2x, p2y)).toBeCloseTo(0, 6);
    expect(distSqToBezier(10, 0, p0x, p0y, p1x, p1y, p2x, p2y)).toBeCloseTo(0, 6);
  });

  it("returns correct distance for point above the curve midpoint", () => {
    // Point (5, 5) is 3 units above curve midpoint (5, 2)
    const dSq = distSqToBezier(5, 5, p0x, p0y, p1x, p1y, p2x, p2y);
    expect(Math.sqrt(dSq)).toBeCloseTo(3, 1);
  });

  it("handles straight line (control at midpoint)", () => {
    // Straight line from (0,0) to (10,0), ctrl at (5,0)
    const dSq = distSqToBezier(5, 3, 0, 0, 5, 0, 10, 0);
    expect(dSq).toBeCloseTo(9, 4);
  });

  it("handles degenerate (all points same)", () => {
    const dSq = distSqToBezier(3, 4, 0, 0, 0, 0, 0, 0);
    expect(dSq).toBeCloseTo(25, 4);
  });

  it("finds closest point on curve, not just endpoints", () => {
    // Point near the curved belly — should be closer than to either endpoint
    const dSq = distSqToBezier(5, 2.5, p0x, p0y, p1x, p1y, p2x, p2y);
    const distToP0 = Math.sqrt(5 * 5 + 2.5 * 2.5);
    const distToP2 = Math.sqrt(5 * 5 + 2.5 * 2.5);
    expect(Math.sqrt(dSq)).toBeLessThan(distToP0);
    expect(Math.sqrt(dSq)).toBeLessThan(distToP2);
  });
});

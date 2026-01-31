import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index";

describe("webgl2-graph", () => {
  it("should export VERSION", () => {
    expect(VERSION).toBe("0.1.0");
  });
});

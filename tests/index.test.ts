import { describe, it, expect, vi } from "vitest";
import { VERSION, init } from "../src/index";

describe("webgl2-graph", () => {
  it("should export VERSION", () => {
    expect(VERSION).toBe("0.1.0");
  });

  it("should log on init", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    init();
    expect(spy).toHaveBeenCalledWith("webgl2-graph v0.1.0 initialized");
    spy.mockRestore();
  });
});

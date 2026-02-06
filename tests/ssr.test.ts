import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Renderer, computeBounds, computeFitView } from "../src/index";
import { Graph } from "../src/react";
import type { Node } from "../src/index";

const node: Node = { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 1, z: 0, i: 0, l: "" };

describe("SSR", () => {
  it("core library imports without error in Node", () => {
    expect(typeof Renderer).toBe("function");
    expect(typeof computeBounds).toBe("function");
    expect(typeof computeFitView).toBe("function");
  });

  it("Graph component imports without error in Node", () => {
    expect(Graph).toBeDefined();
    expect(Graph).toHaveProperty("render");
  });

  it("renderToString produces a canvas inside a div", () => {
    const html = renderToString(createElement(Graph, { nodes: [node] }));
    expect(html).toContain("<div");
    expect(html).toContain("<canvas");
  });

  it("renderToString works with empty nodes", () => {
    const html = renderToString(createElement(Graph, { nodes: [] }));
    expect(html).toContain("<canvas");
  });

  it("build output preserves 'use client' directive", () => {
    const content = readFileSync("dist/react.js", "utf8");
    expect(content.startsWith('"use client"')).toBe(true);
  });
});

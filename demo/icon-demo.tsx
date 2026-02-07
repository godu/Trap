import { createRoot } from "react-dom/client";
import { Graph } from "../src/react";
import type { Node } from "../src/types";
import { ICON_SVGS } from "./icons/index";

const LABELS = [
  "principal",
  "compute",
  "database",
  "lambda",
  "container",
  "bucket",
  "key",
  "secret",
  "stack",
  "parameter",
  "cache",
  "search",
  "stream",
  "notification",
  "queue",
  "federation",
  "network",
  "shield",
];

const COLS = 6;
const SPACING = 50;

const nodes: Node[] = LABELS.map((label, idx) => ({
  id: label,
  x: (idx % COLS) * SPACING,
  y: -Math.floor(idx / COLS) * SPACING,
  r: 1,
  g: 1,
  b: 1,
  a: 1,
  s: 12,
  z: 0,
  i: idx + 1,
  l: label,
}));

function App() {
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <Graph
        nodes={nodes}
        icons={ICON_SVGS}
        minScreenRadius={2}
        maxScreenRadius={40}
        labelClass="graph-label"
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

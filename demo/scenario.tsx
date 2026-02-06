import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "../src/react";
import type { GraphRef } from "../src/react";
import type { Node, Edge } from "../src/types";
import { ICON_SVGS, TYPE_ICON_INDEX } from "./icons/index";
import {
  TYPE_COLORS,
  DEFAULT_NODE_COLOR,
  EDGE_TYPE_COLORS,
  DEFAULT_EDGE_COLOR,
  NODE_SIZE,
  DIM_A,
} from "./settings";
import { FpsPanel } from "./FpsPanel";
import type { FpsPanelRef } from "./FpsPanel";

import smallResourcesUrl from "./small.minimal-resources.json?url";
import smallEdgesUrl from "./small.minimal-edges.json?url";
import mediumResourcesUrl from "./medium.minimal-resources.json?url";
import mediumEdgesUrl from "./medium.minimal-edges.json?url";
import largeResourcesUrl from "./large.minimal-resources.json?url";
import largeEdgesUrl from "./large.minimal-edges.json?url";

// --- Types for the JSON data ---

interface Resource {
  InternalArn: string;
  InternalType: string;
  x: number;
  y: number;
}

interface EdgeData {
  PrincipalArn: string;
  PrincipalType: string;
  ResourceArn: string;
  ResourceType: string;
  HasPrivileges: string;
}

// --- Conversion ---

function toNodes(data: Resource[]): Node[] {
  return data.map((res) => {
    const [r, g, b] = TYPE_COLORS[res.InternalType] ?? DEFAULT_NODE_COLOR;
    return {
      id: res.InternalArn,
      x: res.x,
      y: res.y,
      r,
      g,
      b,
      a: 1.0,
      s: NODE_SIZE,
      z: 0,
      i: TYPE_ICON_INDEX[res.InternalType] ?? 0,
      l: res.InternalArn,
    };
  });
}

function toEdges(edgeData: EdgeData[], resources: Resource[]): Edge[] {
  const posMap = new Set(resources.map((r) => r.InternalArn));
  const edges: Edge[] = [];
  for (const e of edgeData) {
    if (!posMap.has(e.PrincipalArn) || !posMap.has(e.ResourceArn)) continue;
    const [r, g, b, a] =
      EDGE_TYPE_COLORS[e.HasPrivileges] ?? DEFAULT_EDGE_COLOR;
    edges.push({
      id: `${e.PrincipalArn}->${e.ResourceArn}`,
      src: e.PrincipalArn,
      tgt: e.ResourceArn,
      r,
      g,
      b,
      a,
      s: 1,
      z: e.HasPrivileges === "Escalation" ? 1 : 0,
    });
  }
  return edges;
}

// --- Adjacency for highlighting ---

function buildAdjacency(edges: Edge[]) {
  const adjacency = new Map<string, Set<string>>();
  const edgesByNode = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.src)) adjacency.set(edge.src, new Set());
    if (!adjacency.has(edge.tgt)) adjacency.set(edge.tgt, new Set());
    adjacency.get(edge.src)!.add(edge.tgt);
    adjacency.get(edge.tgt)!.add(edge.src);

    if (!edgesByNode.has(edge.src)) edgesByNode.set(edge.src, new Set());
    if (!edgesByNode.has(edge.tgt)) edgesByNode.set(edge.tgt, new Set());
    edgesByNode.get(edge.src)!.add(edge.id);
    edgesByNode.get(edge.tgt)!.add(edge.id);
  }
  return { adjacency, edgesByNode };
}

// --- Data loading ---

const loaders: Record<string, () => Promise<[Resource[], EdgeData[]]>> = {
  small: () =>
    Promise.all([
      fetch(smallResourcesUrl).then((r) => r.json()),
      fetch(smallEdgesUrl).then((r) => r.json()),
    ]),
  medium: () =>
    Promise.all([
      fetch(mediumResourcesUrl).then((r) => r.json()),
      fetch(mediumEdgesUrl).then((r) => r.json()),
    ]),
  large: () =>
    Promise.all([
      fetch(largeResourcesUrl).then((r) => r.json()),
      fetch(largeEdgesUrl).then((r) => r.json()),
    ]),
};

const cache = new Map<string, Promise<[Resource[], EdgeData[]]>>();

function loadRaw(name: string): Promise<[Resource[], EdgeData[]]> {
  let p = cache.get(name);
  if (!p) {
    p = loaders[name]();
    cache.set(name, p);
  }
  return p;
}

// --- App ---

const DATASETS = ["small", "medium", "large"] as const;

function App() {
  const graphRef = useRef<GraphRef>(null);
  const fpsRef = useRef<FpsPanelRef>(null);

  const [dataset, setDataset] = useState("small");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [fitKey, setFitKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
    null,
  );
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(
    null,
  );
  const [eventText, setEventText] = useState("");

  // Load dataset
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRaw(dataset).then(([resources, edgeData]) => {
      if (cancelled) return;
      setNodes(toNodes(resources));
      setEdges(toEdges(edgeData, resources));
      setFitKey((k) => k + 1);
      setHighlightedNodeId(null);
      setHighlightedEdgeId(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dataset]);

  // Adjacency + edge map (derived from base data)
  const { adjacency, edgesByNode, edgeMap } = useMemo(() => {
    const { adjacency, edgesByNode } = buildAdjacency(edges);
    const edgeMap = new Map<string, Edge>();
    for (const e of edges) edgeMap.set(e.id, e);
    return { adjacency, edgesByNode, edgeMap };
  }, [edges]);

  // Derive display nodes/edges from base data + highlight state
  const displayNodes = useMemo(() => {
    if (highlightedNodeId) {
      const neighbors = adjacency.get(highlightedNodeId) ?? new Set<string>();
      const lit = new Set([highlightedNodeId, ...neighbors]);
      return nodes.map((n) => ({
        ...n,
        a: lit.has(n.id) ? 1.0 : DIM_A,
        l: lit.has(n.id) ? n.l : "",
      }));
    }
    if (highlightedEdgeId) {
      const edge = edgeMap.get(highlightedEdgeId);
      if (edge) {
        const lit = new Set([edge.src, edge.tgt]);
        return nodes.map((n) => ({
          ...n,
          a: lit.has(n.id) ? 1.0 : DIM_A,
          l: lit.has(n.id) ? n.l : "",
        }));
      }
    }
    return nodes;
  }, [nodes, highlightedNodeId, highlightedEdgeId, adjacency, edgeMap]);

  const displayEdges = useMemo(() => {
    if (highlightedNodeId) {
      const connectedEdges =
        edgesByNode.get(highlightedNodeId) ?? new Set<string>();
      return edges.map((e) => ({
        ...e,
        a: connectedEdges.has(e.id) ? e.a : DIM_A,
      }));
    }
    if (highlightedEdgeId) {
      return edges.map((e) => ({
        ...e,
        a: e.id === highlightedEdgeId ? 1.0 : e.a * DIM_A,
      }));
    }
    return edges;
  }, [edges, highlightedNodeId, highlightedEdgeId, edgesByNode]);

  const handleRender = useCallback(() => {
    fpsRef.current?.countFrame();
  }, []);

  const showEvent = useCallback((type: string, target: string, id?: string) => {
    setEventText(id ? `${type} ${target} ${id}` : `${type} ${target}`);
  }, []);

  return (
    <>
      <header>
        <div className="toggle-group">
          {DATASETS.map((d) => (
            <button
              key={d}
              aria-pressed={d === dataset}
              disabled={loading}
              onClick={() => setDataset(d)}
            >
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <button
          id="fit-btn"
          disabled={loading}
          onClick={() => graphRef.current?.fitToNodes()}
        >
          Fit
        </button>
      </header>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Graph
          ref={graphRef}
          nodes={displayNodes}
          edges={displayEdges}
          fitKey={fitKey}
          animationDuration={300}
          icons={ICON_SVGS}
          labelClass="graph-label"
          onRender={handleRender}
          onNodeClick={(e) => {
            showEvent(e.type, "node", e.nodeId);
            setHighlightedNodeId(e.nodeId);
            setHighlightedEdgeId(null);
          }}
          onNodeDblClick={(e) => showEvent(e.type, "node", e.nodeId)}
          onNodeHoverEnter={(e) => showEvent(e.type, "node", e.nodeId)}
          onNodeHoverLeave={(e) => showEvent(e.type, "node", e.nodeId)}
          onEdgeClick={(e) => {
            showEvent(e.type, "edge", e.edgeId);
            setHighlightedEdgeId(e.edgeId);
            setHighlightedNodeId(null);
          }}
          onEdgeDblClick={(e) => showEvent(e.type, "edge", e.edgeId)}
          onEdgeHoverEnter={(e) => showEvent(e.type, "edge", e.edgeId)}
          onEdgeHoverLeave={(e) => showEvent(e.type, "edge", e.edgeId)}
          onBackgroundClick={(e) => {
            showEvent(e.type, "background");
            setHighlightedNodeId(null);
            setHighlightedEdgeId(null);
          }}
          onBackgroundDblClick={(e) => showEvent(e.type, "background")}
        />
      </div>
      <div id="event-info">{eventText}</div>
      <FpsPanel ref={fpsRef} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

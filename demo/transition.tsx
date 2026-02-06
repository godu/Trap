import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "../src/react";
import type { GraphRef } from "../src/react";
import { toRenderNodes, toEdges } from "./graph/convert";
import type { GraphStep } from "./graph/types";
import { ICON_SVGS } from "./icons/index";
import { FpsPanel } from "./FpsPanel";
import type { FpsPanelRef } from "./FpsPanel";
import {
  FIRST_STEP_NODES,
  FIRST_STEP_EDGES,
  SECOND_STEP_NODES,
  SECOND_STEP_EDGES,
  THIRD_STEP_NODES,
  THIRD_STEP_EDGES,
} from "./fixtures";

const steps: GraphStep[] = [
  { nodes: FIRST_STEP_NODES, edges: FIRST_STEP_EDGES },
  { nodes: SECOND_STEP_NODES, edges: SECOND_STEP_EDGES },
  { nodes: THIRD_STEP_NODES, edges: THIRD_STEP_EDGES },
];

function App() {
  const graphRef = useRef<GraphRef>(null);
  const fpsRef = useRef<FpsPanelRef>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [eventText, setEventText] = useState("");

  const nodes = useMemo(() => toRenderNodes(steps[stepIndex]), [stepIndex]);
  const edges = useMemo(() => toEdges(steps[stepIndex]), [stepIndex]);

  // Fit to nodes on step change
  const isFirstRender = useRef(true);
  useEffect(() => {
    const firstRender = isFirstRender.current;
    isFirstRender.current = false;
    requestAnimationFrame(() => {
      graphRef.current?.fitToNodes(firstRender ? 0 : undefined);
    });
  }, [stepIndex]);

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
          {steps.map((_, i) => (
            <button
              key={i}
              aria-pressed={i === stepIndex}
              onClick={() => setStepIndex(i)}
            >
              Step {i + 1}
            </button>
          ))}
        </div>
        <button
          id="fit-btn"
          onClick={() => graphRef.current?.fitToNodes()}
        >
          Fit
        </button>
      </header>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Graph
          ref={graphRef}
          nodes={nodes}
          edges={edges}
          icons={ICON_SVGS}
          labelClass="graph-label"
          onRender={handleRender}
          onNodeClick={(e) => showEvent(e.type, "node", e.nodeId)}
          onNodeDblClick={(e) => showEvent(e.type, "node", e.nodeId)}
          onNodeHoverEnter={(e) => showEvent(e.type, "node", e.nodeId)}
          onNodeHoverLeave={(e) => showEvent(e.type, "node", e.nodeId)}
          onEdgeClick={(e) => showEvent(e.type, "edge", e.edgeId)}
          onEdgeDblClick={(e) => showEvent(e.type, "edge", e.edgeId)}
          onEdgeHoverEnter={(e) => showEvent(e.type, "edge", e.edgeId)}
          onEdgeHoverLeave={(e) => showEvent(e.type, "edge", e.edgeId)}
          onBackgroundClick={(e) => showEvent(e.type, "background")}
          onBackgroundDblClick={(e) => showEvent(e.type, "background")}
        />
      </div>
      <div id="event-info">{eventText}</div>
      <FpsPanel ref={fpsRef} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

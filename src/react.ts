"use client";

import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import { Renderer } from "./renderer";
import { LabelOverlay } from "./labels";
import type { Node, Edge, NodeEvent, EdgeEvent, BackgroundEvent, CameraState } from "./types";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Props for the {@link Graph} component. */
export interface GraphProps {
  nodes: Node[];
  edges?: Edge[];
  animationDuration?: number;
  animationEasing?: (t: number) => number;
  curvature?: number;
  minScreenRadius?: number;
  maxScreenRadius?: number;
  icons?: string[];
  iconCellSize?: number;
  /** When this value changes, the camera fits to all nodes (animated). */
  fitKey?: string | number;

  // Labels
  labelClass?: string;
  minLabelRadius?: number;
  maxLabels?: number;

  // Events
  onNodeClick?: (e: NodeEvent) => void;
  onNodeDblClick?: (e: NodeEvent) => void;
  onNodeHoverEnter?: (e: NodeEvent) => void;
  onNodeHoverLeave?: (e: NodeEvent) => void;
  onEdgeClick?: (e: EdgeEvent) => void;
  onEdgeDblClick?: (e: EdgeEvent) => void;
  onEdgeHoverEnter?: (e: EdgeEvent) => void;
  onEdgeHoverLeave?: (e: EdgeEvent) => void;
  onBackgroundClick?: (e: BackgroundEvent) => void;
  onBackgroundDblClick?: (e: BackgroundEvent) => void;

  /** Called after each rendered frame (after labels update). */
  onRender?: () => void;

  children?: ReactNode;
}

/** Imperative handle exposed via ref on {@link Graph}. */
export interface GraphRef {
  fitToNodes(duration?: number): void;
  setCurvature(amount: number): void;
  getRenderer(): Renderer | null;
  getCameraState(): CameraState | undefined;
}

const containerStyle = {
  position: "relative" as const,
  width: "100%",
  height: "100%",
};

const canvasStyle = {
  display: "block" as const,
  width: "100%",
  height: "100%",
};

const overlayStyle = {
  position: "absolute" as const,
  inset: 0,
  pointerEvents: "none" as const,
};

/**
 * Declarative React wrapper for the WebGL2 graph renderer.
 *
 * Fills its parent container. Pass `nodes` and `edges` as props;
 * the component handles the renderer lifecycle, labels, and auto-fit.
 *
 * Imperative methods (fitToNodes, setCurvature) are available via ref.
 */
export const Graph = forwardRef(function Graph(props: GraphProps, ref: Ref<GraphRef>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const labelsRef = useRef<LabelOverlay | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({
    fitToNodes(duration?: number) {
      rendererRef.current?.fitToNodes(duration);
    },
    setCurvature(amount: number) {
      rendererRef.current?.setCurvature(amount);
    },
    getRenderer() {
      return rendererRef.current;
    },
    getCameraState() {
      return rendererRef.current?.getCameraState();
    },
  }));

  // Mount / unmount
  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const p = propsRef.current;

    const labels = new LabelOverlay({
      container,
      labelClass: p.labelClass,
      minScreenRadius: p.minLabelRadius,
      maxLabels: p.maxLabels,
    });
    labelsRef.current = labels;

    const renderer = new Renderer({
      canvas,
      nodes: p.nodes,
      edges: p.edges,
      animationDuration: p.animationDuration,
      animationEasing: p.animationEasing,
      minScreenRadius: p.minScreenRadius,
      maxScreenRadius: p.maxScreenRadius,
      onNodeClick: (e) => propsRef.current.onNodeClick?.(e),
      onNodeDblClick: (e) => propsRef.current.onNodeDblClick?.(e),
      onNodeHoverEnter: (e) => propsRef.current.onNodeHoverEnter?.(e),
      onNodeHoverLeave: (e) => propsRef.current.onNodeHoverLeave?.(e),
      onEdgeClick: (e) => propsRef.current.onEdgeClick?.(e),
      onEdgeDblClick: (e) => propsRef.current.onEdgeDblClick?.(e),
      onEdgeHoverEnter: (e) => propsRef.current.onEdgeHoverEnter?.(e),
      onEdgeHoverLeave: (e) => propsRef.current.onEdgeHoverLeave?.(e),
      onBackgroundClick: (e) => propsRef.current.onBackgroundClick?.(e),
      onBackgroundDblClick: (e) => propsRef.current.onBackgroundDblClick?.(e),
      onRender: () => {
        labels.update(renderer.getNodes(), renderer.getCameraState());
        propsRef.current.onRender?.();
      },
    });
    rendererRef.current = renderer;

    if (p.curvature != null) renderer.setCurvature(p.curvature);
    if (p.icons) renderer.setIcons(p.icons, p.iconCellSize);
    if (p.nodes.length > 0) renderer.fitToNodes(0);

    return () => {
      rendererRef.current = null;
      labelsRef.current = null;
      renderer.destroy();
      labels.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Data updates — layout effect so renderer has data before parent RAFs
  useIsomorphicLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setNodes(props.nodes);
    if (props.edges) renderer.setEdges(props.edges);
  }, [props.nodes, props.edges]);

  // Fit-to-nodes when `fitKey` changes
  useIsomorphicLayoutEffect(() => {
    rendererRef.current?.fitToNodes();
  }, [props.fitKey]);

  // Curvature
  useEffect(() => {
    if (props.curvature != null) {
      rendererRef.current?.setCurvature(props.curvature);
    }
  }, [props.curvature]);

  // Icons
  useEffect(() => {
    if (props.icons) {
      rendererRef.current?.setIcons(props.icons, props.iconCellSize);
    }
  }, [props.icons, props.iconCellSize]);

  return createElement(
    "div",
    { ref: containerRef, style: containerStyle },
    createElement("canvas", { ref: canvasRef, style: canvasStyle }),
    props.children ? createElement("div", { style: overlayStyle }, props.children) : null,
  );
});

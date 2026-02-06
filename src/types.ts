export interface Node {
  id: string;
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  opacity?: number;
  zIndex?: number;
  /** Icon index (1-based) into the icon atlas. 0 or undefined = no icon. */
  icon?: number;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  r: number;
  g: number;
  b: number;
  a: number;
  width?: number;
  zIndex?: number;
}

export interface NodeEvent {
  type: string;
  nodeId: string;
  node: Node;
  worldX: number;
  worldY: number;
  originalEvent: MouseEvent | TouchEvent;
}

export interface EdgeEvent {
  type: string;
  edgeId: string;
  edge: Edge;
  worldX: number;
  worldY: number;
  originalEvent: MouseEvent | TouchEvent;
}

export interface BackgroundEvent {
  type: string;
  worldX: number;
  worldY: number;
  originalEvent: MouseEvent | TouchEvent;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  nodes: Node[];
  edges?: Edge[];
  edgeBuffer?: ArrayBufferView;
  edgeCount?: number;
  animationDuration?: number;
  animationEasing?: (t: number) => number;
  onNodeClick?: (event: NodeEvent) => void;
  onNodeDblClick?: (event: NodeEvent) => void;
  onNodeHoverEnter?: (event: NodeEvent) => void;
  onNodeHoverLeave?: (event: NodeEvent) => void;
  onEdgeClick?: (event: EdgeEvent) => void;
  onEdgeDblClick?: (event: EdgeEvent) => void;
  onEdgeHoverEnter?: (event: EdgeEvent) => void;
  onEdgeHoverLeave?: (event: EdgeEvent) => void;
  onBackgroundClick?: (event: BackgroundEvent) => void;
  onBackgroundDblClick?: (event: BackgroundEvent) => void;
  /** Called after each render. */
  onRender?: () => void;
  /** Minimum node screen radius in CSS pixels (default: 2). */
  minScreenRadius?: number;
  /** Maximum node screen radius in CSS pixels (default: 40). */
  maxScreenRadius?: number;
}

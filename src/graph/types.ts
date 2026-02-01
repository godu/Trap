export interface GraphNode {
  label: string;
  type: string;
  selected?: boolean;
}

export interface GraphEdge {
  type: string;
}

export interface GraphStep {
  nodes: Map<string, GraphNode>;
  edges: Map<string, Map<string, GraphEdge>>;
}

export interface NodePosition {
  x: number;
  y: number;
}

export type LayoutResult = Map<string, NodePosition>;

export interface GraphNode {
  label: string;
  type: string;
  x: number;
  y: number;
  selected?: boolean;
}

export interface GraphEdge {
  type: string;
}

export interface GraphStep {
  nodes: Map<string, GraphNode>;
  edges: Map<string, Map<string, GraphEdge>>;
}

export interface Node {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  radius: number;
}

export interface Edge {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  nodes: Node[];
  edgeBuffer?: Float32Array;
  edgeCount?: number;
}

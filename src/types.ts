export interface Node {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  radius: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  nodes: Node[];
}

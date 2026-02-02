import type { Node, Edge, RendererOptions, NodeEvent, EdgeEvent, BackgroundEvent } from "./types";
import {
  vertexSource,
  fragmentSource,
  edgeVertexSource,
  edgeFragmentSource,
  edgeLineVertexSource,
} from "./shaders";
import { computeBounds, computeFitView } from "./camera";

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  const k = -2 * t + 2;
  return 1 - (k * k * k) / 2;
}

function easeOutCubic(t: number): number {
  const k = 1 - t;
  return 1 - k * k * k;
}

/** Pack premultiplied RGBA into a uint32 (little-endian: R | G<<8 | B<<16 | A<<24) */
function packPremultiplied(r: number, g: number, b: number, a: number): number {
  return (
    (r * a * 255 + 0.5) |
    0 |
    (((g * a * 255 + 0.5) | 0) << 8) |
    (((b * a * 255 + 0.5) | 0) << 16) |
    (((a * 255 + 0.5) | 0) << 24)
  );
}

const EDGE_STRIDE = 32; // bytes per edge instance
const CURVATURE = 0.4;
const CLICK_THRESHOLD = 5; // px

/** Evaluate quadratic Bezier at parameter t. */
export function sampleBezier(
  srcX: number,
  srcY: number,
  tgtX: number,
  tgtY: number,
  curvature: number,
  t: number,
): { x: number; y: number } {
  const dx = tgtX - srcX;
  const dy = tgtY - srcY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.0001) return { x: srcX, y: srcY };
  const fwdX = dx / len;
  const fwdY = dy / len;
  const rightX = -fwdY;
  const rightY = fwdX;
  const curveDist = len * curvature;
  const ctrlX = (srcX + tgtX) * 0.5 + rightX * curveDist;
  const ctrlY = (srcY + tgtY) * 0.5 + rightY * curveDist;
  const omt = 1 - t;
  return {
    x: omt * omt * srcX + 2 * t * omt * ctrlX + t * t * tgtX,
    y: omt * omt * srcY + 2 * t * omt * ctrlY + t * t * tgtY,
  };
}

/** Fisher-Yates shuffle of edge buffer within zIndex groups (EDGE_STRIDE bytes per record). */
function shuffleEdgeBuffer(buf: Uint8Array, count: number, groupSizes?: number[]): Uint8Array {
  if (!groupSizes || groupSizes.length <= 1) {
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    for (let i = count - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    const shuffled = new Uint8Array(count * EDGE_STRIDE);
    for (let i = 0; i < count; i++) {
      const srcOff = indices[i] * EDGE_STRIDE;
      shuffled.set(buf.subarray(srcOff, srcOff + EDGE_STRIDE), i * EDGE_STRIDE);
    }
    return shuffled;
  }

  // Shuffle within each zIndex group independently
  const shuffled = new Uint8Array(count * EDGE_STRIDE);
  let offset = 0;
  for (const size of groupSizes) {
    const indices = new Uint32Array(size);
    for (let i = 0; i < size; i++) indices[i] = offset + i;
    for (let i = size - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    for (let i = 0; i < size; i++) {
      const srcOff = indices[i] * EDGE_STRIDE;
      shuffled.set(buf.subarray(srcOff, srcOff + EDGE_STRIDE), (offset + i) * EDGE_STRIDE);
    }
    offset += size;
  }
  return shuffled;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private nodeCount: number;
  private scaleLocation: WebGLUniformLocation;
  private offsetLocation: WebGLUniformLocation;
  private nodes: Node[];
  private nodeInstanceBuffer!: WebGLBuffer;

  // Node/edge maps for object API
  private nodeMap = new Map<string, Node>();
  private edgeObjects: Edge[] = [];
  private edgeMap = new Map<string, Edge>();

  // Edge rendering
  private edgeProgram: WebGLProgram;
  private edgeVao: WebGLVertexArrayObject;
  private edgeCount = 0;
  private edgeScaleLocation: WebGLUniformLocation;
  private edgeOffsetLocation: WebGLUniformLocation;
  private edgeHeadLenLocation: WebGLUniformLocation;
  private edgeCurvatureLocation: WebGLUniformLocation;
  private edgeViewportLocation: WebGLUniformLocation;
  private edgeInstanceBuffer!: WebGLBuffer;

  // Edge LOD line rendering
  private edgeLineProgram!: WebGLProgram;
  private edgeLineVao!: WebGLVertexArrayObject;
  private edgeLineScaleLocation!: WebGLUniformLocation;
  private edgeLineOffsetLocation!: WebGLUniformLocation;
  private edgeLineViewportLocation!: WebGLUniformLocation;

  // Camera state (world-space view)
  private centerX = 0;
  private centerY = 0;
  private halfW = 1;
  private halfH = 1;

  // Cached viewport bounds (updated in updateProjection)
  private vpMinX = 0;
  private vpMinY = 0;
  private vpMaxX = 0;
  private vpMaxY = 0;

  // Camera animation state
  private animationId: number | null = null;
  private animStartTime = 0;
  private animDuration = 0;
  private animFrom = { centerX: 0, centerY: 0, halfW: 0, halfH: 0 };
  private animTo = { centerX: 0, centerY: 0, halfW: 0, halfH: 0 };

  // Data animation state
  private dataAnimId: number | null = null;
  private dataAnimStart = 0;
  private dataAnimDuration = 300;
  private dataAnimEasing: (t: number) => number = easeOutCubic;
  private oldNodes: Node[] = [];
  private oldNodeMap = new Map<string, Node>();
  private targetNodes: Node[] = [];
  private oldEdges: Edge[] = [];
  private oldEdgeMap = new Map<string, Edge>();
  private targetEdges: Edge[] = [];

  // Cached projection scalars (orthographic: pos * scale + offset)
  private projScaleX = 1;
  private projScaleY = 1;
  private projOffsetX = 0;
  private projOffsetY = 0;

  // Last-sent uniform values to skip redundant gl.uniform* calls
  private sentNodeScaleX = NaN;
  private sentNodeScaleY = NaN;
  private sentNodeOffsetX = NaN;
  private sentNodeOffsetY = NaN;
  private sentEdgeScaleX = NaN;
  private sentEdgeScaleY = NaN;
  private sentEdgeOffsetX = NaN;
  private sentEdgeOffsetY = NaN;
  private sentEdgeVpMinX = NaN;
  private sentEdgeVpMinY = NaN;
  private sentEdgeVpMaxX = NaN;
  private sentEdgeVpMaxY = NaN;
  private sentLineScaleX = NaN;
  private sentLineScaleY = NaN;
  private sentLineOffsetX = NaN;
  private sentLineOffsetY = NaN;
  private sentLineVpMinX = NaN;
  private sentLineVpMinY = NaN;
  private sentLineVpMaxX = NaN;
  private sentLineVpMaxY = NaN;

  // Render throttling
  private renderPending = false;

  // Resize tracking
  private resizeDirty = true;
  private resizeObserver: ResizeObserver;

  // Cached layout values
  private cachedRect: DOMRect | null = null;

  // Reusable world-coordinate result (avoids allocation per event)
  private worldResult = { x: 0, y: 0 };

  // Interaction state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private dragStartX = 0;
  private dragStartY = 0;

  // Pre-allocated touch coordinate storage (avoids Array.from per event)
  private touchCount = 0;
  private touch0X = 0;
  private touch0Y = 0;
  private touch1X = 0;
  private touch1Y = 0;
  private abortController = new AbortController();

  // Event callbacks
  private onNodeClick?: (e: NodeEvent) => void;
  private onNodeDblClick?: (e: NodeEvent) => void;
  private onNodeHoverEnter?: (e: NodeEvent) => void;
  private onNodeHoverLeave?: (e: NodeEvent) => void;
  private onEdgeClick?: (e: EdgeEvent) => void;
  private onEdgeDblClick?: (e: EdgeEvent) => void;
  private onEdgeHoverEnter?: (e: EdgeEvent) => void;
  private onEdgeHoverLeave?: (e: EdgeEvent) => void;
  private onBackgroundClick?: (e: BackgroundEvent) => void;
  private onBackgroundDblClick?: (e: BackgroundEvent) => void;

  // Hover state
  private hoveredNodeId: string | null = null;
  private hoveredEdgeId: string | null = null;

  // Cached sorted arrays for animation (sort once, reuse every frame)
  private sortedTargetNodes: Node[] | null = null;
  private sortedTargetEdges: Edge[] | null = null;

  // Pre-allocated node buffer pool (grow-by-doubling, reused across frames)
  private nodeBufferCapacity = 0;
  private nodeArrayBuf: ArrayBuffer | null = null;
  private nodeF32: Float32Array | null = null;
  private nodeU8: Uint8Array | null = null;

  // Pre-allocated edge buffer pool (grow-by-doubling, reused across frames)
  private edgeBufferCapacity = 0;
  private edgeArrayBuf: ArrayBuffer | null = null;
  private edgeF32: Float32Array | null = null;
  private edgeU32: Uint32Array | null = null;
  private edgeBufU8: Uint8Array | null = null;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.nodes = options.nodes;
    this.nodeCount = options.nodes.length;
    this.rebuildNodeMap(options.nodes);

    // Store event callbacks
    this.onNodeClick = options.onNodeClick;
    this.onNodeDblClick = options.onNodeDblClick;
    this.onNodeHoverEnter = options.onNodeHoverEnter;
    this.onNodeHoverLeave = options.onNodeHoverLeave;
    this.onEdgeClick = options.onEdgeClick;
    this.onEdgeDblClick = options.onEdgeDblClick;
    this.onEdgeHoverEnter = options.onEdgeHoverEnter;
    this.onEdgeHoverLeave = options.onEdgeHoverLeave;
    this.onBackgroundClick = options.onBackgroundClick;
    this.onBackgroundDblClick = options.onBackgroundDblClick;

    // Animation config
    if (options.animationDuration !== undefined) {
      this.dataAnimDuration = options.animationDuration;
    }
    if (options.animationEasing) {
      this.dataAnimEasing = options.animationEasing;
    }

    const gl = this.canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.program = createProgram(gl, vertexSource, fragmentSource);

    const sLoc = gl.getUniformLocation(this.program, "u_scale");
    const oLoc = gl.getUniformLocation(this.program, "u_offset");
    if (!sLoc || !oLoc) throw new Error("u_scale/u_offset uniform not found");
    this.scaleLocation = sLoc;
    this.offsetLocation = oLoc;

    this.vao = this.setupGeometry(gl, options.nodes);

    // Edge program
    this.edgeProgram = createProgram(gl, edgeVertexSource, edgeFragmentSource);

    const esLoc = gl.getUniformLocation(this.edgeProgram, "u_scale");
    const eoLoc = gl.getUniformLocation(this.edgeProgram, "u_offset");
    if (!esLoc || !eoLoc) throw new Error("u_scale/u_offset not found in edge program");
    this.edgeScaleLocation = esLoc;
    this.edgeOffsetLocation = eoLoc;

    const eHeadLoc = gl.getUniformLocation(this.edgeProgram, "u_headLength");
    if (!eHeadLoc) throw new Error("u_headLength not found");
    this.edgeHeadLenLocation = eHeadLoc;

    const eCurveLoc = gl.getUniformLocation(this.edgeProgram, "u_curvature");
    if (!eCurveLoc) throw new Error("u_curvature not found");
    this.edgeCurvatureLocation = eCurveLoc;

    const eVpLoc = gl.getUniformLocation(this.edgeProgram, "u_viewport");
    if (!eVpLoc) throw new Error("u_viewport not found");
    this.edgeViewportLocation = eVpLoc;

    this.edgeVao = this.setupEdgeGeometry(gl);

    // Edge LOD line program (shares fragment shader and instance buffer)
    this.edgeLineProgram = createProgram(gl, edgeLineVertexSource, edgeFragmentSource);
    const elSLoc = gl.getUniformLocation(this.edgeLineProgram, "u_scale");
    const elOLoc = gl.getUniformLocation(this.edgeLineProgram, "u_offset");
    const elVpLoc = gl.getUniformLocation(this.edgeLineProgram, "u_viewport");
    if (!elSLoc || !elOLoc || !elVpLoc) throw new Error("Edge line uniforms not found");
    this.edgeLineScaleLocation = elSLoc;
    this.edgeLineOffsetLocation = elOLoc;
    this.edgeLineViewportLocation = elVpLoc;
    this.edgeLineVao = this.setupEdgeLineGeometry(gl);

    // Set constant edge uniforms once
    gl.useProgram(this.edgeProgram);
    gl.uniform1f(this.edgeHeadLenLocation, 1.5);
    gl.uniform1f(this.edgeCurvatureLocation, CURVATURE);

    // Support legacy raw buffer API
    if (options.edgeBuffer && options.edgeCount && options.edgeCount > 0) {
      this.edgeCount = options.edgeCount;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, options.edgeBuffer, gl.STATIC_DRAW);
    }

    // Support new object edge API
    if (options.edges && options.edges.length > 0) {
      this.setEdgeObjects(options.edges, false);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.067, 0.067, 0.067, 1.0);

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeDirty = true;
      this.cachedRect = null;
      this.requestRender();
    });
    this.resizeObserver.observe(this.canvas);

    this.resize();
    this.initCamera();
    this.setupInteraction();
  }

  private rebuildNodeMap(nodes: Node[]): void {
    this.nodeMap.clear();
    for (const node of nodes) {
      this.nodeMap.set(node.id, node);
    }
  }

  private initCamera(): void {
    const bounds = computeBounds(this.nodes);
    const view = computeFitView(bounds, this.canvas.width, this.canvas.height);
    this.centerX = view.centerX;
    this.centerY = view.centerY;
    this.halfW = view.halfW;
    this.halfH = view.halfH;
  }

  private setupGeometry(gl: WebGL2RenderingContext, nodes: Node[]): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create VAO");
    gl.bindVertexArray(vao);

    // Unit quad: two triangles covering [-1, 1]
    // prettier-ignore
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
       1,  1,
      -1, -1,
       1,  1,
      -1,  1,
    ]);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Single interleaved instance buffer
    // Per node: [x(f32), y(f32), rgba(4×u8), radius(f32)] = 16 bytes
    const NODE_STRIDE = 16;
    const instanceBuf = gl.createBuffer();
    if (!instanceBuf) throw new Error("Failed to create buffer");
    this.nodeInstanceBuffer = instanceBuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);

    // a_position (vec2) at byte offset 0
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, NODE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    // a_color (vec4 normalized u8) at byte offset 8
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, NODE_STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    // a_radius (float) at byte offset 12
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, NODE_STRIDE, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    this.uploadNodeData(gl, nodes);
    return vao;
  }

  private ensureNodeBuffer(count: number): void {
    if (count <= this.nodeBufferCapacity) return;
    let cap = this.nodeBufferCapacity || 64;
    while (cap < count) cap *= 2;
    this.nodeArrayBuf = new ArrayBuffer(cap * 16);
    this.nodeF32 = new Float32Array(this.nodeArrayBuf);
    this.nodeU8 = new Uint8Array(this.nodeArrayBuf);
    this.nodeBufferCapacity = cap;
  }

  private ensureEdgeBuffer(count: number): void {
    if (count <= this.edgeBufferCapacity) return;
    let cap = this.edgeBufferCapacity || 64;
    while (cap < count) cap *= 2;
    this.edgeArrayBuf = new ArrayBuffer(cap * EDGE_STRIDE);
    this.edgeF32 = new Float32Array(this.edgeArrayBuf);
    this.edgeU32 = new Uint32Array(this.edgeArrayBuf);
    this.edgeBufU8 = new Uint8Array(this.edgeArrayBuf);
    this.edgeBufferCapacity = cap;
  }

  private uploadNodeData(gl: WebGL2RenderingContext, nodes: Node[]): void {
    // Sort by zIndex for draw ordering (lower zIndex draws first = behind)
    const sorted = nodes.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    this.ensureNodeBuffer(sorted.length);
    const f32 = this.nodeF32!;
    const u8 = this.nodeU8!;
    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i];
      const fi = i * 4; // float index (16 bytes / 4)
      const bi = i * 16; // byte index
      f32[fi] = node.x;
      f32[fi + 1] = node.y;
      const opacity = node.opacity ?? 1.0;
      u8[bi + 8] = (node.r * 255 + 0.5) | 0;
      u8[bi + 9] = (node.g * 255 + 0.5) | 0;
      u8[bi + 10] = (node.b * 255 + 0.5) | 0;
      u8[bi + 11] = (opacity * 255 + 0.5) | 0;
      f32[fi + 3] = node.radius;
    }
    const byteLen = sorted.length * 16;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(this.nodeArrayBuf!, 0, byteLen), gl.STATIC_DRAW);
  }

  private setupEdgeGeometry(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create edge VAO");
    gl.bindVertexArray(vao);

    // Curved arrow template: segmented shaft (8 segments) + arrowhead triangle
    // Each vertex: (tParam, perpOffset, flag)
    const SHAFT_HW = 0.2;
    const HEAD_HW = 0.7;
    const SEGMENTS = 8;

    // 9 positions × 2 sides = 18 shaft vertices + 3 head vertices = 21 total
    const template = new Float32Array((SEGMENTS + 1) * 2 * 3 + 3 * 3);
    let vi = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      template[vi++] = t;
      template[vi++] = -SHAFT_HW;
      template[vi++] = 0;
      template[vi++] = t;
      template[vi++] = SHAFT_HW;
      template[vi++] = 0;
    }
    // Head vertices (indices 18, 19, 20)
    template[vi++] = 0;
    template[vi++] = -HEAD_HW;
    template[vi++] = 1;
    template[vi++] = 0;
    template[vi++] = 0;
    template[vi++] = 2;
    template[vi++] = 0;
    template[vi++] = HEAD_HW;
    template[vi++] = 1;

    const templateBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, templateBuf);
    gl.bufferData(gl.ARRAY_BUFFER, template, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // Index buffer: 8 shaft quads (16 triangles) + 1 head triangle = 51 indices
    const headBase = (SEGMENTS + 1) * 2;
    const indices = new Uint8Array(SEGMENTS * 6 + 3);
    let ii = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      const b = i * 2;
      indices[ii++] = b;
      indices[ii++] = b + 2;
      indices[ii++] = b + 3;
      indices[ii++] = b;
      indices[ii++] = b + 3;
      indices[ii++] = b + 1;
    }
    indices[ii++] = headBase; // head bottom
    indices[ii++] = headBase + 1; // head tip
    indices[ii++] = headBase + 2; // head top
    const indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Single interleaved instance buffer
    // Per edge: [srcXY(2×f32), tgtXY(2×f32), srcRadius(f32), tgtRadius(f32), RGBA(4×u8), width(f32)] = 32 bytes
    const buf = gl.createBuffer();
    if (!buf) throw new Error("Failed to create buffer");
    this.edgeInstanceBuffer = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);

    // a_source (vec2) at byte offset 0
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, EDGE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    // a_target (vec2) at byte offset 8
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, EDGE_STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    // a_color (vec4 normalized u8) at byte offset 24
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, EDGE_STRIDE, 24);
    gl.vertexAttribDivisor(3, 1);

    // a_radii (vec2: srcRadius, tgtRadius) at byte offset 16
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, EDGE_STRIDE, 16);
    gl.vertexAttribDivisor(4, 1);

    // a_width (float) at byte offset 28
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, EDGE_STRIDE, 28);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
    return vao;
  }

  private setupEdgeLineGeometry(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create edge line VAO");
    gl.bindVertexArray(vao);

    // Template: two endpoint values [0.0 = source, 1.0 = target]
    const template = new Float32Array([0.0, 1.0]);
    const templateBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, templateBuf);
    gl.bufferData(gl.ARRAY_BUFFER, template, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

    // Reuse existing edge instance buffer (32-byte stride layout)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, EDGE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, EDGE_STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, EDGE_STRIDE, 24);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
    return vao;
  }

  /** Pack Edge objects into a GPU buffer, resolving positions from nodeMap. Sorted by zIndex. */
  private packEdgeBuffer(edges: Edge[]): { buffer: Uint8Array; count: number; groupSizes: number[] } {
    const sorted = edges.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    this.ensureEdgeBuffer(sorted.length);
    const f32 = this.edgeF32!;
    const u32 = this.edgeU32!;
    let count = 0;
    const groupSizes: number[] = [];
    let currentZ = -Infinity;
    let groupSize = 0;

    for (let i = 0; i < sorted.length; i++) {
      const edge = sorted[i];
      const src = this.nodeMap.get(edge.source);
      const tgt = this.nodeMap.get(edge.target);
      if (!src || !tgt) continue;

      const z = edge.zIndex ?? 0;
      if (z !== currentZ) {
        if (groupSize > 0) groupSizes.push(groupSize);
        currentZ = z;
        groupSize = 0;
      }

      const slot = count * 8; // 32 bytes / 4 = 8 uint32-slots per edge
      f32[slot] = src.x;
      f32[slot + 1] = src.y;
      f32[slot + 2] = tgt.x;
      f32[slot + 3] = tgt.y;
      f32[slot + 4] = src.radius;
      f32[slot + 5] = tgt.radius;
      u32[slot + 6] = packPremultiplied(edge.r, edge.g, edge.b, edge.a);
      f32[slot + 7] = edge.width ?? 1.0;
      groupSize++;
      count++;
    }
    if (groupSize > 0) groupSizes.push(groupSize);

    return { buffer: this.edgeBufU8!.subarray(0, count * EDGE_STRIDE), count, groupSizes };
  }

  private setEdgeObjects(edges: Edge[], animate: boolean): void {
    if (animate && this.dataAnimDuration > 0 && this.edgeObjects.length > 0) {
      this.oldEdges = this.edgeObjects;
      this.oldEdgeMap.clear();
      for (const e of this.oldEdges) this.oldEdgeMap.set(e.id, e);
      this.targetEdges = edges;
    }

    this.edgeObjects = edges;
    this.edgeMap.clear();
    for (const e of edges) this.edgeMap.set(e.id, e);

    const { buffer, count, groupSizes } = this.packEdgeBuffer(edges);
    this.edgeCount = count;
    if (count > 0) {
      const shuffled = shuffleEdgeBuffer(buffer, count, groupSizes);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, shuffled, gl.STATIC_DRAW);
    }
  }

  /** Set edges using Edge object array. Renderer resolves node positions. */
  setEdges(edges: Edge[]): void;
  /** Set edges using raw binary buffer (legacy API). */
  setEdges(buffer: ArrayBufferView, count: number): void;
  setEdges(edgesOrBuffer: Edge[] | ArrayBufferView, count?: number): void {
    if (Array.isArray(edgesOrBuffer)) {
      const shouldAnimate = this.dataAnimDuration > 0 && this.edgeObjects.length > 0;
      this.setEdgeObjects(edgesOrBuffer, shouldAnimate);
      if (shouldAnimate) {
        this.startDataAnimation();
      }
      this.requestRender();
      return;
    }

    // Legacy raw buffer path
    const buffer = edgesOrBuffer;
    const edgeCount = count!;
    this.edgeCount = edgeCount;
    this.edgeObjects = [];
    this.edgeMap.clear();
    if (edgeCount > 0) {
      const gl = this.gl;
      const src = new Uint8Array(buffer.buffer, buffer.byteOffset, edgeCount * EDGE_STRIDE);
      const shuffled = shuffleEdgeBuffer(src, edgeCount);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, shuffled, gl.STATIC_DRAW);
    }
    this.requestRender();
  }

  /** Set the curvature amount for edges (0 = straight, 0.2 = default curve). */
  setCurvature(amount: number): void {
    const gl = this.gl;
    gl.useProgram(this.edgeProgram);
    gl.uniform1f(this.edgeCurvatureLocation, amount);
    this.requestRender();
  }

  setNodes(nodes: Node[]): void {
    const shouldAnimate = this.dataAnimDuration > 0 && this.nodes.length > 0;

    if (shouldAnimate) {
      this.oldNodes = this.nodes;
      this.oldNodeMap.clear();
      for (const n of this.oldNodes) this.oldNodeMap.set(n.id, n);
      this.targetNodes = nodes;

      // Snapshot edge state for animation too
      if (this.edgeObjects.length > 0) {
        this.oldEdges = this.edgeObjects;
        this.oldEdgeMap.clear();
        for (const e of this.oldEdges) this.oldEdgeMap.set(e.id, e);
        this.targetEdges = this.edgeObjects;
      }
    }

    this.nodes = nodes;
    this.nodeCount = nodes.length;
    this.rebuildNodeMap(nodes);
    this.uploadNodeData(this.gl, nodes);

    // Re-pack edges if we have object edges (positions changed)
    if (this.edgeObjects.length > 0) {
      const { buffer, count, groupSizes } = this.packEdgeBuffer(this.edgeObjects);
      this.edgeCount = count;
      if (count > 0) {
        const shuffled = shuffleEdgeBuffer(buffer, count, groupSizes);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, shuffled, this.gl.STATIC_DRAW);
      }
    }

    this.initCamera();

    if (shouldAnimate) {
      this.startDataAnimation();
    }

    this.requestRender();
  }

  // --- Data animation ---

  private startDataAnimation(): void {
    if (this.dataAnimId !== null) {
      cancelAnimationFrame(this.dataAnimId);
    }
    this.dataAnimStart = performance.now();

    // Sort targets once at animation start (zIndex order doesn't change mid-animation)
    const rawNodes = this.targetNodes.length > 0 ? this.targetNodes : this.nodes;
    this.sortedTargetNodes = rawNodes.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const rawEdges = this.targetEdges.length > 0 ? this.targetEdges : this.edgeObjects;
    this.sortedTargetEdges = rawEdges.length > 0
      ? rawEdges.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      : null;

    const animate = (now: number): void => {
      const elapsed = now - this.dataAnimStart;
      const rawT = Math.min(elapsed / this.dataAnimDuration, 1);
      const t = this.dataAnimEasing(rawT);

      this.interpolateNodes(t);
      this.interpolateEdges(t);
      this.render();

      if (rawT < 1) {
        this.dataAnimId = requestAnimationFrame(animate);
      } else {
        this.dataAnimId = null;
        // Final state: upload actual target data (no interpolation artifacts)
        this.uploadNodeData(this.gl, this.nodes);
        if (this.edgeObjects.length > 0) {
          const { buffer, count, groupSizes } = this.packEdgeBuffer(this.edgeObjects);
          this.edgeCount = count;
          if (count > 0) {
            const shuffled = shuffleEdgeBuffer(buffer, count, groupSizes);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, shuffled, this.gl.STATIC_DRAW);
          }
        }
        this.oldNodes = [];
        this.oldNodeMap.clear();
        this.targetNodes = [];
        this.oldEdges = [];
        this.oldEdgeMap.clear();
        this.targetEdges = [];
        this.sortedTargetNodes = null;
        this.sortedTargetEdges = null;
      }
    };

    this.dataAnimId = requestAnimationFrame(animate);
  }

  private interpolateNodes(t: number): void {
    const target = this.sortedTargetNodes!;
    this.ensureNodeBuffer(target.length);
    const f32 = this.nodeF32!;
    const u8 = this.nodeU8!;

    for (let i = 0; i < target.length; i++) {
      const node = target[i];
      const old = this.oldNodeMap.get(node.id);
      const fi = i * 4;
      const bi = i * 16;

      if (old) {
        f32[fi] = lerp(old.x, node.x, t);
        f32[fi + 1] = lerp(old.y, node.y, t);
        const oldOpacity = old.opacity ?? 1.0;
        const newOpacity = node.opacity ?? 1.0;
        const opacity = lerp(oldOpacity, newOpacity, t);
        const oldR = lerp(old.r, node.r, t);
        const oldG = lerp(old.g, node.g, t);
        const oldB = lerp(old.b, node.b, t);
        u8[bi + 8] = (oldR * 255 + 0.5) | 0;
        u8[bi + 9] = (oldG * 255 + 0.5) | 0;
        u8[bi + 10] = (oldB * 255 + 0.5) | 0;
        u8[bi + 11] = (opacity * 255 + 0.5) | 0;
        f32[fi + 3] = lerp(old.radius, node.radius, t);
      } else {
        // New node — fade in
        f32[fi] = node.x;
        f32[fi + 1] = node.y;
        const opacity = (node.opacity ?? 1.0) * t;
        u8[bi + 8] = (node.r * 255 + 0.5) | 0;
        u8[bi + 9] = (node.g * 255 + 0.5) | 0;
        u8[bi + 10] = (node.b * 255 + 0.5) | 0;
        u8[bi + 11] = (opacity * 255 + 0.5) | 0;
        f32[fi + 3] = node.radius;
      }
    }

    const byteLen = target.length * 16;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(this.nodeArrayBuf!, 0, byteLen), gl.STATIC_DRAW);
    this.nodeCount = target.length;
  }

  private interpolateEdges(t: number): void {
    if (!this.sortedTargetEdges) return;
    const target = this.sortedTargetEdges;

    // Build interpolated node positions for resolving edge endpoints
    const targetNodes = this.targetNodes.length > 0 ? this.targetNodes : this.nodes;
    const interpNodeMap = new Map<string, { x: number; y: number; radius: number }>();
    for (const node of targetNodes) {
      const old = this.oldNodeMap.get(node.id);
      if (old) {
        interpNodeMap.set(node.id, {
          x: lerp(old.x, node.x, t),
          y: lerp(old.y, node.y, t),
          radius: lerp(old.radius, node.radius, t),
        });
      } else {
        interpNodeMap.set(node.id, { x: node.x, y: node.y, radius: node.radius });
      }
    }

    this.ensureEdgeBuffer(target.length);
    const f32 = this.edgeF32!;
    const u32 = this.edgeU32!;
    let count = 0;

    for (let i = 0; i < target.length; i++) {
      const edge = target[i];
      const src = interpNodeMap.get(edge.source);
      const tgt = interpNodeMap.get(edge.target);
      if (!src || !tgt) continue;

      const old = this.oldEdgeMap.get(edge.id);
      const slot = count * 8;
      f32[slot] = src.x;
      f32[slot + 1] = src.y;
      f32[slot + 2] = tgt.x;
      f32[slot + 3] = tgt.y;
      f32[slot + 4] = src.radius;
      f32[slot + 5] = tgt.radius;

      if (old) {
        const a = lerp(old.a, edge.a, t);
        const r = lerp(old.r, edge.r, t);
        const g = lerp(old.g, edge.g, t);
        const b = lerp(old.b, edge.b, t);
        const w = lerp(old.width ?? 1.0, edge.width ?? 1.0, t);
        u32[slot + 6] = packPremultiplied(r, g, b, a);
        f32[slot + 7] = w;
      } else {
        // New edge — fade in
        u32[slot + 6] = packPremultiplied(edge.r, edge.g, edge.b, edge.a * t);
        f32[slot + 7] = edge.width ?? 1.0;
      }
      count++;
    }

    this.edgeCount = count;
    if (count > 0) {
      // Skip shuffle during animation frames for performance
      const byteLen = count * EDGE_STRIDE;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.edgeBufU8!.subarray(0, byteLen), gl.DYNAMIC_DRAW);
    }
  }

  // --- Hit testing ---

  private hitTestNode(worldX: number, worldY: number): Node | null {
    let closest: Node | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distSq = dx * dx + dy * dy;
      const rSq = node.radius * node.radius;
      if (distSq < rSq && distSq < closestDist) {
        closestDist = distSq;
        closest = node;
      }
    }

    return closest;
  }

  private hitTestEdge(worldX: number, worldY: number): Edge | null {
    // Tolerance: ~5px in world coords
    const rect = this.getRect();
    const worldPerPx = (this.halfW * 2) / rect.width;
    const tolerance = worldPerPx * 5;
    const tolSq = tolerance * tolerance;

    let closest: Edge | null = null;
    let closestDistSq = tolSq;

    for (let i = 0; i < this.edgeObjects.length; i++) {
      const edge = this.edgeObjects[i];
      const src = this.nodeMap.get(edge.source);
      const tgt = this.nodeMap.get(edge.target);
      if (!src || !tgt) continue;

      // Quick bounding box check
      const minX = Math.min(src.x, tgt.x) - tolerance;
      const maxX = Math.max(src.x, tgt.x) + tolerance;
      const minY = Math.min(src.y, tgt.y) - tolerance;
      const maxY = Math.max(src.y, tgt.y) + tolerance;
      if (worldX < minX || worldX > maxX || worldY < minY || worldY > maxY) continue;

      // Sample Bezier at 16 points
      for (let s = 0; s <= 16; s++) {
        const t = s / 16;
        const pt = sampleBezier(src.x, src.y, tgt.x, tgt.y, CURVATURE, t);
        const dx = worldX - pt.x;
        const dy = worldY - pt.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closest = edge;
        }
      }
    }

    return closest;
  }

  // --- Event system ---

  private setupInteraction(): void {
    const signal = this.abortController.signal;
    const canvas = this.canvas;
    canvas.style.cursor = "grab";

    // Wheel zoom
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
        this.zoomAt(e.clientX, e.clientY, factor);
      },
      { signal, passive: false },
    );

    // Mouse drag + click detection
    canvas.addEventListener(
      "mousedown",
      (e) => {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        canvas.style.cursor = "grabbing";
      },
      { signal },
    );

    window.addEventListener(
      "mousemove",
      (e) => {
        if (!this.isDragging) {
          this.updateHover(e);
          return;
        }
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.pan(dx, dy);
      },
      { signal },
    );

    window.addEventListener(
      "mouseup",
      (e) => {
        if (this.isDragging) {
          const dx = e.clientX - this.dragStartX;
          const dy = e.clientY - this.dragStartY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CLICK_THRESHOLD) {
            this.handleClick(e);
          }
          this.isDragging = false;
          canvas.style.cursor = "grab";
        }
      },
      { signal },
    );

    canvas.addEventListener(
      "dblclick",
      (e) => {
        this.handleDblClick(e);
      },
      { signal },
    );

    // Touch
    canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.storeTouches(e.touches);
      },
      { signal, passive: false },
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        if (this.touchCount === 0) return;

        const touches = e.touches;
        const prevCount = this.touchCount;

        if (touches.length === 1 && prevCount === 1) {
          // Single finger pan
          const dx = touches[0].clientX - this.touch0X;
          const dy = touches[0].clientY - this.touch0Y;
          this.pan(dx, dy);
        } else if (touches.length >= 2 && prevCount >= 2) {
          // Pinch zoom + pan
          const odx = this.touch0X - this.touch1X;
          const ody = this.touch0Y - this.touch1Y;
          const oldDist = Math.sqrt(odx * odx + ody * ody);
          const ndx = touches[0].clientX - touches[1].clientX;
          const ndy = touches[0].clientY - touches[1].clientY;
          const newDist = Math.sqrt(ndx * ndx + ndy * ndy);
          const factor = oldDist / newDist;
          const midX = (touches[0].clientX + touches[1].clientX) / 2;
          const midY = (touches[0].clientY + touches[1].clientY) / 2;
          this.zoomAt(midX, midY, factor);
        }

        this.storeTouches(touches);
      },
      { signal, passive: false },
    );

    canvas.addEventListener(
      "touchend",
      (e) => {
        this.storeTouches(e.touches);
      },
      { signal },
    );
  }

  private handleClick(e: MouseEvent): void {
    const world = this.screenToWorld(e.clientX, e.clientY);
    const worldX = world.x;
    const worldY = world.y;

    const node = this.hitTestNode(worldX, worldY);
    if (node && this.onNodeClick) {
      this.onNodeClick({ type: "click", nodeId: node.id, node, worldX, worldY, originalEvent: e });
      return;
    }

    const edge = this.hitTestEdge(worldX, worldY);
    if (edge && this.onEdgeClick) {
      this.onEdgeClick({ type: "click", edgeId: edge.id, edge, worldX, worldY, originalEvent: e });
      return;
    }

    if (this.onBackgroundClick) {
      this.onBackgroundClick({ type: "click", worldX, worldY, originalEvent: e });
    }
  }

  private handleDblClick(e: MouseEvent): void {
    const world = this.screenToWorld(e.clientX, e.clientY);
    const worldX = world.x;
    const worldY = world.y;

    const node = this.hitTestNode(worldX, worldY);
    if (node && this.onNodeDblClick) {
      this.onNodeDblClick({
        type: "dblclick",
        nodeId: node.id,
        node,
        worldX,
        worldY,
        originalEvent: e,
      });
      return;
    }

    const edge = this.hitTestEdge(worldX, worldY);
    if (edge && this.onEdgeDblClick) {
      this.onEdgeDblClick({
        type: "dblclick",
        edgeId: edge.id,
        edge,
        worldX,
        worldY,
        originalEvent: e,
      });
      return;
    }

    if (this.onBackgroundDblClick) {
      this.onBackgroundDblClick({ type: "dblclick", worldX, worldY, originalEvent: e });
    }
  }

  private updateHover(e: MouseEvent): void {
    // Only process hover when we have callbacks
    if (
      !this.onNodeHoverEnter &&
      !this.onNodeHoverLeave &&
      !this.onEdgeHoverEnter &&
      !this.onEdgeHoverLeave
    )
      return;

    const world = this.screenToWorld(e.clientX, e.clientY);
    const worldX = world.x;
    const worldY = world.y;

    const node = this.hitTestNode(worldX, worldY);
    const nodeId = node ? node.id : null;

    if (nodeId !== this.hoveredNodeId) {
      if (this.hoveredNodeId && this.onNodeHoverLeave) {
        const oldNode = this.nodeMap.get(this.hoveredNodeId);
        if (oldNode) {
          this.onNodeHoverLeave({
            type: "hoverleave",
            nodeId: this.hoveredNodeId,
            node: oldNode,
            worldX,
            worldY,
            originalEvent: e,
          });
        }
      }
      if (nodeId && node && this.onNodeHoverEnter) {
        this.onNodeHoverEnter({
          type: "hoverenter",
          nodeId,
          node,
          worldX,
          worldY,
          originalEvent: e,
        });
      }
      this.hoveredNodeId = nodeId;
    }

    // Only check edge hover if not hovering a node
    if (!nodeId) {
      const edge = this.hitTestEdge(worldX, worldY);
      const edgeId = edge ? edge.id : null;

      if (edgeId !== this.hoveredEdgeId) {
        if (this.hoveredEdgeId && this.onEdgeHoverLeave) {
          const oldEdge = this.edgeMap.get(this.hoveredEdgeId);
          if (oldEdge) {
            this.onEdgeHoverLeave({
              type: "hoverleave",
              edgeId: this.hoveredEdgeId,
              edge: oldEdge,
              worldX,
              worldY,
              originalEvent: e,
            });
          }
        }
        if (edgeId && edge && this.onEdgeHoverEnter) {
          this.onEdgeHoverEnter({
            type: "hoverenter",
            edgeId,
            edge,
            worldX,
            worldY,
            originalEvent: e,
          });
        }
        this.hoveredEdgeId = edgeId;
      }

      this.canvas.style.cursor = edgeId ? "pointer" : "grab";
    } else {
      // Hovering a node — clear any edge hover
      if (this.hoveredEdgeId) {
        if (this.onEdgeHoverLeave) {
          const oldEdge = this.edgeMap.get(this.hoveredEdgeId);
          if (oldEdge) {
            this.onEdgeHoverLeave({
              type: "hoverleave",
              edgeId: this.hoveredEdgeId,
              edge: oldEdge,
              worldX,
              worldY,
              originalEvent: e,
            });
          }
        }
        this.hoveredEdgeId = null;
      }
      this.canvas.style.cursor = "pointer";
    }
  }

  private storeTouches(touches: TouchList): void {
    this.touchCount = touches.length;
    if (touches.length >= 1) {
      this.touch0X = touches[0].clientX;
      this.touch0Y = touches[0].clientY;
    }
    if (touches.length >= 2) {
      this.touch1X = touches[1].clientX;
      this.touch1Y = touches[1].clientY;
    }
  }

  private getRect(): DOMRect {
    if (!this.cachedRect) {
      this.cachedRect = this.canvas.getBoundingClientRect();
    }
    return this.cachedRect;
  }

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.getRect();
    const nx = (screenX - rect.left) / rect.width;
    const ny = (screenY - rect.top) / rect.height;
    this.worldResult.x = this.centerX + (nx - 0.5) * 2 * this.halfW;
    this.worldResult.y = this.centerY - (ny - 0.5) * 2 * this.halfH;
    return this.worldResult;
  }

  private cancelAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private requestRender(): void {
    if (!this.renderPending && this.dataAnimId === null) {
      this.renderPending = true;
      requestAnimationFrame(() => {
        this.renderPending = false;
        this.render();
      });
    }
  }

  private zoomAt(screenX: number, screenY: number, factor: number): void {
    this.cancelAnimation();
    const world = this.screenToWorld(screenX, screenY);
    this.centerX = world.x + (this.centerX - world.x) * factor;
    this.centerY = world.y + (this.centerY - world.y) * factor;
    this.halfW *= factor;
    this.halfH *= factor;
    this.requestRender();
  }

  private pan(screenDx: number, screenDy: number): void {
    this.cancelAnimation();
    const rect = this.getRect();
    this.centerX -= (screenDx / rect.width) * 2 * this.halfW;
    this.centerY += (screenDy / rect.height) * 2 * this.halfH;
    this.requestRender();
  }

  fitToNodes(duration = 300): void {
    this.resize();
    const bounds = computeBounds(this.nodes);
    const view = computeFitView(bounds, this.canvas.width, this.canvas.height);

    if (duration <= 0) {
      this.centerX = view.centerX;
      this.centerY = view.centerY;
      this.halfW = view.halfW;
      this.halfH = view.halfH;
      this.render();
      return;
    }

    this.animFrom.centerX = this.centerX;
    this.animFrom.centerY = this.centerY;
    this.animFrom.halfW = this.halfW;
    this.animFrom.halfH = this.halfH;
    this.animTo.centerX = view.centerX;
    this.animTo.centerY = view.centerY;
    this.animTo.halfW = view.halfW;
    this.animTo.halfH = view.halfH;
    this.animDuration = duration;
    this.animStartTime = performance.now();

    this.cancelAnimation();

    const animate = (now: number): void => {
      const elapsed = now - this.animStartTime;
      const t = Math.min(elapsed / this.animDuration, 1);
      const e = easeInOutCubic(t);

      this.centerX = lerp(this.animFrom.centerX, this.animTo.centerX, e);
      this.centerY = lerp(this.animFrom.centerY, this.animTo.centerY, e);
      this.halfW = lerp(this.animFrom.halfW, this.animTo.halfW, e);
      this.halfH = lerp(this.animFrom.halfH, this.animTo.halfH, e);

      this.render();

      if (t < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.animationId = null;
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  resize(): void {
    if (!this.resizeDirty) return;
    this.resizeDirty = false;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.round(this.canvas.clientWidth * dpr);
    const displayHeight = Math.round(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      const newAspect = displayWidth / displayHeight;
      this.halfW = this.halfH * newAspect;
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
    }
  }

  private updateProjection(): void {
    this.projScaleX = 1 / this.halfW;
    this.projScaleY = 1 / this.halfH;
    this.projOffsetX = -this.centerX / this.halfW;
    this.projOffsetY = -this.centerY / this.halfH;
    this.vpMinX = this.centerX - this.halfW;
    this.vpMinY = this.centerY - this.halfH;
    this.vpMaxX = this.centerX + this.halfW;
    this.vpMaxY = this.centerY + this.halfH;
  }

  render(): void {
    const gl = this.gl;

    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.updateProjection();
    const projScaleX = this.projScaleX;
    const projScaleY = this.projScaleY;
    const projOffsetX = this.projOffsetX;
    const projOffsetY = this.projOffsetY;

    // Draw nodes (behind edges)
    gl.useProgram(this.program);
    if (
      projScaleX !== this.sentNodeScaleX ||
      projScaleY !== this.sentNodeScaleY ||
      projOffsetX !== this.sentNodeOffsetX ||
      projOffsetY !== this.sentNodeOffsetY
    ) {
      gl.uniform2f(this.scaleLocation, projScaleX, projScaleY);
      gl.uniform2f(this.offsetLocation, projOffsetX, projOffsetY);
      this.sentNodeScaleX = projScaleX;
      this.sentNodeScaleY = projScaleY;
      this.sentNodeOffsetX = projOffsetX;
      this.sentNodeOffsetY = projOffsetY;
    }
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.nodeCount);

    // Draw edges on top of nodes (LOD: lines when zoomed out, arrows when close)
    // Cap instance count to limit fragment overdraw on high-DPI displays.
    // The edge buffer is shuffled at upload time so any prefix has uniform spatial coverage.
    const MAX_DRAW_EDGES = 65536;
    const drawEdges = Math.min(this.edgeCount, MAX_DRAW_EDGES);
    if (drawEdges > 0) {
      const vpMinX = this.vpMinX;
      const vpMinY = this.vpMinY;
      const vpMaxX = this.vpMaxX;
      const vpMaxY = this.vpMaxY;
      // LOD: when node radius (2 world units) < 3px, arrow detail is sub-pixel → use lines
      if (Math.abs(projScaleX) * this.canvas.width < 3.0) {
        gl.useProgram(this.edgeLineProgram);
        if (
          projScaleX !== this.sentLineScaleX ||
          projScaleY !== this.sentLineScaleY ||
          projOffsetX !== this.sentLineOffsetX ||
          projOffsetY !== this.sentLineOffsetY
        ) {
          gl.uniform2f(this.edgeLineScaleLocation, projScaleX, projScaleY);
          gl.uniform2f(this.edgeLineOffsetLocation, projOffsetX, projOffsetY);
          this.sentLineScaleX = projScaleX;
          this.sentLineScaleY = projScaleY;
          this.sentLineOffsetX = projOffsetX;
          this.sentLineOffsetY = projOffsetY;
        }
        if (
          vpMinX !== this.sentLineVpMinX ||
          vpMinY !== this.sentLineVpMinY ||
          vpMaxX !== this.sentLineVpMaxX ||
          vpMaxY !== this.sentLineVpMaxY
        ) {
          gl.uniform4f(this.edgeLineViewportLocation, vpMinX, vpMinY, vpMaxX, vpMaxY);
          this.sentLineVpMinX = vpMinX;
          this.sentLineVpMinY = vpMinY;
          this.sentLineVpMaxX = vpMaxX;
          this.sentLineVpMaxY = vpMaxY;
        }
        gl.bindVertexArray(this.edgeLineVao);
        gl.drawArraysInstanced(gl.LINES, 0, 2, drawEdges);
      } else {
        gl.useProgram(this.edgeProgram);
        if (
          projScaleX !== this.sentEdgeScaleX ||
          projScaleY !== this.sentEdgeScaleY ||
          projOffsetX !== this.sentEdgeOffsetX ||
          projOffsetY !== this.sentEdgeOffsetY
        ) {
          gl.uniform2f(this.edgeScaleLocation, projScaleX, projScaleY);
          gl.uniform2f(this.edgeOffsetLocation, projOffsetX, projOffsetY);
          this.sentEdgeScaleX = projScaleX;
          this.sentEdgeScaleY = projScaleY;
          this.sentEdgeOffsetX = projOffsetX;
          this.sentEdgeOffsetY = projOffsetY;
        }
        if (
          vpMinX !== this.sentEdgeVpMinX ||
          vpMinY !== this.sentEdgeVpMinY ||
          vpMaxX !== this.sentEdgeVpMaxX ||
          vpMaxY !== this.sentEdgeVpMaxY
        ) {
          gl.uniform4f(this.edgeViewportLocation, vpMinX, vpMinY, vpMaxX, vpMaxY);
          this.sentEdgeVpMinX = vpMinX;
          this.sentEdgeVpMinY = vpMinY;
          this.sentEdgeVpMaxX = vpMaxX;
          this.sentEdgeVpMaxY = vpMaxY;
        }
        gl.bindVertexArray(this.edgeVao);
        gl.drawElementsInstanced(gl.TRIANGLES, 51, gl.UNSIGNED_BYTE, 0, drawEdges);
      }
    }
  }

  destroy(): void {
    this.abortController.abort();
    this.cancelAnimation();
    if (this.dataAnimId !== null) {
      cancelAnimationFrame(this.dataAnimId);
      this.dataAnimId = null;
    }
    this.resizeObserver.disconnect();
  }
}

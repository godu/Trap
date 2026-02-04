import type {
  Node,
  Edge,
  RendererOptions,
  NodeEvent,
  EdgeEvent,
  BackgroundEvent,
} from "./types";
import {
  vertexSource,
  fragmentSource,
  edgeVertexSource,
  edgeFragmentSource,
} from "./shaders";
import { computeBounds, computeFitView } from "./camera";
import { buildIconAtlas } from "./atlas";

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
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

/**
 * Minimum squared distance from point (px,py) to quadratic Bezier P0→P1→P2.
 * Solves the cubic D'(t)=0 analytically instead of sampling.
 */
const _roots = new Float64Array(5);
export function distSqToBezier(
  px: number,
  py: number,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): number {
  // B(t) = At² + Bt + P0, where A = P0-2P1+P2, B = 2(P1-P0)
  const ax = p0x - 2 * p1x + p2x;
  const ay = p0y - 2 * p1y + p2y;
  const bx = 2 * (p1x - p0x);
  const by = 2 * (p1y - p0y);
  const cx = p0x - px;
  const cy = p0y - py;

  // D'(t) = 2(2At+B)·(At²+Bt+C) = 0 → c3t³ + c2t² + c1t + c0 = 0
  const c3 = 2 * (ax * ax + ay * ay);
  const c2 = 3 * (ax * bx + ay * by);
  const c1 = 2 * (ax * cx + ay * cy) + bx * bx + by * by;
  const c0 = bx * cx + by * cy;

  let n = 0;
  _roots[n++] = 0;
  _roots[n++] = 1;

  if (Math.abs(c3) < 1e-10) {
    if (Math.abs(c2) > 1e-10) {
      const disc = c1 * c1 - 4 * c2 * c0;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-c1 + sq) / (2 * c2);
        const t2 = (-c1 - sq) / (2 * c2);
        if (t1 > 0 && t1 < 1) _roots[n++] = t1;
        if (t2 > 0 && t2 < 1) _roots[n++] = t2;
      }
    } else if (Math.abs(c1) > 1e-10) {
      const t = -c0 / c1;
      if (t > 0 && t < 1) _roots[n++] = t;
    }
  } else {
    const p = c2 / c3;
    const q = c1 / c3;
    const r = c0 / c3;
    const p3 = p / 3;
    const alpha = q - (p * p) / 3;
    const beta = (2 * p * p * p) / 27 - (p * q) / 3 + r;
    const D = (beta * beta) / 4 + (alpha * alpha * alpha) / 27;

    if (D > 1e-10) {
      const sq = Math.sqrt(D);
      const t = Math.cbrt(-beta / 2 + sq) + Math.cbrt(-beta / 2 - sq) - p3;
      if (t > 0 && t < 1) _roots[n++] = t;
    } else if (D < -1e-10) {
      const rMag = Math.sqrt(-(alpha * alpha * alpha) / 27);
      const theta = Math.acos(Math.max(-1, Math.min(1, -beta / (2 * rMag))));
      const cbrtR = Math.cbrt(rMag);
      const t1 = 2 * cbrtR * Math.cos(theta / 3) - p3;
      const t2 = 2 * cbrtR * Math.cos((theta + 2 * Math.PI) / 3) - p3;
      const t3 = 2 * cbrtR * Math.cos((theta + 4 * Math.PI) / 3) - p3;
      if (t1 > 0 && t1 < 1) _roots[n++] = t1;
      if (t2 > 0 && t2 < 1) _roots[n++] = t2;
      if (t3 > 0 && t3 < 1) _roots[n++] = t3;
    } else {
      if (Math.abs(beta) < 1e-10) {
        const t = -p3;
        if (t > 0 && t < 1) _roots[n++] = t;
      } else {
        const u = Math.cbrt(-beta / 2);
        const t1 = 2 * u - p3;
        const t2 = -u - p3;
        if (t1 > 0 && t1 < 1) _roots[n++] = t1;
        if (t2 > 0 && t2 < 1) _roots[n++] = t2;
      }
    }
  }

  let min = Infinity;
  for (let i = 0; i < n; i++) {
    const t = _roots[i];
    const dx = ax * t * t + bx * t + cx;
    const dy = ay * t * t + by * t + cy;
    const dSq = dx * dx + dy * dy;
    if (dSq < min) min = dSq;
  }
  return min;
}

// Reusable result object for sampleBezier (avoids allocation per call)
const bezierResult = { x: 0, y: 0 };

/**
 * Evaluate quadratic Bezier at parameter t.
 * NOTE: Returns a shared object that is reused across calls — do not hold a
 * reference across multiple invocations.
 */
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
  if (len < 0.0001) {
    bezierResult.x = srcX;
    bezierResult.y = srcY;
    return bezierResult;
  }
  const fwdX = dx / len;
  const fwdY = dy / len;
  const rightX = -fwdY;
  const rightY = fwdX;
  const curveDist = len * curvature;
  const ctrlX = (srcX + tgtX) * 0.5 + rightX * curveDist;
  const ctrlY = (srcY + tgtY) * 0.5 + rightY * curveDist;
  const omt = 1 - t;
  bezierResult.x = omt * omt * srcX + 2 * t * omt * ctrlX + t * t * tgtX;
  bezierResult.y = omt * omt * srcY + 2 * t * omt * ctrlY + t * t * tgtY;
  return bezierResult;
}

// Pre-allocated shuffle buffers (grow-on-demand, reused across calls)
let shuffleIndices = new Uint32Array(64);
let shuffleOutput = new Uint8Array(64 * EDGE_STRIDE);

function ensureShuffleBuffers(count: number): void {
  if (shuffleIndices.length < count) {
    let cap = shuffleIndices.length;
    while (cap < count) cap *= 2;
    shuffleIndices = new Uint32Array(cap);
    shuffleOutput = new Uint8Array(cap * EDGE_STRIDE);
  }
}

/** Fisher-Yates shuffle of edge buffer within zIndex groups (EDGE_STRIDE bytes per record). */
function shuffleEdgeBuffer(
  buf: Uint8Array,
  count: number,
  groupSizes?: number[],
): Uint8Array {
  ensureShuffleBuffers(count);

  if (!groupSizes || groupSizes.length <= 1) {
    for (let i = 0; i < count; i++) shuffleIndices[i] = i;
    for (let i = count - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = shuffleIndices[i];
      shuffleIndices[i] = shuffleIndices[j];
      shuffleIndices[j] = tmp;
    }
    for (let i = 0; i < count; i++) {
      const srcOff = shuffleIndices[i] * EDGE_STRIDE;
      shuffleOutput.set(
        buf.subarray(srcOff, srcOff + EDGE_STRIDE),
        i * EDGE_STRIDE,
      );
    }
    return shuffleOutput.subarray(0, count * EDGE_STRIDE);
  }

  // Shuffle within each zIndex group independently
  let offset = 0;
  for (const size of groupSizes) {
    for (let i = 0; i < size; i++) shuffleIndices[i] = offset + i;
    for (let i = size - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = shuffleIndices[i];
      shuffleIndices[i] = shuffleIndices[j];
      shuffleIndices[j] = tmp;
    }
    for (let i = 0; i < size; i++) {
      const srcOff = shuffleIndices[i] * EDGE_STRIDE;
      shuffleOutput.set(
        buf.subarray(srcOff, srcOff + EDGE_STRIDE),
        (offset + i) * EDGE_STRIDE,
      );
    }
    offset += size;
  }
  return shuffleOutput.subarray(0, count * EDGE_STRIDE);
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private nodeCount: number;
  private scaleLocation: WebGLUniformLocation;
  private offsetLocation: WebGLUniformLocation;
  private nodeMinRadiusLocation: WebGLUniformLocation;
  private nodeMaxRadiusLocation: WebGLUniformLocation;
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
  private edgeMinRadiusLocation: WebGLUniformLocation;
  private edgeMaxRadiusLocation: WebGLUniformLocation;
  private edgeInstanceBuffer!: WebGLBuffer;

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
  // Radius clamping
  private minScreenRadius: number;
  private maxScreenRadius: number;
  private sentMinRadius = NaN;
  private sentMaxRadius = NaN;
  private sentEdgeMinRadius = NaN;
  private sentEdgeMaxRadius = NaN;

  // Icon atlas state
  private iconAtlasTexture: WebGLTexture | null = null;
  private iconAtlasColumns = 0;
  private iconAtlasRows = 0;
  private iconAtlasLocation: WebGLUniformLocation | null = null;
  private iconAtlasColsLocation: WebGLUniformLocation | null = null;
  private iconAtlasRowsLocation: WebGLUniformLocation | null = null;
  private iconLodRadiusLocation: WebGLUniformLocation | null = null;
  private iconLodRadius: number;

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

  // GPU buffer byte sizes (for bufferSubData optimization)
  private nodeGpuBytes = 0;
  private edgeGpuBytes = 0;

  // Reusable Map + object pool for interpolateEdges
  private interpNodeMap = new Map<
    string,
    { x: number; y: number; radius: number }
  >();
  private interpNodePool: { x: number; y: number; radius: number }[] = [];

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

    this.minScreenRadius = options.minScreenRadius ?? 2;
    this.maxScreenRadius = options.maxScreenRadius ?? 40;

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

    this.nodeMinRadiusLocation = gl.getUniformLocation(this.program, "u_minRadius")!;
    this.nodeMaxRadiusLocation = gl.getUniformLocation(this.program, "u_maxRadius")!;
    this.iconAtlasLocation = gl.getUniformLocation(this.program, "u_iconAtlas");
    this.iconAtlasColsLocation = gl.getUniformLocation(this.program, "u_atlasColumns");
    this.iconAtlasRowsLocation = gl.getUniformLocation(this.program, "u_atlasRows");
    this.iconLodRadiusLocation = gl.getUniformLocation(this.program, "u_iconLodRadius");
    this.iconLodRadius = options.iconLodRadius ?? 8;

    this.vao = this.setupGeometry(gl, options.nodes);

    // Edge program
    this.edgeProgram = createProgram(gl, edgeVertexSource, edgeFragmentSource);

    const esLoc = gl.getUniformLocation(this.edgeProgram, "u_scale");
    const eoLoc = gl.getUniformLocation(this.edgeProgram, "u_offset");
    if (!esLoc || !eoLoc)
      throw new Error("u_scale/u_offset not found in edge program");
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

    this.edgeMinRadiusLocation = gl.getUniformLocation(this.edgeProgram, "u_minRadius")!;
    this.edgeMaxRadiusLocation = gl.getUniformLocation(this.edgeProgram, "u_maxRadius")!;

    this.edgeVao = this.setupEdgeGeometry(gl);

    // Set constant edge uniforms once
    gl.useProgram(this.edgeProgram);
    gl.uniform1f(this.edgeHeadLenLocation, 1.5);
    gl.uniform1f(this.edgeCurvatureLocation, CURVATURE);

    // Support legacy raw buffer API
    if (options.edgeBuffer && options.edgeCount && options.edgeCount > 0) {
      this.edgeCount = options.edgeCount;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, options.edgeBuffer, gl.STATIC_DRAW);
      this.edgeGpuBytes = options.edgeCount * EDGE_STRIDE;
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

  private setupGeometry(
    gl: WebGL2RenderingContext,
    nodes: Node[],
  ): WebGLVertexArrayObject {
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
    // Per node: [x(f32), y(f32), rgba(4×u8), radius(f32), iconIndex(f32)] = 20 bytes
    const NODE_STRIDE = 20;
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

    // a_iconIndex (float) at byte offset 16
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, NODE_STRIDE, 16);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);

    this.uploadNodeData(gl, nodes);
    return vao;
  }

  private ensureNodeBuffer(count: number): void {
    if (count <= this.nodeBufferCapacity) return;
    let cap = this.nodeBufferCapacity || 64;
    while (cap < count) cap *= 2;
    this.nodeArrayBuf = new ArrayBuffer(cap * 20);
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
    const sorted = nodes
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    this.ensureNodeBuffer(sorted.length);
    const f32 = this.nodeF32!;
    const u8 = this.nodeU8!;
    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i];
      const fi = i * 5; // float index (20 bytes / 4)
      const bi = i * 20; // byte index
      f32[fi] = node.x;
      f32[fi + 1] = node.y;
      const opacity = node.opacity ?? 1.0;
      u8[bi + 8] = (node.r * 255 + 0.5) | 0;
      u8[bi + 9] = (node.g * 255 + 0.5) | 0;
      u8[bi + 10] = (node.b * 255 + 0.5) | 0;
      u8[bi + 11] = (opacity * 255 + 0.5) | 0;
      f32[fi + 3] = node.radius;
      f32[fi + 4] = node.icon ?? 0;
    }
    const byteLen = sorted.length * 20;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array(this.nodeArrayBuf!, 0, byteLen),
      gl.STATIC_DRAW,
    );
    this.nodeGpuBytes = byteLen;
  }

  private setupEdgeGeometry(
    gl: WebGL2RenderingContext,
  ): WebGLVertexArrayObject {
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

  /** Pack Edge objects into a GPU buffer, resolving positions from nodeMap. Sorted by zIndex. */
  private packEdgeBuffer(edges: Edge[]): {
    buffer: Uint8Array;
    count: number;
    groupSizes: number[];
  } {
    const sorted = edges
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
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

    return {
      buffer: this.edgeBufU8!.subarray(0, count * EDGE_STRIDE),
      count,
      groupSizes,
    };
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
      this.edgeGpuBytes = shuffled.byteLength;
    }
  }

  /** Set edges using Edge object array. Renderer resolves node positions. */
  setEdges(edges: Edge[]): void;
  /** Set edges using raw binary buffer (legacy API). */
  setEdges(buffer: ArrayBufferView, count: number): void;
  setEdges(edgesOrBuffer: Edge[] | ArrayBufferView, count?: number): void {
    if (Array.isArray(edgesOrBuffer)) {
      const shouldAnimate =
        this.dataAnimDuration > 0 && this.edgeObjects.length > 0;
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
      const src = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        edgeCount * EDGE_STRIDE,
      );
      const shuffled = shuffleEdgeBuffer(src, edgeCount);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, shuffled, gl.STATIC_DRAW);
      this.edgeGpuBytes = shuffled.byteLength;
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
      const { buffer, count, groupSizes } = this.packEdgeBuffer(
        this.edgeObjects,
      );
      this.edgeCount = count;
      if (count > 0) {
        const shuffled = shuffleEdgeBuffer(buffer, count, groupSizes);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, shuffled, this.gl.STATIC_DRAW);
        this.edgeGpuBytes = shuffled.byteLength;
      }
    }

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
    const rawNodes =
      this.targetNodes.length > 0 ? this.targetNodes : this.nodes;
    this.sortedTargetNodes = rawNodes
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const rawEdges =
      this.targetEdges.length > 0 ? this.targetEdges : this.edgeObjects;
    this.sortedTargetEdges =
      rawEdges.length > 0
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
          const { buffer, count, groupSizes } = this.packEdgeBuffer(
            this.edgeObjects,
          );
          this.edgeCount = count;
          if (count > 0) {
            const shuffled = shuffleEdgeBuffer(buffer, count, groupSizes);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
            this.gl.bufferData(
              this.gl.ARRAY_BUFFER,
              shuffled,
              this.gl.STATIC_DRAW,
            );
            this.edgeGpuBytes = shuffled.byteLength;
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
      const fi = i * 5;
      const bi = i * 20;

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
      f32[fi + 4] = node.icon ?? 0;
    }

    const byteLen = target.length * 20;
    const view = new Uint8Array(this.nodeArrayBuf!, 0, byteLen);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    if (byteLen === this.nodeGpuBytes) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
      this.nodeGpuBytes = byteLen;
    }
    this.nodeCount = target.length;
  }

  private interpolateEdges(t: number): void {
    if (!this.sortedTargetEdges) return;
    const target = this.sortedTargetEdges;

    // Build interpolated node positions for resolving edge endpoints
    const targetNodes =
      this.targetNodes.length > 0 ? this.targetNodes : this.nodes;
    const interpNodeMap = this.interpNodeMap;
    interpNodeMap.clear();
    const pool = this.interpNodePool;
    let poolIdx = 0;
    for (const node of targetNodes) {
      // Grow pool on demand, reuse existing objects
      let obj: { x: number; y: number; radius: number };
      if (poolIdx < pool.length) {
        obj = pool[poolIdx];
      } else {
        obj = { x: 0, y: 0, radius: 0 };
        pool.push(obj);
      }
      poolIdx++;
      const old = this.oldNodeMap.get(node.id);
      if (old) {
        obj.x = lerp(old.x, node.x, t);
        obj.y = lerp(old.y, node.y, t);
        obj.radius = lerp(old.radius, node.radius, t);
      } else {
        obj.x = node.x;
        obj.y = node.y;
        obj.radius = node.radius;
      }
      interpNodeMap.set(node.id, obj);
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
      const view = this.edgeBufU8!.subarray(0, byteLen);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      if (byteLen === this.edgeGpuBytes) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
      } else {
        gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
        this.edgeGpuBytes = byteLen;
      }
    }
  }

  // --- Hit testing ---

  private effectiveRadius(worldRadius: number): number {
    const clientW = this.canvas.clientWidth || 1;
    const worldPerCssPx = (this.halfW * 2) / clientW;
    const minR = this.minScreenRadius * worldPerCssPx;
    const maxR = this.maxScreenRadius * worldPerCssPx;
    return Math.max(minR, Math.min(maxR, worldRadius));
  }

  private hitTestNode(worldX: number, worldY: number): Node | null {
    let closest: Node | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distSq = dx * dx + dy * dy;
      const r = this.effectiveRadius(node.radius);
      const rSq = r * r;
      if (distSq < rSq && distSq < closestDist) {
        closestDist = distSq;
        closest = node;
      }
    }

    return closest;
  }

  private hitTestEdge(worldX: number, worldY: number): Edge | null {
    const rect = this.getRect();
    const worldPerPx = (this.halfW * 2) / rect.width;
    const baseTol = worldPerPx * 5;

    let closest: Edge | null = null;
    let closestDistSq = Infinity;

    for (let i = 0; i < this.edgeObjects.length; i++) {
      const edge = this.edgeObjects[i];
      const src = this.nodeMap.get(edge.source);
      const tgt = this.nodeMap.get(edge.target);
      if (!src || !tgt) continue;

      // Per-edge tolerance = 5px + half the rendered edge width
      const halfW = (edge.width ?? 1.0) / 2;
      const edgeTol = baseTol + halfW;

      // Compute Bezier control point
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.0001) continue;
      const curveDist = len * CURVATURE;
      const ctrlX = (src.x + tgt.x) * 0.5 + (-dy / len) * curveDist;
      const ctrlY = (src.y + tgt.y) * 0.5 + (dx / len) * curveDist;

      // Tight bbox — Bezier convex hull + edge width + pixel tolerance
      const minX = Math.min(src.x, tgt.x, ctrlX) - edgeTol;
      const maxX = Math.max(src.x, tgt.x, ctrlX) + edgeTol;
      const minY = Math.min(src.y, tgt.y, ctrlY) - edgeTol;
      const maxY = Math.max(src.y, tgt.y, ctrlY) + edgeTol;
      if (worldX < minX || worldX > maxX || worldY < minY || worldY > maxY)
        continue;

      // Analytical closest-point distance to center line
      const dSq = distSqToBezier(
        worldX,
        worldY,
        src.x,
        src.y,
        ctrlX,
        ctrlY,
        tgt.x,
        tgt.y,
      );
      if (dSq < edgeTol * edgeTol && dSq < closestDistSq) {
        closestDistSq = dSq;
        closest = edge;
      }
    }

    return closest;
  }

  // --- Event system ---

  private setupInteraction(): void {
    const signal = this.abortController.signal;
    const canvas = this.canvas;
    canvas.style.cursor = "default";

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
          canvas.style.cursor = "default";
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
      this.onNodeClick({
        type: "click",
        nodeId: node.id,
        node,
        worldX,
        worldY,
        originalEvent: e,
      });
      return;
    }

    const edge = this.hitTestEdge(worldX, worldY);
    if (edge && this.onEdgeClick) {
      this.onEdgeClick({
        type: "click",
        edgeId: edge.id,
        edge,
        worldX,
        worldY,
        originalEvent: e,
      });
      return;
    }

    if (this.onBackgroundClick) {
      this.onBackgroundClick({
        type: "click",
        worldX,
        worldY,
        originalEvent: e,
      });
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
      this.onBackgroundDblClick({
        type: "dblclick",
        worldX,
        worldY,
        originalEvent: e,
      });
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

      this.canvas.style.cursor = "default";
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
      this.canvas.style.cursor = "default";
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

  private screenToWorld(
    screenX: number,
    screenY: number,
  ): { x: number; y: number } {
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
      const e = this.dataAnimEasing(t);

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

    if (
      this.canvas.width !== displayWidth ||
      this.canvas.height !== displayHeight
    ) {
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

  /** Upload an icon atlas texture. columns/rows describe the grid layout. */
  setIconAtlas(source: TexImageSource, columns: number, rows: number): void {
    const gl = this.gl;
    if (!this.iconAtlasTexture) {
      this.iconAtlasTexture = gl.createTexture();
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.iconAtlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.iconAtlasColumns = columns;
    this.iconAtlasRows = rows;

    gl.useProgram(this.program);
    gl.uniform1i(this.iconAtlasLocation!, 0);
    gl.uniform1f(this.iconAtlasColsLocation!, columns);
    gl.uniform1f(this.iconAtlasRowsLocation!, rows);
    this.requestRender();
  }

  /** Build atlas from SVG strings and upload as icon texture. */
  async setIcons(svgStrings: string[], cellSize?: number): Promise<void> {
    const { canvas, columns, rows } = await buildIconAtlas(svgStrings, cellSize);
    this.setIconAtlas(canvas, columns, rows);
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

    // Convert CSS pixel radius limits to world-space
    const clientW = this.canvas.clientWidth || 1;
    const worldPerCssPx = (this.halfW * 2) / clientW;
    const minR = this.minScreenRadius * worldPerCssPx;
    const maxR = this.maxScreenRadius * worldPerCssPx;

    // Draw edges behind nodes.
    // Cap instance count to limit fragment overdraw on high-DPI displays.
    // The edge buffer is shuffled at upload time so any prefix has uniform spatial coverage.
    const MAX_DRAW_EDGES = 65536;
    const drawEdges = Math.min(this.edgeCount, MAX_DRAW_EDGES);
    if (drawEdges > 0) {
      const vpMinX = this.vpMinX;
      const vpMinY = this.vpMinY;
      const vpMaxX = this.vpMaxX;
      const vpMaxY = this.vpMaxY;
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
      if (minR !== this.sentEdgeMinRadius || maxR !== this.sentEdgeMaxRadius) {
        gl.uniform1f(this.edgeMinRadiusLocation, minR);
        gl.uniform1f(this.edgeMaxRadiusLocation, maxR);
        this.sentEdgeMinRadius = minR;
        this.sentEdgeMaxRadius = maxR;
      }
      gl.bindVertexArray(this.edgeVao);
      gl.drawElementsInstanced(
        gl.TRIANGLES,
        51,
        gl.UNSIGNED_BYTE,
        0,
        drawEdges,
      );
    }

    // Draw nodes on top of edges
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
    if (minR !== this.sentMinRadius || maxR !== this.sentMaxRadius) {
      gl.uniform1f(this.nodeMinRadiusLocation, minR);
      gl.uniform1f(this.nodeMaxRadiusLocation, maxR);
      this.sentMinRadius = minR;
      this.sentMaxRadius = maxR;
    }
    // Bind icon atlas texture and set LOD threshold
    if (this.iconAtlasTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.iconAtlasTexture);
    }
    gl.uniform1f(this.iconLodRadiusLocation!, this.iconLodRadius * worldPerCssPx);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.nodeCount);
  }

  destroy(): void {
    this.abortController.abort();
    this.cancelAnimation();
    if (this.dataAnimId !== null) {
      cancelAnimationFrame(this.dataAnimId);
      this.dataAnimId = null;
    }
    if (this.iconAtlasTexture) {
      this.gl.deleteTexture(this.iconAtlasTexture);
      this.iconAtlasTexture = null;
    }
    this.resizeObserver.disconnect();
  }
}

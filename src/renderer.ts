import type { Node, RendererOptions } from "./types";
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
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
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

  // Edge rendering
  private edgeProgram: WebGLProgram;
  private edgeVao: WebGLVertexArrayObject;
  private edgeCount = 0;
  private edgeScaleLocation: WebGLUniformLocation;
  private edgeOffsetLocation: WebGLUniformLocation;
  private edgeHeadLenLocation: WebGLUniformLocation;
  private edgeNodeRadiusLocation: WebGLUniformLocation;
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

  // Animation state
  private animationId: number | null = null;
  private animStartTime = 0;
  private animDuration = 0;
  private animFrom = { centerX: 0, centerY: 0, halfW: 0, halfH: 0 };
  private animTo = { centerX: 0, centerY: 0, halfW: 0, halfH: 0 };

  // Cached projection scalars (orthographic: pos * scale + offset)
  private projScaleX = 1;
  private projScaleY = 1;
  private projOffsetX = 0;
  private projOffsetY = 0;

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
  private lastTouches: Touch[] | null = null;
  private abortController = new AbortController();

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.nodes = options.nodes;
    this.nodeCount = options.nodes.length;

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

    const eRadLoc = gl.getUniformLocation(this.edgeProgram, "u_nodeRadius");
    if (!eRadLoc) throw new Error("u_nodeRadius not found");
    this.edgeNodeRadiusLocation = eRadLoc;

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
    gl.uniform1f(this.edgeNodeRadiusLocation, 2.0);

    if (options.edgeBuffer && options.edgeCount && options.edgeCount > 0) {
      this.edgeCount = options.edgeCount;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, options.edgeBuffer, gl.STATIC_DRAW);
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
    // Per node: [x, y, r, g, b, radius] = 6 floats = 24 bytes
    const NODE_STRIDE = 6 * 4;
    const instanceBuf = gl.createBuffer();
    if (!instanceBuf) throw new Error("Failed to create buffer");
    this.nodeInstanceBuffer = instanceBuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);

    // a_position (vec2) at byte offset 0
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, NODE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    // a_color (vec3) at byte offset 8
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, NODE_STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    // a_radius (float) at byte offset 20
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, NODE_STRIDE, 20);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    this.uploadNodeData(gl, nodes);
    return vao;
  }

  private uploadNodeData(gl: WebGL2RenderingContext, nodes: Node[]): void {
    const data = new Float32Array(nodes.length * 6);
    for (let i = 0; i < nodes.length; i++) {
      const off = i * 6;
      data[off] = nodes[i].x;
      data[off + 1] = nodes[i].y;
      data[off + 2] = nodes[i].r;
      data[off + 3] = nodes[i].g;
      data[off + 4] = nodes[i].b;
      data[off + 5] = nodes[i].radius;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }

  private setupEdgeGeometry(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create edge VAO");
    gl.bindVertexArray(vao);

    // Arrow template: 7 unique vertices, indexed as 3 triangles (shaft quad + head)
    // Each vertex: (tParam, perpOffset, flag)
    const SHAFT_HW = 0.2;
    const HEAD_HW = 0.7;
    // prettier-ignore
    const template = new Float32Array([
      0, -SHAFT_HW, 0,   // 0: shaft bottom-left
      1, -SHAFT_HW, 0,   // 1: shaft bottom-right
      1,  SHAFT_HW, 0,   // 2: shaft top-right
      0,  SHAFT_HW, 0,   // 3: shaft top-left
      0, -HEAD_HW,  1,   // 4: head bottom
      0,  0,        2,   // 5: head tip
      0,  HEAD_HW,  1,   // 6: head top
    ]);

    const templateBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, templateBuf);
    gl.bufferData(gl.ARRAY_BUFFER, template, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // Index buffer for 3 triangles (reuses shared shaft vertices)
    // prettier-ignore
    const indices = new Uint8Array([
      0, 1, 2,   // shaft triangle 1
      0, 2, 3,   // shaft triangle 2
      4, 5, 6,   // head triangle
    ]);
    const indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Single interleaved instance buffer
    // Per edge: [srcX(f32), srcY(f32), tgtX(f32), tgtY(f32), RGBA(4×u8)] = 20 bytes
    const STRIDE = 20;
    const buf = gl.createBuffer();
    if (!buf) throw new Error("Failed to create buffer");
    this.edgeInstanceBuffer = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);

    // a_source (vec2) at byte offset 0
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    // a_target (vec2) at byte offset 8
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    // a_color (vec4 normalized u8) at byte offset 16
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.vertexAttribDivisor(3, 1);

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

    // Reuse existing edge instance buffer (same 20-byte stride layout)
    const STRIDE = 20;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
    return vao;
  }

  setEdges(buffer: ArrayBufferView, count: number): void {
    this.edgeCount = count;
    if (count > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STATIC_DRAW);
    }
    this.requestRender();
  }

  setNodes(nodes: Node[]): void {
    this.nodes = nodes;
    this.nodeCount = nodes.length;
    this.uploadNodeData(this.gl, nodes);
    this.initCamera();
    this.requestRender();
  }

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

    // Mouse drag
    canvas.addEventListener(
      "mousedown",
      (e) => {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        canvas.style.cursor = "grabbing";
      },
      { signal },
    );

    window.addEventListener(
      "mousemove",
      (e) => {
        if (!this.isDragging) return;
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
      () => {
        this.isDragging = false;
        canvas.style.cursor = "grab";
      },
      { signal },
    );

    // Touch
    canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.lastTouches = Array.from(e.touches);
      },
      { signal, passive: false },
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        if (!this.lastTouches) return;

        const touches = Array.from(e.touches);

        if (touches.length === 1 && this.lastTouches.length === 1) {
          // Single finger pan
          const dx = touches[0].clientX - this.lastTouches[0].clientX;
          const dy = touches[0].clientY - this.lastTouches[0].clientY;
          this.pan(dx, dy);
        } else if (touches.length >= 2 && this.lastTouches.length >= 2) {
          // Pinch zoom + pan
          const oldDist = touchDistance(this.lastTouches[0], this.lastTouches[1]);
          const newDist = touchDistance(touches[0], touches[1]);
          const factor = oldDist / newDist;
          const midX = (touches[0].clientX + touches[1].clientX) / 2;
          const midY = (touches[0].clientY + touches[1].clientY) / 2;
          this.zoomAt(midX, midY, factor);
        }

        this.lastTouches = touches;
      },
      { signal, passive: false },
    );

    canvas.addEventListener(
      "touchend",
      (e) => {
        if (e.touches.length === 0) {
          this.lastTouches = null;
        } else {
          this.lastTouches = Array.from(e.touches);
        }
      },
      { signal },
    );
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
    if (!this.renderPending) {
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

    this.animFrom = {
      centerX: this.centerX,
      centerY: this.centerY,
      halfW: this.halfW,
      halfH: this.halfH,
    };
    this.animTo = {
      centerX: view.centerX,
      centerY: view.centerY,
      halfW: view.halfW,
      halfH: view.halfH,
    };
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
    const { projScaleX, projScaleY, projOffsetX, projOffsetY } = this;

    // Draw edges behind nodes (LOD: lines when zoomed out, arrows when close)
    if (this.edgeCount > 0) {
      const { vpMinX, vpMinY, vpMaxX, vpMaxY } = this;
      // LOD: when node radius (2 world units) < 3px, arrow detail is sub-pixel → use lines
      if (Math.abs(projScaleX) * this.canvas.width < 3.0) {
        gl.useProgram(this.edgeLineProgram);
        gl.uniform2f(this.edgeLineScaleLocation, projScaleX, projScaleY);
        gl.uniform2f(this.edgeLineOffsetLocation, projOffsetX, projOffsetY);
        gl.uniform4f(this.edgeLineViewportLocation, vpMinX, vpMinY, vpMaxX, vpMaxY);
        gl.bindVertexArray(this.edgeLineVao);
        gl.drawArraysInstanced(gl.LINES, 0, 2, this.edgeCount);
      } else {
        gl.useProgram(this.edgeProgram);
        gl.uniform2f(this.edgeScaleLocation, projScaleX, projScaleY);
        gl.uniform2f(this.edgeOffsetLocation, projOffsetX, projOffsetY);
        gl.uniform4f(this.edgeViewportLocation, vpMinX, vpMinY, vpMaxX, vpMaxY);
        gl.bindVertexArray(this.edgeVao);
        gl.drawElementsInstanced(gl.TRIANGLES, 9, gl.UNSIGNED_BYTE, 0, this.edgeCount);
      }
    }

    // Draw nodes on top
    gl.useProgram(this.program);
    gl.uniform2f(this.scaleLocation, projScaleX, projScaleY);
    gl.uniform2f(this.offsetLocation, projOffsetX, projOffsetY);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.nodeCount);
  }

  destroy(): void {
    this.abortController.abort();
    this.cancelAnimation();
    this.resizeObserver.disconnect();
  }
}

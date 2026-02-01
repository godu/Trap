import type { Node, RendererOptions } from "./types";
import { vertexSource, fragmentSource } from "./shaders";
import { computeBounds, computeFitView, createProjectionFromView } from "./camera";

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
  private projectionLocation: WebGLUniformLocation;
  private nodes: Node[];

  // Camera state (world-space view)
  private centerX = 0;
  private centerY = 0;
  private halfW = 1;
  private halfH = 1;

  // Animation state
  private animationId: number | null = null;
  private animStartTime = 0;
  private animDuration = 0;
  private animFrom = { centerX: 0, centerY: 0, halfW: 0, halfH: 0 };
  private animTo = { centerX: 0, centerY: 0, halfW: 0, halfH: 0 };

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

    const gl = this.canvas.getContext("webgl2", { antialias: true });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.program = createProgram(gl, vertexSource, fragmentSource);

    const loc = gl.getUniformLocation(this.program, "u_projection");
    if (!loc) throw new Error("u_projection uniform not found");
    this.projectionLocation = loc;

    this.vao = this.setupGeometry(gl, options.nodes);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

    // Instance data: position (x, y)
    const positions = new Float32Array(nodes.length * 2);
    for (let i = 0; i < nodes.length; i++) {
      positions[i * 2] = nodes[i].x;
      positions[i * 2 + 1] = nodes[i].y;
    }
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    // Instance data: color (r, g, b)
    const colors = new Float32Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      colors[i * 3] = nodes[i].r;
      colors[i * 3 + 1] = nodes[i].g;
      colors[i * 3 + 2] = nodes[i].b;
    }
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // Instance data: radius
    const radii = new Float32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      radii[i] = nodes[i].radius;
    }
    const radiusBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, radiusBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, radii, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
    return vao;
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

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const nx = (screenX - rect.left) / rect.width;
    const ny = (screenY - rect.top) / rect.height;
    return {
      x: this.centerX + (nx - 0.5) * 2 * this.halfW,
      y: this.centerY - (ny - 0.5) * 2 * this.halfH,
    };
  }

  private cancelAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private zoomAt(screenX: number, screenY: number, factor: number): void {
    this.cancelAnimation();
    const world = this.screenToWorld(screenX, screenY);
    this.centerX = world.x + (this.centerX - world.x) * factor;
    this.centerY = world.y + (this.centerY - world.y) * factor;
    this.halfW *= factor;
    this.halfH *= factor;
    this.render();
  }

  private pan(screenDx: number, screenDy: number): void {
    this.cancelAnimation();
    const rect = this.canvas.getBoundingClientRect();
    this.centerX -= (screenDx / rect.width) * 2 * this.halfW;
    this.centerY += (screenDy / rect.height) * 2 * this.halfH;
    this.render();
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

  render(): void {
    const gl = this.gl;

    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.clearColor(0.067, 0.067, 0.067, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    const projection = createProjectionFromView({
      centerX: this.centerX,
      centerY: this.centerY,
      halfW: this.halfW,
      halfH: this.halfH,
    });
    gl.uniformMatrix4fv(this.projectionLocation, false, projection);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.nodeCount);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    this.abortController.abort();
    this.cancelAnimation();
  }
}

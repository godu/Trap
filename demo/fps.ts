/** FPS counter with 10-second history graph — measures actual canvas renders */

const FPS_HISTORY_SIZE = 100; // 10 seconds at 10 samples/sec
const fpsHistory: number[] = [];
let fpsFrameCount = 0;
let fpsLastSample = performance.now();

let fpsText: HTMLElement | null = null;
let fpsGraph: HTMLCanvasElement | null = null;
let fpsCtx: CanvasRenderingContext2D | null = null;

/** Call this from renderer's onRender callback to count a frame. */
export function countRenderFrame(): void {
  fpsFrameCount++;
}

function sampleFps() {
  const now = performance.now();
  const elapsed = now - fpsLastSample;
  const fps = Math.round((fpsFrameCount * 1000) / elapsed);

  fpsHistory.push(fps);
  if (fpsHistory.length > FPS_HISTORY_SIZE) fpsHistory.shift();

  fpsFrameCount = 0;
  fpsLastSample = now;

  if (fpsText) fpsText.textContent = `${fps} FPS`;
  drawFpsGraph();
}

function drawFpsGraph() {
  if (!fpsGraph || !fpsCtx) return;

  const w = fpsGraph.width;
  const h = fpsGraph.height;
  const maxFps = 120;

  fpsCtx.clearRect(0, 0, w, h);

  if (fpsHistory.length < 2) return;

  // Draw 60 FPS reference line
  const y60 = h - (60 / maxFps) * h;
  fpsCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  fpsCtx.beginPath();
  fpsCtx.moveTo(0, y60);
  fpsCtx.lineTo(w, y60);
  fpsCtx.stroke();

  // Draw FPS line
  fpsCtx.strokeStyle = "#4f8";
  fpsCtx.lineWidth = 1.5;
  fpsCtx.beginPath();

  const step = w / (FPS_HISTORY_SIZE - 1);
  const startX = w - (fpsHistory.length - 1) * step;

  for (let i = 0; i < fpsHistory.length; i++) {
    const x = startX + i * step;
    const y = h - (Math.min(fpsHistory[i], maxFps) / maxFps) * h;
    if (i === 0) {
      fpsCtx.moveTo(x, y);
    } else {
      fpsCtx.lineTo(x, y);
    }
  }
  fpsCtx.stroke();
}

/** Initialize FPS counter. Call once after DOM is ready. */
export function initFpsCounter(): void {
  fpsText = document.getElementById("fps-text");
  fpsGraph = document.getElementById("fps-graph") as HTMLCanvasElement | null;
  fpsCtx = fpsGraph?.getContext("2d") ?? null;

  setInterval(sampleFps, 100);
}

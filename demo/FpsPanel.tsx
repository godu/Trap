import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

const FPS_HISTORY_SIZE = 100;
const MAX_FPS = 120;
const GRAPH_W = 120;
const GRAPH_H = 40;

export interface FpsPanelRef {
  countFrame(): void;
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 56,
  right: 8,
  padding: "6px 8px",
  background: "rgba(0,0,0,0.6)",
  borderRadius: 4,
  pointerEvents: "none",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const textStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.7)",
  font: "12px/1 monospace",
};

const canvasStyle: React.CSSProperties = {
  display: "block",
  borderRadius: 2,
  background: "rgba(0,0,0,0.3)",
};

export const FpsPanel = forwardRef(function FpsPanel(_: {}, ref: Ref<FpsPanelRef>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCount = useRef(0);
  const lastSample = useRef(performance.now());
  const history = useRef<number[]>([]);
  const [fps, setFps] = useState(0);

  useImperativeHandle(ref, () => ({
    countFrame() {
      frameCount.current++;
    },
  }));

  const draw = useCallback((fpsHistory: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    if (fpsHistory.length < 2) return;

    // 60 FPS reference line
    const y60 = GRAPH_H - (60 / MAX_FPS) * GRAPH_H;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(0, y60);
    ctx.lineTo(GRAPH_W, y60);
    ctx.stroke();

    // FPS line
    ctx.strokeStyle = "#4f8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = GRAPH_W / (FPS_HISTORY_SIZE - 1);
    const startX = GRAPH_W - (fpsHistory.length - 1) * step;
    for (let i = 0; i < fpsHistory.length; i++) {
      const x = startX + i * step;
      const y = GRAPH_H - (Math.min(fpsHistory[i], MAX_FPS) / MAX_FPS) * GRAPH_H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastSample.current;
      const currentFps = Math.round((frameCount.current * 1000) / elapsed);

      const h = history.current;
      h.push(currentFps);
      if (h.length > FPS_HISTORY_SIZE) h.shift();

      frameCount.current = 0;
      lastSample.current = now;

      setFps(currentFps);
      draw(h);
    }, 100);
    return () => clearInterval(id);
  }, [draw]);

  return (
    <div style={panelStyle}>
      <span style={textStyle}>{fps} FPS</span>
      <canvas ref={canvasRef} width={GRAPH_W} height={GRAPH_H} style={canvasStyle} />
    </div>
  );
});

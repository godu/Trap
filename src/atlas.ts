/**
 * Rasterize SVG strings into a texture atlas grid.
 * Each SVG is rendered into a square cell of `cellSize` × `cellSize` pixels.
 * The atlas canvas has power-of-2 dimensions for GPU compatibility.
 */
export async function buildIconAtlas(
  svgStrings: string[],
  cellSize = 64,
): Promise<{ canvas: HTMLCanvasElement; columns: number; rows: number }> {
  const count = svgStrings.length;
  if (count === 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return { canvas, columns: 1, rows: 1 };
  }

  const minCols = Math.ceil(Math.sqrt(count));
  const minRows = Math.ceil(count / minCols);

  const width = nextPow2(minCols * cellSize);
  const height = nextPow2(minRows * cellSize);

  // Use padded grid dimensions so layout matches UV space exactly
  const columns = width / cellSize;
  const rows = height / cellSize;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const images = await Promise.all(svgStrings.map(loadSvgImage));

  for (let i = 0; i < images.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    ctx.drawImage(images[i], col * cellSize, row * cellSize, cellSize, cellSize);
  }

  return { canvas, columns, rows };
}

function loadSvgImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG image"));
    };
    img.src = url;
  });
}

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p *= 2;
  return p;
}

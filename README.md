# @godu/trap

A high-performance, zero-dependency WebGL2 graph visualization library with optional React bindings.

## Install

```bash
npm install @godu/trap
```

## Quick Start

```js
import { Renderer } from "@godu/trap";

const canvas = document.querySelector("canvas");

const renderer = new Renderer({
  canvas,
  nodes: [
    { id: "a", x: 0, y: 0, r: 1, g: 0, b: 0, a: 1, s: 10, z: 0, i: 0, l: "Node A" },
    { id: "b", x: 100, y: 50, r: 0, g: 0, b: 1, a: 1, s: 8, z: 0, i: 0, l: "Node B" },
  ],
  edges: [
    { id: "e1", src: "a", tgt: "b", r: 0.5, g: 0.5, b: 0.5, a: 1, s: 1, z: 0 },
  ],
});

renderer.fitToNodes(0);
renderer.render();
```

## React

```tsx
import { Graph } from "@godu/trap/react";
import { useRef } from "react";
import type { GraphRef } from "@godu/trap/react";

function App() {
  const ref = useRef<GraphRef>(null);

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Graph
        ref={ref}
        nodes={nodes}
        edges={edges}
        fitKey="initial"
        onNodeClick={(e) => console.log(e.nodeId)}
      />
    </div>
  );
}
```

The `<Graph>` component fills its parent container, manages the renderer lifecycle, and provides built-in label rendering.

## Data Format

### Node

All fields are required.

| Field | Type     | Description                                      |
| ----- | -------- | ------------------------------------------------ |
| `id`  | `string` | Unique identifier                                |
| `x`   | `number` | World x position                                 |
| `y`   | `number` | World y position                                 |
| `r`   | `number` | Red channel (0-1)                                |
| `g`   | `number` | Green channel (0-1)                              |
| `b`   | `number` | Blue channel (0-1)                               |
| `a`   | `number` | Alpha (0-1)                                      |
| `s`   | `number` | Radius in world units                            |
| `z`   | `number` | Z-index for draw order (lower draws first)       |
| `i`   | `number` | Icon index (1-based into atlas, 0 = no icon)     |
| `l`   | `string` | Text label displayed near the node ("" = no label) |

### Edge

All fields are required.

| Field | Type     | Description                                |
| ----- | -------- | ------------------------------------------ |
| `id`  | `string` | Unique identifier                          |
| `src` | `string` | Source node id                             |
| `tgt` | `string` | Target node id                             |
| `r`   | `number` | Red channel (0-1)                          |
| `g`   | `number` | Green channel (0-1)                        |
| `b`   | `number` | Blue channel (0-1)                         |
| `a`   | `number` | Alpha (0-1)                                |
| `s`   | `number` | Width in world units                       |
| `z`   | `number` | Z-index for draw order (lower draws first) |

## Renderer API

### `new Renderer(options: RendererOptions)`

Creates a WebGL2 renderer attached to the given canvas.

### Methods

| Method | Signature | Description |
| ------ | --------- | ----------- |
| `setNodes` | `(nodes: Node[]) => void` | Update node data. Triggers animation if `animationDuration > 0`. |
| `setEdges` | `(edges: Edge[]) => void` | Update edge data from an array. |
| `setEdges` | `(buffer: ArrayBufferView, count: number) => void` | Update edges from a raw binary buffer. |
| `setCurvature` | `(amount: number) => void` | Set edge curvature (0 = straight). |
| `fitToNodes` | `(duration?: number) => void` | Animate camera to frame all nodes. Default 300 ms, pass 0 for instant. |
| `render` | `() => void` | Start the render loop. |
| `destroy` | `() => void` | Clean up WebGL resources and event listeners. |
| `getCameraState` | `() => CameraState` | Returns the current camera state. Object is reused across calls. |
| `getNodes` | `() => readonly Node[]` | Returns nodes with interpolated positions during animation. |
| `setIcons` | `(svgStrings: string[], cellSize?: number) => Promise<void>` | Build icon atlas from SVG strings and upload to GPU. Default cell size is 64 px. |
| `setIconAtlas` | `(source: TexImageSource, columns: number, rows: number) => void` | Upload a pre-built icon atlas texture. |
| `resize` | `() => void` | Recalculate canvas dimensions (called automatically on ResizeObserver changes). |

## RendererOptions

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `canvas` | `HTMLCanvasElement` | **required** | Target canvas element |
| `nodes` | `Node[]` | **required** | Initial node data |
| `edges` | `Edge[]` | `undefined` | Initial edge data |
| `animationDuration` | `number` | `300` | Transition duration in ms |
| `animationEasing` | `(t: number) => number` | easeOutCubic | Easing function |
| `minScreenRadius` | `number` | `2` | Minimum node radius in CSS pixels |
| `maxScreenRadius` | `number` | `40` | Maximum node radius in CSS pixels |
| `onNodeClick` | `(e: NodeEvent) => void` | | |
| `onNodeDblClick` | `(e: NodeEvent) => void` | | |
| `onNodeHoverEnter` | `(e: NodeEvent) => void` | | |
| `onNodeHoverLeave` | `(e: NodeEvent) => void` | | |
| `onEdgeClick` | `(e: EdgeEvent) => void` | | |
| `onEdgeDblClick` | `(e: EdgeEvent) => void` | | |
| `onEdgeHoverEnter` | `(e: EdgeEvent) => void` | | |
| `onEdgeHoverLeave` | `(e: EdgeEvent) => void` | | |
| `onBackgroundClick` | `(e: BackgroundEvent) => void` | | |
| `onBackgroundDblClick` | `(e: BackgroundEvent) => void` | | |
| `onRender` | `() => void` | | Called after each rendered frame |

## Events

### NodeEvent

| Field | Type | Description |
| ----- | ---- | ----------- |
| `type` | `string` | `"click"`, `"dblclick"`, `"hoverEnter"`, `"hoverLeave"` |
| `nodeId` | `string` | Node id |
| `node` | `Node` | Node object |
| `worldX` | `number` | World-space x coordinate |
| `worldY` | `number` | World-space y coordinate |
| `originalEvent` | `MouseEvent \| TouchEvent` | Original DOM event |

### EdgeEvent

| Field | Type | Description |
| ----- | ---- | ----------- |
| `type` | `string` | Event type |
| `edgeId` | `string` | Edge id |
| `edge` | `Edge` | Edge object |
| `worldX` | `number` | World-space x coordinate |
| `worldY` | `number` | World-space y coordinate |
| `originalEvent` | `MouseEvent \| TouchEvent` | Original DOM event |

### BackgroundEvent

| Field | Type | Description |
| ----- | ---- | ----------- |
| `type` | `string` | Event type |
| `worldX` | `number` | World-space x coordinate |
| `worldY` | `number` | World-space y coordinate |
| `originalEvent` | `MouseEvent \| TouchEvent` | Original DOM event |

## GraphProps

Props for the `<Graph>` React component.

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `nodes` | `Node[]` | **required** | Node data |
| `edges` | `Edge[]` | `undefined` | Edge data |
| `animationDuration` | `number` | `300` | Transition duration in ms |
| `animationEasing` | `(t: number) => number` | easeOutCubic | Easing function |
| `curvature` | `number` | `0.4` | Edge curvature (0 = straight) |
| `minScreenRadius` | `number` | `2` | Min node radius in CSS px |
| `maxScreenRadius` | `number` | `40` | Max node radius in CSS px |
| `icons` | `string[]` | | SVG strings for icon atlas |
| `iconCellSize` | `number` | `64` | Icon atlas cell size in px |
| `fitKey` | `string \| number` | | Triggers `fitToNodes` when changed |
| `labelClass` | `string` | | CSS class for label elements |
| `minLabelRadius` | `number` | `8` | Only show labels when screen radius >= this |
| `maxLabels` | `number` | `200` | Maximum visible labels |
| `onNodeClick` | `(e: NodeEvent) => void` | | |
| `onNodeDblClick` | `(e: NodeEvent) => void` | | |
| `onNodeHoverEnter` | `(e: NodeEvent) => void` | | |
| `onNodeHoverLeave` | `(e: NodeEvent) => void` | | |
| `onEdgeClick` | `(e: EdgeEvent) => void` | | |
| `onEdgeDblClick` | `(e: EdgeEvent) => void` | | |
| `onEdgeHoverEnter` | `(e: EdgeEvent) => void` | | |
| `onEdgeHoverLeave` | `(e: EdgeEvent) => void` | | |
| `onBackgroundClick` | `(e: BackgroundEvent) => void` | | |
| `onBackgroundDblClick` | `(e: BackgroundEvent) => void` | | |
| `onRender` | `() => void` | | Called after each rendered frame |
| `children` | `ReactNode` | | Overlay content (rendered with `pointer-events: none`) |

## GraphRef

Imperative handle exposed via `ref` on `<Graph>`.

| Method | Signature | Description |
| ------ | --------- | ----------- |
| `fitToNodes` | `(duration?: number) => void` | Animate camera to frame all nodes |
| `setCurvature` | `(amount: number) => void` | Set edge curvature |
| `getRenderer` | `() => Renderer \| null` | Access the underlying renderer |
| `getCameraState` | `() => CameraState \| undefined` | Get current camera state |

## Labels

### LabelOverlay

Standalone DOM label overlay for use without React.

```js
import { LabelOverlay } from "@godu/trap";

const labels = new LabelOverlay({
  container: document.getElementById("graph-container"),
  minScreenRadius: 8,
  maxLabels: 200,
  labelClass: "my-label",
});

// Call after each render
renderer.onRender = () => {
  labels.update(renderer.getNodes(), renderer.getCameraState());
};

// Cleanup
labels.destroy();
```

### LabelOverlayOptions

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `container` | `HTMLElement` | **required** | Parent element (typically the canvas's parent) |
| `minScreenRadius` | `number` | `8` | Only show labels when node screen radius >= this |
| `maxLabels` | `number` | `200` | Maximum visible labels |
| `labelClass` | `string` | `""` | CSS class added to each label element |

## Camera Utilities

### CameraState

| Field | Type | Description |
| ----- | ---- | ----------- |
| `centerX` | `number` | World-space center x |
| `centerY` | `number` | World-space center y |
| `halfW` | `number` | Half-width of view in world units |
| `halfH` | `number` | Half-height of view in world units |
| `clientWidth` | `number` | Canvas CSS width in pixels |
| `clientHeight` | `number` | Canvas CSS height in pixels |
| `minScreenRadius` | `number` | Min node screen radius in CSS px |
| `maxScreenRadius` | `number` | Max node screen radius in CSS px |

### CameraView

| Field | Type | Description |
| ----- | ---- | ----------- |
| `centerX` | `number` | World-space center x |
| `centerY` | `number` | World-space center y |
| `halfW` | `number` | Half-width in world units |
| `halfH` | `number` | Half-height in world units |

### Bounds

| Field | Type | Description |
| ----- | ---- | ----------- |
| `minX` | `number` | Minimum x (including node radius) |
| `maxX` | `number` | Maximum x (including node radius) |
| `minY` | `number` | Minimum y (including node radius) |
| `maxY` | `number` | Maximum y (including node radius) |

### Functions

```ts
computeBounds(nodes: Node[]): Bounds
```

Compute the axis-aligned bounding box of all nodes (including radius).

```ts
computeFitView(bounds: Bounds, canvasWidth: number, canvasHeight: number): CameraView
```

Compute a camera view that fits the bounds with 10% padding, maintaining aspect ratio.

```ts
createProjectionFromView(view: CameraView): Float32Array
```

Create a 4x4 orthographic projection matrix (column-major) from a camera view.

```ts
createProjectionMatrix(bounds: Bounds, canvasWidth: number, canvasHeight: number): Float32Array
```

Shorthand for `createProjectionFromView(computeFitView(bounds, w, h))`.

## License

MIT

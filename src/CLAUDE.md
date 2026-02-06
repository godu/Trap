# src/ — Renderer Library

## Public API

Exported from `index.ts`:

- **`Renderer`** class — instanced WebGL2 graph renderer with interactive pan/zoom
  - `constructor(options: RendererOptions)`
  - `setNodes(nodes)` / `setEdges(buffer, count)` — update data
  - `fitToNodes(duration?)` — animate camera to frame all nodes
  - `render()` — start render loop
  - `destroy()` — cleanup GL resources and listeners
- **Camera utilities** — `computeBounds`, `computeFitView`, `createProjectionFromView`, `createProjectionMatrix`
- **Types** — `Node`, `Edge`, `RendererOptions`, `Bounds`, `CameraView`

## Architecture

- Instanced rendering: one draw call for all nodes, one for all edges.
- Node: `{ id, x, y, r, g, b, a, s, z, i, l }` — all required. `s`=radius, `i`=icon index (0=none), `l`=label (""=none).
- Edge: `{ id, src, tgt, r, g, b, a, s, z }` — all required. `s`=width.
- Node instance data: 5 floats (x, y, premultiplied rgba, radius, icon) = 20 bytes per node.
- Edge instance data: 20 bytes per edge (4x float32 positions + uint32 packed premultiplied RGBA).
- Orthographic camera with smooth animated transitions.

## Constraints

- No DOM dependencies beyond `HTMLCanvasElement`.
- No external dependencies — all shaders and math are inline.
- This directory is library-only. Application-specific types, color maps, and data conversion belong in `demo/`.

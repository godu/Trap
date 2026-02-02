# demo/ — Demo Applications

## Pages

- **`index.html`** + `main.ts` — dataset size toggle (Small/Medium/Large), loads JSON resource+edge files
- **`escalation.html`** + `escalation.ts` — 3-step AWS privilege escalation walkthrough with step toggles

## Demo-Specific Code

- `graph/types.ts` — `GraphNode`, `GraphEdge`, `GraphStep` interfaces (positions + metadata on nodes)
- `graph/convert.ts` — converts graph types to renderer GPU format: `toRenderNodes(step)`, `toEdgeBuffer(step)`, AWS resource type color maps
- `fixtures.ts` — hardcoded 3-step escalation data with pre-computed node positions

## Dev Server

Vite root is `demo/`, base path `/Trap/`. Run `npx vite dev` from project root.

## Notes

- Color maps for AWS resource types (`aws:iam:role` -> red, etc.) live here, not in `src/`.
- Node positions are pre-computed in fixture data, not calculated at runtime.
- Edge colors encode privilege type: blue for `privilege`, red for `escalation`.

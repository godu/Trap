# webgl2-graph

Internal zero-dependency WebGL2 graph visualization library. All rendering is hand-written WebGL2 — never add external dependencies.

## Commands

- `npm test` — run vitest (always run before committing)
- `npm run build` — compile library to dist/
- `npm run build:demo` — build demo pages to demo-dist/
- `npm run lint` — oxlint on src/ and tests/
- `npm run fmt` — oxfmt on src/ and tests/

## Structure

- `src/` — renderer library (public API only, no demo-specific code)
- `demo/` — demo applications and demo-specific utilities
- `tests/` — vitest test suite

## Rules

- Never add dependencies. Zero-dep library.
- Keep `src/` minimal. Demo-specific types, color maps, and conversion code belong in `demo/`.
- Run `npm test` before committing.

## Conventions

- Minimal/pragmatic code — no unnecessary abstractions, no over-engineering.
- JSDoc on public API functions and types.
- Performance-first: prefer typed arrays (Float32Array, Uint32Array), avoid allocations in hot paths, use GPU-oriented interleaved data layouts.
- Comments only where logic is non-obvious.

## Tooling

TypeScript 5.3, Vite 7, Vitest 1.x, oxlint, oxfmt.

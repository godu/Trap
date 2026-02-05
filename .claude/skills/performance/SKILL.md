---
name: performance
description: |
  Performance optimization for WebGL2 rendering and JS runtime code.
  Triggers: (1) /performance command with optional file/area argument,
  (2) "optimize", "performance", "slow", "bottleneck" in conversation,
  (3) when spotting perf anti-patterns during normal code work.
  Analyzes GPU pipeline and JS runtime, then applies fixes directly.
argument-hint: "[file or area]"
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash
  - Task
---

# Performance Optimizer

You are a performance optimization specialist for WebGL2 rendering code.
When invoked, analyze the target code and apply fixes directly. Explain each change briefly.

If `$ARGUMENTS` specifies a file or area, focus there. Otherwise, audit the rendering pipeline.

Read the project's CLAUDE.md files first to understand current architecture and constraints.

## GPU Pipeline

- **Draw calls**: minimize count. Prefer instanced rendering over per-object draws.
- **Buffer uploads**: avoid re-uploading unchanged data. Only call `bufferSubData`/`bufferData` when contents change.
- **Uniform caching**: track last-set values; skip redundant `gl.uniform*` calls.
- **State changes**: batch by program, blend mode, VAO. Minimize `useProgram`, `enable`/`disable`, `blendFunc` switches per frame.
- **Culling**: frustum-cull before submitting instances. Use degenerate output in shaders for off-screen geometry.
- **Texture & framebuffer**: avoid creating/destroying per frame. Reuse and resize.
- **Static VAOs**: Drawing from unchanging VAOs is faster; avoid mutating per draw call.
- **Texture atlasing**: Combine textures to reduce bind calls and enable batching.
- **Degenerate triangles**: Join discontinuous strips with zero-area triangles for single draw call.

## Shader Optimization

- **Precision**: Use `lowp` for colors, `mediump` for positions when possible.
- **Branching**: Replace `if` with `step()`/`mix()` for branchless code.
- **Early exit**: Use degenerate `gl_Position = vec4(2.0, 2.0, 0.0, 1.0)` for culled instances.
- **Invariants**: Mark vertex outputs as `flat` when not interpolated.
- **Divisions**: Precompute `1/x` and multiply instead of dividing.
- **Fragment cost**: Move invariant math from fragment to vertex shader.
- **Prefer builtins**: `dot()`, `mix()`, `normalize()` have hardware-optimized implementations.
- **Precision fallback**: Use `#ifdef GL_FRAGMENT_PRECISION_HIGH` for mobile compatibility.

## JS Runtime

- **Hot path allocations**: no `new Array`, `new Object`, `new Map`, closures, or spread inside render loops or per-frame callbacks. Pre-allocate and reuse.
- **Typed arrays**: use `Float32Array`/`Uint32Array` for numeric data. Avoid boxing through generic arrays.
- **GC pressure**: reuse buffers across frames. Avoid temporary objects and string concat in loops.
- **Complexity**: flag O(n^2) or worse in paths that scale with data size. Suggest spatial indexing or caching if applicable.
- **Iteration**: prefer `for` loops over `.forEach`/`.map`/`.filter` chains in hot paths.
- **Math**: use `Math.fround` for float32 precision where relevant. Inline small utilities to avoid call overhead.

## Data Layout

- **Interleaved buffers**: attributes read together should be interleaved for cache locality.
- **SoA vs AoS**: prefer struct-of-arrays when only some fields are accessed per pass; prefer array-of-structs (interleaved) for GPU vertex data.
- **Alignment**: typed array views must not create unaligned access (offset divisible by element byte size).
- **Packing**: pack small values (colors, flags) into fewer bytes where the GPU format allows it.

## Memory Leaks

- Check `destroy()` deletes all GPU resources (buffers, VAOs, programs, textures).
- Verify event listeners use AbortController for cleanup.
- Clear timeouts/intervals in destroy.
- Null out references to allow GC.
- **Lose context eagerly**: Use `WEBGL_lose_context` extension when canvas no longer needed.
- **Delete shaders after linking**: Call `deleteShader()` immediately after successful `linkProgram()`.

## Shader Compilation

- **Batch compilation**: Compile all shaders, then link all programs (don't check status between each).
- **Defer status checks**: Only check `getShaderParameter(COMPILE_STATUS)` if linking fails.
- **KHR_parallel_shader_compile**: Use `COMPLETION_STATUS_KHR` for non-blocking compilation checks.
- **Avoid sync calls**: `getShaderParameter()` and `getProgramParameter()` cause pipeline stalls.

## Texture Optimization

- **Use texStorage + texSubImage**: Better than `texImage2D` for GPU memory allocation.
- **Prefer RGBA8 over RGB8**: RGB formats often emulated as RGBA, surprisingly slow.
- **Compressed formats**: Use S3TC (desktop), ETC (mobile), ASTC (modern) for GPU-compressed textures.
- **Mipmaps**: Call `generateMipmap()` — only 30% memory overhead but huge perf gain when zoomed out.
- **Avoid alpha:false context**: Can be expensive on some platforms; produce alpha=1.0 in shader instead.

## Avoid Blocking Calls

These cause GPU sync and 1ms+ stalls — avoid in render loops:
- `getError()` — only use during development.
- `getParameter()`, `getShaderParameter()`, `getProgramParameter()`.
- `checkFramebufferStatus()`.
- `readPixels()` — use async PBO readback instead (WebGL2).

## Mobile GPU Optimization

- **invalidateFramebuffer**: Discard depth/stencil after use to avoid expensive tile writeback.
- **Reduce overdraw**: Tiled GPUs process each tile; overdraw multiplies cost.
- **Smaller backbuffer**: Consider rendering at lower resolution and upscaling.

## Process

1. **Profile**: Use DevTools to identify actual bottlenecks (don't guess)
2. **Grep audit**: Search for `new `, `.forEach`, `...` in hot paths
3. **Prioritize**: GPU bottlenecks > JS runtime > data layout
4. **Fix incrementally**: One change at a time, test after each
5. **Verify**: Run `npm test`, check FPS, confirm visual correctness
6. **Document**: Add comments explaining non-obvious optimizations

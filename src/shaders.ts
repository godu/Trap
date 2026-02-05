export const vertexSource = `#version 300 es
layout(location = 0) in vec2 a_quadVertex;
layout(location = 1) in vec2 a_position;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_radius;
layout(location = 4) in float a_iconIndex;

uniform vec2 u_scale;
uniform vec2 u_offset;
uniform float u_minRadius;
uniform float u_maxRadius;
uniform vec4 u_viewport;

flat out vec4 v_color;
out vec2 v_uv;
flat out float v_iconIndex;
flat out float v_worldRadius;

void main() {
  float radius = clamp(a_radius, u_minRadius, u_maxRadius);

  // Viewport frustum cull — hide nodes fully outside visible area
  if (a_position.x + radius < u_viewport.x || a_position.x - radius > u_viewport.z ||
      a_position.y + radius < u_viewport.y || a_position.y - radius > u_viewport.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  v_color = a_color;
  v_uv = a_quadVertex;
  v_iconIndex = a_iconIndex;
  v_worldRadius = radius;
  vec2 worldPos = a_position + a_quadVertex * radius;
  gl_Position = vec4(worldPos * u_scale + u_offset, 0.0, 1.0);
}
`;

export const fragmentSource = `#version 300 es
precision mediump float;

flat in vec4 v_color;
in vec2 v_uv;
flat in float v_iconIndex;
flat in float v_worldRadius;

uniform sampler2D u_iconAtlas;
uniform float u_atlasColumns;
uniform float u_atlasRows;
uniform float u_invAtlasCols;
uniform float u_invAtlasRows;

out vec4 outColor;

void main() {
  float dist = dot(v_uv, v_uv);
  // Use step() + smoothstep() instead of discard to preserve early-z on some GPUs
  float inside = step(dist, 1.0);
  float alpha = inside * (1.0 - smoothstep(0.9, 1.0, dist));
  float a = alpha * v_color.a;
  vec3 rgb = v_color.rgb * a;

  // Icon sampling: branchless via step mask
  // Hoist max() to avoid redundant calls (compiler may not optimize across divisions)
  float cols = max(u_atlasColumns, 1.0);
  float hasIcon = step(0.5, v_iconIndex) * step(0.5, u_atlasColumns);
  vec2 iconUV = v_uv * 0.5 + 0.5;
  float idx = v_iconIndex - 1.0;
  float col = mod(idx, cols);
  float row = floor(idx * u_invAtlasCols);
  vec2 atlasUV = vec2((col + iconUV.x) * u_invAtlasCols, (row + 1.0 - iconUV.y) * u_invAtlasRows);
  float iconAlpha = texture(u_iconAtlas, atlasUV).a * hasIcon;
  rgb += iconAlpha * a;

  outColor = vec4(rgb, a);
}
`;

// Edge arrow shaders — instanced rendering of directed curved arrows.
// Template vertex encodes (tParam, perpOffset, flag):
//   tParam:     parametric position along shaft [0..1]
//   perpOffset: perpendicular offset in world units
//   flag:       0 = shaft, 1 = head base, 2 = head tip
export const edgeVertexSource = `#version 300 es
layout(location = 0) in vec3 a_template;
layout(location = 1) in vec2 a_source;
layout(location = 2) in vec2 a_target;
layout(location = 3) in vec4 a_color;
layout(location = 4) in vec2 a_radii;
layout(location = 5) in float a_width;

uniform vec2 u_scale;
uniform vec2 u_offset;
uniform float u_headLength;
uniform float u_curvature;
uniform vec4 u_viewport;
uniform float u_minRadius;
uniform float u_maxRadius;
uniform float u_pxPerWorld;

flat out vec4 v_color;
out float v_edgeDist;
flat out float v_halfWidthPx;

void main() {
  vec2 delta = a_target - a_source;
  float lenSq = dot(delta, delta);

  // Early exit: degenerate or overlapping nodes
  if (lenSq < 0.000001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  float srcRadius = clamp(a_radii.x, u_minRadius, u_maxRadius);
  float tgtRadius = clamp(a_radii.y, u_minRadius, u_maxRadius);
  float maxR = max(srcRadius, tgtRadius);

  // Compute length for viewport cull (defer direction vectors until after cull)
  float invLen = inversesqrt(lenSq);
  float fullLen = lenSq * invLen;
  float curvePad = fullLen * u_curvature;

  // Early exit: viewport frustum cull (expanded for curve bulge)
  float pad = maxR + abs(curvePad);
  vec2 emin = min(a_source, a_target) - pad;
  vec2 emax = max(a_source, a_target) + pad;
  if (emax.x < u_viewport.x || emin.x > u_viewport.z ||
      emax.y < u_viewport.y || emin.y > u_viewport.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // Early exit: edges with no visible shaft
  float usableLen = fullLen - srcRadius - tgtRadius;
  if (usableLen < 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  // Compute direction vectors (only for edges that pass culling)
  vec2 fwd = delta * invLen;
  vec2 right = vec2(-fwd.y, fwd.x);
  float curveDist = curvePad;

  v_color = a_color;

  // Quadratic Bezier: B(t) = (1-t)^2*P0 + 2t(1-t)*P1 + t^2*P2
  // Control point offset to the right of source->target
  vec2 ctrl = (a_source + a_target) * 0.5 + right * curveDist;

  // Bezier speed at endpoints for world-to-parameter conversion
  float halfLen = fullLen * 0.5;
  float armLen = sqrt(halfLen * halfLen + curveDist * curveDist);
  float speed0 = 2.0 * armLen;

  // Parametric insets using per-node radii
  float invSpeed0 = 1.0 / speed0;
  float tStart = srcRadius * invSpeed0;
  float tEnd = 1.0 - tgtRadius * invSpeed0;
  float tRange = tEnd - tStart;

  float headLen = min(u_headLength, usableLen * 0.4);
  float headT = headLen * invSpeed0;

  float tParam = a_template.x;
  float flag = a_template.z;

  // Compute Bezier parameter
  float s0 = step(0.5, flag);  // 1 for head base/tip
  float s1 = step(1.5, flag);  // 1 for head tip only

  // Minimum shaft width: ensure at least 1px (0.5px half-width)
  float shaftHwPx = 0.2 * a_width * u_pxPerWorld;
  float minScale = max(1.0, 0.5 / max(shaftHwPx, 0.001));
  float effectiveWidth = a_width * minScale;
  float perpOffset = a_template.y * effectiveWidth;

  // 1px AA expansion outward (shaft only)
  perpOffset += (1.0 - s0) * sign(a_template.y) / max(u_pxPerWorld, 0.001);

  float effectiveHwPx = max(shaftHwPx, 0.5);
  v_edgeDist = mix(perpOffset * u_pxPerWorld, 0.0, s0);
  v_halfWidthPx = mix(effectiveHwPx, 1000.0, s0);
  // shaft: tStart + tParam * (tRange - headT)
  // head base: tEnd - headT
  // head tip: tEnd
  float shaftT = tStart + tParam * (tRange - headT);
  float headBaseT = tEnd - headT;
  float t = mix(shaftT, mix(headBaseT, tEnd, s1), s0);

  // Evaluate Bezier position
  float omt = 1.0 - t;
  vec2 curvePos = omt * omt * a_source + 2.0 * t * omt * ctrl + t * t * a_target;

  // Tangent: B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1)
  vec2 tangent = 2.0 * omt * (ctrl - a_source) + 2.0 * t * (a_target - ctrl);
  float tanLen = length(tangent);
  vec2 tanDir = tangent / max(tanLen, 0.0001);
  vec2 perpDir = vec2(-tanDir.y, tanDir.x);

  vec2 pos = curvePos + perpDir * perpOffset;
  gl_Position = vec4(pos * u_scale + u_offset, 0.0, 1.0);
}
`;

export const edgeFragmentSource = `#version 300 es
precision lowp float;

flat in vec4 v_color;
in float v_edgeDist;
flat in float v_halfWidthPx;

out vec4 outColor;

void main() {
  float d = abs(v_edgeDist);
  float aa = clamp(v_halfWidthPx + 0.5 - d, 0.0, 1.0);
  outColor = v_color * aa;
}
`;

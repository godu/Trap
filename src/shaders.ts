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

flat out vec4 v_color;
out vec2 v_uv;
flat out float v_iconIndex;
flat out float v_worldRadius;

void main() {
  v_color = a_color;
  v_uv = a_quadVertex;
  float radius = clamp(a_radius, u_minRadius, u_maxRadius);
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
uniform float u_iconLodRadius;

out vec4 outColor;

void main() {
  float dist = dot(v_uv, v_uv);
  float alpha = 1.0 - smoothstep(0.81, 1.0, dist);
  float a = alpha * v_color.a;
  vec4 base = vec4(v_color.rgb * a, a);

  if (v_iconIndex > 0.5 && v_worldRadius > u_iconLodRadius && u_atlasColumns > 0.0) {
    vec2 cellUV = v_uv * 0.5 + 0.5;
    float iconScale = 1.0;
    vec2 iconUV = (cellUV - 0.5) / iconScale + 0.5;

    if (iconUV.x >= 0.0 && iconUV.x <= 1.0 && iconUV.y >= 0.0 && iconUV.y <= 1.0) {
      float idx = v_iconIndex - 1.0;
      float col = mod(idx, u_atlasColumns);
      float row = floor(idx / u_atlasColumns);
      vec2 atlasUV = vec2(
        (col + iconUV.x) / u_atlasColumns,
        (row + 1.0 - iconUV.y) / u_atlasRows
      );
      float iconAlpha = texture(u_iconAtlas, atlasUV).a;
      float lodFade = smoothstep(u_iconLodRadius, u_iconLodRadius * 1.5, v_worldRadius);
      float ia = iconAlpha * a * lodFade;
      base = vec4(base.rgb + ia, base.a);
    }
  }

  outColor = base;
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

flat out vec4 v_color;

void main() {
  float srcRadius = clamp(a_radii.x, u_minRadius, u_maxRadius);
  float tgtRadius = clamp(a_radii.y, u_minRadius, u_maxRadius);

  vec2 delta = a_target - a_source;
  float lenSq = dot(delta, delta);

  // Degenerate or overlapping nodes — hide
  if (lenSq < 0.000001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  float invLen = inversesqrt(lenSq);
  float fullLen = lenSq * invLen;
  vec2 fwd = delta * invLen;
  vec2 right = vec2(-fwd.y, fwd.x);
  float curveDist = fullLen * u_curvature;

  // Viewport frustum cull — expand for curve bulge
  float maxR = max(srcRadius, tgtRadius);
  float pad = maxR + abs(curveDist);
  vec2 emin = min(a_source, a_target) - pad;
  vec2 emax = max(a_source, a_target) + pad;
  if (emax.x < u_viewport.x || emin.x > u_viewport.z ||
      emax.y < u_viewport.y || emin.y > u_viewport.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  float usableLen = fullLen - srcRadius - tgtRadius;
  if (usableLen < 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  v_color = a_color;

  // Quadratic Bezier: B(t) = (1-t)^2*P0 + 2t(1-t)*P1 + t^2*P2
  // Control point offset to the right of source->target
  vec2 ctrl = (a_source + a_target) * 0.5 + right * curveDist;

  // Bezier speed at endpoints for world-to-parameter conversion
  float halfLen = fullLen * 0.5;
  float armLen = sqrt(halfLen * halfLen + curveDist * curveDist);
  float speed0 = 2.0 * armLen;

  // Parametric insets using per-node radii
  float tStart = srcRadius / speed0;
  float tEnd = 1.0 - tgtRadius / speed0;
  float tRange = tEnd - tStart;

  float headLen = min(u_headLength, usableLen * 0.4);
  float headT = headLen / speed0;

  float tParam = a_template.x;
  float perpOffset = a_template.y * a_width;
  float flag = a_template.z;

  // Compute Bezier parameter
  float s0 = step(0.5, flag);  // 1 for head base/tip
  float s1 = step(1.5, flag);  // 1 for head tip only
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
precision mediump float;

flat in vec4 v_color;

out vec4 outColor;

void main() {
  outColor = v_color;
}
`;


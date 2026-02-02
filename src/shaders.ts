export const vertexSource = `#version 300 es
layout(location = 0) in vec2 a_quadVertex;
layout(location = 1) in vec2 a_position;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_radius;

uniform vec2 u_scale;
uniform vec2 u_offset;

out vec3 v_color;
out vec2 v_uv;

void main() {
  v_color = a_color.rgb;
  v_uv = a_quadVertex;
  vec2 worldPos = a_position + a_quadVertex * a_radius;
  gl_Position = vec4(worldPos * u_scale + u_offset, 0.0, 1.0);
}
`;

export const fragmentSource = `#version 300 es
precision highp float;

in vec3 v_color;
in vec2 v_uv;

out vec4 outColor;

void main() {
  float dist = length(v_uv);
  if (dist > 1.0) discard;
  float alpha = 1.0 - smoothstep(0.9, 1.0, dist);
  outColor = vec4(v_color * alpha, alpha);
}
`;

// Edge arrow shaders — instanced rendering of directed arrows.
// Template vertex encodes (tParam, perpOffset, flag):
//   tParam:     parametric position along shaft [0..1]
//   perpOffset: perpendicular offset in world units
//   flag:       0 = shaft, 1 = head base, 2 = head tip
export const edgeVertexSource = `#version 300 es
layout(location = 0) in vec3 a_template;
layout(location = 1) in vec2 a_source;
layout(location = 2) in vec2 a_target;
layout(location = 3) in vec4 a_color;

uniform vec2 u_scale;
uniform vec2 u_offset;
uniform float u_headLength;
uniform float u_nodeRadius;
uniform vec4 u_viewport;

flat out vec4 v_color;

void main() {
  // Viewport frustum cull — before expensive math
  vec2 emin = min(a_source, a_target) - u_nodeRadius;
  vec2 emax = max(a_source, a_target) + u_nodeRadius;
  if (emax.x < u_viewport.x || emin.x > u_viewport.z ||
      emax.y < u_viewport.y || emin.y > u_viewport.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  v_color = a_color;

  float tParam = a_template.x;
  float perpOffset = a_template.y;
  float flag = a_template.z;

  vec2 delta = a_target - a_source;
  float lenSq = dot(delta, delta);

  // Degenerate or overlapping nodes — hide
  if (lenSq < 0.000001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  float invLen = inversesqrt(lenSq);
  vec2 fwd = delta * invLen;
  vec2 right = vec2(-fwd.y, fwd.x);

  float fullLen = lenSq * invLen;
  float usableLen = fullLen - 2.0 * u_nodeRadius;
  if (usableLen < 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec2 startPt = a_source + fwd * u_nodeRadius;

  float headLen = min(u_headLength, usableLen * 0.4);
  float shaftLen = usableLen - headLen;

  float s0 = step(0.5, flag);
  float s1 = step(1.5, flag);
  float along = mix(tParam * shaftLen, mix(shaftLen, usableLen, s1), s0);

  vec2 pos = startPt + fwd * along + right * perpOffset;
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

// Edge LOD line shader — simple GL_LINES when zoomed out (arrows sub-pixel).
// Two vertices per instance: endpoint 0.0 (source) and 1.0 (target).
export const edgeLineVertexSource = `#version 300 es
layout(location = 0) in float a_endpoint;
layout(location = 1) in vec2 a_source;
layout(location = 2) in vec2 a_target;
layout(location = 3) in vec4 a_color;

uniform vec2 u_scale;
uniform vec2 u_offset;
uniform vec4 u_viewport;

flat out vec4 v_color;

void main() {
  vec2 lo = min(a_source, a_target);
  vec2 hi = max(a_source, a_target);
  if (hi.x < u_viewport.x || lo.x > u_viewport.z ||
      hi.y < u_viewport.y || lo.y > u_viewport.w) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  v_color = a_color;
  vec2 pos = mix(a_source, a_target, a_endpoint);
  gl_Position = vec4(pos * u_scale + u_offset, 0.0, 1.0);
}
`;

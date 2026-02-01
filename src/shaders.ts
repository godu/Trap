export const vertexSource = `#version 300 es
layout(location = 0) in vec2 a_quadVertex;
layout(location = 1) in vec2 a_position;
layout(location = 2) in vec3 a_color;
layout(location = 3) in float a_radius;

uniform mat4 u_projection;

out vec3 v_color;
out vec2 v_uv;

void main() {
  v_color = a_color;
  v_uv = a_quadVertex;
  vec2 worldPos = a_position + a_quadVertex * a_radius;
  gl_Position = u_projection * vec4(worldPos, 0.0, 1.0);
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
  outColor = vec4(v_color, alpha);
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

uniform mat4 u_projection;
uniform float u_headLength;
uniform float u_nodeRadius;

out vec4 v_color;

void main() {
  v_color = a_color;

  float tParam = a_template.x;
  float perpOffset = a_template.y;
  float flag = a_template.z;

  vec2 delta = a_target - a_source;
  float fullLen = length(delta);

  // Degenerate or overlapping nodes — hide
  if (fullLen < 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec2 fwd = delta / fullLen;
  vec2 right = vec2(-fwd.y, fwd.x);

  float usableLen = fullLen - 2.0 * u_nodeRadius;
  if (usableLen < 0.001) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }

  vec2 startPt = a_source + fwd * u_nodeRadius;

  float headLen = min(u_headLength, usableLen * 0.4);
  float shaftLen = usableLen - headLen;

  float along;
  if (flag < 0.5) {
    along = tParam * shaftLen;
  } else if (flag < 1.5) {
    along = shaftLen;
  } else {
    along = usableLen;
  }

  vec2 pos = startPt + fwd * along + right * perpOffset;
  gl_Position = u_projection * vec4(pos, 0.0, 1.0);
}
`;

export const edgeFragmentSource = `#version 300 es
precision highp float;

in vec4 v_color;

out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

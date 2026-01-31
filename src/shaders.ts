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

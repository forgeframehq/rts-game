// Painted sprites (buildings, trees, mines): team colour replaces the magenta in the art,
// the same rule as recolor() in js/art.js. Unlit, cut-out edges so the depth buffer sorts them.
shader_type spatial;
render_mode unshaded, cull_disabled;
uniform sampler2D tex : filter_linear_mipmap, repeat_disable;
uniform vec3 team = vec3(-1.0);     // sRGB 0..1; negative = leave the art as painted
uniform float shade = 1.0;          // fog: explored but not in sight
uniform float flash = 0.0;          // hit flash

void fragment() {
	vec4 c = texture(tex, UV);
	if (c.a < 0.5) discard;
	vec3 s = c.rgb * 255.0;
	if (team.r >= 0.0) {
		float lo = min(s.r, s.b);
		float m = clamp((lo - s.g - 18.0) / 40.0, 0.0, 1.0) * clamp(1.0 - (abs(s.r - s.b) - 70.0) / 80.0, 0.0, 1.0);
		float lum = min(1.35, (s.r + s.b) / 2.0 / 210.0);
		s = mix(s, min(vec3(255.0), team * 255.0 * lum), m);
	}
	vec3 col = s / 255.0 * shade;
	ALBEDO = mix(col, vec3(1.0), flash);
}

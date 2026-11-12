// 3D units: the model's own paint, with team colour in place of the magenta cloth,
// lit softly so they sit with the painted buildings.
shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;
uniform float gamma = 1.0;
uniform vec3 team = vec3(-1.0);
uniform float flash = 0.0;
uniform float shade = 1.0;
void fragment() {
	vec3 s = COLOR.rgb * 255.0;   // the paint is on the vertices (tools/godot_models/shrink.mjs)
	if (team.r >= 0.0) {
		float lo = min(s.r, s.b);
		float m = clamp((lo - s.g - 18.0) / 40.0, 0.0, 1.0) * clamp(1.0 - (abs(s.r - s.b) - 70.0) / 80.0, 0.0, 1.0);
		float lum = min(1.35, (s.r + s.b) / 2.0 / 210.0);
		s = mix(s, min(vec3(255.0), team * 255.0 * lum), m);
	}
	ALBEDO = mix(pow(s / 255.0, vec3(gamma)) * shade, vec3(1.0), flash);
	ROUGHNESS = 1.0;
}

// The ground: photo textures blended by the terrain map, darkened by the fog of war.
// wa = grass A, grass B, dirt, sand; wb = water, shallows, rock, forest floor (one texel per tile, smoothed).
shader_type spatial;
render_mode unshaded;
// The ground is drawn at the far end of the depth range: sprites lean back from the camera, so the
// lower half of a building's painting dips below ground level and must not be cut off by it.
uniform sampler2D wa : filter_linear, repeat_disable;
uniform sampler2D wb : filter_linear, repeat_disable;
uniform sampler2D fog : filter_linear, repeat_disable;   // r = in sight, g = explored
uniform sampler2D grass_a : filter_linear_mipmap, repeat_enable;
uniform sampler2D grass_b : filter_linear_mipmap, repeat_enable;
uniform sampler2D dirt : filter_linear_mipmap, repeat_enable;
uniform sampler2D sand : filter_linear_mipmap, repeat_enable;
uniform sampler2D water : filter_linear_mipmap, repeat_enable;
uniform sampler2D shallows : filter_linear_mipmap, repeat_enable;
uniform sampler2D rock : filter_linear_mipmap, repeat_enable;
uniform sampler2D forest : filter_linear_mipmap, repeat_enable;
uniform float tiles = 72.0;
uniform float reveal = 0.0;

void vertex() {
	POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	POSITION.z = 0.00002 * POSITION.w;   // reversed depth: 0 is the far plane
}

void fragment() {
	vec2 t = UV * tiles;
	vec2 d = t / 4.0;                       // a photo covers 4 tiles
	vec4 a = texture(wa, UV), b = texture(wb, UV);
	vec3 c = texture(grass_a, d).rgb * a.r + texture(grass_b, d).rgb * a.g + texture(dirt, d).rgb * a.b + texture(sand, d).rgb * a.a
		+ texture(water, d + vec2(TIME * 0.01, TIME * 0.006)).rgb * b.r + texture(shallows, d).rgb * b.g + texture(rock, d).rgb * b.b + texture(forest, d).rgb * b.a;
	float w = a.r + a.g + a.b + a.a + b.r + b.g + b.b + b.a;
	c /= max(w, 0.001);
	vec2 f = texture(fog, UV).rg;
	float lit = mix(mix(0.0, 0.45, f.g), 1.0, f.r);
	lit = max(lit, reveal);
	ALBEDO = c * lit;
}

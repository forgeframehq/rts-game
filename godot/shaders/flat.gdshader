// Art that lies flat on the ground (fields, foundations, rubble): the same cut-out, no team colour.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform sampler2D tex : filter_linear_mipmap, repeat_disable;
uniform float shade = 1.0;
uniform float alpha = 1.0;
void fragment() {
	vec4 c = texture(tex, UV);
	ALBEDO = c.rgb * shade;
	ALPHA = c.a * alpha;
}

extends Node
## Painted art: the manifest shared with the web edition, textures and sprite materials.

const PX := 1.41421356 / 64.0      # world units per display pixel: a 64 px tile is one tile diagonal
const AGE_TIER := ["", "dark", "feudal", "castle", "imp"]

var man: Dictionary = {}
var stages: Dictionary = {}
var _tex := {}
var _mat := {}
var _sprite_shader: Shader = preload("res://shaders/sprite.gdshader")
var _flat_shader: Shader = preload("res://shaders/flat.gdshader")

func _init() -> void:
	man = JSON.parse_string(FileAccess.get_file_as_string("res://assets/manifest.json"))

func has(k: String) -> bool:
	return man.has(k)

func tex(file: String) -> Texture2D:
	if not _tex.has(file): _tex[file] = load("res://" + file)
	return _tex[file]

## One material per texture and team colour (c.a < 0 means "as painted").
func sprite_mat(file: String, team = null) -> ShaderMaterial:
	var k: String = file + "|" + (team.to_html(false) if team != null else "")
	if _mat.has(k): return _mat[k]
	var m := ShaderMaterial.new()
	m.shader = _sprite_shader
	m.set_shader_parameter("tex", tex(file))
	if team != null: m.set_shader_parameter("team", Vector3(team.r, team.g, team.b))
	_mat[k] = m
	return m

func flat_mat(file: String) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = _flat_shader
	m.set_shader_parameter("tex", tex(file))
	return m

func region_of(owner_: int) -> String:
	return D.REGION.get(G.players[owner_].civ, "western") if G.players.has(owner_) else "western"

## The art key for a building: its dynasty's style and its owner's Age, falling back to the western set.
func bld_key(type: String, owner_: int) -> String:
	# farms are the same field everywhere: one shared look for every dynasty and every Age
	if type == "farm" or type == "farm_spent": return type
	var r := region_of(owner_)
	var west := r == "western"
	var tier: String = AGE_TIER[E.age_of(owner_)] if owner_ > 0 else ""
	var tries := []
	if tier != "":
		if not west: tries.append("%s_%s_%s" % [r, type, tier])
		tries.append("%s_%s" % [type, tier])
	if not west: tries.append("%s_%s" % [r, type])
	for k in tries:
		if man.has(k): return k
	return type

## painted construction stage n (1 bare frame, 2 half built) of this owner's building, or ""
func stage_key(type: String, owner_: int, n: int) -> String:
	var k := "%s_s%d" % [bld_key(type, owner_), n]
	if man.has(k): return k
	var w := type + ("_dark" if E.age_of(owner_) == 1 and man.has(type + "_dark_s1") else "") + "_s1"
	return w if man.has(w) else ""

## A standing sprite for a manifest entry: a Sprite3D whose anchor point sits at the node's origin.
func make_sprite(key: String, team = null) -> Sprite3D:
	var d: Dictionary = man[key]
	var s := Sprite3D.new()
	s.texture = tex(d.file)
	s.centered = false
	var sw: float = d.get("sw", s.texture.get_width())
	var sh: float = d.get("sh", s.texture.get_height())
	if d.has("sx"):
		s.region_enabled = true
		s.region_rect = Rect2(d.sx, d.sy, sw, sh)
	var kx: float = sw / d.w
	var ky: float = sh / d.h
	s.pixel_size = PX / kx
	s.offset = Vector2(-d.ax * kx, -(d.h - d.ay) * ky)
	s.material_override = sprite_mat(d.file, team)
	s.set_meta("key", key)
	return s

## Art laid flat on the ground over a square plot: the plot's corners are mapped to the
## diamond the painting shows them at, so a field lies under the feet of whoever walks on it.
func make_flat(key: String, size: int) -> MeshInstance3D:
	var d: Dictionary = man[key]
	var t := tex(d.file)
	var sw: float = d.get("sw", t.get_width())
	var sh: float = d.get("sh", t.get_height())
	var ox: float = d.get("sx", 0)
	var oy: float = d.get("sy", 0)
	var kx: float = sw / d.w
	var ky: float = sh / d.h
	var uv := func(px: float, py: float) -> Vector2:
		return Vector2((ox + px * kx) / t.get_width(), (oy + py * ky) / t.get_height())
	var h := size / 2.0
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	# corners relative to the plot centre: (x, z) and where the painting shows them
	var corners := [[-h, -h, 0.0, -size * 16.0], [h, -h, size * 32.0, 0.0], [h, h, 0.0, size * 16.0], [-h, h, -size * 32.0, 0.0]]
	for i in [0, 1, 2, 0, 2, 3]:
		var c: Array = corners[i]
		st.set_uv(uv.call(d.ax + c[2], d.ay + c[3]))
		st.add_vertex(Vector3(c[0], 0, c[1]))
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = flat_mat(d.file)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

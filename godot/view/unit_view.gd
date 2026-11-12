extends Node3D
## One unit on the map: a rigged 3D model playing clips from the shared library, picked the way
## pick3d()/draw3d() in js/art.js pick sprite animations. A unit with no model yet shows as a
## plain figure in its team colour.

const Clips := preload("res://view/clips.gd")
const HEIGHT := 1.0           # world units for a 1.75 m figure, matching the painted sprites
const JOB := {"militia": "j_sword", "spearman": "j_spear", "archer": "j_arch", "longbowman": "j_longbow", "knight": "j_knight",
	"scout": "j_scout", "king": "j_king", "queen": "j_queen", "monk": "j_monk", "axethrower": "j_axe", "cataphract": "j_cata",
	"repeater": "j_repeat", "ram": "j_ram", "trebuchet": "j_trebuchet"}
const WORK := {"tree": "chop", "gold": "mine", "stone": "mine", "berry": "forage"}
const CARRY_ANIM := {"wood": "carry_wood", "gold": "carry_ore", "stone": "carry_ore", "food": "carry_food"}
const IMPACT := {"militia": {"attack": 0.5, "attack2": 0.4}, "spearman": {"attack": 0.55, "attack2": 0.35}, "archer": {"attack": 0.92},
	"longbowman": {"attack": 0.92}, "knight": {"attack": 0.45}, "axethrower": {"attack": 0.62, "attack2": 0.45}, "cataphract": {"attack": 0.45},
	"repeater": {"attack": 0.92}, "ram": {"attack": 0.8}, "trebuchet": {"attack": 0.45}, "elephant": {"attack": 0.55}, "kamayuk": {"attack": 0.5}, "templeguard": {"attack": 0.5}}

static var _recipes: Dictionary = {}
static var _unit_shader: Shader = preload("res://shaders/unit.gdshader")
static var _mats := {}

var player: AnimationPlayer
var recipe: Dictionary = {}
var yaw := 0.0
var has_model := false
var _mat: ShaderMaterial
var _last_cool := -1.0
var _swing := 0
var _clip := ""

static func recipes() -> Dictionary:
	if _recipes.is_empty(): _recipes = JSON.parse_string(FileAccess.get_file_as_string("res://data/unit_anims.json"))
	return _recipes

static func model_path(u: Dictionary) -> String:
	var civ: String = G.players[u.owner].civ if G.players.has(u.owner) else "britons"
	var reg: String = D.REGION.get(civ, "western")
	var sfx: String = ("_" + u.sex) if u.type == "villager" else ""
	for k in ["%s_%s%s" % [civ, u.type, sfx], "%s_%s%s" % [reg, u.type, sfx], "britons_%s%s" % [u.type, sfx], "western_%s%s" % [u.type, sfx]]:
		var p := "res://models/%s.glb" % k
		if ResourceLoader.exists(p): return p
	return ""

func setup(u: Dictionary) -> void:
	var team := G.color_of(u.owner)
	var path := model_path(u)
	if path == "":
		_placeholder(u, team)
		return
	has_model = true
	var body: Node3D = (load(path) as PackedScene).instantiate()
	add_child(body)
	var old: Node = body.find_child("AnimationPlayer", true, false)
	if old != null: old.free()
	var h := 1.75
	for mi in body.find_children("*", "MeshInstance3D", true, false):
		h = maxf(0.5, mi.get_aabb().end.y)
		var key: String = team.to_html(false)
		if not _mats.has(key):
			var m := ShaderMaterial.new()
			m.shader = _unit_shader
			m.set_shader_parameter("team", Vector3(team.r, team.g, team.b))
			_mats[key] = m
		mi.material_override = _mats[key]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.scale = Vector3.ONE * (HEIGHT / h) * (1.12 if u.def.cls == "hero" else 1.0)
	player = AnimationPlayer.new()
	body.add_child(player)
	player.root_node = player.get_path_to(body)
	player.add_animation_library("", Clips.library())
	var job: String = ("villager_jobs_f" if u.sex == "f" else "villager_jobs") if u.type == "villager" else JOB.get(u.type, "j_sword")
	var tier: int = u.def.get("tier", 0)
	var all := recipes()
	while tier > 0 and not all.has("%s_t%d" % [job, tier]): tier -= 1
	recipe = all.get(("%s_t%d" % [job, tier]) if tier > 0 else job, all.get(job, {})).get("anims", {})
	# a soft shadow under the feet
	_shadow()

func _placeholder(u: Dictionary, team: Color) -> void:
	var mi := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	var big: bool = u.def.cls == "cav" or u.def.get("siege", false)
	cm.radius = 0.28 if big else 0.16; cm.height = 0.95 if big else 0.8
	mi.mesh = cm; mi.position.y = cm.height / 2
	var m := StandardMaterial3D.new(); m.albedo_color = team; m.roughness = 1.0
	mi.material_override = m
	add_child(mi)
	_shadow()

func _shadow() -> void:
	var mi := MeshInstance3D.new()
	var q := QuadMesh.new(); q.size = Vector2(0.62, 0.62); q.orientation = PlaneMesh.FACE_Y
	mi.mesh = q; mi.position.y = 0.015
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_texture = _blob(); m.albedo_color = Color(0, 0, 0, 0.38)
	mi.material_override = m
	add_child(mi)

static var _blob_tex: Texture2D
static func _blob() -> Texture2D:
	if _blob_tex == null:
		var g := Gradient.new(); g.set_color(0, Color(1, 1, 1, 1)); g.set_color(1, Color(1, 1, 1, 0))
		var t := GradientTexture2D.new(); t.gradient = g; t.fill = GradientTexture2D.FILL_RADIAL
		t.fill_from = Vector2(0.5, 0.5); t.fill_to = Vector2(1.0, 0.5); t.width = 64; t.height = 64
		_blob_tex = t
	return _blob_tex

## which animations to try, best first (pick3d in js/art.js)
func _pick(u: Dictionary) -> Array:
	if u.path.size() > 0:
		if u.carry != null and u.carry.amt >= 1 and (u.task.t == "return" or u.carry.amt >= D.CARRY - 0.01): return [CARRY_ANIM[u.carry.res], "walk"]
		return ["walk"]
	if u.working:
		var t: Dictionary = u.task
		if t.t == "gather": return [WORK.get(t.rtype, "chop"), "idle"]
		if t.t == "farm": return ["forage", "idle"]
		if t.t == "build":
			var b = G.by_id.get(t.id)
			return ["forage", "idle"] if (b != null and b.type == "farm") else ["build", "idle"]
		if t.t == "attack": return ["attack", "chop", "idle"]
	return ["idle"]

## hold the named animation at phase 0..1 of its stretch of the clip
func _pose(anim: String, phase: float) -> void:
	var r: Dictionary = recipe[anim]
	var clip: String = r.clip
	if not player.has_animation(clip): return
	var length := player.get_animation(clip).length
	var a: float = r.get("start", 0.0) if r.get("start") != null else 0.0
	var b: float = r.get("end", 1.0) if r.get("end") != null else 1.0
	if clip != _clip:
		player.play(clip); player.speed_scale = 0.0; _clip = clip
	player.seek((a + (b - a) * clampf(phase, 0.0, 0.999)) * length, true)

func update(u: Dictionary, dt: float) -> void:
	position = Vector3(u.x, 0, u.y)
	# heading: the way it walks, or the screen direction the rules turned it to
	var hx := 0.0
	var hy := 0.0
	if u.path.size() > 0 and u.hx != null:
		hx = u.hx; hy = u.hy
	else:
		var a: float = maxi(0, u.dir) * PI / 4.0
		var sx := sin(a)
		var sy := cos(a)
		hx = sy + sx / 2.0; hy = sy - sx / 2.0
	if absf(hx) + absf(hy) > 0.001:
		yaw = lerp_angle(yaw, atan2(hx, hy), minf(1.0, dt * 10.0))
	rotation.y = yaw
	if not has_model or recipe.is_empty(): return
	var anim := ""
	for n in _pick(u):
		if recipe.has(n):
			anim = n; break
	if anim == "": return
	var r: Dictionary = recipe[anim]
	var moving: bool = u.path.size() > 0
	var loop_t: float = G.time + (u.id % 7) * 0.37
	if anim == "attack" and not moving:
		# the swing is locked to the real hit, with a combat stance between swings and a flinch when struck
		var rate: float = u.def.get("rate", 2)
		var cool: float = maxf(0.0, u.cool)
		if _last_cool >= 0 and cool > _last_cool + 0.01: _swing += 1
		_last_cool = cool
		var use := "attack2" if (_swing % 2 == 1 and recipe.has("attack2")) else "attack"
		var imp: float = IMPACT.get(u.type, {}).get(use, 0.9 if u.def.get("ranged", false) else 0.55)
		var rr: Dictionary = recipe[use]
		var seg: float = _seg_len(rr)
		var T := minf(rate * 0.95, seg)
		var e := rate - cool
		var ph := -1.0
		if e < (1 - imp) * T: ph = imp + e / T            # follow-through after the hit
		elif cool <= imp * T: ph = imp - cool / T         # wind-up into the next hit
		if ph >= 0:
			_pose(use, ph); return
		if u.hurtT > 0 and recipe.has("hit"):
			_pose("block" if ((u.id + _swing) % 3 == 0 and recipe.has("block")) else "hit", 1 - u.hurtT / 0.6); return
		var rest := "ready" if recipe.has("ready") else "idle"
		_pose(rest, fposmod(loop_t / _seg_len(recipe[rest]), 1.0)); return
	if not moving and u.hurtT > 0 and u.type != "villager" and recipe.has("hit"):
		_pose("hit", 1 - u.hurtT / 0.6); return
	if moving:
		_pose(anim, fposmod(u.dist / float(r.get("stride", 0.95)), 1.0))
	else:
		_pose(anim, fposmod(loop_t / _seg_len(r), 1.0))

func _seg_len(r: Dictionary) -> float:
	if not player.has_animation(r.clip): return 1.0
	var a: float = r.get("start", 0.0) if r.get("start") != null else 0.0
	var b: float = r.get("end", 1.0) if r.get("end") != null else 1.0
	return maxf(0.2, (b - a) * player.get_animation(r.clip).length)

extends Node3D
## One unit on the map: a rigged 3D model playing clips from the shared library, picked the way
## pick3d()/draw3d() in js/art.js pick sprite animations. A unit with no model yet shows as a
## plain figure in its team colour.

const Clips := preload("res://view/clips.gd")
const HEIGHT := 1.0           # world units for a 1.75 m figure, matching the painted sprites
const JOB := {"militia": "j_sword", "spearman": "j_spear", "archer": "j_arch", "longbowman": "j_longbow", "knight": "j_knight",
	"scout": "j_scout", "king": "j_king", "queen": "j_queen", "monk": "j_monk", "axethrower": "j_axe", "cataphract": "j_cata",
	"repeater": "j_repeat", "ram": "j_ram", "trebuchet": "j_trebuchet"}
const STAND_IN := {"scout": "knight", "cataphract": "knight", "monk": "villager_m", "axethrower": "militia", "repeater": "archer",
	"kamayuk": "spearman", "templeguard": "militia"}
## Soldiers fight with the Mixamo packs: sword and shield for the militia line, great sword for
## knights and kings, axe for axe throwers. Anything not listed keeps its Meshy clip.
const SS := {"idle": "ss_sword_and_shield_idle", "walk": "ss_sword_and_shield_walk", "attack": "ss_sword_and_shield_slash", "attack2": "ss_sword_and_shield_attack_2",
	"ready": "ss_sword_and_shield_block_idle", "hit": "ss_sword_and_shield_impact", "block": "ss_sword_and_shield_block", "death": "ss_sword_and_shield_death"}
const GS := {"idle": "gs_great_sword_idle", "walk": "gs_great_sword_walk", "attack": "gs_great_sword_slash", "attack2": "gs_great_sword_attack",
	"ready": "gs_great_sword_idle", "hit": "gs_great_sword_impact", "block": "gs_great_sword_blocking_2", "death": "gs_two_handed_sword_death"}
const AX := {"idle": "ax_standing_idle", "walk": "ax_standing_walk_forward", "attack": "ax_standing_melee_attack_downward", "attack2": "ax_standing_melee_attack_horizontal",
	"ready": "ax_standing_block_idle", "hit": "ax_standing_react_large_gut", "death": "Death01"}
const MIX := {"militia": SS, "templeguard": SS, "knight": GS, "scout": GS, "cataphract": GS, "king": GS, "axethrower": AX}
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
var _skeleton: Skeleton3D
var _props := {}          # prop set signature -> Array of nodes
var _prop_sig := ""
var _team := Color.WHITE

## team colours change between matches
static func reset() -> void:
	_mats = {}

static func recipes() -> Dictionary:
	if _recipes.is_empty(): _recipes = JSON.parse_string(FileAccess.get_file_as_string("res://data/unit_anims.json"))
	return _recipes

static func model_path(u: Dictionary) -> String:
	var civ: String = G.players[u.owner].civ if G.players.has(u.owner) else "britons"
	var reg: String = D.REGION.get(civ, "western")
	var sfx: String = ("_" + u.sex) if u.type == "villager" else ""
	# units with no model of their own borrow the nearest one until theirs is made
	var type: String = STAND_IN.get(u.type, u.type)
	for k in ["%s_%s%s" % [civ, type, sfx], "%s_%s%s" % [reg, type, sfx], "britons_%s%s" % [type, sfx], "western_%s%s" % [type, sfx], "franks_%s%s" % [type, sfx]]:
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
	_team = team
	var body: Node3D = (load(path) as PackedScene).instantiate()
	add_child(body)
	_skeleton = body.find_child("Skeleton3D", true, false)
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
	recipe = (all.get(("%s_t%d" % [job, tier]) if tier > 0 else job, all.get(job, {})).get("anims", {}) as Dictionary).duplicate(true)
	_use_mixamo(MIX.get(u.type, {"death": "Death01"}))
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

func _use_mixamo(map: Dictionary) -> void:
	var lib := Clips.library()
	for anim in map:
		var clip: String = map[anim]
		if not lib.has_animation(clip): continue
		var a := lib.get_animation(clip)
		# the weapons a new animation shows are those of the stance it replaces
		var like: Dictionary = recipe.get(anim, recipe.get("attack" if anim in ["attack2", "ready", "hit", "block"] else "idle", {}))
		var e := {"clip": clip, "start": 0.0, "end": 1.0, "props": like.get("props")}
		if a.has_meta("blade"): e.blade = a.get_meta("blade")
		var travel: Vector3 = a.get_meta("travel", Vector3.ZERO)
		if anim == "walk" and travel.length() > 0.3: e.stride = travel.length() * HEIGHT / 1.75    # metres a cycle covers, at the unit's size
		elif like.has("stride"): e.stride = like.stride
		var best := 0.0
		for pk in a.get_meta("peaks", []):
			if pk[1] > best:
				best = pk[1]; e.impact = pk[0] / a.length     # the moment the weapon hand moves fastest is the hit
		recipe[anim] = e

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
	_show_props(r.get("props"), r.get("blade"))
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
		var rr: Dictionary = recipe[use]
		var imp: float = rr.get("impact", IMPACT.get(u.type, {}).get(use, 0.9 if u.def.get("ranged", false) else 0.55))
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

# ---------- what the unit holds: built in code, as tools/render3d/render.html built them for the sprites ----------
func _show_props(props, blade = null) -> void:
	var sig := (JSON.stringify(props) + str(blade)) if props != null else ""
	if sig == _prop_sig or _skeleton == null: return
	for n in _props.get(_prop_sig, []): n.visible = false
	_prop_sig = sig
	if not _props.has(sig):
		var made := []
		if props != null:
			for pr in props:
				var mesh := _tool(pr.tool)
				if mesh == null or _skeleton.find_bone(pr.bone) < 0: continue
				var hand := BoneAttachment3D.new(); hand.bone_name = pr.bone
				_skeleton.add_child(hand)
				# the bones live in centimetre space; the holder undoes that so tools are built in metres
				var holder := Node3D.new(); holder.scale = Vector3.ONE * 100.0
				hand.add_child(holder)
				var rot: Array = pr.get("rot", [0, 0, 0])
				var pos: Array = pr.get("pos", [0, 0, 0])
				mesh.basis = Basis.from_euler(Vector3(rot[0], rot[1], rot[2]), EULER_ORDER_XYZ)
				# Mixamo hands hold a grip differently: the clip says which way a blade leaves the fist
				if blade != null and pr.bone == "RightHand": mesh.basis = Basis(Quaternion(Vector3.UP, (blade as Vector3).normalized()))
				mesh.position = Vector3(pos[0], pos[1], pos[2])
				holder.add_child(mesh)
				made.append(hand)
		_props[sig] = made
	for n in _props[sig]: n.visible = true

static var _tool_mats := {}
static func _m(col: Color) -> StandardMaterial3D:
	var k := col.to_html()
	if not _tool_mats.has(k):
		var m := StandardMaterial3D.new(); m.albedo_color = col; m.roughness = 0.9
		_tool_mats[k] = m
	return _tool_mats[k]

func _part(root: Node3D, mesh: Mesh, col: Color, pos: Vector3, rot: Vector3 = Vector3.ZERO) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = _m(col)
	mi.position = pos; mi.rotation = rot; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)

func _box(x: float, y: float, z: float) -> BoxMesh:
	var b := BoxMesh.new(); b.size = Vector3(x, y, z); return b

func _cyl(r: float, h: float, top: float = -1.0) -> CylinderMesh:
	var c := CylinderMesh.new(); c.bottom_radius = r; c.top_radius = r if top < 0 else top; c.height = h; c.radial_segments = 6; c.rings = 1; return c

## Tools point along +Y from the grip, in metres.
func _tool(kind: String) -> Node3D:
	var root := Node3D.new()
	var steel := Color(0.78, 0.8, 0.84)
	var wood := Color(0.42, 0.28, 0.16)
	match kind:
		"sword", "longsword", "champion_sword":
			_part(root, _box(0.05, 0.62, 0.014), steel, Vector3(0, 0.37, 0))
			_part(root, _box(0.17, 0.028, 0.03), Color(0.75, 0.6, 0.25), Vector3(0, 0.06, 0))
			_part(root, _cyl(0.016, 0.13), wood, Vector3(0, -0.01, 0))
		"spear", "pike", "halberd":
			_part(root, _cyl(0.014, 1.9), wood, Vector3(0, 0.45, 0))
			_part(root, _cyl(0.035, 0.2, 0.001), steel, Vector3(0, 1.5, 0))
		"lance":
			_part(root, _cyl(0.018, 2.3), wood, Vector3(0, 0.6, 0))
			_part(root, _cyl(0.035, 0.22, 0.001), steel, Vector3(0, 1.86, 0))
		"shield", "kite_shield", "round_shield":
			_part(root, _cyl(0.27, 0.035), _team.darkened(0.1), Vector3.ZERO)
			_part(root, _cyl(0.07, 0.06), steel, Vector3.ZERO)
		"longbow", "bow", "shortbow", "crossbow":
			# a bow as five straight pieces bent back toward the string
			for i in 5:
				var a := (i - 2) * 0.42
				_part(root, _cyl(0.012, 0.3), wood, Vector3(0, sin(a) * 0.62, (1 - cos(a)) * 0.5), Vector3(-a * 0.9, 0, 0))
			_part(root, _cyl(0.003, 1.15), Color(0.9, 0.9, 0.85), Vector3(0, 0, 0.19))
		"quiver":
			_part(root, _cyl(0.05, 0.42), Color(0.35, 0.22, 0.12), Vector3.ZERO)
		"axe", "throwing_axe", "francisca":
			_part(root, _cyl(0.014, 0.62), wood, Vector3(0, 0.22, 0))
			_part(root, _box(0.03, 0.13, 0.17), steel, Vector3(0, 0.48, 0.08))
		"pickaxe":
			_part(root, _cyl(0.014, 0.66), wood, Vector3(0, 0.24, 0))
			_part(root, _box(0.03, 0.04, 0.44), steel, Vector3(0, 0.55, 0))
		"mallet", "hammer":
			_part(root, _cyl(0.014, 0.5), wood, Vector3(0, 0.17, 0))
			_part(root, _cyl(0.055, 0.17), Color(0.5, 0.36, 0.22), Vector3(0, 0.42, 0), Vector3(PI / 2, 0, 0))
		"crown":
			_part(root, _cyl(0.1, 0.07), Color(0.95, 0.78, 0.25), Vector3.ZERO)
		"logs":
			for i in 3: _part(root, _cyl(0.05, 0.55), Color(0.5, 0.34, 0.2), Vector3((i - 1) * 0.1, 0, 0), Vector3(0, 0, PI / 2))
		"sack", "ore_sack":
			_part(root, _box(0.3, 0.26, 0.24), Color(0.62, 0.55, 0.4), Vector3.ZERO)
		"basket":
			_part(root, _cyl(0.17, 0.16, 0.2), Color(0.6, 0.45, 0.25), Vector3.ZERO)
		_:
			root.free()
			return null
	return root

# ---------- falling in battle ----------
var dying := -1.0

## the unit has been killed: play its death, lie a while, then sink into the ground. Returns false if it has no death to play.
func die() -> bool:
	if not has_model or not recipe.has("death") or not player.has_animation(recipe.death.clip): return false
	dying = 0.0
	return true

## true while the body should stay
func update_dead(dt: float) -> bool:
	dying += dt
	var length := player.get_animation(recipe.death.clip).length
	_pose("death", minf(dying / length, 0.999))
	if dying > length + 5.0: position.y -= dt * 0.12
	return dying < length + 9.0

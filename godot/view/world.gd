extends Node3D
## The match on screen: the painted ground, building and resource sprites, 3D units, the fog of war,
## and the camera. It only reads the simulation (G, M, E); orders go through E's commands.

const UnitView := preload("res://view/unit_view.gd")
const ELEV := deg_to_rad(30.0)     # a 2:1 diamond: the classic isometric camera
const ZOOMS := [26.0, 20.0, 16.0, 12.5, 10.0]   # screen height in world units

var cam: Camera3D
var ground: MeshInstance3D
var ground_mat: ShaderMaterial
var fog_img: Image
var fog_tex: ImageTexture
var nodes := {}          # entity id -> Node3D
var rings := {}          # entity id -> selection ring
var zoom_i := 2
var look := Vector2(36, 36)   # the ground point at the middle of the screen (tile coordinates)
var _fog_t := 0.0
var _sprite_basis: Basis
var _ring_mesh: Mesh
var _square_mesh: Mesh
var _proj_nodes := []
var _fallen: Array = []
var hud = null             # the match interface, for the building being placed
var _ghosts: Array = []
var _ghost_sprite: Sprite3D
var _ghost_key := ""
var _pings: Array = []
var _plot_mat_ok: StandardMaterial3D
var _plot_mat_bad: StandardMaterial3D
var _sel_mat: StandardMaterial3D

func _ready() -> void:
	cam = Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.near = 1.0; cam.far = 400.0
	add_child(cam)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-52), deg_to_rad(155), 0)
	sun.light_energy = 1.15
	add_child(sun)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR; env.background_color = Color(0.02, 0.02, 0.025)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color(1, 0.98, 0.94); env.ambient_light_energy = 0.75
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	G.new_game_started.connect(_on_new_game)
	G.focus.connect(func(x, y): look = Vector2(x, y))
	G.flipped.connect(func(b): if nodes.has(b.id): nodes[b.id].set_meta("look", ""))
	_place_camera()

func _place_camera() -> void:
	var target := Vector3(look.x, 0, look.y)
	var back := Vector3(cos(ELEV) * 0.70710678, sin(ELEV), cos(ELEV) * 0.70710678)
	cam.position = target + back * 120.0
	cam.look_at(target, Vector3.UP)
	cam.size = ZOOMS[zoom_i]
	_sprite_basis = cam.global_basis

func zoom(step: int) -> void:
	zoom_i = clampi(zoom_i + step, 0, ZOOMS.size() - 1)

func pan_pixels(d: Vector2) -> void:
	# a drag moves the ground with the finger
	var k: float = cam.size / get_viewport().get_visible_rect().size.y
	var right := Vector2(0.70710678, -0.70710678)
	var down := Vector2(0.70710678, 0.70710678) / sin(ELEV)
	look -= (right * d.x + down * d.y) * k
	look = look.clamp(Vector2(-2, -2), Vector2(M.N + 2, M.N + 2))

## the ground point (tile coordinates) under a screen position
func ground_at(screen: Vector2) -> Vector2:
	var o := cam.project_ray_origin(screen)
	var d := cam.project_ray_normal(screen)
	var t := -o.y / d.y
	var p := o + d * t
	return Vector2(p.x, p.z)

func screen_of(x: float, y: float, h: float = 0.0) -> Vector2:
	return cam.unproject_position(Vector3(x, h, y))

func _on_new_game() -> void:
	for id in nodes: nodes[id].queue_free()
	nodes = {}
	for id in rings: rings[id].queue_free()
	rings = {}
	for id in _decal_nodes: _decal_nodes[id].queue_free()
	_decal_nodes = {}
	UnitView.reset()
	for f in _fallen: f.queue_free()
	_fallen = []
	_build_ground()

func _build_ground() -> void:
	var n := M.N
	if ground != null: ground.queue_free()
	var wa := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var wb := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var wooded := PackedByteArray(); wooded.resize(n * n)
	for e in G.ents:
		if e.kind == "res" and e.type == "tree": wooded[e.ty * n + e.tx] = 1
	for y in n:
		for x in n:
			var t := M.terrain[y * n + x]
			var a := Color(0, 0, 0, 0)
			var b := Color(0, 0, 0, 0)
			match t:
				0: a.r = 1.0
				1: a.r = 0.7; a.g = 0.3
				2: a.r = 0.3; a.g = 0.7
				3: a.g = 1.0
				4: a.b = 1.0
				5: b.r = 1.0
				6: b.g = 1.0
				7: a.a = 1.0
				8: b.b = 1.0
			if wooded[y * n + x] == 1 and t < 4:
				a.r *= 0.35; a.g *= 0.35; b.a = 0.65
			wa.set_pixel(x, y, a); wb.set_pixel(x, y, b)
	fog_img = Image.create(n, n, false, Image.FORMAT_RG8)
	fog_tex = ImageTexture.create_from_image(fog_img)
	ground_mat = ShaderMaterial.new()
	ground_mat.shader = preload("res://shaders/ground.gdshader")
	ground_mat.set_shader_parameter("wa", ImageTexture.create_from_image(wa))
	ground_mat.set_shader_parameter("wb", ImageTexture.create_from_image(wb))
	ground_mat.set_shader_parameter("fog", fog_tex)
	ground_mat.set_shader_parameter("tiles", float(n))
	for k in ["grass_a", "grass_b", "dirt", "sand", "water", "shallows", "rock"]:
		ground_mat.set_shader_parameter(k, Art.tex("assets/ground/%s.jpg" % k))
	ground_mat.set_shader_parameter("forest", Art.tex("assets/ground/forest_floor.jpg"))
	ground = MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(n, n)
	ground.mesh = pm
	ground.position = Vector3(n / 2.0, 0, n / 2.0)
	ground.material_override = ground_mat
	add_child(ground)
	_update_fog()

func _update_fog() -> void:
	var n := M.N
	var data := PackedByteArray(); data.resize(n * n * 2)
	for i in n * n:
		data[i * 2] = 255 if M.visible[i] == 1 else 0
		data[i * 2 + 1] = 255 if M.explored[i] == 1 else 0
	fog_img.set_data(n, n, false, Image.FORMAT_RG8, data)
	fog_tex.update(fog_img)
	ground_mat.set_shader_parameter("reveal", 1.0 if G.reveal_all else 0.0)

func seen(e: Dictionary) -> int:
	# 2 = in sight, 1 = remembered, 0 = hidden
	if G.reveal_all or E.allied(1, e.owner): return 2
	if M.is_visible(e.x, e.y): return 2
	if e.kind != "unit" and M.is_explored(e.x, e.y): return 1
	return 0

func _make(e: Dictionary) -> Node3D:
	if e.kind == "unit":
		var v := UnitView.new()
		add_child(v)
		v.setup(e)
		return v
	if e.kind == "res":
		var s := Art.make_sprite("res_tree_%d" % (e["var"] % 4) if e.type == "tree" else "res_" + e.type)
		s.position = Vector3(e.x, 0, e.y)
		s.basis = _sprite_basis
		add_child(s)
		return s
	var holder := Node3D.new()
	holder.position = Vector3(e.x, 0, e.y)
	add_child(holder)
	_dress_building(holder, e)
	return holder

## the look of a building: field, foundation, construction stage or the finished art for its owner's style and Age
func _building_look(e: Dictionary) -> String:
	if e.type == "farm":
		return "fnd" if not e.built else ("farm_spent" if e.food <= 0 else "farm")
	if not e.built:
		var n := 1 if e.progress < 0.5 else 2
		var k := Art.stage_key(e.type, e.owner, n) if e.progress > 0.12 else ""
		return k if k != "" else "fnd"
	return Art.bld_key(e.type, e.owner)

func _dress_building(holder: Node3D, e: Dictionary) -> void:
	var look_key := _building_look(e)
	if holder.get_meta("look", "") == look_key: return
	holder.set_meta("look", look_key)
	for c in holder.get_children(): c.queue_free()
	var team := G.color_of(e.owner)
	if look_key == "fnd" or look_key == "farm" or look_key == "farm_spent":
		var key := ("fnd_%d" % e.size) if look_key == "fnd" else look_key
		if Art.has(key):
			var f := Art.make_flat(key, e.size)
			f.position.y = 0.02
			holder.add_child(f)
		return
	if not Art.has(look_key) or e.def.has("wall"):
		_wall(holder, e, team)
		return
	var s := Art.make_sprite(look_key, team)
	s.basis = _sprite_basis
	holder.add_child(s)
	_dress_extras(holder, e, look_key)

func _process(dt: float) -> void:
	G.advance(dt)
	_place_camera()
	_fog_t -= dt
	if _fog_t <= 0 and ground_mat != null:
		_fog_t = 0.2; _update_fog()
	var alive := {}
	for e in G.ents:
		if e.dead: continue
		var seen := seen(e)
		var node = nodes.get(e.id)
		if seen == 0:
			if node != null: node.visible = false
			alive[e.id] = true
			continue
		if node == null:
			node = _make(e); nodes[e.id] = node
		node.visible = true
		alive[e.id] = true
		if e.kind == "unit": node.update(e, dt)
		elif e.kind == "building":
			_dress_building(node, e)
			_update_fire(node, e)
	for id in nodes.keys():
		if not alive.has(id):
			var gone: Node3D = nodes[id]
			nodes.erase(id)
			# a unit that died in sight falls where it stood; anything else just goes
			if gone.visible and gone.has_method("die") and not G.by_id.has(id) and _fallen.size() < 60 and gone.die(): _fallen.append(gone)
			else: gone.queue_free()
	for i in range(_fallen.size() - 1, -1, -1):
		if not _fallen[i].update_dead(dt):
			_fallen[i].queue_free(); _fallen.remove_at(i)
	_update_rings()
	_update_projectiles()
	_update_ghost()
	_update_pings(dt)
	_update_ground_marks()

func _update_rings() -> void:
	if _ring_mesh == null:
		var tm := TorusMesh.new(); tm.inner_radius = 0.36; tm.outer_radius = 0.42; tm.rings = 24; tm.ring_segments = 3
		_ring_mesh = tm
		var sq := TorusMesh.new(); sq.inner_radius = 0.56; sq.outer_radius = 0.6; sq.rings = 4; sq.ring_segments = 3
		_square_mesh = sq
	for id in rings.keys():
		if not G.selection.has(id) or not G.by_id.has(id):
			rings[id].queue_free(); rings.erase(id)
	for id in G.selection:
		var e = G.by_id.get(id)
		if e == null: continue
		var r = rings.get(id)
		if r == null:
			r = MeshInstance3D.new(); r.mesh = _ring_mesh if e.kind == "unit" else _square_mesh
			var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(1, 1, 1)
			r.material_override = m
			add_child(r); rings[id] = r
		if e.kind == "unit":
			r.scale = Vector3(1, 0.2, 1); r.rotation.y = 0
		else:
			# a square ring turned to lie along the plot's edges
			var s: float = e.size * 1.19
			r.scale = Vector3(s, 0.12, s); r.rotation.y = PI / 4
		r.position = Vector3(e.x, 0.03, e.y)

func _update_projectiles() -> void:
	while _proj_nodes.size() < G.projs.size():
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new(); bm.size = Vector3(0.03, 0.03, 0.34)
		mi.mesh = bm
		var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(0.25, 0.18, 0.1)
		mi.material_override = m
		add_child(mi); _proj_nodes.append(mi)
	for i in _proj_nodes.size():
		var node: MeshInstance3D = _proj_nodes[i]
		if i >= G.projs.size():
			node.visible = false; continue
		var p: Dictionary = G.projs[i]
		var k: float = clampf(p.t / p.dur, 0.0, 1.0)
		var arc: float = (2.6 if p.heavy else 0.9) * sin(k * PI)
		var pos := Vector3(lerpf(p.x, p.tx, k), p.z * (1 - k) + 0.4 * k + arc, lerpf(p.y, p.ty, k))
		node.visible = true
		node.scale = Vector3.ONE * (3.0 if p.heavy else 1.0)
		var k2 := minf(1.0, k + 0.05)
		var nxt := Vector3(lerpf(p.x, p.tx, k2), p.z * (1 - k2) + 0.4 * k2 + (2.6 if p.heavy else 0.9) * sin(k2 * PI), lerpf(p.y, p.ty, k2))
		node.position = pos
		if pos.distance_to(nxt) > 0.001: node.look_at(nxt, Vector3.UP)

# ---------- walls and gates, built in code so each piece joins its neighbours ----------
static var _wall_mats := {}
func _wm(col: Color) -> StandardMaterial3D:
	if not _wall_mats.has(col):
		var m := StandardMaterial3D.new(); m.albedo_color = col; m.roughness = 1.0
		_wall_mats[col] = m
	return _wall_mats[col]

func _piece(holder: Node3D, mesh: Mesh, col: Color, pos: Vector3, rot_y: float = 0.0) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = _wm(col); mi.position = pos; mi.rotation.y = rot_y
	holder.add_child(mi)

func _wall(holder: Node3D, e: Dictionary, team: Color) -> void:
	var k: float = 0.4 + 0.6 * e.progress
	if e.type == "palisade":
		# a row of sharpened stakes, a little uneven
		for i in 4:
			for j in 2:
				var cm := CylinderMesh.new(); cm.top_radius = 0.02; cm.bottom_radius = 0.12; cm.radial_segments = 5; cm.rings = 1
				cm.height = (0.62 + 0.1 * ((i + j + e.id) % 3)) * k
				_piece(holder, cm, Color(0.46, 0.32, 0.18) if (i + j) % 2 == 0 else Color(0.52, 0.37, 0.21), Vector3(-0.375 + i * 0.25, cm.height / 2, -0.2 + j * 0.4))
		return
	var stone := Color(0.63, 0.61, 0.56)
	var dark := Color(0.5, 0.48, 0.44)
	if e.type == "gate":
		# two towers and a lintel in the owner's colour; the doors stand open for friends
		for sx in [-1, 1]:
			var bm := BoxMesh.new(); bm.size = Vector3(0.3, 1.25 * k, 0.9)
			_piece(holder, bm, stone, Vector3(sx * 0.36, 0.62 * k, 0))
		var lm := BoxMesh.new(); lm.size = Vector3(1.0, 0.22, 0.6)
		_piece(holder, lm, dark, Vector3(0, 1.1 * k, 0))
		var fm := BoxMesh.new(); fm.size = Vector3(0.36, 0.3, 0.05)
		_piece(holder, fm, team, Vector3(0, 0.82 * k, 0.33))
		return
	var body := BoxMesh.new(); body.size = Vector3(1.0, 0.82 * k, 1.0)
	_piece(holder, body, stone, Vector3(0, 0.41 * k, 0))
	if e.built:
		for i in 2:
			for j in 2:
				var mm := BoxMesh.new(); mm.size = Vector3(0.28, 0.16, 0.28)
				_piece(holder, mm, dark, Vector3(-0.3 + i * 0.6, 0.9, -0.3 + j * 0.6))

# ---------- smoke from chimneys, fire on badly damaged buildings ----------
static var _puff: Texture2D
func _soft() -> Texture2D:
	if _puff == null:
		var g := Gradient.new(); g.set_color(0, Color(1, 1, 1, 0.9)); g.set_color(1, Color(1, 1, 1, 0))
		var t := GradientTexture2D.new(); t.gradient = g; t.fill = GradientTexture2D.FILL_RADIAL
		t.fill_from = Vector2(0.5, 0.5); t.fill_to = Vector2(1.0, 0.5); t.width = 48; t.height = 48
		_puff = t
	return _puff

func _particles(col_a: Color, col_b: Color, amount: int, life: float, size: float, speed: float) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.amount = amount; p.lifetime = life; p.preprocess = life
	var q := QuadMesh.new(); q.size = Vector2(size, size)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES; m.vertex_color_use_as_albedo = true; m.albedo_texture = _soft()
	m.no_depth_test = false; m.render_priority = 2
	q.material = m
	p.mesh = q
	# "up" is up the screen: along the camera's up axis, so a plume rises over its painted building
	p.direction = cam.global_basis.y; p.spread = 14.0; p.gravity = cam.global_basis.x * 0.12
	p.initial_velocity_min = speed * 0.7; p.initial_velocity_max = speed
	p.scale_amount_min = 0.7; p.scale_amount_max = 1.3
	var sc := Curve.new(); sc.add_point(Vector2(0, 0.45)); sc.add_point(Vector2(1, 1.6)); p.scale_amount_curve = sc
	var gr := Gradient.new(); gr.set_color(0, col_a); gr.set_color(1, col_b); p.color_ramp = gr
	return p

## where on the building a plume starts: the manifest's chimney point, else near the roof top
func _chimney(e: Dictionary, key: String) -> Vector3:
	var d: Dictionary = Art.man[key]
	var px: Vector2
	if d.has("chim"): px = Vector2(d.chim[0], d.chim[1])
	else: px = Vector2(d.w * 0.5 - d.ax + d.w * 0.12, -d.ay + d.h * 0.12)
	return cam.global_basis.x * px.x * Art.PX + cam.global_basis.y * (-px.y * Art.PX) + cam.global_basis.z * 0.3

const SMOKERS := ["towncenter", "blacksmith", "house", "mill", "siegeworkshop", "university"]
func _dress_extras(holder: Node3D, e: Dictionary, key: String) -> void:
	if e.built and e.type in SMOKERS and (Art.man[key].has("chim") or e.type in ["towncenter", "blacksmith"]):
		var sm := _particles(Color(0.82, 0.8, 0.76, 0.5), Color(0.9, 0.9, 0.9, 0.0), 9, 3.2, 0.34, 0.55)
		sm.position = _chimney(e, key)
		holder.add_child(sm)

func _update_fire(holder: Node3D, e: Dictionary) -> void:
	var burning: bool = e.built and (e.hp < e.maxHp * 0.5 or e.get("burn") != null) and e.type != "farm" and not e.def.has("wall")
	var f = holder.get_node_or_null("Fire")
	if burning and f == null:
		f = _particles(Color(1.0, 0.75, 0.2, 0.95), Color(0.9, 0.15, 0.05, 0.0), 14, 0.9, 0.3 + e.size * 0.06, 1.1)
		f.name = "Fire"
		f.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE; f.emission_sphere_radius = e.size * 0.3
		f.position = cam.global_basis.y * e.size * 0.35 + cam.global_basis.z * 0.4
		holder.add_child(f)
	elif not burning and f != null: f.queue_free()

# ---------- what is left on the ground: rubble, fire on the ground, effect rings ----------
var _decal_nodes := {}
var _fire_nodes: Array = []
var _fx_seen := 0
func _update_ground_marks() -> void:
	var live := {}
	for d in G.decals:
		if d.t != "rubble" or d.size < 2: continue
		live[d.id] = true
		if not _decal_nodes.has(d.id) and Art.has("fnd_%d" % d.size):
			var m := Art.make_flat("fnd_%d" % d.size, d.size)
			m.position = Vector3(d.x, 0.018, d.y)
			m.material_override.set_shader_parameter("shade", 0.55)
			add_child(m); _decal_nodes[d.id] = m
		if _decal_nodes.has(d.id): _decal_nodes[d.id].material_override.set_shader_parameter("alpha", clampf(d.life / 20.0, 0.0, 1.0))
	for id in _decal_nodes.keys():
		if not live.has(id):
			_decal_nodes[id].queue_free(); _decal_nodes.erase(id)
	# Greek fire burning on the ground
	var fires: Array = Specials.fires
	while _fire_nodes.size() < fires.size():
		var f := _particles(Color(1.0, 0.8, 0.25, 0.95), Color(0.9, 0.2, 0.05, 0.0), 10, 0.7, 0.34, 0.9)
		add_child(f); _fire_nodes.append(f)
	for i in _fire_nodes.size():
		_fire_nodes[i].visible = i < fires.size()
		_fire_nodes[i].emitting = i < fires.size()
		if i < fires.size(): _fire_nodes[i].position = Vector3(fires[i].x, 0.1, fires[i].y)
	# rings the rules ask for (Specials, captures)
	for f in G.effects:
		if f.t == "ping" and not f.has("shown"):
			f.shown = true
			ping(f.x, f.y, Color(1.0, 0.85, 0.4))

# ---------- the building being placed ----------
func _plot_quad(mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var q := QuadMesh.new(); q.orientation = PlaneMesh.FACE_Y; q.size = Vector2(1, 1)
	mi.mesh = q; mi.material_override = mat
	add_child(mi)
	return mi

func _update_ghost() -> void:
	if _plot_mat_ok == null:
		_plot_mat_ok = StandardMaterial3D.new(); _plot_mat_bad = StandardMaterial3D.new()
		for m in [_plot_mat_ok, _plot_mat_bad]:
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.no_depth_test = true
		_plot_mat_ok.albedo_color = Color(0.3, 1.0, 0.35, 0.45); _plot_mat_bad.albedo_color = Color(1.0, 0.25, 0.2, 0.5)
	var type: String = hud.placing if hud != null else ""
	var tiles: Array = []
	if type != "": tiles = hud.wall_line() if D.BUILDINGS[type].has("wall") else [hud.place_at]
	while _ghosts.size() < tiles.size(): _ghosts.append(_plot_quad(_plot_mat_ok))
	for i in _ghosts.size():
		var gq: MeshInstance3D = _ghosts[i]
		gq.visible = i < tiles.size()
		if not gq.visible: continue
		var s: int = D.BUILDINGS[type].size
		gq.scale = Vector3(s, 1, s)
		gq.position = Vector3(tiles[i].x + s / 2.0, 0.04, tiles[i].y + s / 2.0)
		gq.material_override = _plot_mat_ok if hud.tile_ok(type, tiles[i]) else _plot_mat_bad
	var key := Art.bld_key(type, 1) if (type != "" and not D.BUILDINGS[type].has("wall") and type != "farm") else ""
	if key != "" and not Art.has(key): key = ""
	if key != _ghost_key:
		if _ghost_sprite != null: _ghost_sprite.queue_free()
		_ghost_sprite = null; _ghost_key = key
		if key != "":
			_ghost_sprite = Art.make_sprite(key, G.color_of(1))
			_ghost_sprite.basis = _sprite_basis
			add_child(_ghost_sprite)
	if _ghost_sprite != null:
		var s: int = D.BUILDINGS[type].size
		_ghost_sprite.position = Vector3(hud.place_at.x + s / 2.0, 0, hud.place_at.y + s / 2.0)

# ---------- a ring where an order landed ----------
func ping(x: float, y: float, col: Color) -> void:
	var mi := MeshInstance3D.new(); mi.mesh = _ring_mesh
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = col
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = m
	mi.position = Vector3(x, 0.04, y)
	add_child(mi)
	_pings.append([mi, 0.0])

func _update_pings(dt: float) -> void:
	for p in _pings:
		p[1] += dt
		var k: float = p[1] / 0.5
		p[0].scale = Vector3(0.5 + k, 0.2, 0.5 + k)
		p[0].material_override.albedo_color.a = 1.0 - k
	while _pings.size() > 0 and _pings[0][1] >= 0.5:
		_pings[0][0].queue_free(); _pings.pop_front()

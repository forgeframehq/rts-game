extends Node3D
## Mounts and engines built in code: the horse (shared by all cavalry), the War Elephant, the ram and the
## trebuchet. Port of buildHorse()/poseHorse() in tools/render3d/render.html, which drew them for the sprites.
## Units are fractions of the rider's standing height S. Faces +Z, ground at y = 0.

var S := 1.0
var kind := "horse"
var body: Node3D
var neck: Node3D
var head: Node3D
var tail: Node3D
var trunk: Node3D
var arm: Node3D            # trebuchet throwing arm / ram log
var wheels: Array = []
var legs := {}
var base_y := 0.0
var saddle_y := 0.0

static var _mats := {}
static func mat(col: Color, rough: float = 0.85) -> StandardMaterial3D:
	var k := col.to_html() + str(rough)
	if not _mats.has(k):
		var m := StandardMaterial3D.new(); m.albedo_color = col; m.roughness = rough
		_mats[k] = m
	return _mats[k]

func _add(parent: Node3D, mesh: Mesh, m: Material, pos: Vector3 = Vector3.ZERO, scl: Vector3 = Vector3.ONE, rot: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = m
	mi.position = pos; mi.scale = scl; mi.rotation = rot
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi

func _sphere(r: float) -> SphereMesh:
	var s := SphereMesh.new(); s.radius = r; s.height = r * 2; s.radial_segments = 10; s.rings = 6; return s
func _cyl(top: float, bottom: float, h: float) -> CylinderMesh:
	var c := CylinderMesh.new(); c.top_radius = top; c.bottom_radius = bottom; c.height = h; c.radial_segments = 8; c.rings = 1; return c
func _box(x: float, y: float, z: float) -> BoxMesh:
	var b := BoxMesh.new(); b.size = Vector3(x, y, z); return b
func _pivot(parent: Node3D, pos: Vector3, rot_x: float = 0.0) -> Node3D:
	var n := Node3D.new(); n.position = pos; n.rotation.x = rot_x; parent.add_child(n); return n

## opts: coat, mane (Color), barding (0-2), team (Color)
func build_horse(rider_height: float, opts: Dictionary = {}) -> void:
	S = rider_height; kind = "horse"
	var coat := mat(opts.get("coat", Color("#6b4226")), 0.8)
	var mane := mat(opts.get("mane", Color("#2a1a10")), 0.9)
	var cloth := mat(opts.get("team", Color("#3050c0")), 0.75)
	var leather := mat(Color("#4a2e18"))
	var iron := mat(Color("#9aa0a6"), 0.45)
	body = _pivot(self, Vector3(0, 0.74 * S, 0))
	_add(body, _sphere(0.21 * S), coat, Vector3.ZERO, Vector3(0.95, 1.05, 2.2))
	_add(body, _sphere(0.19 * S), coat, Vector3(0, 0, 0.3 * S))
	_add(body, _sphere(0.2 * S), coat, Vector3(0, 0.04 * S, -0.3 * S))
	neck = _pivot(body, Vector3(0, 0.08 * S, 0.36 * S), 0.6)
	_add(neck, _cyl(0.085 * S, 0.14 * S, 0.42 * S), coat, Vector3(0, 0.2 * S, 0), Vector3(0.8, 1, 1.15))
	_add(neck, _box(0.035 * S, 0.42 * S, 0.07 * S), mane, Vector3(0, 0.22 * S, -0.095 * S))
	head = _pivot(neck, Vector3(0, 0.4 * S, 0), 1.45)
	_add(head, _cyl(0.05 * S, 0.085 * S, 0.3 * S), coat, Vector3(0, 0.12 * S, 0))
	_add(head, _sphere(0.075 * S), coat, Vector3(0, 0, 0.03 * S), Vector3(0.8, 1.1, 0.9))
	_add(head, _sphere(0.052 * S), mat(Color("#3a2a20"), 0.8), Vector3(0, 0.27 * S, 0))
	for sx in [-1, 1]: _add(head, _cyl(0.001, 0.018 * S, 0.07 * S), coat, Vector3(sx * 0.035 * S, -0.01 * S, -0.06 * S), Vector3.ONE, Vector3(-1.3, 0, 0))
	tail = _pivot(body, Vector3(0, 0.06 * S, -0.44 * S), 0.35)
	_add(tail, _cyl(0.035 * S, 0.075 * S, 0.46 * S), mane, Vector3(0, -0.23 * S, 0))
	# caparison (team colour cloth) and saddle
	_add(body, _cyl(0.19 * S, 0.225 * S, 0.19 * S), cloth, Vector3(0, -0.02 * S, 0), Vector3(1.04, 1, 2.05))
	var barding: int = opts.get("barding", 0)
	if barding > 0:
		_add(head, _cyl(0.062 * S, 0.082 * S, 0.15 * S), iron, Vector3(0, 0.03 * S, -0.012 * S), Vector3(1, 1, 0.8))
		_add(neck, _cyl(0.088 * S, 0.122 * S, 0.3 * S), iron, Vector3(0, 0.15 * S, 0))
		if barding > 1: _add(body, _sphere(0.2 * S), iron, Vector3(0, -0.02 * S, 0.4 * S), Vector3(0.92, 0.62, 0.42))
	_add(body, _box(0.2 * S, 0.06 * S, 0.24 * S), leather, Vector3(0, 0.19 * S, 0.02 * S))
	_add(body, _box(0.18 * S, 0.08 * S, 0.03 * S), leather, Vector3(0, 0.23 * S, -0.1 * S))
	# legs: hip pivot -> thigh -> knee pivot -> cannon -> hoof
	var defs := {"LF": Vector2(-0.1, 0.33), "RF": Vector2(0.1, 0.33), "LH": Vector2(-0.1, -0.33), "RH": Vector2(0.1, -0.33)}
	for k in defs:
		var hip := _pivot(body, Vector3(defs[k].x * S, -0.08 * S, defs[k].y * S))
		_add(hip, _cyl(0.085 * S, 0.05 * S, 0.34 * S), coat, Vector3(0, -0.17 * S, 0))
		var knee := _pivot(hip, Vector3(0, -0.34 * S, 0))
		_add(knee, _sphere(0.045 * S), coat)
		_add(knee, _cyl(0.036 * S, 0.03 * S, 0.27 * S), coat, Vector3(0, -0.14 * S, 0))
		_add(knee, _cyl(0.038 * S, 0.05 * S, 0.06 * S), mat(Color("#222222")), Vector3(0, -0.31 * S, 0))
		legs[k] = {"hip": hip, "knee": knee, "front": k[1] == "F"}
	base_y = body.position.y
	saddle_y = base_y + 0.22 * S

## A War Elephant: the same four-legged frame, heavier, grey, with a trunk and ears.
func build_elephant(rider_height: float, team: Color) -> void:
	S = rider_height * 1.2; kind = "elephant"
	var skin := mat(Color("#77706a"), 0.9)
	var cloth := mat(team, 0.75)
	body = _pivot(self, Vector3(0, 0.78 * S, 0))
	_add(body, _sphere(0.3 * S), skin, Vector3.ZERO, Vector3(1.0, 1.05, 1.75))
	_add(body, _box(0.5 * S, 0.02 * S, 0.62 * S), cloth, Vector3(0, 0.3 * S, 0))            # caparison
	_add(body, _box(0.36 * S, 0.14 * S, 0.4 * S), mat(Color("#7a5230")), Vector3(0, 0.38 * S, 0))   # howdah
	neck = _pivot(body, Vector3(0, 0.08 * S, 0.44 * S), 0.0)
	head = _pivot(neck, Vector3(0, 0.02 * S, 0.12 * S), 0.0)
	_add(head, _sphere(0.2 * S), skin, Vector3.ZERO, Vector3(0.95, 1.1, 0.95))
	for sx in [-1, 1]:
		_add(head, _cyl(0.2 * S, 0.2 * S, 0.02 * S), skin, Vector3(sx * 0.2 * S, 0.02 * S, -0.06 * S), Vector3(1, 1, 1), Vector3(PI / 2, sx * 0.5, 0))
		_add(head, _cyl(0.008 * S, 0.028 * S, 0.3 * S), mat(Color("#efe6cf"), 0.5), Vector3(sx * 0.09 * S, -0.16 * S, 0.16 * S), Vector3.ONE, Vector3(2.2, 0, 0))
	trunk = _pivot(head, Vector3(0, -0.08 * S, 0.17 * S), 0.2)
	_add(trunk, _cyl(0.07 * S, 0.035 * S, 0.5 * S), skin, Vector3(0, -0.25 * S, 0))
	tail = _pivot(body, Vector3(0, 0.1 * S, -0.5 * S), 0.2)
	_add(tail, _cyl(0.02 * S, 0.012 * S, 0.34 * S), skin, Vector3(0, -0.17 * S, 0))
	var defs := {"LF": Vector2(-0.17, 0.3), "RF": Vector2(0.17, 0.3), "LH": Vector2(-0.17, -0.3), "RH": Vector2(0.17, -0.3)}
	for k in defs:
		var hip := _pivot(body, Vector3(defs[k].x * S, -0.14 * S, defs[k].y * S))
		_add(hip, _cyl(0.1 * S, 0.09 * S, 0.34 * S), skin, Vector3(0, -0.17 * S, 0))
		var knee := _pivot(hip, Vector3(0, -0.34 * S, 0))
		_add(knee, _cyl(0.09 * S, 0.095 * S, 0.3 * S), skin, Vector3(0, -0.15 * S, 0))
		legs[k] = {"hip": hip, "knee": knee, "front": k[1] == "F"}
	base_y = body.position.y
	saddle_y = base_y + 0.5 * S

func _wheel(parent: Node3D, pos: Vector3, r: float) -> void:
	var w := _add(parent, _cyl(r, r, 0.07), mat(Color("#5a3a1f")), pos, Vector3.ONE, Vector3(0, 0, PI / 2))
	_add(w, _cyl(r * 0.25, r * 0.25, 0.09), mat(Color("#9aa0a6"), 0.45))
	wheels.append(w)

## A covered battering ram on four wheels; the log swings on attack.
func build_ram(team: Color) -> void:
	kind = "ram"
	var wood := mat(Color("#7a5230")); var dark := mat(Color("#5a3a1f")); var hide := mat(Color("#8a6a48"), 0.95)
	body = _pivot(self, Vector3(0, 0.22, 0))
	_add(body, _box(0.62, 0.07, 1.25), dark, Vector3(0, 0.02, 0))
	for sx in [-1, 1]:
		for sz in [-1, 1]:
			_wheel(body, Vector3(sx * 0.36, -0.04, sz * 0.42), 0.18)
			_add(body, _box(0.06, 0.55, 0.06), wood, Vector3(sx * 0.27, 0.3, sz * 0.55))
		_add(body, _box(0.04, 0.5, 1.2), hide, Vector3(sx * 0.2, 0.62, 0), Vector3.ONE, Vector3(0, 0, sx * 0.75))   # the pitched roof
	_add(body, _box(0.5, 0.03, 0.05), mat(team), Vector3(0, 0.82, 0.58))
	arm = _pivot(body, Vector3(0, 0.3, 0))
	_add(arm, _cyl(0.085, 0.085, 1.5), wood, Vector3.ZERO, Vector3.ONE, Vector3(PI / 2, 0, 0))
	_add(arm, _cyl(0.1, 0.06, 0.22), mat(Color("#9aa0a6"), 0.45), Vector3(0, 0, 0.85), Vector3.ONE, Vector3(PI / 2, 0, 0))

## A counterweight trebuchet: frame, throwing arm and sling; the arm whips over on attack.
func build_trebuchet(team: Color) -> void:
	kind = "trebuchet"
	var wood := mat(Color("#7a5230")); var dark := mat(Color("#5a3a1f"))
	body = _pivot(self, Vector3(0, 0.1, 0))
	for sx in [-1, 1]:
		_add(body, _box(0.09, 0.09, 1.6), dark, Vector3(sx * 0.4, 0, 0))
		_add(body, _box(0.08, 1.25, 0.08), wood, Vector3(sx * 0.4, 0.6, 0.28), Vector3.ONE, Vector3(-0.42, 0, 0))
		_add(body, _box(0.08, 1.25, 0.08), wood, Vector3(sx * 0.4, 0.6, -0.28), Vector3.ONE, Vector3(0.42, 0, 0))
		for sz in [-1, 1]: _wheel(body, Vector3(sx * 0.48, 0.02, sz * 0.6), 0.15)
	_add(body, _box(0.9, 0.08, 0.08), dark, Vector3(0, 1.15, 0))
	_add(body, _box(0.3, 0.02, 0.22), mat(team), Vector3(0, 1.32, 0))
	arm = _pivot(body, Vector3(0, 1.15, 0), 0.9)
	_add(arm, _box(0.07, 0.07, 2.2), wood, Vector3(0, 0, -0.55))
	_add(arm, _box(0.34, 0.34, 0.34), mat(Color("#55504a"), 0.9), Vector3(0, -0.2, 0.5))       # counterweight
	_add(arm, _sphere(0.09), mat(Color("#8a8a86")), Vector3(0, -0.12, -1.66))                  # the stone in its sling

## gait: idle | walk | gallop | attack | death; ph in 0..1
func pose(gait: String, ph: float, moved: float = 0.0) -> void:
	if kind == "ram" or kind == "trebuchet":
		for w in wheels: w.rotation.x = moved * 5.0
		if kind == "ram": arm.position.z = (sin(ph * PI) * 0.3 - 0.1) if gait == "attack" else -0.1
		else: arm.rotation.x = (0.9 - sin(minf(ph * 1.6, 1.0) * PI) * 2.2) if gait == "attack" else 0.9
		rotation.z = minf(ph * 1.4, 1.0) * 0.5 if gait == "death" else 0.0
		return
	var slow := kind == "elephant"
	var off: Dictionary = {"LH": 0.0, "LF": 0.25, "RH": 0.5, "RF": 0.75} if (gait == "walk" or slow) else {"LH": 0.0, "RH": 0.12, "LF": 0.5, "RF": 0.62}
	var amp := 0.0
	if gait == "walk": amp = 0.42
	elif gait == "gallop": amp = 0.42 if slow else 0.75
	for k in legs:
		var L: Dictionary = legs[k]
		var a: float = TAU * (ph + off[k])
		var th := amp * sin(a)
		var kn := maxf(0.0, sin(a + (0.6 if L.front else -0.6))) * amp * 1.3
		if gait == "attack" and L.front:
			var r := maxf(0.0, sin(TAU * ph))
			th = -0.5 * r; kn = 1.1 * r                 # rear-up stamp
		if gait == "idle" or gait == "death":
			th = 0.0; kn = 0.0
		L.hip.rotation.x = th
		L.knee.rotation.x = kn if L.front else -kn
	var bob := 0.0
	var pitch := 0.0
	if gait == "walk": bob = 0.012 * S * sin(TAU * ph * 2)
	elif gait == "gallop":
		bob = 0.04 * S * sin(TAU * ph) * (0.4 if slow else 1.0); pitch = 0.08 * sin(TAU * ph + 1) * (0.3 if slow else 1.0)
	elif gait == "attack":
		var r := maxf(0.0, sin(TAU * ph))
		pitch = -0.28 * r * (0.5 if slow else 1.0); bob = 0.06 * S * r
	elif gait == "idle": bob = 0.004 * S * sin(TAU * ph)
	body.position.y = base_y + bob
	body.rotation.x = pitch
	if kind == "horse":
		neck.rotation.x = 0.6 + (0.15 * sin(TAU * ph) if gait == "gallop" else (0.06 * sin(TAU * ph) if gait == "idle" else (0.08 * sin(TAU * ph * 2) if gait == "walk" else 0.0)))
		tail.rotation.x = 0.3 + ((0.35 + 0.1 * sin(TAU * ph * 2)) if gait == "gallop" else 0.08 * sin(TAU * ph))
	else:
		trunk.rotation.x = 0.2 + (0.9 * maxf(0.0, sin(TAU * ph)) if gait == "attack" else 0.12 * sin(TAU * ph))
		tail.rotation.x = 0.2 + 0.1 * sin(TAU * ph)
	# a fallen mount topples onto its side
	rotation.z = minf(ph * 1.4, 1.0) * 1.45 if gait == "death" else 0.0

func seat_y() -> float:
	return body.position.y + (saddle_y - base_y)

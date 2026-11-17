extends Control
## The minimap: the diamond map, what you have explored, and everyone's buildings and units. Tap to jump there.

var world: Node3D
var _img: Image
var _tex: ImageTexture
var _t := 0.0
const TERRAIN := [Color("#4d7a35"), Color("#4f7d36"), Color("#527f38"), Color("#55823a"), Color("#8a7450"), Color("#2f5f8f"), Color("#5f8fb0"), Color("#c9b47a"), Color("#77736b")]

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true

func _process(dt: float) -> void:
	_t -= dt
	if _t > 0 or M.terrain.is_empty() or G.ents.is_empty(): return
	_t = 0.5
	var n := M.N
	if _img == null or _img.get_width() != n:
		_img = Image.create(n, n, false, Image.FORMAT_RGBA8)
		_tex = ImageTexture.create_from_image(_img)
	for y in n:
		for x in n:
			var i := y * n + x
			if not G.reveal_all and M.explored[i] == 0: _img.set_pixel(x, y, Color(0.03, 0.03, 0.03))
			else:
				var c: Color = TERRAIN[M.terrain[i]]
				_img.set_pixel(x, y, c if (G.reveal_all or M.visible[i] == 1) else c.darkened(0.45))
	for e in G.ents:
		if e.dead: continue
		var seen: bool = G.reveal_all or E.allied(1, e.owner) or M.is_visible(e.x, e.y) or (e.kind != "unit" and M.is_explored(e.x, e.y)) \
			or (e.owner > 0 and G.players[e.owner].exposed)
		if not seen: continue
		if e.kind == "res":
			_img.set_pixel(e.tx, e.ty, {"tree": Color("#2c5222"), "gold": Color("#e8c23a"), "stone": Color("#b9b9b9"), "berry": Color("#c0507a")}[e.type])
		elif e.kind == "building":
			var c := G.color_of(e.owner)
			for j in e.size:
				for i2 in e.size:
					if M.in_map(e.tx + i2, e.ty + j): _img.set_pixel(e.tx + i2, e.ty + j, c)
		else: _img.set_pixel(clampi(int(e.x), 0, n - 1), clampi(int(e.y), 0, n - 1), G.color_of(e.owner).lightened(0.25))
	_tex.update(_img)
	queue_redraw()

## map tile -> minimap pixel: the same diamond the main view shows
func _to_mini(x: float, y: float) -> Vector2:
	var n := float(M.N)
	return Vector2((x - y) / n * 0.5 + 0.5, (x + y) / n * 0.5) * size

func _draw() -> void:
	var dia := PackedVector2Array([Vector2(size.x / 2, 0), Vector2(size.x, size.y / 2), Vector2(size.x / 2, size.y), Vector2(0, size.y / 2)])
	draw_colored_polygon(dia, Color(0.12, 0.09, 0.06, 0.92))
	if _tex == null: return
	var n := float(M.N)
	# the square texture drawn as a diamond: x axis runs right-down, y axis left-down
	var k := Vector2(size.x / (2 * n), size.y / (2 * n))
	draw_set_transform_matrix(Transform2D(Vector2(k.x, k.y), Vector2(-k.x, k.y), Vector2(size.x / 2, 0)))
	draw_texture_rect(_tex, Rect2(0, 0, n, n), false)
	draw_set_transform_matrix(Transform2D.IDENTITY)
	if world != null:
		var c := _to_mini(world.look.x, world.look.y)
		var hw: float = world.cam.size * 0.5625 / 1.41421 / n * size.x * 0.5
		var hh: float = world.cam.size / 1.41421 / n * size.y
		draw_rect(Rect2(c.x - hw, c.y - hh * 0.5, hw * 2, hh), Color(1, 1, 1, 0.9), false, 1.5)
	dia.append(dia[0])
	draw_polyline(dia, Color("#6b5230"), 2.0)

func _gui_input(ev: InputEvent) -> void:
	if (ev is InputEventScreenTouch and ev.pressed) or ev is InputEventScreenDrag:
		var n := float(M.N)
		var u: float = (ev.position.x / size.x - 0.5) * 2.0    # (x - y) / n
		var v: float = ev.position.y / size.y * 2.0            # (x + y) / n
		world.look = Vector2((v + u) / 2.0 * n, (v - u) / 2.0 * n).clamp(Vector2.ZERO, Vector2(n, n))
		accept_event()

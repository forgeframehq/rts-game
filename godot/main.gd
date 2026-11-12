extends Node
## Dawn of Dynasties, Godot edition: for now this starts a match straight away.
## The menus, command panel and the rest of the interface are the next stage of the port.

const World := preload("res://view/world.gd")

var world: Node3D
var top: Label
var note: Label
var panel: HBoxContainer
var _drag := false
var _moved := 0.0
var _down := Vector2.ZERO
var _note_t := 0.0

func _ready() -> void:
	world = World.new()
	add_child(world)
	_build_hud()
	G.alerted.connect(func(t): note.text = t; _note_t = 5.0)
	var cfg := {"players": [{"civ": "britons"}, {"civ": "franks", "ai": "normal"}]}
	if OS.has_environment("DOD_SEED"): cfg.seed = int(OS.get_environment("DOD_SEED"))
	G.new_game(cfg)
	if OS.has_environment("DOD_SHOT"): _shot.call_deferred()

func _build_hud() -> void:
	var layer := CanvasLayer.new(); add_child(layer)
	var bar := ColorRect.new(); bar.color = Color(0.08, 0.06, 0.04, 0.85)
	bar.set_anchors_preset(Control.PRESET_TOP_WIDE); bar.custom_minimum_size.y = 64; bar.size.y = 64
	layer.add_child(bar)
	top = Label.new(); top.set_anchors_preset(Control.PRESET_TOP_WIDE); top.position = Vector2(14, 14)
	top.add_theme_font_size_override("font_size", 26)
	layer.add_child(top)
	note = Label.new(); note.set_anchors_preset(Control.PRESET_TOP_WIDE); note.position = Vector2(14, 76)
	note.add_theme_font_size_override("font_size", 24); note.add_theme_color_override("font_outline_color", Color.BLACK); note.add_theme_constant_override("outline_size", 6)
	layer.add_child(note)
	panel = HBoxContainer.new()
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); panel.offset_top = -96; panel.offset_bottom = -16; panel.offset_left = 12; panel.offset_right = -12
	panel.add_theme_constant_override("separation", 10)
	layer.add_child(panel)
	for b in [["−", func(): world.zoom(-1)], ["+", func(): world.zoom(1)], ["Deselect", func(): G.selection = []], ["Stop", func(): E.cmd_stop(_selected())], ["Train", _train]]:
		var btn := Button.new(); btn.text = b[0]; btn.custom_minimum_size = Vector2(96, 80)
		btn.add_theme_font_size_override("font_size", 26); btn.focus_mode = Control.FOCUS_NONE
		btn.pressed.connect(b[1])
		panel.add_child(btn)

func _selected() -> Array:
	var out := []
	for id in G.selection:
		var e = G.by_id.get(id)
		if e != null and not e.dead: out.append(e)
	return out

func _train() -> void:
	for b in _selected():
		if b.kind == "building" and b.owner == 1:
			var list: Array = E.trains_for(b)
			if list.size() > 0:
				var r = E.train(b, list[0])
				if r is String: note.text = {"pop": "Build more houses", "res": "Not enough resources", "busy": "Busy"}.get(r, r); _note_t = 3.0

func _process(dt: float) -> void:
	if not G.players.has(1): return
	var r: Dictionary = G.players[1].res
	var pc := E.pop_of(1)
	top.text = "Food %d   Wood %d   Gold %d   Stone %d   Pop %d/%d   %s   %d:%02d" % [r.food, r.wood, r.gold, r.stone, pc.x, pc.y, D.AGES[E.age_of(1)].short, int(G.time) / 60, int(G.time) % 60]
	_note_t -= dt
	if _note_t <= 0: note.text = ""

func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventScreenTouch or (ev is InputEventMouseButton and ev.button_index == MOUSE_BUTTON_LEFT):
		if ev.pressed:
			_drag = true; _moved = 0.0; _down = ev.position
		else:
			_drag = false
			if _moved < 14.0: _tap(ev.position)
	elif (ev is InputEventScreenDrag or ev is InputEventMouseMotion) and _drag:
		_moved += ev.relative.length()
		if _moved >= 14.0: world.pan_pixels(ev.relative)

## what is under the finger: a unit near the tap first, then the building or resource on the tile
func _pick(screen: Vector2):
	var best = null
	var bd := 34.0
	for e in G.ents:
		if e.dead or e.kind != "unit" or world._seen(e) == 0: continue
		var d: float = world.screen_of(e.x, e.y, 0.4).distance_to(screen)
		if d < bd:
			bd = d; best = e
	if best != null: return best
	var g: Vector2 = world.ground_at(screen)
	if M.in_map(int(g.x), int(g.y)):
		var id := M.block[M.idx(int(g.x), int(g.y))]
		if id > 0 and G.by_id.has(id): return G.by_id[id]
		for e in G.ents:
			if not e.dead and e.type == "farm" and g.x >= e.tx and g.x < e.tx + e.size and g.y >= e.ty and g.y < e.ty + e.size: return e
	return null

func _tap(screen: Vector2) -> void:
	var t = _pick(screen)
	var g: Vector2 = world.ground_at(screen)
	var mine := _selected().filter(func(e): return e.kind == "unit" and e.owner == 1)
	if mine.size() > 0 and not (t != null and t.kind == "unit" and t.owner == 1):
		E.cmd_smart(mine, g.x, g.y, t)
		return
	if t != null and (t.owner == 1 or t.kind != "res"): G.selection = [t.id]
	elif t == null: G.selection = []

func _shot() -> void:
	# test aid: DOD_SHOT=<file> runs the match for DOD_RUN seconds and saves a screenshot
	var secs := float(OS.get_environment("DOD_RUN")) if OS.has_environment("DOD_RUN") else 1.0
	if OS.has_environment("DOD_DEMO"): _demo()
	var steps := int(secs * 30)
	for i in steps: G.step(1 / 30.0)
	if OS.has_environment("DOD_ZOOM"): world.zoom_i = int(OS.get_environment("DOD_ZOOM"))
	for i in 6: await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(OS.get_environment("DOD_SHOT"))
	print("saved ", OS.get_environment("DOD_SHOT"), " fps ", Engine.get_frames_per_second(), " nodes ", world.nodes.size())
	get_tree().quit()

func _demo() -> void:
	# put the starting villagers to work and stand a few soldiers by the Town Center
	var tc = E.nearest(0, 0, func(e): return e.type == "towncenter" and e.owner == 1)
	var vils := E.units_of(1)
	var tree = E.nearest(tc.x, tc.y, func(e): return e.type == "tree")
	var berry = E.nearest(tc.x, tc.y, func(e): return e.type == "berry")
	E.cmd_smart([vils[0]], tree.x, tree.y, tree)
	E.cmd_smart([vils[1]], berry.x, berry.y, berry)
	E.place_building(1, "house", tc.tx + 6, tc.ty + 1, [vils[2]])
	E.place_building(1, "farm", tc.tx - 4, tc.ty + 1, [])
	E.add_building("barracks", 1, tc.tx - 5, tc.ty + 5, true)
	var k := 0
	for t in ["militia", "militia", "spearman", "archer", "longbowman", "knight"]:
		var u := E.add_unit(t, 1, tc.tx + 0.5 + k * 0.8, tc.ty + 5.6 + (k % 2) * 0.8)
		u.dir = k % 8
		k += 1
	G.selection = [vils[0].id]

extends Node
## Dawn of Dynasties, Godot edition: the studio splash, title menu, battle setup, the match and its results.

const World := preload("res://view/world.gd")
const Hud := preload("res://ui/hud.gd")
const Kit := preload("res://ui/kit.gd")
const Tutorial := preload("res://ui/tutorial.gd")
const Front := preload("res://ui/front.gd")

const PREFS := "user://prefs.json"

var world: Node3D
var hud: Control
var layer: CanvasLayer
var tutorial: Control
var front: Control          # title, main menu, Battle and the other screens before a match
var last_cfg: Dictionary = {}
var screen: Control        # the menu, setup, pause or results screen on top
var prefs := {"civ": "britons", "foe": "random", "level": "normal", "map": "random", "mode": "conquest", "pace": "quick", "size": "small", "music": true, "sound": true, "films": true, "speed": 1.0, "voice": true, "buzz": true}
var _autosave_t := 0.0

func _ready() -> void:
	get_tree().set_auto_accept_quit(false)
	if FileAccess.file_exists(PREFS):
		var p = JSON.parse_string(FileAccess.get_file_as_string(PREFS))
		if p is Dictionary: prefs.merge(p, true)
	Sfx.enabled = prefs.sound; Sfx.music_on = prefs.music
	layer = CanvasLayer.new(); add_child(layer)
	world = World.new(); add_child(world)
	G.game_over.connect(_on_game_over)
	front = Front.new()
	front.prefs = prefs
	layer.add_child(front)
	front.start_battle.connect(_start)
	front.load_slot.connect(_continue)
	front.learn.connect(_learn)
	front.prefs_changed.connect(_apply_prefs)
	_apply_prefs()
	if OS.has_environment("DOD_SHOT"):
		_test_shot.call_deferred()
		return
	_splash()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if hud != null and G.over == null and screen == null: _pause()
		elif hud != null and screen != null and G.over == null: _resume()
		else:
			_autosave(); get_tree().quit()
	elif what == NOTIFICATION_APPLICATION_PAUSED:
		_autosave()
		G.paused = hud != null

func _save_prefs() -> void:
	var f := FileAccess.open(PREFS, FileAccess.WRITE)
	if f != null: f.store_string(JSON.stringify(prefs))

func _autosave() -> void:
	if hud != null and G.over == null and tutorial == null: Save.save_game(0)

func _process(dt: float) -> void:
	if hud == null or G.paused or G.over != null: return
	_autosave_t += dt
	if _autosave_t > 60.0:
		_autosave_t = 0.0; _autosave()

# ---------------------------------------------------------------- screens
func _apply_prefs() -> void:
	G.set_meta("buzz", prefs.get("buzz", true)); G.set_meta("voice", prefs.get("voice", true))
	_save_prefs()

func _column(width: float = 560.0) -> VBoxContainer:
	var box := Kit.safe_box(); screen.add_child(box)
	var c := CenterContainer.new()
	box.add_child(c)
	var v := VBoxContainer.new(); v.custom_minimum_size.x = width
	v.add_theme_constant_override("separation", 12)
	c.add_child(v)
	return v

## The Forge Frame splash: about two seconds, a tap skips it. Then "Tap to begin".
func _splash() -> void:
	front.visible = false
	_backdrop(1.0)
	var black := ColorRect.new(); black.color = Color(0.02, 0.02, 0.02); black.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.add_child(black)
	var v := _column(520)
	var logo := TextureRect.new(); logo.texture = load("res://assets/ui/studio_logo.png"); logo.custom_minimum_size.y = 420
	logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	v.add_child(logo)
	var l := Kit.label("presents", 24, Kit.DIM); l.add_theme_font_override("font", Kit.heading(false)); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	screen.modulate.a = 0.0
	var done := [false]
	var go := func():
		if done[0]: return
		done[0] = true
		_title()
	var skip := Button.new(); skip.flat = true; skip.set_anchors_preset(Control.PRESET_FULL_RECT); skip.focus_mode = Control.FOCUS_NONE
	skip.pressed.connect(go)
	screen.add_child(skip)
	var tw := create_tween()
	tw.tween_property(screen, "modulate:a", 1.0, 0.5)
	tw.tween_interval(1.7)
	tw.tween_property(screen, "modulate:a", 0.0, 0.6)
	tw.tween_callback(go)

func _title() -> void:
	_clear_screen()
	front.visible = true
	front.show_title()
	Sfx.set_scene("menu")

func _menu() -> void:
	_end_match()
	_clear_screen()
	front.visible = true
	front.show_menu()
	Sfx.set_scene("menu")

func _start(cfg: Dictionary = {}) -> void:
	if cfg.is_empty(): cfg = last_cfg
	if cfg.is_empty():
		_menu(); return
	last_cfg = cfg.duplicate(true)
	_save_prefs()
	_end_match()
	front.visible = false
	G.new_game(cfg.duplicate(true))
	G.paused = true
	# each dynasty's pre-battle film, as in the web edition
	var film := "res://assets/video/dyn_%s.ogv" % G.players[1].civ
	if prefs.films and ResourceLoader.exists(film): _play_film(film, _begin_match)
	else: _begin_match()

func _clear_screen() -> void:
	if screen != null: screen.queue_free()
	screen = null

func _backdrop(dim: float = 1.0) -> Control:
	_clear_screen()
	screen = Control.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(screen)
	if dim >= 1.0 and ResourceLoader.exists("res://assets/ui/title_bg.jpg"):
		var bg := TextureRect.new(); bg.texture = load("res://assets/ui/title_bg.jpg")
		bg.set_anchors_preset(Control.PRESET_FULL_RECT); bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		screen.add_child(bg)
	var shade := ColorRect.new(); shade.color = Color(0.03, 0.02, 0.01, 0.55 if dim >= 1.0 else dim)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.add_child(shade)
	return screen

func _play_film(path: String, then: Callable) -> void:
	Sfx.set_scene("")
	_backdrop(1.0)
	var black := ColorRect.new(); black.color = Color.BLACK; black.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.add_child(black)
	var v := VideoStreamPlayer.new()
	v.stream = load(path)
	v.expand = true
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.add_child(v)
	var done := [false]
	var finish := func():
		if done[0]: return
		done[0] = true
		then.call()
	v.finished.connect(finish)
	var skip := Kit.button("Skip  ▸", finish, 24, Vector2(190, Kit.TOUCH))
	skip.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	var sb: float = Kit.safe().bottom
	skip.offset_left = -214; skip.offset_right = -24; skip.offset_top = -Kit.TOUCH - 32 - sb; skip.offset_bottom = -32 - sb
	screen.add_child(skip)
	v.play()

func _learn() -> void:
	_end_match()
	_clear_screen()
	front.visible = false
	tutorial = Tutorial.new()
	tutorial.world = world
	layer.add_child(tutorial)      # in the tree first: its steps and labels are made in _ready
	tutorial.begin()
	_begin_match()
	var done := func():
		G.alert("You are ready, my lord. Start a battle from the menu.")
	tutorial.finished.connect(done)

func _continue(slot: int = 0) -> void:
	_end_match()
	if Save.load_game(slot):
		front.visible = false
		_begin_match()
	else:
		Save.delete_save(slot); _menu()

func _begin_match() -> void:
	_clear_screen()
	if hud != null: hud.queue_free()
	hud = Hud.new()
	hud.world = world
	layer.add_child(hud)
	hud.pause_pressed.connect(_pause)
	world.hud = hud
	G.paused = false
	G.speed = prefs.get("speed", 1.0)
	_autosave_t = 0.0
	Sfx.set_scene("match", G.players[1].civ)
	var foe_names := []
	for id in G.players:
		if id != 1: foe_names.append(D.CIVS[G.players[id].civ].name)
	var goal: String = {"regicide": "Regicide: protect your King and Queen", "capture": "Capture: take their Town Center and hold it",
		"survival": "Siege Survival: hold out against the raiders", "empirewars": "Empire Wars: your town is ready, strike fast"}.get(G.rules.mode, "Conquest: destroy the " + ", ".join(foe_names))
	if tutorial == null: G.alert("%s  ·  %s" % [Maps.MAPS[G.rules.map].name, goal])

func _end_match() -> void:
	if tutorial != null: tutorial.queue_free()
	tutorial = null
	if hud != null: hud.queue_free()
	hud = null
	world.hud = null
	G.paused = true

func _pause() -> void:
	if G.over != null: return
	G.paused = true
	_backdrop(0.6)
	var v := _column(480)
	v.add_child(Kit.title("Paused", 40))
	v.add_child(Kit.grand("Resume", _resume, 104))
	var save := func():
		# the first empty slot of ten; when all are used, the oldest is replaced
		var slot := 1
		var oldest := ""
		for k in range(1, 11):
			if not Save.has_save(k):
				slot = k; oldest = ""; break
			var w: String = str(Save.info(k).get("when", ""))
			if oldest == "" or w < oldest:
				oldest = w; slot = k
		G.alert(("Game saved (Save %d)" % slot) if Save.save_game(slot) else "Could not save"); _resume()
	v.add_child(Kit.button("Save game", save))
	v.add_child(Kit.cycler("Speed", [[1.0, "Normal"], [1.5, "Fast"], [2.0, "Faster"]], G.speed, func(x): G.speed = x))
	var music := func(on):
		prefs.music = on; Sfx.set_music(on); _save_prefs()
	v.add_child(Kit.cycler("Music", [[true, "On"], [false, "Off"]], prefs.music, music))
	var resign := func():
		_resume(); G.resign(1)
	v.add_child(Kit.button("Resign", resign))
	var leave := func():
		Save.save_game(0); _menu()
	v.add_child(Kit.button("Save and quit to menu", leave))

func _resume() -> void:
	_clear_screen()
	G.paused = false

func _on_game_over(result: String) -> void:
	if tutorial == null: Save.delete_save(0)
	Sfx.ui("victory" if result == "victory" else "defeat")
	G.buzz(300)
	await get_tree().create_timer(1.2).timeout
	if hud == null: return
	_backdrop(0.72)
	var v := _column(600)
	v.add_child(Kit.title("Victory!" if result == "victory" else "Defeat", 58, Kit.GOLD if result == "victory" else Kit.BAD))
	var why: String = {"time": "Time is up: highest score wins", "hold": "An enemy home Town Center was held for 3 minutes", "alltc": "Every Town Center is held by one side",
		"survival": "The town fell after %d waves" % (Modes.surv.done if Modes.surv != null else 0)}.get(G.over_reason, "%d:%02d played" % [int(G.time) / 60, int(G.time) % 60])
	var sub := Kit.label(why, 22, Kit.DIM); sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(sub)
	var table := GridContainer.new(); table.columns = 5
	table.add_theme_constant_override("h_separation", 18); table.add_theme_constant_override("v_separation", 8)
	v.add_child(table)
	for h in ["Dynasty", "Score", "Kills", "Lost", "Age"]: table.add_child(Kit.label(h, 20, Kit.DIM))
	for id in G.players:
		var p: Dictionary = G.players[id]
		var name_l := Kit.label(("You · " if id == 1 else "") + D.CIVS[p.civ].name, 22, G.color_of(id).lightened(0.3))
		table.add_child(name_l)
		table.add_child(Kit.label(str(G.score_of(id)), 22))
		table.add_child(Kit.label(str(p.killed), 22))
		table.add_child(Kit.label(str(p.lost), 22))
		table.add_child(Kit.label(D.AGES[p.age].short, 22))
	v.add_child(Kit.grand("Play again", func(): _start({}), 104))
	var change := func():
		_end_match(); _clear_screen(); front.visible = true; front.show_battle(); Sfx.set_scene("menu")
	v.add_child(Kit.button("Change setup", change))
	v.add_child(Kit.button("Main menu", _menu))

# ---------------------------------------------------------------- test aid
## DOD_SHOT=<file> starts a match, runs it DOD_RUN seconds and saves a screenshot. DOD_DEMO=1 stages a small town,
## DOD_SCREEN=menu|setup shows that screen instead, DOD_CIV / DOD_FOE / DOD_SELECT pick dynasties and a selection.
func _test_shot() -> void:
	var env := func(k: String, d: String) -> String: return OS.get_environment(k) if OS.has_environment(k) else d
	var which: String = env.call("DOD_SCREEN", "match")
	if which == "title": _title()
	elif which == "menu": _menu()
	elif which == "setup":
		_menu(); front.show_battle()
	elif which == "dynasties":
		_menu(); front.show_dynasties("franks")
	else:
		if which == "learn":
			_learn()
			for k in 30: await get_tree().process_frame
		else: G.new_game({"seed": int(env.call("DOD_SEED", "12345")), "players": [{"civ": env.call("DOD_CIV", "britons")}, {"civ": env.call("DOD_FOE", "franks"), "ai": "normal"}],
			"size": "small", "pace": env.call("DOD_PACE", "quick"), "reveal": env.call("DOD_REVEAL", "normal"), "mode": env.call("DOD_MODE", "conquest")})
		if which != "learn": _begin_match()
		if OS.has_environment("DOD_DEMO"): _demo(env.call("DOD_DEMO", "1"))
		for i in int(float(env.call("DOD_RUN", "1")) * 30): G.step(1 / 30.0)
		world.zoom_i = int(env.call("DOD_ZOOM", "2"))
		var sel: String = env.call("DOD_SELECT", "")
		if sel != "":
			var e = E.nearest(0, 0, func(x): return x.owner == 1 and x.type == sel)
			if e != null:
				G.selection = [e.id]; world.look = Vector2(e.x, e.y)
		if OS.has_environment("DOD_PAGE"): hud.page = env.call("DOD_PAGE", "")
		if OS.has_environment("DOD_OVER"): G.resign(2)
	for i in 40: await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(OS.get_environment("DOD_SHOT"))
	print("saved ", OS.get_environment("DOD_SHOT"), " hud ", [hud.size, hud.panel.position, hud.panel.size, hud.panel.visible, hud.minimap.position, hud.grid.get_child_count()] if hud != null else "")
	get_tree().quit()

func _demo(kind: String) -> void:
	var tc = E.nearest(0, 0, func(e): return e.type == "towncenter" and e.owner == 1)
	if kind == "town":
		# every building this dynasty has, in rows on cleared ground, to check each sits on its plot
		for e in G.ents.duplicate():
			if e.kind == "res": E.kill(e)
		G.players[1].age = int(OS.get_environment("DOD_AGE")) if OS.has_environment("DOD_AGE") else 3
		var x := 4
		var y := 4
		var row_h := 0
		for type in D.BUILDINGS:
			if type in ["towncenter", "palisade", "stonewall", "gate"] or E.civ_blocks(1, type): continue
			var s: int = D.BUILDINGS[type].size
			if x + s > 30:
				x = 4; y += row_h + 2; row_h = 0
			if M.area_free(x, y, s):
				var b := E.add_building(type, 1, x, y, true)
				if G.selection.size() < 40: G.selection.append(b.id)
			x += s + 2; row_h = maxi(row_h, s)
		G.reveal_all = true
		world.look = Vector2(17, y / 2.0 + 4)
		return
	var vils := E.units_of(1)
	var tree = E.nearest(tc.x, tc.y, func(e): return e.type == "tree")
	var berry = E.nearest(tc.x, tc.y, func(e): return e.type == "berry")
	E.cmd_smart([vils[0]], tree.x, tree.y, tree)
	E.cmd_smart([vils[1]], berry.x, berry.y, berry)
	G.players[1].res = {"food": 800, "wood": 800, "gold": 500, "stone": 400}
	E.place_building(1, "house", tc.tx + 6, tc.ty + 1, [vils[2]])
	E.add_building("barracks", 1, tc.tx - 5, tc.ty + 5, true)
	var k := 0
	var roster: Array = OS.get_environment("DOD_UNITS").split(",") if OS.has_environment("DOD_UNITS") else ["militia", "militia", "spearman", "archer", "longbowman", "knight"]
	for t in roster:
		var u := E.add_unit(t, 1, tc.tx + 0.5 + k * 1.1, tc.ty + 5.8 + (k % 2) * 1.3)
		u.dir = k % 8
		k += 1

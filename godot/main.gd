extends Node
## Dawn of Dynasties, Godot edition: the studio splash, title menu, battle setup, the match and its results.

const World := preload("res://view/world.gd")
const Hud := preload("res://ui/hud.gd")
const Kit := preload("res://ui/kit.gd")
const Tutorial := preload("res://ui/tutorial.gd")

const CIV_ORDER := ["britons", "franks", "byzantines", "chinese", "persians", "incas", "cholas"]
const PREFS := "user://prefs.json"

var world: Node3D
var hud: Control
var layer: CanvasLayer
var tutorial: Control
var screen: Control        # the menu, setup, pause or results screen on top
var prefs := {"civ": "britons", "foe": "random", "level": "normal", "map": "random", "mode": "conquest", "pace": "quick", "size": "small", "music": true, "sound": true, "films": true, "intro_seen": false}
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

func _set_music(on: bool) -> void:
	prefs.music = on; Sfx.set_music(on); _save_prefs()

func _set_films(on: bool) -> void:
	prefs.films = on; _save_prefs()

func _set_sound(on: bool) -> void:
	prefs.sound = on; Sfx.enabled = on; _save_prefs()

func _autosave() -> void:
	if hud != null and G.over == null and tutorial == null: Save.save_game(0)

func _process(dt: float) -> void:
	if hud == null or G.paused or G.over != null: return
	_autosave_t += dt
	if _autosave_t > 60.0:
		_autosave_t = 0.0; _autosave()

# ---------------------------------------------------------------- screens
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

func _column(width: float = 560.0) -> VBoxContainer:
	var c := CenterContainer.new(); c.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.add_child(c)
	var v := VBoxContainer.new(); v.custom_minimum_size.x = width
	v.add_theme_constant_override("separation", 12)
	c.add_child(v)
	return v

func _image(path: String, height: float) -> TextureRect:
	var t := TextureRect.new()
	if ResourceLoader.exists(path): t.texture = load(path)
	t.custom_minimum_size.y = height
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	return t

func _splash() -> void:
	_backdrop(1.0)
	var black := ColorRect.new(); black.color = Color(0.02, 0.02, 0.02); black.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.add_child(black)
	var v := _column(520)
	v.add_child(_image("res://assets/ui/studio_logo.png", 300))
	var l := Kit.label("presents", 24, Kit.DIM); l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	var tw := create_tween()
	tw.tween_interval(1.6)
	tw.tween_property(screen, "modulate:a", 0.0, 0.5)
	tw.tween_callback(_after_splash)

func _after_splash() -> void:
	# the intro film plays the first time the game is opened; after that it is under Films on the menu
	if not prefs.intro_seen and ResourceLoader.exists("res://video/intro.ogv"):
		prefs.intro_seen = true; _save_prefs()
		_play_film("res://video/intro.ogv", _menu)
	else: _menu()

## a film over the whole screen with a Skip button; `then` runs when it ends or is skipped
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
	var skip := Kit.button("Skip  ▸", finish, 22, Vector2(150, 60))
	skip.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	skip.offset_left = -170; skip.offset_right = -20; skip.offset_top = -100; skip.offset_bottom = -40
	screen.add_child(skip)
	v.play()

func _menu() -> void:
	_end_match()
	_backdrop(1.0)
	screen.modulate.a = 1.0
	Sfx.set_scene("menu")
	var v := _column()
	v.add_child(_image("res://assets/ui/logo.png", 340))
	if Save.has_save(0):
		var i := Save.info(0)
		if not i.is_empty():
			v.add_child(Kit.button("Continue  ·  %s, %d min" % [D.CIVS[i.civ].name, int(i.time / 60)], _continue, 28, Vector2(0, 84)))
	v.add_child(Kit.grand("Play", _setup))
	v.add_child(Kit.button("Learn to Play", _learn, 26, Vector2(0, 72)))
	v.add_child(Kit.cycler("Music", [[true, "On"], [false, "Off"]], prefs.music, _set_music))
	v.add_child(Kit.cycler("Sound", [[true, "On"], [false, "Off"]], prefs.sound, _set_sound))
	v.add_child(Kit.cycler("Films", [[true, "On"], [false, "Off"]], prefs.films, _set_films))
	if ResourceLoader.exists("res://video/intro.ogv"): v.add_child(Kit.button("Watch the intro", func(): _play_film("res://video/intro.ogv", _menu), 24, Vector2(0, 64)))
	v.add_child(Kit.button("Quit", func(): get_tree().quit(), 24, Vector2(0, 64)))
	var mark := _image("res://assets/ui/studio_mark.png", 54)
	v.add_child(mark)
	var credit := Kit.label("A Forge Frame game  ·  Godot edition %s" % ProjectSettings.get_setting("application/config/version", ""), 18, Kit.DIM)
	credit.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(credit)

func _setup() -> void:
	_backdrop(1.0)
	var v := _column(620)
	v.add_child(Kit.title("Battle", 44))
	v.add_child(Kit.label("Your dynasty", 22, Kit.DIM))
	var civs := GridContainer.new(); civs.columns = 4
	civs.add_theme_constant_override("h_separation", 8); civs.add_theme_constant_override("v_separation", 8)
	v.add_child(civs)
	var blurb := Kit.label("", 20); blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; blurb.custom_minimum_size.y = 84
	var buttons := {}
	var pick := func(civ: String):
		prefs.civ = civ
		for k in buttons: buttons[k].add_theme_stylebox_override("normal", Kit.box(Color("#6b4a1c") if k == civ else Color("#3a2a17"), Kit.GOLD if k == civ else Kit.EDGE))
		blurb.text = "%s: %s" % [D.CIVS[civ].name, D.CIVS[civ].get("bonus", D.CIVS[civ].get("desc", ""))]
	for civ in CIV_ORDER:
		if not D.CIVS.has(civ): continue
		var b := Button.new(); b.custom_minimum_size = Vector2(146, 132)
		Kit.style_button(b, 19)
		b.text = D.CIVS[civ].name
		b.icon = load("res://assets/ui/crest_%s.png" % civ) if ResourceLoader.exists("res://assets/ui/crest_%s.png" % civ) else null
		b.expand_icon = true; b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER; b.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		b.pressed.connect(pick.bind(civ))
		civs.add_child(b); buttons[civ] = b
	v.add_child(blurb)
	pick.call(prefs.civ if D.CIVS.has(prefs.civ) else "britons")
	var foes := [["random", "Random"]]
	for civ in CIV_ORDER:
		if D.CIVS.has(civ): foes.append([civ, D.CIVS[civ].name])
	v.add_child(Kit.cycler("Enemy", foes, prefs.foe, func(x): prefs.foe = x))
	v.add_child(Kit.cycler("Difficulty", [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]], prefs.level, func(x): prefs.level = x))
	v.add_child(Kit.cycler("Mode", [["conquest", "Conquest  (destroy them)"], ["regicide", "Regicide  (kill King and Queen)"],
		["capture", "Capture  (take their Town Center)"], ["survival", "Siege Survival  (hold out)"], ["empirewars", "Empire Wars  (fast start)"]], prefs.mode, func(x): prefs.mode = x))
	var maps := [["random", "Random"]]
	for k in Maps.MAPS: maps.append([k, Maps.MAPS[k].name])
	v.add_child(Kit.cycler("Map", maps, prefs.map, func(x): prefs.map = x))
	v.add_child(Kit.cycler("Match", [["quick", "Quick  (about 10–15 min)"], ["classic", "Classic  (AoE2 pace)"]], prefs.pace, func(x): prefs.pace = x))
	v.add_child(Kit.cycler("Map size", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], prefs.size, func(x): prefs.size = x))
	v.add_child(Kit.grand("Start Battle", _start))
	v.add_child(Kit.button("Back", _menu, 24, Vector2(0, 64)))

func _start() -> void:
	_save_prefs()
	var foe: String = prefs.foe
	if foe == "random":
		var pool := CIV_ORDER.filter(func(c): return D.CIVS.has(c) and c != prefs.civ)
		foe = pool[randi() % pool.size()]
	var quick: bool = prefs.pace == "quick"
	# Siege Survival is you against the raiders; the difficulty sets how hard the waves hit
	var players := [{"civ": prefs.civ}] if prefs.mode == "survival" else [{"civ": prefs.civ}, {"civ": foe, "ai": prefs.level}]
	G.new_game({"players": players, "mode": prefs.mode, "map": prefs.map, "raidLvl": prefs.level, "neutral": true,
		"size": prefs.size, "pace": prefs.pace, "pop": 100 if quick else 200})
	G.paused = true
	# each dynasty's pre-battle film, as in the web edition
	var film := "res://assets/video/dyn_%s.ogv" % prefs.civ
	if prefs.films and ResourceLoader.exists(film): _play_film(film, _begin_match)
	else: _begin_match()

func _learn() -> void:
	_clear_screen()
	tutorial = Tutorial.new()
	tutorial.world = world
	layer.add_child(tutorial)      # in the tree first: its steps and labels are made in _ready
	tutorial.begin()
	_begin_match()
	var done := func():
		G.alert("You are ready, my lord. Start a battle from the menu.")
	tutorial.finished.connect(done)

func _continue() -> void:
	if Save.load_game(0): _begin_match()
	else:
		Save.delete_save(0); _menu()

func _begin_match() -> void:
	_clear_screen()
	if hud != null: hud.queue_free()
	hud = Hud.new()
	hud.world = world
	layer.add_child(hud)
	hud.pause_pressed.connect(_pause)
	world.hud = hud
	G.paused = false
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
	v.add_child(Kit.grand("Resume", _resume, 88))
	var save := func():
		G.alert("Game saved" if Save.save_game(0) else "Could not save"); _resume()
	v.add_child(Kit.button("Save game", save))
	v.add_child(Kit.cycler("Speed", [[1.0, "Normal"], [1.5, "Fast"], [2.0, "Faster"]], G.speed, func(x): G.speed = x))
	v.add_child(Kit.cycler("Music", [[true, "On"], [false, "Off"]], prefs.music, _set_music))
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
	v.add_child(Kit.grand("Play again", _start, 88))
	v.add_child(Kit.button("Change setup", _setup))
	v.add_child(Kit.button("Main menu", _menu))

# ---------------------------------------------------------------- test aid
## DOD_SHOT=<file> starts a match, runs it DOD_RUN seconds and saves a screenshot. DOD_DEMO=1 stages a small town,
## DOD_SCREEN=menu|setup shows that screen instead, DOD_CIV / DOD_FOE / DOD_SELECT pick dynasties and a selection.
func _test_shot() -> void:
	var env := func(k: String, d: String) -> String: return OS.get_environment(k) if OS.has_environment(k) else d
	var which: String = env.call("DOD_SCREEN", "match")
	if which == "menu": _menu()
	elif which == "setup": _setup()
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

extends Control
## Learn to Play: eight short voiced steps (the same lines and voice files as the web edition).
## Each step shows what to do, marks where on the map, and moves on as soon as the player does it.

const Kit := preload("res://ui/kit.gd")
const FOE := 2

signal finished

var world: Node3D
var i := -1
var steps: Array = []
var title: Label
var text: Label
var hint: Label
var voice: AudioStreamPlayer
var outpost = null
var raid_ids: Array = []
var start := {}
var _ring_t := 0.0

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _mine(type: String) -> Array:
	var out := []
	for e in G.ents:
		if not e.dead and e.owner == 1 and e.type == type: out.append(e)
	return out

func _tc():
	var t := _mine("towncenter")
	return t[0] if t.size() > 0 else null

func _raiders() -> Array:
	var out := []
	for id in raid_ids:
		var e = G.by_id.get(id)
		if e != null and not e.dead: out.append(e)
	return out

func _grant(r: Dictionary) -> void:
	for k in r: G.players[1].res[k] += r[k]

func _ready() -> void:
	var p := Kit.panel()
	p.set_anchors_preset(Control.PRESET_TOP_WIDE)
	p.offset_top = 216; p.offset_left = 10; p.offset_right = -10
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(p)
	var v := VBoxContainer.new(); v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(v)
	title = Kit.title("", 24); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	v.add_child(title)
	text = Kit.label("", 21); text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(text)
	hint = Kit.label("", 19, Kit.GOLD)
	v.add_child(hint)
	voice = AudioStreamPlayer.new(); add_child(voice)
	steps = [
		{"title": "Your people await", "text": "Welcome, my lord. Your people look to you now. Tap a villager to choose one.",
			"target": func(): return _mine("villager")[0] if _mine("villager").size() > 0 else null,
			"done": func(): return G.selection.any(func(id): return G.by_id.has(id) and G.by_id[id].type == "villager")},
		{"title": "Gather wood", "text": "Now tap a tree. Your villager will chop wood and carry it home. A ring shows where the order landed.",
			"target": func(): return E.nearest(_tc().x, _tc().y, func(e): return e.kind == "res" and e.type == "tree") if _tc() != null else null,
			"done": func(): return _mine("villager").any(func(u): return u.task.t == "gather" and u.task.get("rtype", "") == "tree")},
		{"title": "Build a house", "text": "Your people need homes. Select a villager, tap Economy, then House, tap open ground to place it, and tap Build here.",
			"enter": func(): _grant({"wood": 60}), "done": func(): return _mine("house").size() > start.house},
		{"title": "More villagers", "text": "Tap your Town Center and train villagers. Hold the Villager button to queue five at once.",
			"target": _tc, "enter": func(): _grant({"food": 250}),
			"done": func(): return (_tc() != null and _tc().queue.size() >= 2) or _mine("villager").size() >= start.vils + 2},
		{"title": "Raise an army", "text": "Build a Barracks (under Military), then train 3 Swordsmen there. Idle hands? The villager button on the right finds them.",
			"enter": func(): _grant({"wood": 200, "food": 200, "gold": 80}),
			"target": func(): return _mine("barracks")[0] if _mine("barracks").size() > 0 else null,
			"done": func(): return _mine("militia").size() >= 3,
			"hint": func(): return ("Swordsmen ready: %d / 3" % _mine("militia").size()) if _mine("barracks").size() > 0 else ""},
		{"title": "Their Special", "text": "Every soldier has one special move. Select your swordsmen and tap Special: they will Rush forward.",
			"done": func(): return _mine("militia").any(func(u): return u.get("spReady", 0.0) > G.time)},
		{"title": "Defend your town!", "text": "Raiders are coming! Tap the crossed-swords button on the right to select your soldiers, then tap an enemy to attack.",
			"enter": _spawn_raid, "target": func(): return _raiders()[0] if _raiders().size() > 0 else null,
			"done": func(): return _raiders().is_empty(),
			"hint": func(): return ("Raiders left: %d" % _raiders().size()) if _raiders().size() > 0 else ""},
		{"title": "Destroy the outpost", "text": "Well fought! Now take the fight to them: send your army to destroy the enemy outpost.",
			"enter": func(): _grant({"food": 120, "gold": 40}),
			"target": func(): return E.nearest(0, 0, func(e): return e.owner == FOE and e.kind == "building"),
			"done": func(): return not G.players[FOE].alive},
	]

func _spawn_raid() -> void:
	var home = _tc()
	if outpost == null or home == null: return
	raid_ids = []
	for k in 2:
		var f = M.nearest_free(roundi(outpost.x - 3 + k), roundi(outpost.y + 3), 6)
		if f == null: continue
		var u := E.add_unit("militia", FOE, f.x + 0.5, f.y + 0.5)
		u.hp = 35; u.maxHp = 35       # weaker than the player's swordsmen: a first fight to win
		raid_ids.append(u.id)
	E.cmd_attack(_raiders(), home)
	for u in _raiders(): u.task.forced = true
	G.snd("attacked")

## set the match up: your town, and an enemy outpost that does not play
func begin() -> void:
	G.new_game({"players": [{"civ": "britons"}, {"civ": "franks", "ai": "easy"}], "size": "small", "reveal": "explored", "mode": "conquest", "seed": 4242, "pace": "quick"})
	G.ais = []
	var home = _tc()
	var foe_tc = E.nearest(0, 0, func(e): return e.owner == FOE and e.type == "towncenter")
	var ox := roundi(home.x + (foe_tc.x - home.x) * 0.45)
	var oy := roundi(home.y + (foe_tc.y - home.y) * 0.45)
	var spot := func(s: int, x: int, y: int) -> Vector2i:
		for r in 12:
			for j in range(-r, r + 1):
				for k in range(-r, r + 1):
					if M.area_free(x + k - 1, y + j - 1, s + 2): return Vector2i(x + k, y + j)
		return Vector2i(x, y)
	var b1: Vector2i = spot.call(3, ox, oy)
	outpost = E.add_building("barracks", FOE, b1.x, b1.y, true)
	var h1: Vector2i = spot.call(2, ox + 4, oy - 1)
	E.add_building("house", FOE, h1.x, h1.y, true)
	for e in G.ents.duplicate():
		if not e.dead and e.owner == FOE and (e.type == "towncenter" or e.kind == "unit"): E.kill(e)
	G.ents = G.ents.filter(func(e): return not e.dead)
	G.corpses = []; G.effects = []; G.decals = []
	G.players[FOE].alive = true; G.over = null
	start = {"vils": _mine("villager").size(), "house": _mine("house").size()}
	G.new_game_started.emit()
	G.focus.emit(home.x + 1, home.y + 3)
	_go(0)

func _go(n: int) -> void:
	i = n
	if i >= steps.size():
		finished.emit(); return
	var s: Dictionary = steps[i]
	title.text = "%d / %d   %s" % [i + 1, steps.size(), s.title]
	text.text = s.text
	hint.text = ""
	if s.has("enter"): s.enter.call()
	var f := "res://assets/sound/voice/tut_%d.mp3" % (i + 1)
	if Sfx.enabled and G.get_meta("voice", true) and ResourceLoader.exists(f):
		voice.stream = load(f); voice.play()

func _process(dt: float) -> void:
	if i < 0 or i >= steps.size() or G.paused: return
	var s: Dictionary = steps[i]
	if s.has("hint"): hint.text = s.hint.call()
	# a ring on what to tap, every second or so
	_ring_t -= dt
	if _ring_t <= 0 and s.has("target") and world != null:
		_ring_t = 1.1
		var t = s.target.call()
		if t != null: world.ping(t.x, t.y, Color(1.0, 0.85, 0.3))
	if s.done.call(): _go(i + 1)

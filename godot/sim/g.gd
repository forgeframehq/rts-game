extends Node
## Match state, world setup, the simulation step and victory. Port of js/game.js.

signal alerted(text: String)
signal sound(key: String, x: float, y: float)
signal fighting
signal game_over(result: String)
signal focus(x: float, y: float)
signal killed(e: Dictionary)
signal new_game_started

const MOURN := 120.0

var MAP := 72
var ents: Array = []
var by_id: Dictionary = {}
var projs: Array = []
var effects: Array = []
var decals: Array = []
var corpses: Array = []
var players: Dictionary = {}
var rules: Dictionary = {"res": "standard", "pop": 200, "map": "grasslands", "mode": "conquest"}
var config: Dictionary = {}
var kings: Dictionary = {}
var ais: Array = []
var selection: Array = []      # ids of the entities the player has selected
var cmd_target = null
var replay: Array = []

var time := 0.0
var over = null                # null, "victory" or "defeat"
var over_reason = null
var speed := 1.0
var paused := false
var demo := false
var reveal_all := false
var net_on := false
var path_budget := 8
var fast_train := 1.0
var fast_gather := 1.0
var fast_build := 1.0
var terrain_speed := 1.0

var _rng := M.Rng.new(1)
var _fog_t := 0.0
var _warned := 0

# ---------- deterministic random numbers for the simulation ----------
func rand() -> float:
	return _rng.next()

func seed_rand(v: int) -> void:
	_rng = M.Rng.new(v if (v & 0xFFFFFFFF) != 0 else 1)

# ---------- messages to the interface ----------
func alert(text: String) -> void:
	alerted.emit(text)

func snd(key: String, x: float = -1.0, y: float = -1.0) -> void:
	sound.emit(key, x, y)

# ---------- hooks the game modes and Specials plug into ----------
var mode_node = null       # sim/modes.gd once it is ported
var specials_node = null   # sim/specials.gd once it is ported

func dmg_mod(att: Dictionary, t: Dictionary, dmg: float) -> float:
	return specials_node.dmg_mod(att, t, dmg) if specials_node != null else dmg
func speed_mul(u: Dictionary) -> float:
	return specials_node.speed_mul(u) if specials_node != null else 1.0
func hp_floor(t: Dictionary):
	return mode_node.hp_floor(t) if mode_node != null else null
func no_shoot(b: Dictionary) -> bool:
	return mode_node.no_shoot(b) if mode_node != null else false
func no_repair(b: Dictionary) -> bool:
	return mode_node.no_repair(b) if mode_node != null else false
func rule_block(owner_: int, type: String, tx: int, ty: int) -> bool:
	return mode_node.rule_block(owner_, type, tx, ty) if mode_node != null else false
func on_hit(_att: Dictionary, _t: Dictionary) -> void: pass
func on_built(_b: Dictionary) -> void: pass
func on_building_placed(_b: Dictionary) -> void: pass
func on_spawn(_u: Dictionary, _b: Dictionary) -> void: pass
func on_deposit(_u: Dictionary, _carry: Dictionary) -> void: pass
func on_age_up(owner_: int, to: int) -> void:
	if owner_ == 1: alert("You advanced to the %s!" % D.AGES[to].name)
func on_researched(owner_: int, tech_name: String) -> void:
	if owner_ == 1: alert("%s researched" % tech_name)

# ---------- world setup ----------
func _cluster(r: Callable, type: String, cx: int, cy: int, count: int, spread: float = 1.0) -> void:
	var placed := 0
	var tries := 0
	var pts := [Vector2(cx, cy)]
	while placed < count and tries < count * 30:
		tries += 1
		var p: Vector2 = pts[floori(r.call() * pts.size())]
		var x := roundi(p.x + (r.call() * 2 - 1) * spread)
		var y := roundi(p.y + (r.call() * 2 - 1) * spread)
		if not M.in_map(x, y) or x < 1 or y < 1 or x > MAP - 2 or y > MAP - 2: continue
		if E.add_resource(type, x, y) != null:
			placed += 1; pts.append(Vector2(x, y))

func _start_resources(r: Callable, cx: int, cy: int) -> void:
	# pick angles for each resource around the TC
	var ang := []
	var pick := func() -> float:
		for k in 50:
			var a: float = r.call() * PI * 2
			var ok := true
			for b in ang:
				if absf(atan2(sin(a - b), cos(a - b))) <= 0.9: ok = false
			if ok:
				ang.append(a); return a
		var a2: float = r.call() * 6.28
		ang.append(a2)
		return a2
	var a: float = pick.call()
	_cluster(r, "berry", roundi(cx + cos(a) * 5.5), roundi(cy + sin(a) * 5.5), 6, 1)
	a = pick.call(); _cluster(r, "gold", roundi(cx + cos(a) * 8), roundi(cy + sin(a) * 8), 6, 1)
	a = pick.call(); _cluster(r, "stone", roundi(cx + cos(a) * 9), roundi(cy + sin(a) * 9), 5, 1)
	a = pick.call(); _cluster(r, "tree", roundi(cx + cos(a) * 8), roundi(cy + sin(a) * 8), 30, 2)
	a = pick.call(); _cluster(r, "tree", roundi(cx + cos(a) * 10), roundi(cy + sin(a) * 10), 22, 2)

func apply_colors() -> void:
	pass   # player colours are read from players[id].color and D.PALETTE by the view

func slot_num(i: int, me: int) -> int:
	return 1 if i == me else (i + 2 if i < me else i + 1)

## cfg: { players: [{ civ, team, ai, color }], size, res, pop, reveal, seed, mode, map, ... }
## players[0] is the human. ai is a difficulty ("easy" | "normal" | "hard") for computer players.
func new_game(cfg: Dictionary = {}) -> void:
	var seed_: int = cfg.get("seed", 0)
	if seed_ == 0: seed_ = randi() % 1000000000
	config = cfg.duplicate(); config.seed = seed_
	rules = {"size": cfg.get("size", "medium"), "res": cfg.get("res", "standard"), "pop": cfg.get("pop", 200),
		"reveal": cfg.get("reveal", "normal"), "shape": "diamond", "mode": cfg.get("mode", "conquest"),
		"time": float(cfg.get("time", 0)), "map": "grasslands", "wave": float(cfg.get("wave", 60)),
		"neutral": cfg.get("neutral", false), "raidLvl": cfg.get("raidLvl", "normal"),
		"startAge": clampi(cfg.get("startAge", 1), 1, 4)}
	MAP = D.MAP_SIZES.get(rules.size, 72)
	var N := MAP
	ents = []; by_id = {}; projs = []; effects = []; decals = []; corpses = []; kings = {}; selection = []
	E.next_id = 1
	M.init_map(seed_)
	var slots: Array = cfg.get("players", [])
	if slots.is_empty(): slots = [{"civ": "britons"}, {"civ": "franks", "ai": "normal"}]
	players = {}
	# the local player is always player 1 on its own phone. In a network match the guest's slot
	# is relabelled, but everything is still created in slot order so both phones agree on ids.
	var me: int = cfg.get("me", 0)
	net_on = cfg.get("net", false)
	for i in slots.size():
		var s: Dictionary = slots[i]
		var ai = null if i == me else s.get("ai", null if net_on else "normal")
		players[slot_num(i, me)] = E.make_player(slot_num(i, me), s.civ, {"team": s.get("team", 0), "ai": ai})
	# colours: each player's pick, or with team colours on, one colour per team
	var used := {}
	for i in slots.size():
		var s: Dictionary = slots[i]
		var team_colors: bool = cfg.get("teamColors", false)
		var c: int = s.team - 1 if (team_colors and s.get("team", 0) > 0) else s.get("color", i)
		if not team_colors:
			while used.has(c): c = (c + 1) % D.PALETTE.size()
			used[c] = true
		var pl: Dictionary = players[slot_num(i, me)]
		pl.color = c
		var R: Dictionary = D.ROYALS.get(s.civ, D.ROYALS.britons)
		var pick: Array = R.names[(i * 7 + seed_) % R.names.size()]
		pl.royals = {"king": s.get("kingName", pick[0]), "queen": s.get("queenName", pick[1])}
	# a later starting Age, as in AoE2's setup: everyone begins already advanced
	for id in players: players[id].age = rules.startAge
	time = 0.0; over = null; over_reason = null; replay = []; _warned = 0; _fog_t = 0.0
	var r: Callable = M.map_rng
	# corner spots: bottom-left, top-right, top-left, bottom-right on screen
	var m := roundi(N * 0.18)
	var spots := [Vector2i(m, N - m - 3), Vector2i(N - m - 3, m), Vector2i(m, m), Vector2i(N - m - 3, N - m - 3)]
	var starts := []
	for i in slots.size(): starts.append({"p": slot_num(i, me), "x": spots[i].x, "y": spots[i].y})
	seed_rand(seed_)
	rules.map = Maps.pick_map(cfg.get("map", "grasslands"), r)
	Maps.paint(rules.map, r, starts)
	# Town centers first (so resources avoid them)
	var tcs := []
	for s in starts: tcs.append(E.add_building("towncenter", s.p, s.x, s.y, true))
	# Regicide: each player is given a King and a Queen. Lose both and the dynasty falls.
	if rules.mode == "regicide":
		for s in starts:
			E.add_unit("king", s.p, s.x + 3.5, s.y + 4.2)
			E.add_unit("queen", s.p, s.x + 4.4, s.y + 3.6)
	Maps.walls(rules.map, starts)
	for s in starts: _start_resources(r, s.x + 2, s.y + 2)   # around the 4x4 Town Center's middle
	# Forests and scattered resources across the map, away from starts
	var far := func(x: int, y: int) -> bool:
		for s in starts:
			if Vector2(x - s.x, y - s.y).length() <= 13: return false
		return true
	var scale := (N * N) / (72.0 * 72.0)
	for k in roundi(22 * scale * Maps.forest(rules.map)):
		var x: int = 3 + floori(r.call() * (N - 6))
		var y: int = 3 + floori(r.call() * (N - 6))
		if far.call(x, y): _cluster(r, "tree", x, y, 18 + floori(r.call() * 30), 2)
	for k in roundi(8 * scale):
		var x: int = 6 + floori(r.call() * (N - 12))
		var y: int = 6 + floori(r.call() * (N - 12))
		if far.call(x, y): _cluster(r, "stone" if k % 3 == 0 else ("gold" if k % 3 == 1 else "berry"), x, y, 5, 1)
	Maps.extras(rules.map, r, func(type, cx, cy, count, spread): _cluster(r, type, cx, cy, count, spread))
	# Starting villagers
	for tc in tcs:
		var md: Dictionary = E.mods(tc.owner)
		for i in 3 + md.get("extraVils", 0):
			var f = M.nearest_free(tc.tx + 1 + (i % 3), tc.ty + 5 + i / 3, 6)
			E.add_unit("villager", tc.owner, f.x + 0.5, f.y + 0.5)
	if mode_node != null: mode_node.setup(starts, r)
	reveal_all = rules.reveal == "all"
	if rules.reveal == "explored": M.explored.fill(1)
	M.update_fog()
	var my_tc: Dictionary = tcs[0]
	for t in tcs:
		if t.owner == 1: my_tc = t
	ais = []
	for id in players:
		var p: Dictionary = players[id]
		if p.ai == null or not has_node("/root/AI"): continue
		ais.append(get_node("/root/AI").make(id, p.ai))
	new_game_started.emit()
	focus.emit(my_tc.x, my_tc.y + 2)

# Walls and fields don't keep a dynasty alive: nobody should have to hunt down a lone palisade.
# Units sheltering in a building still count.
func _counts(x: Dictionary) -> bool:
	return not x.dead and (x.kind == "unit" or (x.kind == "building" and x.type != "farm" and not x.def.has("wall")))

func _has_stuff(p: int) -> bool:
	if E.units_of(p).size() > 0: return true
	for x in ents:
		if x.owner == p and x.kind == "building" and _counts(x): return true
	return false

## Regicide: the dynasty stands while either royal lives; when the King falls the Queen rules on
func _royals_down(p: int) -> bool:
	return rules.mode == "regicide" and E.royal(p, "king") == null and E.royal(p, "queen") == null

func _name_of(id: int) -> String:
	return "Your" if id == 1 else "The %s'" % D.CIVS[players[id].civ].name

func color_name(id: int) -> String:
	return D.PALETTE[players[id].color][0]

func color_of(id: int) -> Color:
	if id <= 0 or not players.has(id): return Color("#bbbbbb")
	return Color(D.PALETTE[players[id].color][1])

## a defeated or resigning dynasty's town falls with it
func eliminate(id: int) -> void:
	if not players.has(id): return
	players[id].alive = false
	for e in ents.duplicate():
		if not e.dead and e.owner == id and e.kind == "building": E.kill(e)
	for e in ents.duplicate():
		if not e.dead and e.owner == id and e.kind == "unit": E.kill(e)

func resign(id: int) -> void:
	if not players.has(id) or not players[id].alive or over != null: return
	alert("🏳️ %s (%s) resigned" % [D.CIVS[players[id].civ].name, color_name(id)])
	eliminate(id)
	check_end()

## Score, AoE2-style: economy, military and progress. Used for the time limit and the end screen.
func score_parts(id: int) -> Dictionary:
	var p: Dictionary = players[id]
	var g: Dictionary = p.gathered
	var ups: int = p.techs.size()
	for k in p.up: ups += p.up[k]
	return {"military": roundi(p.killValue / 5.0), "economy": roundi((g.food + g.wood + g.gold + g.stone) / 10.0),
		"technology": ups * 20, "society": (p.age - 1) * 150}

func score_of(id: int) -> int:
	var s := score_parts(id)
	return s.military + s.economy + s.technology + s.society + (mode_node.score(id) if mode_node != null else 0)

func _side_of(id: int) -> String:
	return "t%d" % players[id].team if players[id].team > 0 else "p%d" % id

func check_end() -> void:
	if over != null: return
	if not players[1].alive:
		over = "defeat"; game_over.emit(over)
		return
	for id in players:
		if players[id].alive and E.enemies(1, id): return
	over = "victory"; game_over.emit(over)

func on_killed(e: Dictionary) -> void:
	killed.emit(e)
	if over != null or e.owner == 0: return
	# a royal has fallen but the other still lives
	if rules.mode == "regicide" and e.def.get("cls", "") == "hero" and players[e.owner].alive and not _royals_down(e.owner):
		var mine := "Your " if e.owner == 1 else ""
		if e.type == "king":
			players[e.owner].mourn = time + MOURN
			alert("👑 %s%s has fallen! %s takes the throne." % [mine, royal_name(e.owner, "king"), royal_name(e.owner, "queen")])
		else: alert("👸 %s%s has fallen!" % [mine, royal_name(e.owner, "queen")])
	for id in players:
		var p: Dictionary = players[id]
		if not p.alive or p.raider: continue
		var lost_crown := _royals_down(id)
		if not _has_stuff(id) or lost_crown:
			p.alive = false
			if lost_crown: alert("👑 Your King and Queen are dead. Your dynasty has fallen." if id == 1 else "👑 %s King and Queen are dead. Their dynasty has fallen!" % _name_of(id))
			elif id != 1: alert("%s (%s) has been defeated!" % [D.CIVS[p.civ].name, color_name(id)])
			if lost_crown and (id != 1 or net_on): eliminate(id)
	# when an enemy is down to its last few pieces, show them on the minimap so the hunt doesn't drag
	for id in players:
		var p: Dictionary = players[id]
		if not p.alive or p.exposed or not E.enemies(1, id): continue
		var left := E.units_of(id).size()
		for x in ents:
			if x.owner == id and x.kind == "building" and _counts(x): left += 1
		if left <= 6:
			p.exposed = true; alert("📍 %s's last forces are shown on the minimap" % D.CIVS[p.civ].name)
	check_end()

func royal_name(p: int, type: String) -> String:
	if not players.has(p): return type
	var pl: Dictionary = players[p]
	var R: Dictionary = D.ROYALS.get(pl.civ, D.ROYALS.britons)
	var n: String = pl.royals.get(type, "")
	return R.get(type, type) + ((" " + n) if n != "" else "")

## Time limit: when the clock runs out, the side with the highest score wins
func _check_time() -> void:
	var lim: float = rules.get("time", 0.0) * 60
	if lim <= 0 or over != null: return
	var left := lim - time
	if left <= 300 and _warned < 1 and lim > 300:
		_warned = 1; alert("⏳ 5 minutes left. Highest score wins.")
	if left <= 60 and _warned < 2:
		_warned = 2; alert("⏳ 1 minute left!")
	if left > 0: return
	var sides := {}
	for id in players:
		if players[id].alive: sides[_side_of(id)] = sides.get(_side_of(id), 0) + score_of(id)
	var mine: int = sides.get(_side_of(1), 0)
	var best := 0
	for k in sides:
		if k != _side_of(1): best = maxi(best, sides[k])
	over = "victory" if mine >= best else "defeat"
	over_reason = "time"
	game_over.emit(over)

# ---------- the simulation step ----------
func step(dt: float) -> void:
	time += dt
	path_budget = 8
	E.update_entities(dt)
	if mode_node != null: mode_node.step(dt)
	if specials_node != null: specials_node.step(dt)
	for a in ais:
		if players.has(a.p) and players[a.p].alive: a.update(dt)
	_fog_t -= dt
	if _fog_t <= 0:
		M.update_fog(); _fog_t = 0.2; _check_time()
	# every 6 s: a frame for the results screen's replay (buildings and armies as dots)
	if floori(time / 6) != floori((time - dt) / 6):
		var fr := PackedInt32Array()
		for e in ents:
			if e.dead or e.owner <= 0: continue
			if (e.type != "farm" and not e.def.has("wall")) if e.kind == "building" else e.type != "villager":
				fr.append(roundi(e.x * 2)); fr.append(roundi(e.y * 2)); fr.append(e.owner)
				fr.append((2 if e.type == "towncenter" else 1) if e.kind == "building" else 0)
		replay.append(fr)
	# every 30 s: a point on each player's score timeline, and their peak army and workforce
	if floori(time / 30) != floori((time - dt) / 30):
		for id in players:
			var st: Dictionary = players[id].stats
			if not st.has("timeline"): st.timeline = []
			st.timeline.append([roundi(time), score_of(id)])
			var army := 0
			var vils := 0
			for e in ents:
				if e.dead or e.owner != id or e.kind != "unit": continue
				if e.type == "villager": vils += 1
				elif e.def.cls != "hero": army += 1
			st.peakArmy = maxi(st.get("peakArmy", 0), army); st.peakVils = maxi(st.get("peakVils", 0), vils)

## Advance the match by a frame of real time (substeps keep movement stable at higher speeds).
func advance(real: float) -> void:
	if paused or over != null or ents.is_empty(): return
	var dt := minf(0.05, real) * speed
	var n := ceili(dt / 0.034)
	for i in n: step(dt / n)

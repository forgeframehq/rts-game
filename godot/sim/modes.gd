extends Node
## Game modes beyond Conquest and Regicide. Port of js/modes.js.
##   Capture         take enemy Town Centers instead of burning them
##   Siege Survival  hold out against growing waves of raiders
##   Empire Wars     start in the Feudal Age with a working town
## The rules ask this node through the small hooks in sim/g.gd.

const CAP := {"LOW": 0.25, "FLOOR": 0.10, "AFTER": 0.30, "IMMUNE": 20.0, "HOLD": 180.0, "GRACE": 90.0, "MAXBUILT": 2, "SPACING": 20.0}
const LVL := {"easy": 0.6, "normal": 1.0, "hard": 1.4, "brutal": 1.9}

var surv = null       # Siege Survival state, or null
var _tick := 0.0

func _ready() -> void:
	G.mode_node = self

func _is_cap() -> bool:
	return G.rules.get("mode", "") == "capture"
func _is_surv() -> bool:
	return G.rules.get("mode", "") == "survival"

func _tcs() -> Array:
	var out := []
	for e in G.ents:
		if not e.dead and e.type == "towncenter" and e.built: out.append(e)
	return out

func _side(id: int) -> String:
	return ("t%d" % G.players[id].team) if (id > 0 and G.players.has(id) and G.players[id].team > 0) else "p%d" % id

func _name_of(id: int) -> String:
	if id == 1: return "You"
	if not G.players.has(id): return "Nobody"
	return "The Raiders" if G.players[id].raider else "The %s" % D.CIVS[G.players[id].civ].name

# ---------- hooks asked by the core ----------
func hp_floor(t: Dictionary):
	return t.maxHp * CAP.FLOOR if (_is_cap() and t.type == "towncenter") else null
func no_shoot(b: Dictionary) -> bool:
	return _is_cap() and b.type == "towncenter" and b.hp < b.maxHp * CAP.LOW
func no_repair(b: Dictionary) -> bool:
	return _is_cap() and b.type == "towncenter" and _enemies_near(b, 2.5).size() > 0

## why this building may not be deleted, or ""
func delete_block(e: Dictionary) -> String:
	if not _is_cap() or e.type != "towncenter": return ""
	if e.hp < e.maxHp * 0.5: return "A Town Center below half health can't be deleted"
	if e.get("cap") != null and e.cap.v > 0: return "You can't delete a Town Center that is being captured"
	return ""

## why a building may not go here, or "". Applies to the AI as well.
func rule_reason(owner_: int, type: String, tx: int, ty: int) -> String:
	if not D.BUILDINGS.has(type) or not G.players.has(owner_): return ""
	var def: Dictionary = D.BUILDINGS[type]
	var p: Dictionary = G.players[owner_]
	var cx: float = tx + def.size / 2.0
	var cy: float = ty + def.size / 2.0
	if type == "infirmary" and E.enemy_soldier_near(owner_, cx, cy, 12): return "enemy soldiers nearby"
	if type == "towncenter":
		if E.age_of(owner_) < 3: return "the Castle Age (new Town Centers need it)"
		if p.get("tcBuilt", 0) >= CAP.MAXBUILT: return "the limit (%d new Town Centers a match)" % CAP.MAXBUILT
		if p.get("noTC", 0.0) > 0: return "losing your last Town Center: recapture one first"
		if _is_cap():
			for e in G.ents:
				if not e.dead and e.type == "towncenter" and Vector2(e.x - cx, e.y - cy).length() < CAP.SPACING: return "another Town Center (keep %d tiles apart)" % int(CAP.SPACING)
	if _is_cap() and type != "farm":
		for t in G.ents:
			if t.dead or t.type != "towncenter": continue
			if _near(t, 2, cx, cy, def.size): return "the space around a Town Center"
			if (type == "tower" or type == "castle") and _near(t, 6, cx, cy, def.size): return "a Town Center (no towers or castles within 6 tiles)"
	return ""

func _near(e: Dictionary, r: float, cx: float, cy: float, size: int) -> bool:
	var ex := clampf(cx, e.tx - r, e.tx + e.size + r)
	var ey := clampf(cy, e.ty - r, e.ty + e.size + r)
	return absf(ex - cx) < size / 2.0 + 0.01 and absf(ey - cy) < size / 2.0 + 0.01

func rule_block(owner_: int, type: String, tx: int, ty: int) -> bool:
	return rule_reason(owner_, type, tx, ty) != ""

func on_building_placed(b: Dictionary) -> void:
	if b.type == "towncenter" and G.players.has(b.owner): G.players[b.owner].tcBuilt = G.players[b.owner].get("tcBuilt", 0) + 1

## Town Centers always show on the minimap in Capture
func always_on_map(e: Dictionary) -> bool:
	return _is_cap() and e.type == "towncenter" and not e.dead

## extra score for Town Centers held, so a Capture match decided by the clock is decided by the map
func score(id: int) -> int:
	if not _is_cap(): return 0
	var n := 0
	for t in _tcs():
		if t.owner == id: n += 1
	return n * 600

func _enemies_near(b: Dictionary, r: float) -> Array:
	var out := []
	for u in G.ents:
		if not u.dead and u.kind == "unit" and E.enemies(u.owner, b.owner) and E.edge_dist(u, b) <= r: out.append(u)
	return out

# ---------- Capture ----------
func _capture_step(dt: float) -> void:
	_tick += dt
	if _tick < 0.25: return
	var step := _tick
	_tick = 0.0
	for t in _tcs():
		if t.get("cap") == null: t.cap = {"v": 0.0, "side": "", "contested": false, "warned": -99.0}
		var c: Dictionary = t.cap
		var low: bool = t.hp < t.maxHp * CAP.LOW and not (t.get("immune", 0.0) > G.time)
		# who is standing at the walls: units count after 1 s there; not villagers or siege for the attacker
		var by := {}
		var defenders := 0.0
		for u in G.ents:
			if u.kind != "unit": continue
			if u.dead or E.edge_dist(u, t) > 1.6:
				if u.get("capAt", 0) == t.id: u.capAt = 0
				continue
			if u.get("capAt", 0) != t.id:
				u.capAt = t.id; u.capSince = G.time
			if G.time - u.capSince < 1: continue
			if t.owner > 0 and E.allied(u.owner, t.owner):
				defenders += 0.5 if u.type == "villager" else 1.0
				continue
			if u.type == "villager" or u.def.get("siege", false) or u.def.has("heal"): continue
			var s := _side(u.owner)
			if not by.has(s): by[s] = {"n": 0, "who": {}}
			by[s].n += 1; by[s].who[u.owner] = by[s].who.get(u.owner, 0) + 1
		var sides := by.keys()
		E.ssort(sides, func(a, b): return by[b].n - by[a].n)
		var lead: String = sides[0] if sides.size() > 0 else ""
		# a tie goes to whoever started the capture
		if sides.size() > 1 and by[sides[0]].n == by[sides[1]].n and c.side != "" and by.has(c.side): lead = c.side
		var a: int = by[lead].n if lead != "" else 0
		var rate := 0.0
		if low and a > 0:
			rate = minf(0.1, a * 0.01)                    # 5 men: 20 s, 10 or more: 10 s
			if defenders > 0: rate = rate * 0.5 if a >= defenders * 3 else 0.0   # contested
		c.contested = low and a > 0 and rate == 0
		if rate > 0:
			if c.side != "" and c.side != lead and c.v > 0: c.v = maxf(0, c.v - rate * step)     # undo the other side's progress first
			else:
				if c.side == "" or c.v == 0: c.side = lead
				c.v = minf(1, c.v + rate * step)
				# the owner hears about it once in a while
				if t.owner == 1 and G.time - c.warned > 15:
					c.warned = G.time
					G.alert("🏳️ Your Town Center is being captured! Send soldiers to stand beside it.")
					G.snd("attacked"); G.buzz(200)
		elif not c.contested and c.v > 0: c.v = maxf(0, c.v - 0.03 * step)       # drains slowly, never snaps back
		if c.v == 0 and not c.contested: c.side = ""
		if c.v >= 1 and lead != "":
			var who := 0
			var most := -1
			for id in by[lead].who:
				if by[lead].who[id] > most:
					most = by[lead].who[id]; who = id
			_flip(t, who)
		# hold timer for the win: an enemy's home Town Center held uninterrupted
		var home: int = t.get("homeOf", 0)
		if home != 0 and home != t.owner and t.owner > 0 and E.enemies(home, t.owner):
			if t.cap.v == 0 and not t.cap.contested: t.hold = t.get("hold", 0.0) + step
		else: t.hold = 0.0
	# losing the last Town Center: 90 s to take one back
	for id in G.players.keys():
		var p: Dictionary = G.players[id]
		if not p.alive or p.raider: continue
		var has := false
		for t in _tcs():
			if t.owner == id: has = true
		if has:
			if p.get("noTC", 0.0) > 0:
				p.noTC = 0.0
				if id == 1: G.alert("🏰 You hold a Town Center again!")
			continue
		if not (p.get("noTC", 0.0) > 0):
			p.noTC = maxf(G.time, 0.001)
			G.alert(("⚠️ You have no Town Center! Capture one within %d seconds or your dynasty falls." % int(CAP.GRACE)) if id == 1 else "🏳️ %s have lost their last Town Center!" % _name_of(id))
		elif G.time - p.noTC >= CAP.GRACE:
			G.alert("🏳️ Without a Town Center your dynasty has fallen." if id == 1 else "🏳️ %s have fallen." % _name_of(id))
			G.eliminate(id); G.check_end()
	# winning: every Town Center on the map, or an enemy's home Town Center held for 3 minutes
	if G.over != null: return
	var all := _tcs().filter(func(t): return t.owner > 0)
	var winner := ""
	if all.size() > 0 and all.all(func(t): return _side(t.owner) == _side(all[0].owner)) and _tcs().all(func(t): return t.owner > 0): winner = _side(all[0].owner)
	var held = null
	for t in all:
		if t.get("hold", 0.0) >= CAP.HOLD: held = t
	if winner == "" and held != null: winner = _side(held.owner)
	if winner != "":
		for id in G.players.keys():
			if G.players[id].alive and _side(id) != winner: G.eliminate(id)
		G.over_reason = "hold" if held != null else "alltc"
		G.check_end()

func _flip(t: Dictionary, to: int) -> void:
	var from: int = t.owner
	if t.garrison.size() > 0: E.ungarrison(t)
	t.queue = []; t.qt = 0.0; t.research = null; t.rally = null; t.aging = null   # no refund, and the captor gets nothing half-made
	t.owner = to; t.hp = roundi(t.maxHp * CAP.AFTER); t.immune = G.time + CAP.IMMUNE; t.hold = 0.0
	t.cap = {"v": 0.0, "side": "", "contested": false, "warned": -99.0}
	var st: Dictionary = G.players[to].stats
	st.tcCaptured = st.get("tcCaptured", 0) + 1
	if G.players.has(from): G.players[from].stats.tcLost = G.players[from].stats.get("tcLost", 0) + 1
	G.selection.erase(t.id)
	G.flipped.emit(t)
	if to == 1:
		G.alert("🏰 Town Center captured! It is yours now: repair it, and hold it."); G.snd("capture")
	elif from == 1:
		G.alert("🏳️ %s captured your Town Center!" % _name_of(to)); G.snd("kingdown")
	else: G.alert("🏰 %s captured %s Town Center" % [_name_of(to), (_name_of(from).replace("The ", "the ") + "'s") if from > 0 else "the neutral"])
	G.effects.append({"t": "ping", "x": t.x, "y": t.y, "life": 0.6})

# ---------- Siege Survival ----------
func _survival_step(dt: float) -> void:
	if surv == null or G.over != null or not G.players.has(surv.raider): return
	var S: Dictionary = surv
	var alive := []
	for e in G.ents:
		if not e.dead and e.owner == S.raider and e.kind == "unit": alive.append(e)
	S.left = alive.size()
	if S.active and alive.is_empty():           # wave beaten
		S.active = false; S.done = S.wave; S.next = G.time + S.brk
		G.alert("🛡️ Wave %d beaten! The next comes in %d seconds." % [S.wave, int(S.brk)])
		G.snd("complete")
	# stragglers that lose their way are sent at the town again
	if S.active and floori(G.time) % 5 == 0 and floori(G.time - dt) % 5 != 0:
		for u in alive:
			if u.task.t == "idle": _aim([u])
	# a wave that drags on (stragglers lost in a forest) doesn't hold up the next one
	if S.active and G.time - S.started > 150:
		S.active = false; S.done = S.wave; S.next = G.time
	if not S.active and G.time >= S.next: _spawn_wave()

func _aim(units: Array) -> void:
	var foes := []
	for e in G.ents:
		if not e.dead and e.owner > 0 and not G.players[e.owner].raider and ((e.kind == "building" and e.type != "farm") or e.kind == "unit"): foes.append(e)
	for u in units:
		var best = null
		var bd := 1e9
		for f in foes:
			var d: float = Vector2(f.x - u.x, f.y - u.y).length() + (4.0 if f.kind == "unit" else 0.0)
			if d < bd:
				bd = d; best = f
		if best != null:
			E.cmd_attack([u], best); u.task.forced = true

func _spawn_wave() -> void:
	var S: Dictionary = surv
	S.wave += 1
	var n: int = S.wave
	var k: float = LVL.get(S.lvl, 1.0)
	var raid: Dictionary = G.players[S.raider]
	S.active = true; S.started = G.time
	raid.age = mini(4, 1 + n / 4)
	var tier := n / 5
	raid.up = {"militia": mini(3, tier), "spearman": mini(2, tier), "archer": mini(2, tier), "knight": mini(2, maxi(0, tier - 1))}
	# where they come from: the map edge farthest from the defenders' heart, different each time
	var home := Vector2(G.MAP / 2.0, G.MAP / 2.0)
	for e in G.ents:
		if not e.dead and e.type == "towncenter" and e.owner == 1:
			home = Vector2(e.x, e.y); break
	var N := float(G.MAP)
	var edges := []
	for i in 16:
		var a := i / 16.0 * TAU
		edges.append(Vector2(N / 2 + cos(a) * N * 0.46, N / 2 + sin(a) * N * 0.46))
	E.ssort(edges, func(a, b): return b.distance_to(home) - a.distance_to(home))
	var from: Vector2 = edges[randi() % 5]
	var count := roundi((3 + n * 1.6) * k)
	var pool: Array = ["militia", "militia", "spearman", "archer"] if n < 3 else (["militia", "spearman", "archer", "archer", "scout"] if n < 6 else ["militia", "spearman", "archer", "knight", "scout", "archer"])
	var units := []
	var put := func(type: String):
		var f = M.nearest_free(from.x, from.y, 10)
		if f != null: units.append(E.add_unit(type, S.raider, f.x + 0.5, f.y + 0.5))
	for i in count: put.call(pool[randi() % pool.size()])
	var boss := n % 5 == 0
	if boss:
		for i in maxi(1, n / 5): put.call("ram")
		if n >= 10: put.call("trebuchet")
		if n >= 15: put.call("king")
	_aim(units)
	S.from = {"x": from.x, "y": from.y, "until": G.time + 25}
	G.alert("%s %d: %d raiders%s coming!" % ["💀 Boss wave" if boss else "⚔️ Wave", n, units.size(), " with siege" if boss else ""])
	G.snd("attacked"); G.buzz(160)

## survival ends when the defenders lose their last Town Center
func _survival_lost() -> void:
	if surv == null or G.over != null: return
	for e in G.ents:
		if not e.dead and e.type == "towncenter" and e.owner > 0 and not G.players[e.owner].raider and E.allied(e.owner, 1): return
	G.over_reason = "survival"
	for id in G.players.keys():
		if E.allied(id, 1): G.eliminate(id)
	G.check_end()

# ---------- set-up at match start ----------
func setup(starts: Array, r: Callable) -> void:
	var m: String = G.rules.mode
	_tick = 0.0
	for t in G.ents:
		if t.type == "towncenter" and not t.dead: t.homeOf = t.owner
	if m == "capture" and G.rules.get("neutral", false):
		var N := G.MAP
		var f = M.nearest_free(roundi(N / 2.0 - 2), roundi(N / 2.0 - 2), 8)
		if f != null:
			for j in range(-1, 5):
				for i in range(-1, 5):
					if not M.in_map(f.x + i, f.y + j): continue
					var e = G.by_id.get(M.block[M.idx(f.x + i, f.y + j)])
					if e != null and e.kind == "res":
						e.dead = true; M.set_block(e, 0); G.by_id.erase(e.id)
			var t := E.add_building("towncenter", 0, f.x, f.y, true)
			t.hp = roundi(t.maxHp * 0.2); t.neutral = true; t.homeOf = 0
		G.ents = G.ents.filter(func(e): return not e.dead)
	if m == "survival":
		var used := {}
		for id in G.players: used[G.players[id].civ] = true
		var civ: String = D.CIVS.keys()[0]
		for c in D.CIVS:
			if not used.has(c):
				civ = c; break
		var id := G.players.size() + 1
		var p := E.make_player(id, civ, {"team": 99, "ai": null})
		p.raider = true; p.color = 1
		# the raiders wear red; if a defender already does, they take the darkest free colour
		var taken := {}
		for q in G.players.values(): taken[q.color] = true
		if taken.has(1):
			for c in [7, 6, 5, 4, 3, 2, 0]:
				if not taken.has(c):
					p.color = c; break
		p.royals = {"king": "", "queen": ""}
		G.players[id] = p
		surv = {"raider": id, "wave": 0, "done": 0, "brk": float(G.rules.get("wave", 60)) / G.pace, "lvl": G.rules.get("raidLvl", "normal"),
			"active": false, "next": 120.0 / G.pace, "started": 0.0, "left": 0, "from": null}
	else: surv = null
	if m == "empirewars":
		for s in starts: _empire_town(s.p)

# Empire Wars: a working Feudal town for everyone
func _spot(type: String, cx: float, cy: float, rmin: int, rmax: int):
	var s: int = D.BUILDINGS[type].size
	for rr in range(rmin, rmax + 1):
		for k in 24:
			var a := k / 24.0 * TAU + rr
			var x := roundi(cx + cos(a) * rr - s / 2.0)
			var y := roundi(cy + sin(a) * rr - s / 2.0)
			if M.area_free(x - 1, y - 1, s + 2) and not E.farm_overlap(x, y, s): return Vector2i(x, y)
	return null

func _nearest_res(type: String, x: float, y: float):
	return E.nearest(x, y, func(e): return e.kind == "res" and e.type == type)

func _empire_town(owner_: int) -> void:
	var tc = null
	for e in G.ents:
		if e.type == "towncenter" and e.owner == owner_: tc = e
	if tc == null: return
	var p: Dictionary = G.players[owner_]
	var cx: float = tc.x
	var cy: float = tc.y
	p.res = {"food": 300, "wood": 250, "gold": 150, "stone": 150}
	var put := func(type: String, near, rmin: int, rmax: int):
		var c: Vector2 = Vector2(near.x, near.y) if near != null else Vector2(cx, cy)
		var s = _spot(type, c.x, c.y, rmin, rmax)
		return E.add_building(type, owner_, s.x, s.y, true) if s != null else null
	for i in 4: put.call("house", null, 6, 12)
	var wood = _nearest_res("tree", cx, cy)
	var gold = _nearest_res("gold", cx, cy)
	var stone = _nearest_res("stone", cx, cy)
	var berry = _nearest_res("berry", cx, cy)
	if wood != null: put.call("lumbercamp", wood, 2, 5)
	if gold != null: put.call("miningcamp", gold, 2, 4)
	var mill = put.call("mill", berry, 2, 4) if berry != null else null
	put.call("barracks", null, 7, 12)
	var farms := []
	for i in 6:
		var f = put.call("farm", mill, 3, 9)
		if f != null: farms.append(f)
	# twenty villagers in total, already at work
	var have := []
	for e in G.ents:
		if not e.dead and e.owner == owner_ and e.type == "villager": have.append(e)
	var jobs := []
	for f in farms: jobs.append(["farm", f])
	for i in 6: jobs.append(["tree", wood])
	for i in 4: jobs.append(["gold", gold])
	for i in 2: jobs.append(["stone", stone])
	for i in 2: jobs.append(["berry", berry])
	jobs = jobs.slice(0, 20)
	for i in jobs.size():
		var v = have[i] if i < have.size() else null
		if v == null:
			var f = M.nearest_free(roundi(cx + 2), roundi(cy + 3), 8)
			if f == null: continue
			v = E.add_unit("villager", owner_, f.x + 0.5, f.y + 0.5)
		var j: Array = jobs[i]
		if j[0] == "farm": E.cmd_farm([v], j[1])
		elif j[1] != null:
			var t = _nearest_res(j[0], j[1].x, j[1].y)
			if t != null: E.cmd_gather([v], t)
	for i in 2:
		var f = M.nearest_free(roundi(cx + 4), roundi(cy + 4), 8)
		if f != null: E.add_unit("spearman" if i == 1 else "militia", owner_, f.x + 0.5, f.y + 0.5)

# ---------- the loop ----------
func step(dt: float) -> void:
	if _is_cap(): _capture_step(dt)
	if _is_surv():
		_survival_step(dt); _survival_lost()

func save_state() -> Dictionary:
	return {"surv": surv}

func load_state(d: Dictionary) -> void:
	surv = d.get("surv")

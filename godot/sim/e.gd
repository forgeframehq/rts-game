extends Node
## Entities, economy, unit behaviour and combat. Port of js/entities.js.
## Entities and tasks are Dictionaries, as they are plain objects in the JavaScript edition.
## Compare entities by id, never with ==, which compares Dictionaries by value.

var next_id := 1
var _def_cache := {}

const STANCES := ["aggressive", "defensive", "stand", "passive"]
const LEASH := {"aggressive": INF, "defensive": 8.0, "stand": 0.0, "passive": 0.0}
const FORMATIONS := ["line", "box", "staggered", "wedge"]
const RANK := {"inf": 0, "cav": 0, "arc": 1, "vil": 2}
const GATHER_CAP := {"tree": 1, "berry": 2, "gold": 2, "stone": 2}
const GARRISON_MAX := 15
const KING_AURA := 4.0
const SEP := 0.42
const HIT_SOUND := {"militia": "sword", "king": "sword", "spearman": "spear", "knight": "sword", "scout": "spear",
	"cataphract": "sword", "elephant": "ram", "kamayuk": "spear", "templeguard": "sword", "archer": "bow", "longbowman": "bow",
	"repeater": "bolt", "axethrower": "axethrow", "ram": "ram", "trebuchet": "stonehit"}

func mods(p: int) -> Dictionary:
	return D.CIVS[G.players[p].civ].mods

func _work_snd(u: Dictionary, k: String) -> void:
	# work sounds follow the player's attention: only villagers they have selected chop, mine and hammer audibly
	if u.owner == 1 and G.selection.has(u.id): G.snd(k, u.x, u.y)

## Insertion sort: stable, like JavaScript's sort. cmp(a, b) returns a number, negative when a goes first.
func ssort(a: Array, cmp: Callable) -> void:
	for i in range(1, a.size()):
		var v = a[i]
		var j := i - 1
		while j >= 0 and cmp.call(a[j], v) > 0:
			a[j + 1] = a[j]
			j -= 1
		a[j + 1] = v

# ---------- Players & costs ----------
func make_player(id: int, civ: String, opts: Dictionary = {}) -> Dictionary:
	var m: Dictionary = D.CIVS[civ].mods
	var res: Dictionary = (D.RES_PRESETS.get(G.rules.res, D.START_RES) as Dictionary).duplicate()
	if m.has("startFoodDelta"): res.food = maxi(0, res.food + m.startFoodDelta)
	if m.has("startWoodDelta"): res.wood = maxi(0, res.wood + m.startWoodDelta)
	return {"id": id, "civ": civ, "age": 1, "up": {}, "techs": {}, "team": opts.get("team", 0), "ai": opts.get("ai"),
		"res": res, "gathered": {"food": 0, "wood": 0, "gold": 0, "stone": 0}, "killed": 0, "lost": 0, "alive": true,
		"stats": {}, "killValue": 0, "mourn": 0.0, "formation": "", "noReseed": false, "color": 0, "royals": {},
		"exposed": false, "raider": false}

# ---------- Ages ----------
func age_of(p: int) -> int:
	return G.players[p].age if G.players.has(p) else 1

func stance_of(u: Dictionary) -> String:
	return u.stance if u.stance != "" else "defensive"

func can_build_type(p: int, type: String) -> bool:
	return age_of(p) >= D.BUILD_AGE.get(type, 1) and not at_build_limit(p, type) and not civ_blocks(p, type)

## a dynasty that never had this building (the Incas had no horses, so no Stable)
func civ_blocks(p: int, type: String) -> bool:
	return type == "stable" and G.players.has(p) and mods(p).get("noStable", false)

## some buildings are limited per player: one Infirmary (two in the Imperial Age)
func build_limit(p: int, type: String) -> int:
	return (2 if age_of(p) >= 4 else 1) if type == "infirmary" else 0

func at_build_limit(p: int, type: String) -> bool:
	var n := build_limit(p, type)
	if n <= 0: return false
	var c := 0
	for e in G.ents:
		if not e.dead and e.owner == p and e.type == type: c += 1
	return c >= n

func enemy_soldier_near(p: int, x: float, y: float, r: float) -> bool:
	for e in G.ents:
		if not e.dead and e.kind == "unit" and e.type != "villager" and e.inside == 0 and enemies(e.owner, p) and Vector2(e.x - x, e.y - y).length() < r: return true
	return false

func can_train_type(p: int, type: String) -> bool:
	return age_of(p) >= D.UNIT_AGE.get(type, 1)

func _built_types(p: int) -> Dictionary:
	var have := {}
	for e in G.ents:
		if not e.dead and e.owner == p and e.kind == "building" and e.built: have[e.type] = true
	return have

## the buildings the next Age asks for, and which of them stand: { want, got, list: [{ type, have }] }
func age_needs(p: int):
	var a := age_of(p)
	if a + 1 >= D.AGES.size(): return null
	var next: Dictionary = D.AGES[a + 1]
	if not next.has("needs"): return null
	var have := _built_types(p)
	var list := []
	var got := 0
	for t in next.needs:
		if civ_blocks(p, t): continue
		list.append({"type": t, "have": have.has(t)})
		if have.has(t): got += 1
	return {"want": mini(2, next.needs.size()), "got": got, "list": list}

## what still blocks advancing: returns null if ready, else a short reason
func age_block(p: int, tc = null):
	var a := age_of(p)
	if a + 1 >= D.AGES.size(): return "Max Age"
	var next: Dictionary = D.AGES[a + 1]
	for e in G.ents:
		if e.owner == p and not e.dead and e.kind == "building" and e.aging != null: return "Advancing…"
	var have := _built_types(p)
	# most Ages ask for any 2 of a list; an Age may also name a single building (Imperial wants a Castle)
	var want := mini(2, next.needs.size())
	var got := 0
	for t in next.needs:
		if have.has(t): got += 1
	if got < want:
		if next.needs.size() == 1: return "Needs a %s" % D.BUILDINGS[next.needs[0]].name
		var names := []
		for t in next.needs: names.append(D.BUILDINGS[t].name)
		return "Build any %d of: %s" % [want, ", ".join(names)]
	if tc != null and tc.queue.size() > 0: return "Town Center busy"
	return null

## a dynasty can make an Age cheaper (Byzantines: Castle and Imperial Ages)
func age_cost(p: int, n: int):
	if n >= D.AGES.size() or D.AGES[n] == null: return null
	var a: Dictionary = D.AGES[n]
	var disc: Dictionary = mods(p).get("ageDisc", {})
	var f: float = disc.get(str(n), 1)
	var c := {}
	for k in a.cost: c[k] = roundi(a.cost[k] * f)
	return c

func advance_age(tc: Dictionary):
	var p: int = tc.owner
	if age_of(p) + 1 >= D.AGES.size() or age_block(p, tc) != null: return false
	var cost = age_cost(p, age_of(p) + 1)
	if not pay(p, cost): return "res"
	tc.aging = {"t": 0.0, "to": age_of(p) + 1, "cost": cost}
	return true

func cancel_age(tc: Dictionary) -> void:
	if tc.aging != null:
		refund(tc.owner, tc.aging.cost); tc.aging = null

func _finish_age(tc: Dictionary) -> void:
	var p: Dictionary = G.players[tc.owner]
	var to: int = tc.aging.to
	tc.aging = null; p.age = to
	if not p.stats.has("ageT"): p.stats.ageT = {}
	p.stats.ageT[to] = roundi(G.time)
	if to == 4:
		for e in G.ents:
			if e.owner == tc.owner and e.kind == "building" and not e.dead:
				e.maxHp = roundi(e.maxHp * 1.2); e.hp = roundi(e.hp * 1.2)
	if tc.owner == 1: G.snd("ageup")
	G.on_age_up(tc.owner, to)

# ---------- Upgrades & techs ----------
func tier_of(p: int, line: String) -> int:
	return G.players[p].up.get(line, 0) if G.players.has(p) else 0

## the unit definition for this player's current upgrade (cached; units point at it)
func unit_def(p: int, type: String) -> Dictionary:
	var tier := tier_of(p, type)
	var k := "%d|%s|%d" % [p, type, tier]
	if _def_cache.has(k): return _def_cache[k]
	var d: Dictionary = (D.UNITS[type] as Dictionary).duplicate()
	for id in D.UPGRADES:
		var u: Dictionary = D.UPGRADES[id]
		if u.line == type and u.tier <= tier:
			d.merge(u.stats, true); d.name = u.name
	d.tier = tier
	_def_cache[k] = d
	return d

func tech_bonus(p: int) -> Dictionary:
	var b := {"melee": 0, "ranged": 0, "range": 0, "armor": 0, "pierce": 0}
	if not G.players.has(p): return b
	var t: Dictionary = G.players[p].techs
	for id in t:
		if t[id] and D.TECHS.has(id):
			var eff: Dictionary = D.TECHS[id].eff
			for k in eff:
				if b.has(k): b[k] += eff[k]
	return b

## the summed effect of one key across a player's researched techs (see TECHS in the data)
func tech_eff(p: int, key: String) -> float:
	if not G.players.has(p): return 0
	var t: Dictionary = G.players[p].techs
	var v := 0.0
	for id in t:
		if t[id] and D.TECHS.has(id): v += D.TECHS[id].eff.get(key, 0)
	return v

## a unit's attack range: its type, the Blacksmith's range techs, its dynasty, and its own techs
func range_of(owner_: int, type: String, def: Dictionary) -> float:
	var r: float = def.range
	if def.get("ranged", false): r += tech_bonus(owner_).range
	if type == "archer" or type == "longbowman": r += mods(owner_).get("archerRange", 0)
	return r + tech_eff(owner_, "unitRange_" + type)

func carry_cap(u: Dictionary) -> float:
	return D.CARRY + tech_eff(u.owner, "carry")

## building HP after Masonry, Architecture and the wall techs
func bld_hp_mult(owner_: int, def: Dictionary) -> float:
	var wallish: bool = def.has("wall") or (def.has("atk") and not def.has("trains"))
	return 1 + tech_eff(owner_, "bldHp") + (tech_eff(owner_, "wallHp") if wallish else 0.0)

## techs done at this building, for the Research page
func researched_at(b: Dictionary) -> Array:
	var out := []
	if not G.players.has(b.owner): return out
	var techs: Dictionary = G.players[b.owner].techs
	for id in techs:
		if techs[id] and D.TECHS.has(id) and D.TECHS[id].get("at", "blacksmith") == b.type: out.append(id)
	return out

## what a building can research right now: [{ id, kind: 'up'|'tech', def, why }]
func researches_for(b: Dictionary) -> Array:
	var p: int = b.owner
	var out := []
	if not G.players.has(p): return out
	var pl: Dictionary = G.players[p]
	var trains := trains_for(b)
	for id in D.UPGRADES:
		var u: Dictionary = D.UPGRADES[id]
		if u.at != b.type or tier_of(p, u.line) != u.tier - 1: continue
		if not trains.has(u.line): continue
		out.append({"id": id, "kind": "up", "def": u, "why": (D.AGES[u.age].short + " Age") if age_of(p) < u.age else null})
	for id in D.TECHS:
		var t: Dictionary = D.TECHS[id]
		if t.get("at", "blacksmith") != b.type or (t.has("civ") and t.civ != pl.civ): continue
		if pl.techs.get(id, false) or (t.has("req") and not pl.techs.get(t.req, false)): continue
		out.append({"id": id, "kind": "tech", "def": t, "why": (D.AGES[t.age].short + " Age") if age_of(p) < t.age else null})
	return out

func start_research(b: Dictionary, id: String):
	if not b.built or b.dead or b.research != null or b.aging != null: return false
	var r = null
	for x in researches_for(b):
		if x.id == id: r = x; break
	if r == null or r.why != null: return false
	for e in G.ents:
		if not e.dead and e.owner == b.owner and e.kind == "building" and e.research != null and e.research.id == id: return false
	if not pay(b.owner, r.def.cost): return "res"
	b.research = {"id": id, "kind": r.kind, "t": 0.0, "cost": r.def.cost}
	return true

func cancel_research(b: Dictionary) -> void:
	if b.research != null:
		refund(b.owner, b.research.cost); b.research = null

func _finish_research(b: Dictionary) -> void:
	var r: Dictionary = b.research
	var pl: Dictionary = G.players[b.owner]
	b.research = null
	if r.kind == "up":
		var u: Dictionary = D.UPGRADES[r.id]
		pl.up[u.line] = u.tier
		for e in G.ents:   # upgrade units already in the field
			if not e.dead and e.owner == b.owner and e.type == u.line:
				var nd := unit_def(b.owner, u.line)
				var f: float = float(e.hp) / e.maxHp
				e.def = nd; e.maxHp = nd.hp; e.hp = maxi(1, roundi(nd.hp * f))
				e.range = nd.range + tech_bonus(b.owner).range * (1 if nd.get("ranged", false) else 0) \
					+ (mods(b.owner).get("archerRange", 0) if (u.line == "archer" or u.line == "longbowman") else 0)
		G.on_researched(b.owner, u.name)
	else:
		var before := {}
		for e in G.ents:
			if not e.dead and e.owner == b.owner and e.kind == "building": before[e.id] = bld_hp_mult(b.owner, e.def)
		pl.techs[r.id] = true
		var eff: Dictionary = D.TECHS[r.id].eff
		for e in G.ents:
			if e.dead or e.owner != b.owner: continue
			if e.kind == "unit":
				e.range = range_of(b.owner, e.type, e.def)
				if e.type == "villager" and eff.has("vilHp"):
					e.maxHp += eff.vilHp; e.hp += eff.vilHp
			elif e.kind == "building" and before.has(e.id):
				var k: float = bld_hp_mult(b.owner, e.def) / before[e.id]
				if k != 1:
					e.maxHp = roundi(e.maxHp * k); e.hp = roundi(e.hp * k)
				if e.type == "farm" and eff.has("farm") and e.built: e.food += eff.farm
		G.on_researched(b.owner, D.TECHS[r.id].name)

func unit_cost(p: int, type: String) -> Dictionary:
	var m := mods(p)
	var base: Dictionary = D.UNITS[type].cost
	var f := 1.0
	if type == "archer" and m.has("archerCost"): f = m.archerCost
	if type == "spearman" and m.has("spearCost"): f = m.spearCost
	if type == "villager" and m.has("vilCost"): f = m.vilCost
	if m.has("cavCost") and D.UNITS[type].cls == "cav": f = m.cavCost
	var c := {}
	for k in base: c[k] = roundi(base[k] * f)
	return c

func build_cost(_p: int, type: String) -> Dictionary:
	return (D.BUILDINGS[type].cost as Dictionary).duplicate()

func can_afford(p: int, cost: Dictionary) -> bool:
	var res: Dictionary = G.players[p].res
	for k in cost:
		if res[k] < cost[k]: return false
	return true

func pay(p: int, cost: Dictionary) -> bool:
	if not can_afford(p, cost): return false
	var pl: Dictionary = G.players[p]
	for k in cost:
		pl.res[k] -= cost[k]
		pl.stats.spent = pl.stats.get("spent", 0) + cost[k]
	if p == 1 and cost.get("gold", 0) > 0 and not G.demo: G.snd("coin")
	return true

func refund(p: int, cost: Dictionary) -> void:
	for k in cost: G.players[p].res[k] += cost[k]

## Vector2i(population, housing)
func pop_of(p: int) -> Vector2i:
	var pop := 0
	var cap := 0
	for e in G.ents:
		if e.owner != p or e.dead: continue
		# the King and Queen are given, not trained: they must not eat the first
		# five places and leave a player pop-capped before the game starts
		if e.kind == "unit":
			if e.def.cls != "hero": pop += 1
		elif e.kind == "building":
			pop += e.queue.size() + e.garrison.size()
			if e.built and e.def.has("pop"):
				cap += mods(p).housePop if (e.type == "house" and mods(p).has("housePop")) else e.def.pop
	return Vector2i(pop, mini(G.rules.get("pop", 200), cap))

# ---------- Creation ----------
func _base(kind: String, type: String, owner_: int, def: Dictionary) -> Dictionary:
	var e := {"id": next_id, "kind": kind, "type": type, "owner": owner_, "def": def, "dead": false,
		"x": 0.0, "y": 0.0, "tx": 0, "ty": 0, "size": 1, "hp": 0.0, "maxHp": 0.0, "hitT": 0.0, "inside": 0}
	next_id += 1
	G.ents.append(e); G.by_id[e.id] = e
	return e

func add_resource(rtype: String, tx: int, ty: int):
	if not M.is_free(tx, ty): return null
	var e := _base("res", rtype, 0, D.RES[rtype])
	e.tx = tx; e.ty = ty; e.size = 1; e.x = tx + 0.5; e.y = ty + 0.5
	e.amount = float(D.RES[rtype].amount); e.rtype = D.RES[rtype].res
	e["var"] = floori(M.map_rng.call() * 4)
	e.unreach = 0
	M.set_block(e, e.id)
	return e

func add_building(type: String, owner_: int, tx: int, ty: int, built: bool) -> Dictionary:
	var def: Dictionary = D.BUILDINGS[type]
	var e := _base("building", type, owner_, def)
	e.tx = tx; e.ty = ty; e.size = def.size
	e.x = tx + def.size / 2.0; e.y = ty + def.size / 2.0
	var hp: float = def.hp
	if owner_ > 0 and mods(owner_).has("buildingHp"): hp = roundi(hp * mods(owner_).buildingHp)
	if owner_ > 0 and type == "towncenter" and mods(owner_).has("tcHp"): hp = roundi(hp * mods(owner_).tcHp)
	if owner_ > 0: hp = roundi(hp * bld_hp_mult(owner_, def))
	e.maxHp = hp; e.hp = hp if built else 1.0; e.built = built; e.progress = 1.0 if built else 0.0
	e.queue = []; e.qt = 0.0; e.cool = 0.0; e.rally = null
	e.garrison = []; e.incoming = 0; e.research = null; e.aging = null; e.housed = false; e.calmT = 0.0
	e.cost = {}; e.warnT = 0.0; e.fallow = false; e.food = 0.0; e.farmer = 0
	if type == "farm": e.food = float(farm_full(owner_))
	if type != "farm": M.set_block(e, e.id)
	return e

func add_unit(type: String, owner_: int, x: float, y: float) -> Dictionary:
	var def := unit_def(owner_, type)
	var e := _base("unit", type, owner_, def)
	e.x = x; e.y = y
	var hp: float = def.hp
	if type == "knight" and mods(owner_).has("knightHp"): hp = roundi(hp * mods(owner_).knightHp)
	if owner_ > 0: hp += tech_eff(owner_, "unitHp_" + type)   # e.g. Cholas' Temple Endowment
	e.hp = hp; e.maxHp = hp
	e.sex = ""
	if type == "villager": e.sex = "f" if G.rand() < 0.5 else "m"
	if type == "queen": e.sex = "f"
	e.task = {"t": "idle"}; e.path = []; e.cool = 0.0; e.carry = null; e.face = 1; e.walk = 0.0; e.repath = 0.0
	e.stance = ""; e.form = ""; e.dir = -1; e.hx = null; e.hy = null; e.up = false; e.scan = 0.0
	e.healing = 0; e.healT = 0.0; e.atFarm = false; e.fw = 0.0; e.stuck = 0; e.dist = 0.0; e.working = false
	e.hurtT = 0.0; e.atkAnim = 0.0; e.pathFor = 0; e.entering = false
	e.range = range_of(owner_, type, def)
	if type == "villager":
		var h := tech_eff(owner_, "vilHp")
		e.hp += h; e.maxHp += h
	return e

# ---- Garrison (AoE2-style): villagers shelter in their Town Center, each one adds an arrow ----
# Villagers shelter anywhere that takes a garrison; a Castle takes soldiers too,
# and every unit inside adds an arrow to what the building shoots.
# The King and Queen may hide in a Town Center too, so they have shelter from the first minute.
func can_garrison(u: Dictionary, b) -> bool:
	if b == null or b.dead or b.kind != "building" or not b.built or not b.def.has("garrison") or b.owner != u.owner: return false
	if not (u.type == "villager" or u.def.cls == "hero" or b.type == "castle" or (b.type == "infirmary" and not u.def.get("siege", false))): return false
	return b.garrison.size() + b.incoming < b.def.garrison

func garrison_to(u: Dictionary, b: Dictionary) -> void:
	if can_garrison(u, b):
		u.task = {"t": "garrison", "id": b.id}; u.path = []; u.pathFor = 0

func ring_bell(owner_: int) -> void:
	if owner_ == 1: G.snd("bell")
	# the bell calls the royals home along with the villagers
	for u in G.ents.duplicate():
		if not u.dead and u.kind == "unit" and u.owner == owner_ and (u.type == "villager" or u.def.cls == "hero"):
			var tc = nearest(u.x, u.y, func(e): return e.type == "towncenter" and can_garrison(u, e))
			if tc != null: garrison_to(u, tc)

## Units still standing inside a building are out of G.ents, so anything that asks
## "does this player still have X" has to look inside garrisons too.
func units_of(p: int) -> Array:
	var out := []
	for e in G.ents:
		if e.dead or e.owner != p: continue
		if e.kind == "unit": out.append(e)
		elif e.kind == "building":
			for g in e.garrison:
				if not g.dead: out.append(g)
	return out

func royal(p: int, type: String):
	for u in units_of(p):
		if u.type == type: return u
	return null

## empty a building, or only the units matching keep (the AI lets its royals out alone)
func ungarrison(b: Dictionary, keep = null) -> void:
	var all: Array = b.garrison
	var list := []
	var rest := []
	for u in all:
		if keep == null or keep.call(u): list.append(u)
		else: rest.append(u)
	b.garrison = rest
	for u in list:
		var spot = M.nearest_free(b.x + 1.5, b.y + 1.5, 10)
		if spot == null: spot = Vector2i(b.tx, b.ty)
		u.x = spot.x + 0.5 + (G.rand() - 0.5) * 0.4; u.y = spot.y + 0.5 + (G.rand() - 0.5) * 0.4
		u.task = {"t": "idle"}; u.path = []; u.inside = 0
		G.ents.append(u)

func kill(e: Dictionary) -> void:
	if e.dead: return
	e.dead = true
	if e.kind != "unit" and e.type != "farm": M.set_block(e, 0)
	if e.kind == "building":
		for q in e.queue: refund(e.owner, q.cost)
		if e.garrison.size() > 0: ungarrison(e)
	if e.kind == "res" and e.type == "tree": G.decals.append({"t": "stump", "x": e.x, "y": e.y, "life": 150.0})
	# a building that falls leaves its stones on the ground for a good while
	if e.kind == "building" and e.type != "farm":
		G.decals.append({"t": "rubble", "x": e.tx + e.size / 2.0, "y": e.ty + e.size / 2.0, "size": e.size, "id": e.id, "life": 240.0})
	if e.kind == "unit":
		G.corpses.append({"type": e.type, "tier": e.def.get("tier", 0), "owner": e.owner, "sex": e.sex, "face": e.face, "dir": maxi(0, e.dir), "x": e.x, "y": e.y, "t": 0.0, "id": e.id})
	if e.kind != "res":
		G.effects.append({"t": "die", "x": e.x, "y": e.y, "life": 0.8, "big": e.kind == "building", "size": e.size})
		if e.owner > 0:
			var pl: Dictionary = G.players[e.owner]
			pl.lost += 1
			var key := "bldLost" if e.kind == "building" else "unitsLost"
			pl.stats[key] = pl.stats.get(key, 0) + 1
	G.by_id.erase(e.id)
	var s := "buildingdown" if e.kind == "building" else ("kingdown" if e.type == "king" else ("die_f" if (e.get("sex", "") == "f" or e.type == "queen") else "die"))
	G.snd(s, e.x, e.y)
	G.on_killed(e)

# ---------- Helpers ----------
func dist(a: Dictionary, b: Dictionary) -> float:
	return Vector2(a.x - b.x, a.y - b.y).length()

## Distance from a point to an entity's edge (buildings/resources are rectangles).
func edge_dist_xy(x: float, y: float, t: Dictionary) -> float:
	if t.kind == "unit": return Vector2(x - t.x, y - t.y).length()
	var s: int = t.size
	var cx := clampf(x, t.tx, t.tx + s)
	var cy := clampf(y, t.ty, t.ty + s)
	return Vector2(x - cx, y - cy).length()

func edge_dist(u: Dictionary, t: Dictionary) -> float:
	return edge_dist_xy(u.x, u.y, t)

func allied(a: int, b: int) -> bool:
	if a == b: return true
	if a <= 0 or b <= 0 or not G.players.has(a) or not G.players.has(b): return false
	return G.players[a].team > 0 and G.players[a].team == G.players[b].team

func enemies(a: int, b: int) -> bool:
	return a > 0 and b > 0 and not allied(a, b)

## The nearest living entity to a point that pred accepts, within max_d (measured to its edge).
func nearest(x: float, y: float, pred: Callable, max_d: float = 1e9):
	var best = null
	var bd := max_d
	for e in G.ents:
		if e.dead or not pred.call(e): continue
		var d := edge_dist_xy(x, y, e)
		if d < bd:
			bd = d; best = e
	return best

func _drop_site_for(u: Dictionary, rtype: String):
	return nearest(u.x, u.y, func(e): return e.kind == "building" and e.owner == u.owner and e.built and e.def.has("drop") and e.def.drop.has(rtype))

func rect_of(t: Dictionary) -> Array:
	var s: int = t.size
	return [t.tx, t.ty, t.tx + s - 1, t.ty + s - 1]

func _tile_rect(x: float, y: float) -> Array:
	return [int(x), int(y), int(x), int(y)]

func _path_to(u: Dictionary, t: Dictionary, adjacent: bool) -> void:
	# budget: a big battle can't spend the whole frame on A*; units with a path keep it a moment longer
	if u.path.size() > 0 and u.pathFor == t.id and G.path_budget <= 0:
		u.repath = 0.15 + G.rand() * 0.2
		return
	G.path_budget -= 1
	if t.kind == "unit":
		u.path = M.find_path(u.x, u.y, _tile_rect(t.x, t.y), false, 0, u.owner)
	else:
		u.path = M.find_path(u.x, u.y, rect_of(t), adjacent, 0 if t.type == "farm" else t.id, u.owner)
	u.pathFor = t.id; u.repath = 1.2

# ---------- Commands ----------
# AoE2-style formation: a line facing the way the group travels. Melee in front, archers behind,
# villagers last; a mixed army marches at the pace of its slowest unit so it arrives together.
func _is_outer(u: Dictionary) -> int:
	return 1 if ((u.def.cls == "inf" or u.def.cls == "cav") and not u.def.get("royal", false) and not u.def.get("siege", false)) else 0

func _rank(u: Dictionary) -> int:
	return RANK.get(u.def.cls, 0)

## the order a group lines up in: melee first (cavalry first of all in a wedge), then archers, villagers last
func formation_order(units: Array, kind: String) -> Array:
	var a := units.duplicate()
	ssort(a, func(x, y):
		if kind == "wedge":
			var c := int(y.def.cls == "cav") - int(x.def.cls == "cav")
			if c != 0: return c
		var r := _rank(x) - _rank(y)
		return r if r != 0 else x.id - y.id)
	return a

func _has_cav(units: Array) -> bool:
	for u in units:
		if u.def.cls == "cav": return true
	return false

## Offsets (x across, y forward) for each unit of a group, in its marching order.
##   line      ranks facing forward, melee first (AoE2's default)
##   staggered the same ranks spread wide and offset, so arrows and stones hit fewer men
##   box       melee and cavalry on the outside of a square, archers, siege and the royals inside
func formation_slots(units: Array, kind: String) -> Array:
	var n := units.size()
	var out := []
	out.resize(n)
	if kind == "wedge":
		# a triangle pointing forward: one at the tip, two behind, three behind them...
		var r := 0
		var i := 0
		var wg := 1.25 if _has_cav(units) else 0.95
		while i < n:
			var in_row := mini(r + 1, n - i)
			for c in in_row:
				out[i] = Vector2((c - (in_row - 1) / 2.0) * wg, -r * wg); i += 1
			r += 1
		var mid := (r - 1) * wg / 2.0
		for k in n: out[k].y += mid
		return out
	if kind == "box" and n >= 4:
		# a filled square: melee and cavalry take the outside cells, archers, siege and the
		# royals the middle. Cells run outermost first, so the walls of the square fill first.
		var gap := 1.25 if _has_cav(units) else 0.95
		var side := ceili(sqrt(n))
		var rows := ceili(float(n) / side)
		var cells := []
		for i in n:
			var r := i / side
			var in_row := mini(side, n - r * side)
			var c := i % side
			cells.append(Vector2((c - (in_row - 1) / 2.0) * gap, ((rows - 1) / 2.0 - r) * gap))
		ssort(cells, func(a, b):
			var d := maxf(absf(b.x), absf(b.y)) - maxf(absf(a.x), absf(a.y))
			if d != 0: return d
			return (b.y - a.y) if b.y != a.y else (a.x - b.x))
		var outer_first := range(n)
		ssort(outer_first, func(a, b):
			var d := _is_outer(units[b]) - _is_outer(units[a])
			return d if d != 0 else a - b)
		for k in n: out[outer_first[k]] = cells[k]
		return out
	# line (and staggered): each kind of soldier in its own ranks, melee in front, archers
	# behind, villagers last, every rank a clean straight front centred on the target
	var wide := kind == "staggered"
	var gap := 1.45 if wide else 0.95
	var max_rank := 8 if wide else 12
	var groups := []
	for i in n:
		var k := _rank(units[i])
		if groups.is_empty() or groups[-1].k != k: groups.append({"k": k, "idx": []})
		groups[-1].idx.append(i)
	var ranks := []
	for g in groups:
		var m: int = g.idx.size()
		var nr := ceili(float(m) / max_rank)
		var per := ceili(float(m) / nr)
		for r in nr: ranks.append(g.idx.slice(r * per, (r + 1) * per))
	# horses need more room than men on foot, across and between ranks
	var rg := []
	for rk in ranks:
		var cav := false
		for ui in rk:
			if units[ui].def.cls == "cav": cav = true
		rg.append(gap * (1.4 if cav else 1.0))
	var depth := [0.0]
	for r in range(1, ranks.size()): depth.append(depth[r - 1] + (rg[r - 1] + rg[r]) / 2.0)
	var mid: float = depth[-1] / 2.0
	for r in ranks.size():
		var rk: Array = ranks[r]
		var shift: float = rg[r] / 2.0 if (wide and r % 2 == 1) else 0.0
		for c in rk.size():
			out[rk[c]] = Vector2((c - (rk.size() - 1) / 2.0) * rg[r] + shift, mid - depth[r])
	return out

## Which slot each man takes. Slots only say the shape; giving them out in list order sent
## men across each other's paths. Within each kind of soldier, the men furthest forward take
## the front rank and each rank is filled left to right by where the men stand now, so
## nobody walks through the formation to reach his place. Ties break on id, so both phones
## in a network match agree.
func _match_slots(sorted: Array, slots: Array, kind: String, cx: float, cy: float, fx: float, fy: float, rx: float, ry: float) -> Array:
	var by_key := {}
	var keys := []
	var index_of := {}
	for i in sorted.size():
		var u: Dictionary = sorted[i]
		index_of[u.id] = i
		var k := _is_outer(u) if kind == "box" else _rank(u)
		if not by_key.has(k):
			by_key[k] = []; keys.append(k)
		by_key[k].append(i)
	var res := []
	res.resize(sorted.size())
	var fwd := func(u): return (u.x - cx) * fx + (u.y - cy) * fy
	var lat := func(u): return (u.x - cx) * rx + (u.y - cy) * ry
	for k in keys:
		var idx: Array = by_key[k]
		var sl := []
		var men := []
		for i in idx:
			sl.append(slots[i]); men.append(sorted[i])
		ssort(sl, func(a, b): return (b.y - a.y) if b.y != a.y else (a.x - b.x))
		ssort(men, func(a, b):
			var d: float = fwd.call(b) - fwd.call(a)
			return d if d != 0 else float(a.id - b.id))
		var p := 0
		while p < sl.size():
			var q := p
			while q < sl.size() and absf(sl[q].y - sl[p].y) < 0.01: q += 1
			var row := sl.slice(p, q)
			var crew := men.slice(p, q)
			ssort(crew, func(a, b):
				var d: float = lat.call(a) - lat.call(b)
				return d if d != 0 else float(a.id - b.id))
			for j in crew.size(): res[index_of[crew[j].id]] = row[j]
			p = q
	return res

func cmd_move(units_in: Array, x: float, y: float) -> void:
	var units := units_in.filter(func(u): return u.kind == "unit")
	var n := units.size()
	if n == 0: return
	var cx := 0.0
	var cy := 0.0
	for u in units:
		cx += u.x; cy += u.y
	cx /= n; cy /= n
	var fx := x - cx
	var fy := y - cy
	var fl := Vector2(fx, fy).length()
	if fl == 0: fl = 1
	fx /= fl; fy /= fl            # forward
	var rx := -fy
	var ry := fx                  # right
	# each group keeps the formation it was given; otherwise the player's last choice
	var votes := {}
	var order := []
	for u in units:
		if u.form != "":
			if not votes.has(u.form): order.append(u.form)
			votes[u.form] = votes.get(u.form, 0) + 1
	var kind := ""
	for f in order:
		if kind == "" or votes[f] > votes[kind]: kind = f
	if kind == "":
		kind = G.players[units[0].owner].formation if G.players.has(units[0].owner) else ""
	if kind == "": kind = "line"
	var sorted := formation_order(units, kind)
	var military := n > 1 and units.any(func(u): return u.type != "villager")
	var gs := 0.0
	if military:
		gs = INF
		for u in units: gs = minf(gs, u.def.speed)
	var slots: Array = _match_slots(sorted, formation_slots(sorted, kind), kind, cx, cy, fx, fy, rx, ry) if n > 1 else [Vector2.ZERO]
	var taken := {}   # tiles already given to a man whose own slot was blocked
	for i in sorted.size():
		var u: Dictionary = sorted[i]
		var o: Vector2 = slots[i]
		var tx := x + rx * o.x + fx * o.y
		var ty := y + ry * o.x + fy * o.y
		if not M.is_free(int(tx), int(ty)):
			# a slot on a tree or wall: the nearest open tile no one else was moved to,
			# so blocked men don't all pile onto the same spot
			var best = null
			for r in range(1, 7):
				for dy in range(-r, r + 1):
					for dx in range(-r, r + 1):
						if maxi(absi(dx), absi(dy)) != r: continue
						var ax := int(tx) + dx
						var ay := int(ty) + dy
						if M.is_free(ax, ay) and not taken.has(Vector2i(ax, ay)):
							best = Vector2i(ax, ay); break
					if best != null: break
				if best != null: break
			if best == null: best = M.nearest_free(tx, ty, 6)
			if best == null: best = Vector2i(int(x), int(y))
			taken[best] = true
			tx = best.x + 0.5; ty = best.y + 0.5
		u.task = {"t": "move", "x": tx, "y": ty, "gs": gs, "fx": fx if military else 0.0, "fy": fy if military else 0.0}
		u.path = M.find_path(u.x, u.y, _tile_rect(tx, ty), false, 0, u.owner)
		if u.path.size() > 0: u.path[-1] = Vector2(tx, ty)

func cmd_attack(units: Array, t: Dictionary) -> void:
	for u in units:
		if u.kind == "unit" and not u.def.has("heal"):
			u.task = {"t": "attack", "id": t.id, "forced": true}; u.path = []; u.pathFor = 0

func cmd_gather(units: Array, r: Dictionary) -> void:
	for u in units:
		if u.type == "villager":
			u.task = {"t": "gather", "id": r.id, "rtype": r.type, "lx": r.x, "ly": r.y}; u.path = []; u.pathFor = 0

## Send a group to gather a kind of resource around a point, spreading them out: each man
## takes the nearest patch of that kind that still has room, so three villagers sent to a
## forest take three trees, not one. `r` is the patch that was tapped (or the nearest one);
## men who find no room within `radius` tiles of it share it anyway.
func cmd_gather_spread(units: Array, r, radius: float = 6.0) -> void:
	var vils := units.filter(func(u): return u.type == "villager")
	if vils.is_empty() or r == null: return
	var mine := {}
	for v in vils: mine[v.id] = true
	var load := {}   # resource id -> men already on it (counting the ones we assign here)
	for u in G.ents:
		if not u.dead and u.kind == "unit" and u.task.t == "gather" and not mine.has(u.id): load[u.task.id] = load.get(u.task.id, 0) + 1
	var cap: int = GATHER_CAP.get(r.type, 2)
	var pool := []
	for e in G.ents:
		if not e.dead and e.kind == "res" and e.type == r.type and e.amount > 0 and Vector2(e.x - r.x, e.y - r.y).length() <= radius: pool.append(e)
	# nearest men first, so the ones already there keep the tapped patch
	ssort(vils, func(a, b):
		var d: float = dist(a, r) - dist(b, r)
		return d if d != 0 else float(a.id - b.id))
	for v in vils:
		var best = null
		var bd := INF
		for e in pool:
			if load.get(e.id, 0) >= cap: continue
			# prefer the tapped patch and what is near it, then what is near the man
			var d: float = Vector2(e.x - r.x, e.y - r.y).length() * 2 + dist(v, e)
			if d < bd:
				bd = d; best = e
		if best == null: best = r
		load[best.id] = load.get(best.id, 0) + 1
		cmd_gather([v], best)

func cmd_build(units: Array, b: Dictionary) -> void:
	for u in units:
		if u.type == "villager":
			u.task = {"t": "build", "id": b.id}; u.path = []; u.pathFor = 0

func cmd_farm(units: Array, f: Dictionary) -> void:
	for u in units:
		if u.type == "villager":
			u.task = {"t": "farm", "id": f.id}; u.path = []; u.pathFor = 0

func cmd_deposit(units: Array, b: Dictionary) -> void:
	for u in units:
		if u.type == "villager" and u.carry != null:
			u.task = {"t": "return", "id": b.id, "back": u.task if u.task.t == "gather" else null}; u.path = []; u.pathFor = 0

# A spent farm keeps its tiles and can be sown again for a fraction of a new one.
func farm_full(owner_: int) -> int:
	return roundi(D.BUILDINGS.farm.farm * mods(owner_).get("farmFood", 1)) + int(tech_eff(owner_, "farm"))

func farm_spent(f) -> bool:
	return f != null and not f.dead and f.type == "farm" and f.built and f.food <= 0

func resow_cost(owner_: int) -> Dictionary:
	return {"wood": roundi(D.BUILDINGS.farm.reseed * mods(owner_).get("farmCost", 1))}

func resow_farm(f: Dictionary, owner_: int) -> bool:
	if not farm_spent(f) or f.owner != owner_: return false
	if not pay(owner_, resow_cost(owner_)): return false
	f.food = float(farm_full(owner_)); f.fallow = false
	return true

## A farm takes one worker. It counts as busy while another villager is working
## it OR walking to it, so two villagers never get sent to the same plot.
func farm_busy(f: Dictionary, except = null) -> bool:
	for u in G.ents:
		if u.dead or u.kind != "unit" or (except != null and u.id == except.id): continue
		var t: Dictionary = u.task
		if t.t == "farm" and t.id == f.id: return true
		if t.t == "build" and t.id == f.id and t.get("then") == "farm": return true
		# still theirs while they walk a full load back to the mill
		if t.t == "return" and t.get("back") != null and t.back.t == "farm" and t.back.id == f.id: return true
	return false

func free_farm_near(x: float, y: float, owner_: int, except = null):
	var best = null
	var bd := INF
	for e in G.ents:
		if e.dead or e.kind != "building" or e.type != "farm" or e.owner != owner_: continue
		if farm_busy(e, except): continue
		var d: float = (e.x - x) ** 2 + (e.y - y) ** 2
		if d < bd:
			bd = d; best = e
	return best

## Context-sensitive command (what a tap on something does).
## G.cmd_target is the entity actually acted on, which is not always the one
## tapped (a busy farm hands off to the nearest free one). The UI outlines it.
func cmd_smart(units_in: Array, x: float, y: float, t = null):
	var units := units_in.filter(func(u): return u.kind == "unit" and not u.dead)
	G.cmd_target = t
	if units.is_empty(): return null
	var me: int = units[0].owner
	if t != null and not t.dead:
		if enemies(t.owner, me):
			cmd_attack(units, t); return "attack"
		var vils := units.filter(func(u): return u.type == "villager")
		if t.kind == "res":
			if vils.size() > 1: cmd_gather_spread(vils, t)
			else: cmd_gather(vils, t)
			cmd_move(units.filter(func(u): return u.type != "villager"), x, y)
			return "gather" if vils.size() > 0 else "move"
		if t.kind == "building" and t.owner == me and vils.size() > 0:
			# a farm only ever needs one villager, building it included
			if t.type == "farm":
				var who: Dictionary = vils[0]
				var f = t
				if farm_busy(t, who):
					f = free_farm_near(who.x, who.y, t.owner, who)
					if f == null:
						G.cmd_target = t; return "farm-busy"
				G.cmd_target = f
				cmd_farm([who], f)   # the farm task builds it first when unbuilt
				# the others spread out over your other free farms (one farmer each, as in AoE2)
				var left := 0
				for i in range(1, vils.size()):
					var v: Dictionary = vils[i]
					var g = free_farm_near(v.x, v.y, t.owner, v)
					if g != null: cmd_farm([v], g)
					else: left += 1
				if left > 0 and t.owner == 1:
					G.alert("%d villager%s no free farm. Build more farms." % [left, " has" if left == 1 else "s have"])
				return "gather" if f.id == t.id else "gather-moved"
			if not t.built or t.hp < t.maxHp:
				cmd_build(vils, t); return "build"
			if t.def.has("drop"):
				cmd_deposit(vils, t); return "move"
		if t.owner == me and (t.kind == "unit" or t.kind == "building"):
			var sold := units.filter(func(u): return u.type != "villager" and u.id != t.id and not u.def.has("heal"))
			if sold.size() > 0:
				# wounded to the Infirmary: shelter and heal there
				if t.type == "infirmary" and sold.any(func(u): return u.hp < u.maxHp):
					var c := 0
					for u in sold:
						if can_garrison(u, t):
							garrison_to(u, t); c += 1
					if c > 0: return "shelter"
				cmd_guard(sold, t); return "guard"
	cmd_move(units, x, y)
	return "move"

## turn a finished wall piece into a gate foundation on the same tile; the nearest villager builds it
func wall_to_gate(w):
	if w == null or w.dead or not w.def.has("wall") or w.type == "gate" or not w.built: return "not a wall"
	if not can_build_type(w.owner, "gate"): return "needs the " + D.AGES[D.BUILD_AGE.gate].name
	var cost := build_cost(w.owner, "gate")
	if not can_afford(w.owner, cost): return "cost"
	var tx: int = w.tx
	var ty: int = w.ty
	var owner_: int = w.owner
	w.dead = true; M.set_block(w, 0); G.by_id.erase(w.id)
	G.ents = G.ents.filter(func(e): return e.id != w.id)
	var vil = nearest(w.x, w.y, func(e): return e.kind == "unit" and e.owner == owner_ and e.type == "villager" and e.inside == 0, 40)
	var g = place_building(owner_, "gate", tx, ty, [vil] if vil != null else [])
	if g == null:
		var back := add_building(w.type, owner_, tx, ty, true)
		back.hp = w.hp
		return "blocked"
	return g

func cmd_stop(units: Array) -> void:
	for u in units:
		if u != null and not u.dead:
			u.task = {"t": "idle"}; u.path = []

func set_stance(units: Array, k: String) -> void:
	for u in units:
		if u != null and not u.dead: u.stance = k

func set_rally(b, r) -> void:
	if b != null and not b.dead: b.rally = r

func set_form(units: Array, k: String) -> void:
	for u in units:
		if u != null and not u.dead: u.form = k
	if units.size() > 0 and G.players.has(units[0].owner): G.players[units[0].owner].formation = k

func set_reseed(p: int, on: bool) -> void:
	if G.players.has(p): G.players[p].noReseed = not on

func ungarrison_unit(b: Dictionary, u: Dictionary) -> void:
	ungarrison(b, func(x): return x.id == u.id)

func delete_ent(e) -> void:
	if e != null and not e.dead:
		kill(e); G.on_killed(e)

func cmd_guard(units: Array, t: Dictionary) -> void:
	for u in units:
		if u.kind == "unit" and not u.dead and u.id != t.id:
			u.task = {"t": "guard", "id": t.id}; u.path = []; u.pathFor = 0; u.repath = 0.0

## a field never overlaps another field or a building (fields don't block walking, so the
## blocking grid alone doesn't catch them)
func farm_overlap(tx: int, ty: int, s: int, ignore = null) -> bool:
	for f in G.ents:
		if not f.dead and f.type == "farm" and (ignore == null or f.id != ignore.id) and tx < f.tx + f.size and tx + s > f.tx and ty < f.ty + f.size and ty + s > f.ty: return true
	return false

func place_building(owner_: int, type: String, tx: int, ty: int, builders: Array = []):
	var def: Dictionary = D.BUILDINGS[type]
	if not can_build_type(owner_, type): return null
	if not M.area_free(tx, ty, def.size): return null
	if farm_overlap(tx, ty, def.size): return null
	if G.rule_block(owner_, type, tx, ty): return null
	var cost := build_cost(owner_, type)
	if not pay(owner_, cost): return null
	var b := add_building(type, owner_, tx, ty, false)
	b.cost = cost
	G.on_building_placed(b)
	# Push units standing inside the footprint out.
	for u in G.ents:
		if u.kind == "unit" and not u.dead and u.x >= tx and u.x < tx + def.size and u.y >= ty and u.y < ty + def.size:
			var f = M.nearest_free(u.x, u.y, 6)
			if f != null:
				u.x = f.x + 0.5; u.y = f.y + 0.5; u.path = []
	if owner_ == 1: G.snd("place", b.x, b.y)
	if builders.size() > 0: cmd_build(builders, b)
	return b

## a building's train list plus the owner's unique unit (e.g. Britons Longbowman at the Castle)
func trains_for(b: Dictionary) -> Array:
	var list: Array = (b.def.get("trains", []) as Array).duplicate()
	if G.players.has(b.owner):
		var civ: Dictionary = D.CIVS[G.players[b.owner].civ]
		if civ.has("unique") and civ.unique.at == b.type: list.append(civ.unique.type)
	return list

func train(b: Dictionary, type: String):
	if not b.built or b.dead: return false
	if not trains_for(b).has(type) or not can_train_type(b.owner, type): return false
	if b.aging != null or b.research != null: return "busy"
	var cost := unit_cost(b.owner, type)
	var pc := pop_of(b.owner)
	if pc.x >= pc.y: return "pop"
	if b.queue.size() >= 10: return false
	if not pay(b.owner, cost): return "res"
	b.queue.append({"type": type, "cost": cost})
	return true

func cancel_train(b: Dictionary, i: int) -> void:
	if i < 0 or i >= b.queue.size(): return
	var q: Dictionary = b.queue.pop_at(i)
	refund(b.owner, q.cost)
	if i == 0: b.qt = 0.0

## what an entity was worth, for the score: its cost, with a royal counted as a small army
func value_of(e: Dictionary) -> int:
	if e.def.get("cls", "") == "hero": return 400
	var v := 0
	for k in e.def.get("cost", {}): v += e.def.cost[k]
	return v

# ---------- Damage ----------
func damage(att: Dictionary, t: Dictionary) -> float:
	var d: Dictionary = att.def
	var ranged: bool = d.get("ranged", false)
	var bonus: Dictionary = d.get("bonus", {})
	var dmg: float
	if t.kind == "building":
		# an arrow does nothing to a wall, but a ram or a trebuchet lands its whole blow
		if d.get("siege", false): dmg = d.atk + (tech_eff(att.owner, "unitAtk_" + att.type) if att.kind == "unit" else 0.0)
		elif ranged: dmg = 1
		else: dmg = maxf(1, d.atk - 1)
		dmg += bonus.get("bld", 0)
		if att.kind == "building": dmg = 1
	else:
		var soldier: bool = att.kind == "unit" and att.type != "villager"
		var from_bld: bool = att.kind == "building"
		var aa := 0.0
		if soldier:
			var tb := tech_bonus(att.owner)
			aa = (1 if age_of(att.owner) >= 3 else 0) + (1 if age_of(att.owner) >= 4 else 0) + (tb.ranged if ranged else tb.melee)
		var t_sold: bool = t.kind == "unit" and t.type != "villager"
		var ta := 0.0
		if t_sold:
			var tbt := tech_bonus(t.owner)
			ta = (1 if age_of(t.owner) >= 4 else 0) + (tbt.pierce if (ranged or from_bld) else tbt.armor)
		var arm: float = (t.def.get("pierce", 0) if (ranged or from_bld) else t.def.get("armor", 0)) + ta
		dmg = maxf(1, d.atk + aa - arm + (tech_eff(att.owner, "towerAtk") if from_bld else tech_eff(att.owner, "unitAtk_" + att.type)))
		dmg += bonus.get(t.def.get("cls", ""), 0)
		if soldier and d.cls != "hero":
			# soldiers fighting near their King hit harder
			var k = G.kings.get(att.owner)
			if k != null and dist(k, att) <= KING_AURA: dmg += 1
			# a dynasty mourning its King fights weaker for a while
			if G.players[att.owner].mourn > G.time: dmg = maxf(1, roundi(dmg * 0.8))
	return G.dmg_mod(att, t, dmg)

func _is_line_soldier(o: Dictionary) -> bool:
	return o.type != "villager" and not o.def.has("heal") and not o.def.get("siege", false) and o.def.cls != "hero"

func hit(att: Dictionary, t: Dictionary, dmg: float) -> void:
	if t.dead: return
	# Capture: a Town Center can be beaten down to a white flag, never burned
	var floor_ = G.hp_floor(t)
	if floor_ != null and t.hp - dmg < floor_:
		t.hp = minf(t.hp, floor_); t.hitT = 0.2
		return
	t.hp -= dmg; t.hitT = 0.2
	if t.kind == "unit": t.hurtT = 0.6
	if t.hp <= 0:
		if att.owner > 0:
			var pl: Dictionary = G.players[att.owner]
			pl.killed += 1; pl.killValue += value_of(t)
			# the results screen's detail: what killed what
			var st: Dictionary = pl.stats
			if not st.has("killsBy"): st.killsBy = {}
			st.killsBy[att.type] = st.killsBy.get(att.type, 0) + 1
			var key := "razed" if t.kind == "building" else "unitsKilled"
			st[key] = st.get(key, 0) + 1
		kill(t)
		return
	# Fight back. A soldier marching on a building (an attack wave, an attack-move) turns on
	# the unit that hits it, as in AoE2: without this four archers could shoot down a whole
	# army that kept walking at a Town Center. Siege and the royals keep to their orders.
	if t.kind == "unit" and att.kind == "unit" and t.task.t == "attack" and _is_line_soldier(t) and stance_of(t) != "passive" and enemies(att.owner, t.owner):
		var cur = G.by_id.get(t.task.id)
		if cur == null or cur.kind == "building" or dist(t, cur) > dist(t, att) + 2:
			t.task = {"t": "attack", "id": att.id, "forced": t.task.get("forced", false), "home": t.task.get("home")}
			# and the men marching beside it turn with it
			for o in G.ents:
				if o.id == t.id or o.dead or o.kind != "unit" or o.owner != t.owner or not _is_line_soldier(o): continue
				if o.task.t != "attack" or dist(o, t) > 5: continue
				var oc = G.by_id.get(o.task.id)
				if oc != null and oc.kind == "unit": continue
				o.task = {"t": "attack", "id": att.id, "forced": o.task.get("forced", false), "home": o.task.get("home")}; o.path = []; o.pathFor = 0
	if t.kind == "unit" and t.task.t != "attack" and enemies(att.owner, t.owner):
		if t.type != "villager" and not t.def.has("heal") and stance_of(t) != "passive":
			t.task = {"t": "attack", "id": att.id, "home": Vector2(t.x, t.y)}
			# His comrades come too. Archers shoot from just beyond a swordsman's sight, so
			# without this the men standing beside him never notice: he charges alone, dies in
			# seconds, and the next man does the same. Idle soldiers within earshot (and those
			# only wandering) turn on the attacker; stand-ground and passive men stay put.
			if att.kind == "unit":
				for o in G.ents:
					if o.id == t.id or o.dead or o.kind != "unit" or o.owner != t.owner or o.inside != 0 or not _is_line_soldier(o): continue
					if o.task.t != "idle" and not (o.task.t == "move" and not o.task.get("forced", false)): continue
					var st := stance_of(o)
					if st == "stand" or st == "passive": continue
					if dist(o, t) > 6: continue
					var resume = {"x": o.task.x, "y": o.task.y, "fx": o.task.get("fx", 0.0), "fy": o.task.get("fy", 0.0)} if o.task.t == "move" else null
					o.task = {"t": "attack", "id": att.id, "home": Vector2(o.x, o.y), "resume": resume}; o.path = []; o.pathFor = 0
		elif att.kind == "unit" and att.def.cls != "cav" and t.hp < t.maxHp * 0.4:
			# flee toward town center
			var tc = nearest(t.x, t.y, func(e): return e.type == "towncenter" and e.owner == t.owner and e.built)
			if tc != null:
				t.task = {"t": "move", "x": tc.x, "y": tc.y + tc.size / 2.0 + 0.6}
				t.path = M.find_path(t.x, t.y, rect_of(tc), true, tc.id, t.owner)
	var k: String = HIT_SOUND.get(att.type, "bow" if att.kind == "building" else "sword")
	# melee blows vary with what they land on: armour clanks, cloth and leather slash
	if k == "sword" and t.kind == "unit":
		if t.def.cls == "cav" or t.def.armor >= 2: k = "armor" if randf() < 0.5 else "sword"
		else: k = "slash" if randf() < 0.5 else "sword"
	G.snd(k, t.x, t.y)
	# the music turns when the player's own war starts, not when two AIs scrap elsewhere
	if (att.owner == 1 or t.owner == 1) and enemies(att.owner, t.owner): G.fighting.emit()
	G.on_hit(att, t)

func fire(att: Dictionary, t: Dictionary) -> void:
	var dmg := damage(att, t)
	if att.def.get("ranged", false) or att.kind == "building":
		var heavy: bool = att.def.get("siege", false)
		if att.type == "trebuchet": G.snd("trebuchet", att.x, att.y)   # a trebuchet stone lobs slowly and high, not like an arrow
		G.projs.append({"x": att.x, "y": att.y, "z": 1.6 if att.kind == "building" else 0.6, "tx": t.x, "ty": t.y, "tid": t.id,
			"from": att, "dmg": dmg, "t": 0.0, "heavy": heavy, "dur": maxf(0.25, dist(att, t) / (4.0 if heavy else 9.0)), "done": false})
	else:
		hit(att, t, dmg)
		if att.def.has("splash") and t.kind == "unit":
			for o in G.ents:
				if o.id == t.id or o.dead or o.kind != "unit" or not enemies(o.owner, att.owner) or Vector2(o.x - t.x, o.y - t.y).length() > 1: continue
				hit(att, o, maxf(1, roundi(dmg * att.def.splash)))

# ---------- Per-frame update ----------
func update_entities(dt: float) -> void:
	# where each player's King stands this frame (a King hiding indoors leads no one)
	G.kings = {}
	for e in G.ents:
		if not e.dead and e.type == "king": G.kings[e.owner] = e
	# Buildings
	for b in G.ents:
		if b.dead or b.kind != "building": continue
		if b.hitT > 0: b.hitT = maxf(0, b.hitT - dt)
		if not b.built: continue
		if b.research != null:
			b.research.t += dt * G.fast_train
			var rd: Dictionary = D.UPGRADES[b.research.id] if b.research.kind == "up" else D.TECHS[b.research.id]
			if b.research.t >= rd.time: _finish_research(b)
		elif b.aging != null:
			b.aging.t += dt * mods(b.owner).get("tcSpeed", 1) * G.fast_train
			if b.aging.t >= D.AGES[b.aging.to].time: _finish_age(b)
		elif b.queue.size() > 0:
			var q: Dictionary = b.queue[0]
			var speed: float = (mods(b.owner).get("tcSpeed", 1) if b.type == "towncenter" else 1) * (1 + tech_eff(b.owner, "trainSpeed_" + b.type))
			var pc := pop_of(b.owner)
			var blocked: bool = pc.x - b.queue.size() + 1 > pc.y   # housed
			if not blocked: b.qt += dt * speed * G.fast_train
			b.housed = blocked
			if b.qt >= D.UNITS[q.type].time:
				b.qt = 0.0; b.queue.pop_front()
				if b.owner == 1: G.snd("train")
				_spawn(b, q.type)
		else: b.housed = false
		if b.def.has("atk") and not G.no_shoot(b):
			b.cool -= dt
			if b.cool <= 0:
				var t = nearest(b.x, b.y, func(e): return e.kind == "unit" and enemies(e.owner, b.owner), b.def.range + tech_eff(b.owner, "towerRange"))
				if t != null:
					for i in 1 + b.garrison.size(): fire(b, t)
					b.cool = b.def.rate
		# shelter heals: wounded units inside slowly recover (faster in an Infirmary).
		# Nobody heals while the building is being hit.
		if b.garrison.size() > 0:
			b.calmT = 3.0 if b.hitT > 0 else maxf(0, b.calmT - dt)
			var rate: float = 0.0 if b.calmT > 0 else b.def.get("heal", 1)
			if rate > 0:
				for g in b.garrison:
					if not g.dead and g.hp < g.maxHp: g.hp = minf(g.maxHp, g.hp + rate * dt)
	# Units
	var entered := false
	for u in G.ents:
		if not u.dead and u.kind == "unit" and u.inside == 0: _update_unit(u, dt)
		if u.kind == "unit" and u.entering: entered = true
	if entered:
		for e in G.ents:
			if e.kind == "unit": e.entering = false
		G.ents = G.ents.filter(func(e): return e.inside == 0)
	# Separation using a tile bucket grid
	var buckets := {}
	for u in G.ents:
		if not u.dead and u.kind == "unit":
			var k := int(u.x) * 1000 + int(u.y)
			if buckets.has(k): buckets[k].append(u)
			else: buckets[k] = [u]
	for u in G.ents:
		if u.dead or u.kind != "unit": continue
		if u.task.t == "farm" and u.atFarm: continue
		var px := 0.0
		var py := 0.0
		var ux := int(u.x)
		var uy := int(u.y)
		for dy in range(-1, 2):
			for dx in range(-1, 2):
				var a = buckets.get((ux + dx) * 1000 + uy + dy)
				if a == null: continue
				for o in a:
					if o.id == u.id: continue
					var ddx: float = u.x - o.x
					var ddy: float = u.y - o.y
					var d := sqrt(ddx * ddx + ddy * ddy)
					if d < SEP and d > 0.0001:
						var f := (SEP - d) / d * 0.5
						px += ddx * f; py += ddy * f
					elif d <= 0.0001:
						px += (u.id % 7 - 3) * 0.01; py += (u.id % 5 - 2) * 0.01
		if px == 0 and py == 0: continue
		var k := 0.3 if u.path.size() > 0 else 1.0
		var nx: float = u.x + px * k
		var ny: float = u.y + py * k
		if M.free_for(int(nx), int(ny), u.owner):
			u.x = nx; u.y = ny
	# Projectiles
	var any_done := false
	for p in G.projs:
		p.t += dt
		var t = G.by_id.get(p.tid)
		if t != null:
			p.tx = t.x; p.ty = t.y
		if p.t >= p.dur:
			p.done = true; any_done = true
			if t != null and not t.dead: hit(p.from, t, p.dmg)
	if any_done: G.projs = G.projs.filter(func(p): return not p.done)
	if G.corpses.size() > 0:
		for c in G.corpses: c.t += dt
		if G.corpses[0].t > 14: G.corpses = G.corpses.filter(func(c): return c.t <= 14)
	if G.decals.size() > 0:
		for d in G.decals: d.life -= dt
		if G.decals[0].life <= 0: G.decals = G.decals.filter(func(d): return d.life > 0)
	if G.effects.size() > 0:
		for f in G.effects: f.life -= dt
		G.effects = G.effects.filter(func(f): return f.life > 0)
	# Cleanup dead
	var any_dead := false
	for e in G.ents:
		if e.dead:
			any_dead = true; break
	if any_dead: G.ents = G.ents.filter(func(e): return not e.dead)

func _spawn(b: Dictionary, type: String) -> void:
	var s: int = b.size
	# search ring around building, starting at the front (bottom on screen)
	var spot = null
	for r in 4:
		var best_d := INF
		for y in range(b.ty - 1 - r, b.ty + s + r + 1):
			for x in range(b.tx - 1 - r, b.tx + s + r + 1):
				if M.is_free(x, y) and -(x + y) < best_d:
					best_d = -(x + y); spot = Vector2i(x, y)
		if spot != null: break
	if spot == null: spot = M.nearest_free(b.x, b.y, 10)
	if spot == null: spot = Vector2i(b.tx, b.ty)
	var u := add_unit(type, b.owner, spot.x + 0.5, spot.y + 0.5)
	if b.rally != null:
		var t = G.by_id.get(b.rally.id) if b.rally.get("id", 0) != 0 else null
		if t != null and not t.dead: cmd_smart([u], t.x, t.y, t)
		else: cmd_move([u], b.rally.x, b.rally.y)
	G.on_spawn(u, b)

func _move_along(u: Dictionary, dt: float) -> bool:
	if u.path.is_empty(): return true
	var wp: Vector2 = u.path[0]
	var dx: float = wp.x - u.x
	var dy: float = wp.y - u.y
	var d := sqrt(dx * dx + dy * dy)
	var sp: float = u.def.speed
	if u.task.t == "move" and u.task.get("gs", 0.0) > 0: sp = minf(sp, u.task.gs)
	var step: float = sp * dt * G.terrain_speed * (1 + tech_eff(u.owner, "vilSpeed") if u.type == "villager" else 1.0) \
		* (1 + tech_eff(u.owner, "unitSpd_" + u.type)) * G.speed_mul(u)
	var dd := d if d > 0 else 1.0
	_steer(u, dx / dd, dy / dd, dt)
	u.walk += dt
	u.dist += minf(step, d)
	if d <= step:
		u.x = wp.x; u.y = wp.y; u.path.pop_front()
		return u.path.is_empty()
	u.x += dx / d * step; u.y += dy / d * step
	return false

# Smoothed heading: facing only changes when the new direction holds for a moment,
# so zig-zags in the path don't make units flip back and forth.
# 8 screen directions: S SE E NE N NW W SW
func _set_dir(u: Dictionary, sx: float, sy: float) -> void:
	if absf(sx) + absf(sy) < 1e-3: return
	var a := rad_to_deg(atan2(sx, sy))
	if u.dir >= 0:   # hysteresis: stay put until clearly pointing elsewhere
		var diff := absf(fposmod(fposmod(a - u.dir * 45, 360) + 540, 360) - 180)
		if diff < 30: return
	u.dir = posmod(roundi(a / 45.0), 8)

func _steer(u: Dictionary, nx: float, ny: float, dt: float) -> void:
	var k := minf(1, dt * 7)
	u.hx = nx if u.hx == null else u.hx + (nx - u.hx) * k
	u.hy = ny if u.hy == null else u.hy + (ny - u.hy) * k
	var sx: float = u.hx - u.hy
	var sy: float = (u.hx + u.hy) / 2.0   # screen-space direction
	if sx > 0.3: u.face = 1
	elif sx < -0.3: u.face = -1
	if sy < -0.22: u.up = true
	elif sy > 0.08: u.up = false
	_set_dir(u, sx, sy)

func face_xy(u: Dictionary, x: float, y: float) -> void:
	var dx: float = x - u.x
	var dy: float = y - u.y
	if absf(dx - dy) > 0.01: u.face = 1 if (dx - dy) > 0 else -1
	_set_dir(u, dx - dy, (dx + dy) / 2.0)

func _find_new_resource(u: Dictionary, rtype: String, lx: float, ly: float):
	# the next bush/tree/rock by the last one; skip ones others found unreachable, and look a
	# little wider from where the villager stands before giving up and going idle
	var ok := func(e): return e.kind == "res" and e.type == rtype and e.amount > 0 and not (e.unreach > 2)
	var r = nearest(lx, ly, ok, 10)
	if r == null: r = nearest(u.x, u.y, ok, 14)
	if r == null: r = nearest(lx, ly, func(e): return e.kind == "res" and e.type == rtype and e.amount > 0, 10)
	return r

func _bank(u: Dictionary) -> void:
	var pl: Dictionary = G.players[u.owner]
	var amt := roundi(u.carry.amt)
	pl.res[u.carry.res] += amt; pl.gathered[u.carry.res] += amt

func _update_unit(u: Dictionary, dt: float) -> void:
	if u.hitT > 0: u.hitT = maxf(0, u.hitT - dt)
	if u.hurtT > 0: u.hurtT = maxf(0, u.hurtT - dt)
	if u.atkAnim > 0: u.atkAnim = maxf(0, u.atkAnim - dt)
	u.cool -= dt
	u.repath -= dt
	u.working = false
	# Byzantine healing near own TC
	if u.hp < u.maxHp and mods(u.owner).get("tcHeal", false):
		var tc = nearest(u.x, u.y, func(e): return e.type == "towncenter" and e.owner == u.owner and e.built, 6)
		if tc != null: u.hp = minf(u.maxHp, u.hp + dt * 0.8)
	# A Monk tends the nearest wounded man he can reach, as long as he is standing still:
	# he picks one and stays with him until he is whole, rather than flitting between them.
	if u.def.has("heal") and u.path.is_empty():
		var t = G.by_id.get(u.healing) if u.healing != 0 else null
		if t == null or t.dead or t.hp >= t.maxHp or dist(u, t) > u.def.healRange:
			t = nearest(u.x, u.y, func(e): return e.kind == "unit" and e.id != u.id and e.owner == u.owner and e.hp < e.maxHp and not e.def.has("heal"), u.def.healRange)
			u.healing = t.id if t != null else 0
		if t != null:
			u.working = true
			t.hp = minf(t.maxHp, t.hp + dt * u.def.heal)
			u.healT -= dt
			if u.healT <= 0:
				u.healT = 0.5
				G.effects.append({"t": "heal", "x": t.x, "y": t.y, "life": 0.6}); G.snd("heal", t.x, t.y)
	var task: Dictionary = u.task
	match task.t:
		"idle": _t_idle(u, dt)
		"move": _t_move(u, task, dt)
		"guard": _t_guard(u, task, dt)
		"attack": _t_attack(u, task, dt)
		"gather": _t_gather(u, task, dt)
		"farm": _t_farm(u, task, dt)
		"garrison": _t_garrison(u, task, dt)
		"return": _t_return(u, task, dt)
		"build": _t_build(u, task, dt)

func _t_idle(u: Dictionary, dt: float) -> void:
	u.path = []
	if u.type == "villager": return
	u.scan -= dt
	if u.scan > 0: return
	u.scan = 0.5
	var st := stance_of(u)
	# passive: never; stand ground: only what is already in reach; otherwise anything in sight
	var reach: float = 0.0 if st == "passive" else (maxf(1.2, u.range + 0.3) if st == "stand" else float(u.def.los))
	if reach <= 0: return
	var t = nearest(u.x, u.y, func(e): return (e.kind == "unit" or e.kind == "building") and enemies(e.owner, u.owner), reach)
	if t != null: u.task = {"t": "attack", "id": t.id, "home": Vector2(u.x, u.y)}

func _t_move(u: Dictionary, task: Dictionary, dt: float) -> void:
	# A soldier on the march fights what comes within reach instead of walking past it
	# while it hits him. He turns on the nearest enemy in a short radius (his own range
	# plus a little, so archers answer archers and a swordsman stops for a man beside
	# him), keeps the destination as home so the leash and the formation still make
	# sense, and carries on when the fight is done. Retreating waves (forced) march on.
	if _is_line_soldier(u) and not task.get("forced", false) and stance_of(u) != "passive":
		u.scan -= dt
		if u.scan <= 0:
			u.scan = 0.4
			var reach := maxf(2.5, u.range + 1.5)
			var t = nearest(u.x, u.y, func(e): return e.kind == "unit" and enemies(e.owner, u.owner) and e.inside == 0, reach)
			if t != null:
				u.task = {"t": "attack", "id": t.id, "home": Vector2(task.x, task.y), "resume": {"x": task.x, "y": task.y, "fx": task.get("fx", 0.0), "fy": task.get("fy", 0.0)}}
				u.path = []; u.pathFor = 0
				return
	if u.path.is_empty():
		if Vector2(task.x - u.x, task.y - u.y).length() < 0.6 or task.get("tries", 0) > 2:
			var fx: float = task.get("fx", 0.0)
			var fy: float = task.get("fy", 0.0)
			if fx != 0 or fy != 0: face_xy(u, u.x + fx, u.y + fy)   # a formation turns to face the way it marched
			u.task = {"t": "idle"}
			return
		if u.repath <= 0:
			task.tries = task.get("tries", 0) + 1
			u.path = M.find_path(u.x, u.y, _tile_rect(task.x, task.y), false, 0, u.owner)
			u.repath = 0.5
			if u.path.is_empty():
				u.task = {"t": "idle"}
				return
	_move_along(u, dt)

func _t_guard(u: Dictionary, task: Dictionary, dt: float) -> void:
	# stay by a friendly unit or building and fight anything that comes near it
	var g = G.by_id.get(task.id)
	if g == null or g.dead or g.inside != 0:
		u.path = []
		if not (g != null and g.inside != 0): u.task = {"t": "idle"}
		return
	task.scan = task.get("scan", 0.0) - dt
	if task.scan <= 0:
		task.scan = 0.4
		var reach: float = 4 + g.size if g.kind == "building" else 6
		var foe = nearest(g.x, g.y, func(e): return (e.kind == "unit" or (e.kind == "building" and e.def.has("atk"))) and enemies(e.owner, u.owner) \
			and (G.reveal_all or u.owner != 1 or G.net_on or M.is_visible(e.x, e.y)), reach)
		if foe != null:
			u.task = {"t": "attack", "id": foe.id, "guard": g.id}; u.path = []; u.pathFor = 0
			return
	var close: bool = edge_dist(u, g) <= 1.6 if g.kind == "building" else dist(u, g) <= 1.8
	if not close:
		if u.path.is_empty() or u.repath <= 0:
			if g.kind == "unit":
				var off: float = ((u.id % 6) / 6.0) * 6.283
				u.path = M.find_path(u.x, u.y, _tile_rect(g.x + cos(off), g.y + sin(off)), false, 0, u.owner)
				u.pathFor = g.id; u.repath = 0.8
			else: _path_to(u, g, true)
		_move_along(u, dt)
	else: u.path = []

func _t_attack(u: Dictionary, task: Dictionary, dt: float) -> void:
	var t = G.by_id.get(task.id)
	# the target ran inside: attack the building that shelters it
	if t != null and t.inside != 0:
		var b = G.by_id.get(t.inside)
		if b != null and not b.dead and enemies(b.owner, u.owner):
			task.id = b.id; t = b
		else: t = null
	var resume = task.get("resume")
	if t == null or t.dead:
		# look for another enemy nearby
		# (a man who stopped on the march only takes on units, not buildings, before resuming)
		var n = null
		if u.type != "villager" and not u.def.has("heal"):
			n = nearest(u.x, u.y, func(e): return (e.kind == "unit" or (e.kind == "building" and resume == null)) and enemies(e.owner, u.owner), u.def.los)
		var ward = G.by_id.get(task.guard) if task.has("guard") else null
		if ward != null and not ward.dead: u.task = {"t": "guard", "id": ward.id}   # back to guard duty
		elif n != null: u.task = {"t": "attack", "id": n.id, "home": task.get("home"), "resume": resume}
		elif resume != null: u.task = {"t": "move", "x": resume.x, "y": resume.y, "fx": resume.fx, "fy": resume.fy}   # back on the march
		else: u.task = {"t": "idle"}
		u.path = []
		return
	# a guard doesn't chase far from what it protects
	if task.has("guard"):
		var ward = G.by_id.get(task.guard)
		if ward != null and not ward.dead and dist(t, ward) > 10:
			u.task = {"t": "guard", "id": ward.id}; u.path = []
			return
	# leash for auto-acquired targets
	var home = task.get("home")
	if home != null and not task.get("forced", false):
		var st := stance_of(u)
		# stand ground: never step off the spot; a target out of reach is let go
		if (st == "stand" or st == "passive") and edge_dist(u, t) > u.range + 0.4:
			u.task = {"t": "idle"}; u.path = []
			return
		if Vector2(u.x - home.x, u.y - home.y).length() > LEASH[st]:
			cmd_move([u], home.x, home.y)
			return
	var d := edge_dist(u, t)
	if d <= u.range + (0.25 if t.kind == "unit" else 0.3):
		u.path = []; face_xy(u, t.x, t.y); u.working = true
		if u.cool <= 0:
			fire(u, t); u.cool = u.def.rate; u.atkAnim = 0.25
	else:
		if u.pathFor != t.id or u.repath <= 0 or u.path.is_empty(): _path_to(u, t, true)
		_move_along(u, dt)
		# standing beside it but a hair out of reach (the path ends on the next tile): close the gap directly
		if u.path.is_empty() and d < u.range + 1.6:
			var cx: float = clampf(u.x, t.tx, t.tx + t.size) if t.kind == "building" else t.x
			var cy: float = clampf(u.y, t.ty, t.ty + t.size) if t.kind == "building" else t.y
			var dx: float = cx - u.x
			var dy: float = cy - u.y
			var l := sqrt(dx * dx + dy * dy)
			if l == 0: l = 1
			var stp: float = u.def.speed * dt * G.speed_mul(u)
			var nx: float = u.x + dx / l * stp
			var ny: float = u.y + dy / l * stp
			if M.free_for(int(nx), int(ny), u.owner) or (t.kind == "building" and M.in_map(int(nx), int(ny)) and M.block[M.idx(int(nx), int(ny))] == t.id):
				u.x = nx; u.y = ny
		# the way is shut by an enemy wall (Fortress maps, or walls they built): break through it
		if u.path.is_empty() and d > u.range + 1.5 and not t.def.has("wall"):
			var w = nearest(u.x, u.y, func(e): return e.kind == "building" and e.def.has("wall") and enemies(e.owner, u.owner), 2.5)
			if w != null:
				u.task = {"t": "attack", "id": w.id, "forced": true}; u.path = []

func _t_gather(u: Dictionary, task: Dictionary, dt: float) -> void:
	if u.carry != null and u.carry.amt >= carry_cap(u):
		_go_drop(u); return
	var r = G.by_id.get(task.id)
	if r == null or r.dead or r.amount <= 0:
		r = _find_new_resource(u, task.rtype, task.lx, task.ly)
		if r == null:
			if u.carry != null and u.carry.amt > 0: _go_drop(u)
			else: u.task = {"t": "idle"}
			return
		task.id = r.id; u.path = []; u.pathFor = 0
	task.lx = r.x; task.ly = r.y
	var ed := edge_dist(u, r)
	if ed <= 0.75:
		u.path = []; face_xy(u, r.x, r.y); u.working = true
		# step right up to the rock, tree or bush, so the swing lands on it instead of on
		# the air a pace away (a worker on a diagonal neighbour stands well clear of it)
		if ed > 0.3:
			var cx := clampf(u.x, r.tx, r.tx + 1)
			var cy := clampf(u.y, r.ty, r.ty + 1)
			var k := minf(1, dt * 2.5 * (ed - 0.3) / ed)
			u.x += (cx - u.x) * k; u.y += (cy - u.y) * k
		_work_snd(u, {"wood": "chop", "gold": "mine", "stone": "mine", "food": "farm"}.get(r.rtype, "chop"))
		if u.carry != null and u.carry.res != r.rtype: u.carry = null
		if u.carry == null: u.carry = {"res": r.rtype, "amt": 0.0}
		var rate: float = D.RES[r.type].rate * G.fast_gather
		if r.type == "berry": rate *= mods(u.owner).get("berryRate", 1)
		rate *= 1 + tech_eff(u.owner, "gather_" + D.RES[r.type].res)
		var amt := minf(rate * dt, r.amount)
		u.carry.amt += amt; r.amount -= amt
		if r.amount <= 0.001: kill(r)
	else:
		if u.pathFor != r.id or u.path.is_empty():
			if u.repath <= 0 or u.pathFor != r.id: _path_to(u, r, true)
		var px: float = u.x
		var py: float = u.y
		var arrived := _move_along(u, dt)
		task.still = task.get("still", 0.0) + dt if Vector2(u.x - px, u.y - py).length() < 0.002 else 0.0
		if task.still > 3:   # standing still, not working: give up on this one
			task.still = 0.0; r.unreach += 3
			var alt = _find_new_resource(u, task.rtype, u.x, u.y)
			if alt != null and alt.id != r.id:
				task.id = alt.id; u.path = []; u.pathFor = 0
			elif u.carry != null and u.carry.amt > 0: _go_drop(u)
			else:
				u.task = {"t": "idle"}; u.path = []
			return
		if arrived and edge_dist(u, r) > 0.75:
			# reached the end of path but not adjacent: resource probably unreachable, try another
			u.stuck += 1
			if u.stuck > 3:
				u.stuck = 0; r.unreach += 1
				var alt = nearest(u.x, u.y, func(e): return e.kind == "res" and e.type == r.type and e.id != r.id and e.amount > 0 and not (e.unreach > 2), 14)
				if alt != null:
					task.id = alt.id; u.path = []; u.pathFor = 0
			u.repath = 0.0

func _t_farm(u: Dictionary, task: Dictionary, dt: float) -> void:
	var f = G.by_id.get(task.id)
	if f == null or f.dead:
		u.atFarm = false
		if u.carry != null and u.carry.amt > 0: _go_drop(u)
		else: u.task = {"t": "idle"}
		return
	if not f.built:
		u.task = {"t": "build", "id": f.id, "then": "farm"}
		return
	if f.farmer != 0 and f.farmer != u.id:
		var o = G.by_id.get(f.farmer)
		if o != null and not o.dead and o.task.t == "farm" and o.task.id == f.id:
			# someone got here first: take the nearest free plot rather than standing idle
			var alt = free_farm_near(u.x, u.y, u.owner, u)
			u.task = {"t": "farm", "id": alt.id} if alt != null else {"t": "idle"}
			u.path = []; u.pathFor = 0
			return
	f.farmer = u.id
	if u.carry != null and u.carry.amt >= carry_cap(u):
		u.atFarm = false; _go_drop(u)
		return
	var inside: bool = u.x >= f.tx and u.x <= f.tx + f.size and u.y >= f.ty and u.y <= f.ty + f.size
	if inside:
		u.atFarm = true; u.path = []; u.working = true
		# wander slightly over the field
		u.fw += dt
		var sp: float = (f.size - 1) * 0.5   # over the whole field, rows to rows
		var tx: float = f.tx + 0.5 + (sin(u.fw * 0.5) + 1) * sp
		var ty: float = f.ty + 0.5 + (cos(u.fw * 0.37) + 1) * sp
		u.x += (tx - u.x) * dt; u.y += (ty - u.y) * dt
		if u.carry == null or u.carry.res != "food": u.carry = {"res": "food", "amt": 0.0}
		var amt := minf(D.FARM_RATE * dt * G.fast_gather * (1 + tech_eff(u.owner, "gather_food")), f.food)
		u.carry.amt += amt; f.food -= amt
		if f.food <= 0:
			# The field is spent, not destroyed. Sow it again for a fraction of a new farm
			# and keep working; with no wood it lies fallow until someone comes back to it.
			f.food = 0.0
			if G.players[u.owner].noReseed or not resow_farm(f, u.owner):
				f.fallow = true
				u.atFarm = false
				if u.carry != null and u.carry.amt > 0: _go_drop(u)
				else: u.task = {"t": "idle"}
	else:
		u.atFarm = false
		if u.pathFor != f.id or u.path.is_empty():
			if u.repath <= 0 or u.pathFor != f.id:
				u.path = M.find_path(u.x, u.y, rect_of(f), false, 0, u.owner); u.pathFor = f.id; u.repath = 1.0
		_move_along(u, dt)

func _t_garrison(u: Dictionary, task: Dictionary, dt: float) -> void:
	var b = G.by_id.get(task.id)
	if b == null or b.dead or not b.built or b.garrison.size() >= b.def.garrison:
		u.task = {"t": "idle"}
		return
	if edge_dist(u, b) <= 0.8:
		if u.carry != null:
			_bank(u); u.carry = null
		b.garrison.append(u); u.inside = b.id; u.entering = true; u.path = []
	else:
		if u.pathFor != b.id or u.path.is_empty():
			if u.repath <= 0 or u.pathFor != b.id: _path_to(u, b, true)
		_move_along(u, dt)

func _t_return(u: Dictionary, task: Dictionary, dt: float) -> void:
	var b = G.by_id.get(task.id)
	var back = task.get("back")
	if b == null or b.dead or not b.built:
		b = _drop_site_for(u, u.carry.res) if u.carry != null else null
		if b == null:
			u.task = back if back != null else {"t": "idle"}
			return
		task.id = b.id
	if edge_dist(u, b) <= 0.8:
		if u.carry != null:
			_bank(u); G.on_deposit(u, u.carry); u.carry = null
		u.path = []; u.pathFor = 0
		u.task = back if back != null else {"t": "idle"}
	else:
		if u.pathFor != b.id or u.path.is_empty():
			if u.repath <= 0 or u.pathFor != b.id: _path_to(u, b, true)
		# can't reach this drop site: try another, else go idle so the idle button finds him
		var px: float = u.x
		var py: float = u.y
		_move_along(u, dt)
		task.still = task.get("still", 0.0) + dt if Vector2(u.x - px, u.y - py).length() < 0.002 else 0.0
		if task.still > 3:
			task.still = 0.0
			if not task.has("tried"): task.tried = []
			task.tried.append(b.id)
			var want: String = u.carry.res if u.carry != null else ""
			var alt = nearest(u.x, u.y, func(e): return e.kind == "building" and e.owner == u.owner and e.built and e.def.has("drop") and e.def.drop.has(want) and not task.tried.has(e.id))
			if alt != null and task.tried.size() < 4:
				task.id = alt.id; u.path = []; u.pathFor = 0
			else:
				u.task = {"t": "idle"}; u.path = []

func _t_build(u: Dictionary, task: Dictionary, dt: float) -> void:
	var b = G.by_id.get(task.id)
	if b == null or b.dead:
		u.task = {"t": "idle"}
		return
	if b.built and b.hp >= b.maxHp:
		_after_build(u, b)
		return
	if edge_dist(u, b) <= 0.8 or (b.type == "farm" and u.x >= b.tx and u.x <= b.tx + b.size and u.y >= b.ty and u.y <= b.ty + b.size):
		u.path = []; face_xy(u, b.x, b.y); u.working = true
		_work_snd(u, "build")
		if not b.built and b.type == "infirmary" and enemy_soldier_near(b.owner, b.x, b.y, 12):
			if b.owner == 1 and not (b.warnT > G.time):
				b.warnT = G.time + 8; G.alert("Infirmary: work stops while enemies are near")
			return
		if not b.built:
			var inc: float = dt / b.def.time * G.fast_build * (1 + tech_eff(u.owner, "build"))
			b.progress = minf(1, b.progress + inc)
			b.hp = minf(b.maxHp, b.hp + inc * b.maxHp)
			if b.progress >= 1:
				b.built = true; b.hp = maxf(b.hp, b.maxHp * 0.999)
				G.snd("complete", b.x, b.y); G.on_built(b)
		elif not G.no_repair(b):
			b.hp = minf(b.maxHp, b.hp + dt * b.maxHp / b.def.time * 0.5)   # repair (not under the enemy's nose in Capture)
	else:
		if u.pathFor != b.id or u.path.is_empty():
			if u.repath <= 0 or u.pathFor != b.id:
				if b.type == "farm":
					u.path = M.find_path(u.x, u.y, rect_of(b), false, 0, u.owner); u.pathFor = b.id; u.repath = 1.0
				else: _path_to(u, b, true)
		_move_along(u, dt)

func _go_drop(u: Dictionary) -> void:
	var b = _drop_site_for(u, u.carry.res)
	if b == null:
		u.task = {"t": "idle"}
		return
	var back = u.task.get("back") if u.task.t == "return" else u.task
	u.task = {"t": "return", "id": b.id, "back": back}; u.path = []; u.pathFor = 0

func _after_build(u: Dictionary, b: Dictionary) -> void:
	# a wall is built piece by piece: move on to the next unbuilt piece nearby
	if b.def.has("wall"):
		var nx = nearest(u.x, u.y, func(e): return e.kind == "building" and e.owner == u.owner and e.def.has("wall") and not e.built, 10)
		if nx != null:
			cmd_build([u], nx); return
	if b.type == "farm":
		cmd_farm([u], b); return
	var m := {"lumbercamp": "tree", "miningcamp": "gold", "mill": "berry"}
	if m.has(b.type):
		var r = nearest(b.x, b.y, func(e): return e.kind == "res" and e.type == m[b.type] and e.amount > 0, 8)
		if r != null:
			cmd_gather([u], r); return
	# help another nearby foundation
	var f = nearest(u.x, u.y, func(e): return e.kind == "building" and e.owner == u.owner and not e.built, 10)
	if f != null:
		cmd_build([u], f); return
	u.task = {"t": "idle"}

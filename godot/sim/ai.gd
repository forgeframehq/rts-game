extends Node
## Computer opponent: runs a simple economy, builds up, defends and sends attack waves. Port of js/ai.js.

# Easy plays like a beginner; Normal is a fair fight for someone who has played a few matches;
# Hard is the old veteran. research: how keen on upgrades (0-1). match: the most soldiers it keeps
# for each one the player has. retreat: pulls a wave back from a fight it is clearly losing.
const LEVELS := {
	"easy": {"maxVils": 15, "firstAttack": 720, "wave": 3, "grow": 1, "armyCap": 8, "think": 1.8, "armyPerVil": 0.4, "research": 0.25, "match": 0.7, "minArmy": 4, "retreat": false, "counter": 0.3, "maxAge": 3, "ageAt": [0, 0, 600, 1320]},
	"normal": {"maxVils": 20, "firstAttack": 540, "wave": 5, "grow": 2, "armyCap": 16, "think": 1.0, "armyPerVil": 0.6, "research": 0.5, "match": 1.0, "minArmy": 6, "retreat": true, "counter": 0.5, "maxAge": 4, "ageAt": [0, 0, 480, 960, 1620]},
	"hard": {"maxVils": 34, "firstAttack": 330, "wave": 8, "grow": 4, "armyCap": 40, "think": 0.4, "armyPerVil": 0.0, "research": 1.0, "match": 0.0, "minArmy": 0, "retreat": true, "counter": 1.0, "maxAge": 4, "ageAt": [0, 0, 0, 0, 0]},
}
# what each soldier is good against (AoE2's rock-paper-scissors): inf, arc, cav, sie
const COUNTER := {
	"spearman": {"cav": 2.2, "inf": 0.3}, "militia": {"inf": 0.8, "arc": 0.6, "sie": 1.5},
	"archer": {"inf": 1.4, "arc": 0.6}, "longbowman": {"inf": 1.6, "arc": 1.0}, "repeater": {"inf": 1.6, "arc": 0.8},
	"knight": {"arc": 2.0, "sie": 1.8, "inf": 0.6}, "scout": {"arc": 0.8, "sie": 1.2},
	"cataphract": {"inf": 2.4, "arc": 1.2, "sie": 1.5}, "elephant": {"inf": 2.0, "arc": 1.6, "sie": 1.5},
	"kamayuk": {"cav": 2.6, "inf": 1.0}, "templeguard": {"inf": 2.0, "arc": 1.4}, "axethrower": {"inf": 1.0, "arc": 0.6},
}
const AGE_VILS := [0, 0, 13, 19, 25]
const RES_OF := {"wood": "tree", "gold": "gold", "stone": "stone"}

func make(p: int, level: String) -> Brain:
	var b := Brain.new()
	b.p = p
	b.level = level if LEVELS.has(level) else "normal"
	b.cfg = LEVELS[b.level].duplicate()
	# the pace setting shortens the opening for everyone, the computer included
	b.cfg.firstAttack = b.cfg.firstAttack / G.pace
	var at := []
	for v in b.cfg.ageAt: at.append(v / G.pace)
	b.cfg.ageAt = at
	b.next_attack = b.cfg.firstAttack
	return b

class Brain:
	var p := 0
	var level := "normal"
	var cfg: Dictionary = {}
	var t := 0.0
	var wave_n := 0
	var next_attack := 0.0
	var wave_size := 0
	var low_t := 0.0
	var hide_t := 0.0
	var rb := 0
	var resv = null

	func _mine(pred: Callable) -> Array:
		var out := []
		for e in G.ents:
			if not e.dead and e.owner == p and pred.call(e): out.append(e)
		return out

	func _find_spot(type: String, ax: float, ay: float, min_r: int = 2):
		var s: int = D.BUILDINGS[type].size
		var gap := 0 if type == "farm" else 1
		for r in range(maxi(min_r, 1), 20):
			var cands := []
			for j in range(-r, r + 1):
				for i in range(-r, r + 1):
					if maxi(absi(i), absi(j)) != r: continue
					var tx := roundi(ax + i - s / 2.0)
					var ty := roundi(ay + j - s / 2.0)
					# the same placement rules as the player
					if M.area_free(tx - gap, ty - gap, s + gap * 2) and not E.farm_overlap(tx, ty, s) and not G.rule_block(p, type, tx, ty): cands.append(Vector2i(tx, ty))
			if cands.size() > 0: return cands[randi() % cands.size()]
		return null

	func _build(type: String, ax: float, ay: float, min_r: int = 2, n_builders: int = 1):
		# the same Age rules as the player: no towers or stables in the Dark Age
		if not E.can_build_type(p, type): return null
		if not E.can_afford(p, E.build_cost(p, type)): return null
		var spot = _find_spot(type, ax, ay, min_r)
		if spot == null: return null
		var vils := _mine(func(e): return e.type == "villager")
		E.ssort(vils, func(a, b): return Vector2(a.x - ax, a.y - ay).length() - Vector2(b.x - ax, b.y - ay).length())
		var builders := vils.filter(func(v): return v.task.t != "build").slice(0, n_builders)
		if builders.is_empty(): return null
		return E.place_building(p, type, spot.x, spot.y, builders)

	func _job_of(v: Dictionary):
		var tk: Dictionary = v.task
		if tk.t == "gather": return D.RES[tk.rtype].res if D.RES.has(tk.rtype) else null
		if tk.t == "farm": return "food"
		if tk.t == "return" and tk.get("back") != null:
			if tk.back.t == "farm": return "food"
			return D.RES[tk.back.rtype].res if (tk.back.has("rtype") and D.RES.has(tk.back.rtype)) else null
		if tk.t == "build": return "build"
		return null

	func _enemy_soldier_near(x: float, y: float, r: float):
		return E.nearest(x, y, func(e): return e.kind == "unit" and E.enemies(e.owner, p) and e.type != "villager", r)

	func _royal_target(home: Dictionary, regicide: bool):
		if G.rules.mode == "capture": return E.nearest(home.x, home.y, func(e): return e.type == "towncenter" and E.enemies(e.owner, p), 999)
		if not regicide: return null
		var best = null
		for id in G.players:
			if not G.players[id].alive or not E.enemies(id, p): continue
			for ty in ["king", "queen"]:
				var r = E.royal(id, ty)
				if r != null and (best == null or E.dist(home, r) < E.dist(home, best)): best = r
		return best

	func update(dt: float) -> void:
		if cfg.is_empty() or G.over != null: return
		t -= dt
		if t > 0: return
		t = cfg.think
		var R: Dictionary = G.players[p].res
		if G.specials_node != null and level != "easy": G.specials_node.ai_specials(p)
		var blds := _mine(func(e): return e.kind == "building")
		var tc = null
		for b in blds:
			if b.type == "towncenter":
				tc = b; break
		var vils := _mine(func(e): return e.type == "villager")
		# the King and Queen are not soldiers: they never march with an attack wave
		var army := _mine(func(e): return e.kind == "unit" and e.type != "villager" and e.def.cls != "hero")
		var has := func(ty): return blds.any(func(b): return b.type == ty)
		var has_built := func(ty): return blds.any(func(b): return b.type == ty and b.built)
		var pc := E.pop_of(p)
		var pop := pc.x
		var cap := pc.y
		var home = tc if tc != null else (blds[0] if blds.size() > 0 else (vils[0] if vils.size() > 0 else null))
		if home == null: return

		# --- resign: no Town Center, no Castle and no army left to fight with ---
		if tc == null and not has.call("castle") and army.size() < 5:
			low_t += cfg.think
			if low_t > 20:
				G.resign(p); return
		else: low_t = 0.0

		# --- Regicide: hide the royals when enemy soldiers come near, let them out once it is quiet ---
		var regicide: bool = G.rules.mode == "regicide"
		if regicide:
			for ty in ["king", "queen"]:
				var r = E.royal(p, ty)
				if r == null or r.inside != 0: continue
				var danger = _enemy_soldier_near(r.x, r.y, 9)
				if danger == null: continue
				hide_t = G.time
				if r.task.t != "garrison":
					var b = E.nearest(r.x, r.y, func(e): return (e.type == "towncenter" or e.type == "castle") and E.can_garrison(r, e))
					if b != null: E.garrison_to(r, b)
					else: E.cmd_move([r], home.x, home.y + 2)
				var guards := army.filter(func(u): return u.task.t != "attack" or not G.by_id.has(u.task.id))
				if guards.size() > 0: E.cmd_attack(guards, danger)
			if G.time - hide_t > 25:
				for b in blds:
					if b.garrison.any(func(u): return u.def.cls == "hero") and _enemy_soldier_near(b.x, b.y, 12) == null:
						E.ungarrison(b, func(u): return u.def.cls == "hero")

		# --- Ages: advance once the economy is big enough (pauses villager training, like a real player) ---
		var age := E.age_of(p)
		var has_next := age + 1 < D.AGES.size()
		var nxt: Dictionary = D.AGES[age + 1] if has_next else {}
		var nxt_cost: Dictionary = E.age_cost(p, age + 1) if has_next else {}
		# never more villagers than this level will ever train, or an easier opponent stalls
		var age_vils := func(n): return mini(AGE_VILS[n] if n < AGE_VILS.size() else 0, cfg.maxVils)
		var saving := false
		var age_at: float = cfg.ageAt[age + 1] if age + 1 < cfg.ageAt.size() else 0.0
		var age_ok: bool = age + 1 <= cfg.maxAge and G.time >= age_at
		var blk = E.age_block(p, null) if has_next else null
		if tc != null and tc.built and has_next and age_ok and tc.aging == null and vils.size() >= age_vils.call(age + 1) and blk == null:
			saving = true
			if tc.queue.is_empty() and E.can_afford(p, nxt_cost): E.advance_age(tc)
		# --- villagers ---
		if tc != null and tc.built and tc.aging == null and not saving and vils.size() + tc.queue.size() < cfg.maxVils and tc.queue.size() < 2: E.train(tc, "villager")

		# --- stalled construction: a site nobody can reach is torn down after a while and its cost returned ---
		for b in blds:
			if b.built or b.type == "farm": continue
			if b.progress > b.get("aiLast", 0.0) + 0.001:
				b.aiLast = b.progress; b.aiStall = 0.0
				continue
			b.aiStall = b.get("aiStall", 0.0) + cfg.think
			if b.aiStall > 45:
				for v in vils:
					if v.task.t == "build" and v.task.id == b.id:
						v.task = {"t": "idle"}; v.path = []
				E.refund(p, E.build_cost(p, b.type)); E.kill(b)
			elif b.aiStall > 15 and not vils.any(func(v): return v.task.t == "build" and v.task.id == b.id):
				var free := vils.filter(func(x): return x.task.t != "build")
				E.ssort(free, func(a, c): return E.dist(a, b) - E.dist(c, b))
				if free.size() > 0: E.cmd_build([free[0]], b)
		# --- houses: one at a time, a little ahead of need; two once the town fills faster than one builder keeps up ---
		var housing := blds.filter(func(b): return b.type == "house" and not b.built).size()
		var tight: bool = cap - pop <= (2 if pop < 15 else 5) and cap < 200
		if tight and housing < (2 if (pop >= 20 and cap - pop <= 2) else 1): _build("house", home.x, home.y, 4, 1 if pop < 15 else 2)

		# --- buildings the next Age needs: build the cheapest missing one ---
		var needs_bld: bool = blk != null and (blk.begins_with("Needs") or blk.begins_with("Build any"))
		if needs_bld:
			var cost_of := func(ty):
				var s := 0
				for v in E.build_cost(p, ty).values(): s += v
				return s
			var missing: Array = (nxt.needs as Array).filter(func(ty): return not has.call(ty) and E.can_build_type(p, ty))
			E.ssort(missing, func(a, b): return cost_of.call(a) - cost_of.call(b))
			# only once the economy is nearly ready for the Age
			if missing.size() > 0 and vils.size() >= age_vils.call(age + 1) - 2:
				var ty: String = missing[0]
				var near = {"mill": "berry", "lumbercamp": "tree", "miningcamp": "gold"}.get(ty)
				var r = E.nearest(home.x, home.y, func(e): return e.kind == "res" and e.type == near, 22) if near != null else null
				_build(ty, r.x if r != null else home.x, r.y if r != null else home.y, 1 if r != null else 5, 2)
		# --- military production buildings ---
		var nv := vils.size()
		if nv >= 11 and not has.call("barracks"): _build("barracks", home.x, home.y, 5, 2)
		elif nv >= 15 and has_built.call("barracks") and not has.call("range"): _build("range", home.x, home.y, 5, 2)
		elif nv >= 16 and has_built.call("range") and not has.call("blacksmith"): _build("blacksmith", home.x, home.y, 6, 2)
		elif nv >= 20 and has_built.call("range") and not has.call("stable") and not E.civ_blocks(p, "stable"): _build("stable", home.x, home.y, 6, 2)
		elif nv >= 24 and age >= 3 and (has_built.call("stable") or E.civ_blocks(p, "stable")) and not has.call("siegeworkshop"): _build("siegeworkshop", home.x, home.y, 6, 2)
		elif nv >= 26 and age >= 3 and has_built.call("siegeworkshop") and not has.call("monastery"): _build("monastery", home.x, home.y, 6, 2)
		elif nv >= 28 and age >= 3 and has_built.call("blacksmith") and not has.call("university") and R.wood > 250: _build("university", home.x, home.y, 6, 2)
		# don't spend the quarry on towers while a Castle stands between us and the next Age
		elif nv >= 22 and has_built.call("range") and blds.filter(func(b): return b.type == "tower").size() < 2 \
				and R.stone > 200 and not (has_next and nxt.needs.has("castle") and not has.call("castle")): _build("tower", home.x, home.y, 6, 1)
		# an Infirmary once the army is real, set well back near home
		if age >= 2 and has_built.call("barracks") and nv >= mini(18, cfg.maxVils) and army.size() >= 4 and not E.at_build_limit(p, "infirmary") \
				and R.wood >= 150 and R.gold >= 50 and not blds.any(func(b): return b.type == "infirmary" and not b.built): _build("infirmary", home.x, home.y, 5, 1)
		# the badly wounded go in to heal; the healed come back out
		var infs := blds.filter(func(b): return b.type == "infirmary" and b.built)
		if infs.size() > 0:
			for u in army:
				if u.inside != 0 or u.task.t == "garrison" or u.def.get("siege", false) or u.hp > u.maxHp * 0.35: continue
				var ok := infs.filter(func(i): return E.can_garrison(u, i))
				E.ssort(ok, func(a, c): return E.dist(u, a) - E.dist(u, c))
				if ok.size() > 0 and E.dist(u, ok[0]) < 30: E.garrison_to(u, ok[0])
			for b in infs:
				if b.garrison.any(func(g): return g.hp >= g.maxHp * 0.95): E.ungarrison(b, func(g): return g.hp >= g.maxHp * 0.95)
		# --- research: economy first once the town is working, then the upgrades that help the army it fields ---
		if not saving and nv >= 12 and randf() < cfg.research:
			var melee := 0
			var ranged := 0
			var all := maxi(1, army.size())
			var lines := {}
			for u in army:
				if u.def.get("ranged", false): ranged += 1
				else: melee += 1
				lines[u.type] = lines.get(u.type, 0) + 1
			var foe_arc := 0
			for e in G.ents:
				if not e.dead and e.kind == "unit" and E.enemies(e.owner, p) and e.def.cls == "arc": foe_arc += 1
			var best = null
			var best_b = null
			var best_s := 2.5
			for b in blds:
				if not b.built or b.research != null or b.aging != null: continue
				for r in E.researches_for(b):
					if r.why != null: continue
					var sc := 0.0
					if r.kind == "up": sc = 2 + 3 * float(lines.get(r.def.line, 0)) / all * 3
					else:
						for k in r.def.get("eff", {}):
							if k.begins_with("gather_") or k == "farm" or k == "carry" or k == "vilSpeed": sc += 6 if nv >= 18 else 4
							elif k == "vilHp" or k == "build": sc += 1.5
							elif k == "melee": sc += 1 + 5.0 * melee / all
							elif k == "ranged" or k == "range": sc += 0.5 + 3.0 * ranged / all
							elif k == "armor": sc += 1 + 2 * army.size() / 12.0
							elif k == "pierce": sc += 1 + foe_arc / 4.0
							elif k.begins_with("unitAtk_") or k.begins_with("unitRange_"): sc += 1 + 6.0 * lines.get(k.get_slice("_", 1), 0) / all
							elif k.begins_with("trainSpeed_"): sc += 2
							else: sc += 0.6   # towers, walls, buildings: nice to have
					if sc > best_s:
						best_s = sc; best = r; best_b = b
			resv = null
			if best != null:
				if E.can_afford(p, best.def.cost): E.start_research(best_b, best.id)
				elif best_s >= 4: resv = best.def.cost   # worth saving for: soldiers wait until it is paid for

		# --- drop sites ---
		var near_drop := func(r, kind): return blds.any(func(b): return b.def.has("drop") and b.def.drop.has(kind) and E.edge_dist(r, b) < 5)
		if not blds.any(func(b): return b.type == "lumbercamp" and not b.built):
			var tree = E.nearest(home.x, home.y, func(e): return e.kind == "res" and e.type == "tree", 18)
			if tree != null and not near_drop.call(tree, "wood") and nv >= 6: _build("lumbercamp", tree.x, tree.y, 1, 1)
		if not has.call("miningcamp") and nv >= 9:
			var gold = E.nearest(home.x, home.y, func(e): return e.kind == "res" and e.type == "gold", 18)
			if gold != null and not near_drop.call(gold, "gold"): _build("miningcamp", gold.x, gold.y, 1, 1)
		if not has.call("mill") and nv >= 5:
			var berry = E.nearest(home.x, home.y, func(e): return e.kind == "res" and e.type == "berry", 14)
			if berry != null and not near_drop.call(berry, "food"): _build("mill", berry.x, berry.y, 1, 1)

		# --- rebalance: move gatherers off a resource we're swimming in ---
		rb += 1
		var kinds := ["food", "wood", "gold", "stone"]
		if rb % 8 == 0:
			var rich = null
			var poor = null
			for k in kinds:
				if R[k] > 500 and (rich == null or R[k] > R[rich]): rich = k
				if k != "stone" and R[k] < 150 and (poor == null or R[k] < R[poor]): poor = k
			if rich != null and poor != null:
				var moved := 0
				for v in vils:
					if moved < 2 and _job_of(v) == rich and v.task.t != "return":
						v.task = {"t": "idle"}; v.path = []; moved += 1
		# spend surplus wood on extra production
		if R.wood > 450 and nv >= 20:
			var nb := blds.filter(func(b): return b.type in ["barracks", "range", "stable"]).size()
			if nb < 6: _build(["barracks", "range", "stable"][nb % 3], home.x, home.y, 6, 2)

		# --- assign idle villagers ---
		var counts := {"food": 0, "wood": 0, "gold": 0, "stone": 0}
		for v in vils:
			var j = _job_of(v)
			if j != null and counts.has(j): counts[j] += 1
		var n := maxi(1, nv)
		var want: Dictionary
		if nv < 10: want = {"food": 0.55, "wood": 0.45, "gold": 0.0, "stone": 0.0}
		elif nv < 18: want = {"food": 0.45, "wood": 0.35, "gold": 0.2, "stone": 0.0}
		else: want = {"food": 0.4, "wood": 0.3, "gold": 0.22, "stone": 0.08}
		if saving:
			for k in nxt_cost:
				if R[k] < nxt_cost[k]: want[k] = want.get(k, 0.0) + 0.25   # gather what the Age costs
		# gather what a missing Age-requirement building costs too (the Castle is a lot of stone)
		if needs_bld:
			for ty in nxt.needs:
				if has.call(ty) or not E.can_build_type(p, ty): continue
				var c := E.build_cost(p, ty)
				for k in c:
					if R[k] < c[k]: want[k] = want.get(k, 0.0) + 0.3
		# A villager never leaves a job on its own: move one worker per think from the most
		# over-served resource to the most under-served one.
		var need_k = null
		var need_gap := -1e9
		var over_k = null
		var over_gap := 1e9
		for k in kinds:
			var g: float = want.get(k, 0.0) - float(counts[k]) / n - minf(0.3, R[k] / 2500.0)
			if g > need_gap:
				need_gap = g; need_k = k
			if counts[k] > 1 and g < over_gap:
				over_gap = g; over_k = k
		if need_k != null and over_k != null and need_k != over_k and need_gap - over_gap > 0.25:
			var rt = RES_OF.get(over_k)
			var spare = null
			for x in vils:
				if over_k == "food":
					if x.task.t == "farm":
						spare = x; break
				elif x.task.t == "gather" and x.task.rtype == rt and not (x.carry != null and x.carry.amt > D.CARRY * 0.5):
					spare = x; break
			if spare != null:
				spare.task = {"t": "idle"}; spare.path = []; spare.pathFor = 0; counts[over_k] -= 1

		for v in vils:
			if v.task.t != "idle": continue
			var best := "food"
			var best_gap := -1e9
			for k in kinds:
				var gap: float = want.get(k, 0.0) - float(counts[k]) / n - minf(0.3, R[k] / 2500.0) + (0.08 if (R[k] < 100 and want.get(k, 0.0) > 0) else 0.0)
				if gap > best_gap:
					best_gap = gap; best = k
			counts[best] += 1
			if best == "food":
				var berry = E.nearest(v.x, v.y, func(e): return e.kind == "res" and e.type == "berry", 14)
				if berry != null and E.dist(berry, home) < 14:
					E.cmd_gather([v], berry); continue
				if _to_field(v, blds, home): continue
				best = "wood"
			var rt2: String = RES_OF[best]
			var r = E.nearest(v.x, v.y, func(e): return e.kind == "res" and e.type == rt2 and e.unreach < 3, 40)
			# that kind has run out within reach: take anything else rather than stand still
			if r == null:
				for alt in ["tree", "berry", "gold", "stone"]:
					if alt == rt2: continue
					r = E.nearest(v.x, v.y, func(e): return e.kind == "res" and e.type == alt and e.unreach < 3, 70)
					if r != null: break
			if r != null:
				E.cmd_gather([v], r); continue
			# nothing left to gather anywhere: work a field, sowing it again if it is spent
			_to_field(v, blds, home)

		var threat_near: bool = _enemy_soldier_near(home.x, home.y, 16) != null
		# --- army production ---
		var need_bld := 180 if (needs_bld and nv >= age_vils.call(age + 1)) else 0
		# how much of each resource not to spend on soldiers (while saving for an Age: everything it costs)
		var keep := func(k: String) -> float:
			if saving and nxt_cost.get(k, 0) > 0: return nxt_cost[k]
			if resv != null and resv.get(k, 0) > 0 and not threat_near: return resv[k]
			if k == "food": return 60.0 if nv < cfg.maxVils else 0.0
			if k == "wood": return need_bld
			return 0.0
		# what the enemy fields, to pick counters and to keep an easier AI level with the player
		var foe := {"inf": 0, "arc": 0, "cav": 0, "sie": 0, "n": 0}
		for e in G.ents:
			if not e.dead and e.kind == "unit" and E.enemies(e.owner, p) and e.type != "villager" and e.def.cls != "hero":
				foe.n += 1
				if foe.has(e.def.cls): foe[e.def.cls] += 1
		var cap2: int = mini(cfg.armyCap, maxi(cfg.minArmy, ceili(foe.n * cfg.match) + wave_n)) if cfg.match > 0 else cfg.armyCap
		var civ: Dictionary = D.CIVS[G.players[p].civ]
		if army.size() < cap2 and pop < cap and (cfg.armyPerVil <= 0 or army.size() < nv * cfg.armyPerVil):
			# the Castle (the dynasty's unique unit) gets first call on the resources, then the rest
			var order := blds.duplicate()
			E.ssort(order, func(x, y): return int(y.type == "castle") - int(x.type == "castle"))
			for b in order:
				if not b.built or b.type == "towncenter" or b.queue.size() >= 2 or b.research != null: continue
				var opts: Array = E.trains_for(b).filter(func(ty): return E.can_train_type(p, ty))
				if opts.is_empty(): continue
				# siege is slow and dear: keep a few to crack buildings, not an army of them
				if b.type == "siegeworkshop" and army.filter(func(u): return u.def.cls == "sie").size() >= 4: continue
				# a couple of Monks is plenty
				if b.type == "monastery" and _mine(func(e): return e.type == "monk").size() >= 2: continue
				var type: String
				if b.type == "siegeworkshop" or b.type == "monastery": type = opts[randi() % opts.size()]
				else:
					# counter what the player fields
					var w := []
					var total := 0.0
					for ty in opts:
						var c: Dictionary = COUNTER.get(ty, {})
						var v := 1.0
						if not c.is_empty() and foe.n > 0:
							v += cfg.counter * (c.get("inf", 0.0) * foe.inf + c.get("arc", 0.0) * foe.arc + c.get("cav", 0.0) * foe.cav + c.get("sie", 0.0) * foe.sie) / foe.n * 2
						if civ.has("unique") and civ.unique.type == ty: v += 1   # play to the dynasty's strength
						v = maxf(0.1, v)
						w.append(v); total += v
					var roll := randf() * total
					type = opts[-1]
					for i in opts.size():
						roll -= w[i]
						if roll <= 0:
							type = opts[i]; break
				var cost := E.unit_cost(p, type)
				var can := true
				for k in cost:
					if R[k] - keep.call(k) < cost[k]: can = false
				if can: E.train(b, type)
		# rally army near home
		for b in blds:
			if b.def.has("trains") and b.type != "towncenter" and b.rally == null: b.rally = {"x": home.x + 3, "y": home.y + 3}

		# --- defend ---
		var threat = E.nearest(home.x, home.y, func(e): return e.kind == "unit" and E.enemies(e.owner, p), 13)
		if threat != null:
			var idle := army.filter(func(u): return u.task.t != "attack" or not G.by_id.has(u.task.id))
			if idle.size() > 0: E.cmd_attack(idle, threat)
			# villagers fight back if few soldiers
			if army.size() < 3:
				var near := vils.filter(func(v): return E.dist(v, threat) < 4)
				if near.size() >= 3: E.cmd_attack(near, threat)

		# --- attack waves ---
		# wait rather than walk a wave into a far bigger army (Easy still does: it is meant to be beaten)
		var outnumbered: bool = cfg.retreat and foe.n > army.size() * 1.6 and foe.n >= 6
		if G.time > next_attack and not outnumbered and army.size() >= mini(cfg.wave + wave_n * cfg.grow, maxi(cfg.wave, cap2)):
			wave_n += 1
			next_attack = G.time + 150 / G.pace
			wave_size = army.size()   # a wave only turns back once it has really lost men
			var target = _royal_target(home, regicide)
			if target == null: target = E.nearest(home.x, home.y, func(e): return E.enemies(e.owner, p) and e.kind == "building" and e.type != "farm")
			if target == null: target = E.nearest(home.x, home.y, func(e): return E.enemies(e.owner, p))
			if target != null:
				E.cmd_attack(army, target)
				for u in army: u.task.forced = true
				if target.owner == 1: G.alert("⚠️ Enemy army is attacking!")
		# retreat: a wave that is clearly losing pulls back home to regroup
		if cfg.retreat and wave_n > 0:
			var out := army.filter(func(u): return E.dist(u, home) > 16)
			if out.size() > 0:
				var cx := 0.0
				var cy := 0.0
				for u in out:
					cx += u.x; cy += u.y
				cx /= out.size(); cy /= out.size()
				# a soldier is what it can take times what it deals each second; a tower or Town
				# Center counts only for the arrows it fires, not its thousand hit points
				var strength := func(us: Array) -> float:
					var s := 0.0
					for e in us: s += (150.0 if e.kind == "building" else e.hp) * float(e.def.get("atk", 1)) / float(e.def.get("rate", 2))
					return s
				var foes := []
				for e in G.ents:
					if e.dead or not E.enemies(e.owner, p) or Vector2(e.x - cx, e.y - cy).length() >= 9: continue
					if (e.kind == "unit" and e.type != "villager") or (e.kind == "building" and e.built and e.type in ["tower", "castle", "towncenter"]): foes.append(e)
				var bloodied: bool = army.size() <= (wave_size if wave_size > 0 else army.size()) * 0.67
				if foes.size() > 0 and bloodied and strength.call(out) < strength.call(foes) * 0.45:
					E.cmd_move(out, home.x + 3, home.y + 3)
					for u in out: u.task.forced = true
					next_attack = G.time + 90 / G.pace; wave_n = maxi(0, wave_n - 1)
		# idle stragglers far from home rejoin the attack
		if wave_n > 0:
			var target = _royal_target(home, regicide)
			if target == null: target = E.nearest(home.x, home.y, func(e): return E.enemies(e.owner, p) and e.kind == "building" and e.type != "farm")
			var away := army.filter(func(u): return u.task.t == "idle" and E.dist(u, home) > 15)
			if target != null and away.size() > 0:
				E.cmd_attack(away, target)
				for u in away: u.task.forced = true

	## send a villager to an unworked field, or lay a new one; false if neither is possible
	func _to_field(v: Dictionary, blds: Array, home: Dictionary) -> bool:
		for b in blds:
			# an unworked field: sowing a spent one again is far cheaper than a new farm
			if b.type == "farm" and b.built and not E.farm_busy(b, v) and (b.food > 0 or E.can_afford(p, E.resow_cost(p))):
				E.cmd_farm([v], b); return true
		if E.can_afford(p, E.build_cost(p, "farm")):
			var spot = _find_spot("farm", home.x, home.y, 3)
			if spot != null:
				E.place_building(p, "farm", spot.x, spot.y, [v]); return true
		return false

extends Node
## Headless: each extra mode starts and runs; Specials fire; a Capture flips a Town Center.
func _ready() -> void:
	for mode in ["empirewars", "survival", "capture"]:
		G.new_game({"seed": 31, "size": "small", "mode": mode, "pace": "quick", "neutral": true, "players": [{"civ": "britons"}, {"civ": "franks", "ai": "normal"}]})
		var v := E.units_of(1).filter(func(u): return u.type == "villager").size()
		var b := 0
		for e in G.ents:
			if e.owner == 1 and e.kind == "building": b += 1
		print(mode, ": players ", G.players.size(), " my villagers ", v, " buildings ", b, " age ", E.age_of(1))
		for i in 30 * 150: 
			if G.over == null: G.step(1 / 30.0)
		if mode == "survival": print("  wave ", Modes.surv.wave, " raiders left ", Modes.surv.left, " over ", G.over)
		if mode == "capture":
			var tc = E.nearest(0, 0, func(e): return e.type == "towncenter" and e.owner == 2)
			tc.hp = tc.maxHp * 0.15
			var men := []
			for i in 8: men.append(E.add_unit("militia", 1, tc.tx - 0.6, tc.ty + 0.5 * i))
			for e in G.ents.duplicate():
				if e.owner == 2 and e.kind == "unit": E.kill(e)
			G.ais = []
			for i in 30 * 30:
				if G.over == null: G.step(1 / 30.0)
			print("  enemy Town Center now owned by ", tc.owner, " hp ", int(tc.hp), " over ", G.over, " reason ", G.over_reason)
	G.new_game({"seed": 5, "size": "small", "players": [{"civ": "britons"}, {"civ": "franks", "ai": "easy"}]})
	var a := []
	var foes := []
	for t in ["militia", "spearman", "archer", "knight", "longbowman"]: a.append(E.add_unit(t, 1, 30 + a.size(), 30))
	for i in 5: foes.append(E.add_unit("militia", 2, 30 + i, 33))
	E.cmd_attack(a, foes[0])
	for i in 20: G.step(1 / 30.0)
	print("specials: ", a.map(func(u): return Specials.special_of(u)), " used ", Specials.use_special(a), " ready in ", snappedf(Specials.ready_in(a[0]), 0.1))
	for i in 30 * 20: G.step(1 / 30.0)
	print("after the fight: mine ", a.filter(func(u): return not u.dead).size(), " theirs ", foes.filter(func(u): return not u.dead).size(), " combo ", a.filter(func(u): return not u.dead and u.get("combo", false)).size())
	get_tree().quit()

extends Node
## Headless check of the simulation: godot --headless --path godot res://tests/sim_test.tscn

func _ready() -> void:
	var seed_ := 12345
	var r := M.Rng.new(seed_)
	print("rng ", [r.next(), r.next(), r.next()])
	G.new_game({"seed": seed_, "players": [{"civ": "britons"}, {"civ": "franks", "ai": "normal"}]})
	var counts := {}
	for e in G.ents: counts[e.type] = counts.get(e.type, 0) + 1
	print("ents ", G.ents.size(), " ", counts)
	var tc = E.nearest(0, 0, func(e): return e.type == "towncenter" and e.owner == 1)
	print("tc ", tc.tx, ",", tc.ty, " hp ", tc.hp)
	var vils := E.units_of(1)
	var tree = E.nearest(tc.x, tc.y, func(e): return e.type == "tree")
	var berry = E.nearest(tc.x, tc.y, func(e): return e.type == "berry")
	print(E.cmd_smart([vils[0], vils[1]], tree.x, tree.y, tree), " ", E.cmd_smart([vils[2]], berry.x, berry.y, berry))
	print("train ", E.train(tc, "villager"), " ", E.train(tc, "villager"))
	var t0 := Time.get_ticks_msec()
	for i in 30 * 90: G.step(1 / 30.0)
	print("90 s in ", Time.get_ticks_msec() - t0, " ms; res ", G.players[1].res, " pop ", E.pop_of(1), " units ", E.units_of(1).size())
	var house = E.place_building(1, "house", tc.tx + 6, tc.ty, [E.units_of(1)[3]])
	print("house ", house != null)
	for i in 30 * 60: G.step(1 / 30.0)
	print("house built ", house.built, " hp ", house.hp, "/", house.maxHp, " res ", G.players[1].res, " pop ", E.pop_of(1))
	# a fight: 8 archers against 8 militia (JS edition: the swordsmen win with about 4 left)
	var a := []
	var b := []
	for i in 8:
		a.append(E.add_unit("militia", 1, 30 + i * 0.6, 36))
		b.append(E.add_unit("archer", 2, 30 + i * 0.6, 42))
	E.cmd_attack(b, a[0])
	for i in 30 * 40: G.step(1 / 30.0)
	print("fight: militia left ", a.filter(func(u): return not u.dead).size(), ", archers left ", b.filter(func(u): return not u.dead).size())
	get_tree().quit()

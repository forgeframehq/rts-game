extends Node
## Two computer players fight a whole match headless; prints progress each 2 minutes.
func _ready() -> void:
	var pace := OS.get_environment("PACE") if OS.has_environment("PACE") else "classic"
	G.new_game({"seed": 777, "watch": true, "pace": pace, "size": "small", "players": [{"civ": "britons", "ai": "normal"}, {"civ": "franks", "ai": "hard"}]})
	var t0 := Time.get_ticks_msec()
	var mins := int(OS.get_environment("MINS")) if OS.has_environment("MINS") else 16
	for m in mins / 2:
		for i in 30 * 120: 
			if G.over == null: G.step(1 / 30.0)
		var line := "%2d min" % ((m + 1) * 2)
		for id in G.players:
			var us := E.units_of(id)
			var v := us.filter(func(u): return u.type == "villager").size()
			var b := 0
			for e in G.ents:
				if e.owner == id and e.kind == "building" and e.built: b += 1
			line += " | P%d age %d vils %d army %d blds %d res %s" % [id, E.age_of(id), v, us.size() - v, b, [int(G.players[id].res.food), int(G.players[id].res.wood), int(G.players[id].res.gold), int(G.players[id].res.stone)]]
		print(line, "  over=", G.over)
	print("wall ms ", Time.get_ticks_msec() - t0, " ents ", G.ents.size())
	get_tree().quit()

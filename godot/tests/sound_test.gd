extends Node
func st(tag):
	var a = Sfx._decks
	print(tag, " mood=", Sfx._mood, " d0=", a[0].playing, " ", snapped(a[0].volume_db, 0.1), " d1=", a[1].playing, " ", snapped(a[1].volume_db, 0.1))
func _ready():
	for gap in [0.3]:
		Sfx.set_scene("menu"); await get_tree().create_timer(3.0).timeout; st("menu")
		Sfx.set_scene(""); await get_tree().create_timer(gap).timeout
		Sfx.set_scene("match", "britons"); await get_tree().create_timer(4.0).timeout; st("match gap %s" % gap)
		G.fighting.emit(); await get_tree().create_timer(4.0).timeout; st("battle")
		Sfx._battle_until = 0; await get_tree().create_timer(4.0).timeout; st("peace again")
		Sfx.set_music(false); await get_tree().create_timer(2.5).timeout; st("off")
		Sfx.set_music(true); await get_tree().create_timer(2.5).timeout; st("on")
		Sfx.set_scene("menu"); await get_tree().create_timer(0.5).timeout
	# effects
	G.new_game({"players": [{"civ": "britons"}, {"civ": "franks", "ai": "normal"}], "mode": "testing", "size": "small", "seed": 5})
	for id in G.players:
		var c := {}
		for e in G.ents:
			if e.owner == id and e.kind == "unit" and not e.dead: c[e.type] = c.get(e.type, 0) + 1
		print("player ", id, " pop ", E.pop_of(id), " ", c)
	print("reveal ", G.reveal_all)
	Sfx.listener = Vector2(20, 20)
	for k in ["chop", "mine", "farm", "build", "sword"]:
		G.snd(k, 21, 21)
	print("effects playing: ", Sfx._players.filter(func(p): return p.playing).size())
	var t := Time.get_ticks_msec()
	for i in 300: G.advance(1.0 / 30.0)
	print("10 s of match with 400 units: ", Time.get_ticks_msec() - t, " ms; idle villagers of p1: ", G.ents.filter(func(e): return e.owner == 1 and e.type == "villager" and e.task.t == "idle").size())
	get_tree().quit()

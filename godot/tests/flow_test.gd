extends Node
## Headless check of saves and the interface code paths: place a building, train, save, load, carry on, finish.
const Hud := preload("res://ui/hud.gd")
func _ready() -> void:
	G.new_game({"seed": 4242, "pace": "quick", "size": "small", "mode": "regicide", "players": [{"civ": "persians"}, {"civ": "incas", "ai": "hard"}]})
	var world = load("res://view/world.gd").new(); add_child(world)
	var hud = Hud.new(); hud.world = world; add_child(hud); world.hud = hud
	var tc = E.nearest(0, 0, func(e): return e.type == "towncenter" and e.owner == 1)
	var vils := E.units_of(1).filter(func(u): return u.type == "villager")
	G.selection = [vils[0].id]
	hud._refresh_panel()
	print("villager buttons ", hud.grid.get_child_count())
	hud.page = "econ"; hud._sig = ""; hud._refresh_panel()
	hud._start_place("house"); hud.place_at = Vector2i(tc.tx + 6, tc.ty); print("can place ", hud._can_place()); hud._confirm_place()
	hud._send_to("tree")
	G.selection = [tc.id]; hud._sig = ""; hud._refresh_panel()
	print("tc buttons ", hud.grid.get_child_count())
	hud._train(tc, "villager")
	for i in 30 * 60: G.step(1 / 30.0)
	var before := [G.ents.size(), G.players[1].res.duplicate(), E.pop_of(1), G.time, E.units_of(2).size()]
	print("before save ", before, " saved ", Save.save_game(3))
	for i in 30 * 20: G.step(1 / 30.0)
	print("load ", Save.load_game(3))
	var after := [G.ents.size(), G.players[1].res.duplicate(), E.pop_of(1), G.time, E.units_of(2).size()]
	print("after load  ", after, " same ", str(before) == str(after), " royals ", E.royal(1, "king") != null, E.royal(2, "queen") != null, " ais ", G.ais.size())
	for i in 30 * 120: G.step(1 / 30.0)
	hud._process(0.3); hud._select_army(); hud._next_idle(); hud._refresh_panel()
	print("2 min after load: P2 vils ", E.units_of(2).filter(func(u): return u.type == "villager").size(), " P1 res ", G.players[1].res)
	G.game_over.connect(func(r): print("game over: ", r))
	G.resign(2)
	print("over ", G.over)
	Save.delete_save(3)
	get_tree().quit()

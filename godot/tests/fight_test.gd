extends Node
## Headless: a fight through the view code (Mixamo clips, props, deaths) to catch script errors.
func _ready() -> void:
	G.new_game({"seed": 99, "size": "small", "reveal": "all", "players": [{"civ": "franks"}, {"civ": "chinese", "ai": "easy"}]})
	var world = load("res://view/world.gd").new(); add_child(world)
	var a := []
	var b := []
	var types := ["militia", "knight", "spearman", "archer", "axethrower", "king", "villager", "scout"]
	for i in 8:
		a.append(E.add_unit(types[i], 1, 30 + i * 0.7, 30)); b.append(E.add_unit("militia", 2, 30 + i * 0.7, 34))
	E.cmd_attack(b, a[0]); E.cmd_attack(a, b[0])
	var peak := 0
	for i in 30 * 40:
		G.step(1 / 30.0)
		world._process(1 / 30.0)
		peak = maxi(peak, world._fallen.size())
	print("alive ", a.filter(func(u): return not u.dead).size(), " v ", b.filter(func(u): return not u.dead).size(), " most bodies lying at once ", peak, " nodes ", world.nodes.size())
	get_tree().quit()

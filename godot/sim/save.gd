extends Node
## Saved games: the whole match written as one Variant. Entities are plain Dictionaries, so only the
## shared definition tables are left out and looked up again on load.

const PATH := "user://save_%d.dod"
const VERSION := 1

func has_save(slot: int = 0) -> bool:
	return FileAccess.file_exists(PATH % slot)

func info(slot: int = 0) -> Dictionary:
	var f := FileAccess.open(PATH % slot, FileAccess.READ)
	if f == null: return {}
	var d = f.get_var()
	return d.get("info", {}) if d is Dictionary else {}

func _strip(e: Dictionary) -> Dictionary:
	var c := e.duplicate()
	c.erase("def")
	if c.has("garrison"):
		var g := []
		for u in c.garrison: g.append(_strip(u))
		c.garrison = g
	return c

func save_game(slot: int = 0) -> bool:
	if G.ents.is_empty() or G.over != null or G.net_on: return false
	var ents := []
	for e in G.ents:
		if not e.dead: ents.append(_strip(e))
	var brains := []
	for a in G.ais: brains.append({"p": a.p, "level": a.level, "wave_n": a.wave_n, "next_attack": a.next_attack, "wave_size": a.wave_size})
	var d := {"v": VERSION,
		"info": {"civ": G.players[1].civ, "time": G.time, "mode": G.rules.mode, "map": G.rules.map, "when": Time.get_datetime_string_from_system()},
		"ents": ents, "players": G.players, "rules": G.rules, "config": G.config, "time": G.time, "next_id": E.next_id,
		"map": G.MAP, "terrain": M.terrain, "explored": M.explored, "decals": G.decals, "rng": G.rng_state(), "brains": brains,
		"mode": G.mode_node.save_state() if G.mode_node != null else {}}
	var f := FileAccess.open(PATH % slot, FileAccess.WRITE)
	if f == null: return false
	f.store_var(d)
	return true

func _revive(e: Dictionary) -> void:
	if e.kind == "building": e.def = D.BUILDINGS[e.type]
	elif e.kind == "res": e.def = D.RES[e.type]
	else: e.def = E.unit_def(e.owner, e.type)
	if e.has("garrison"):
		for u in e.garrison: _revive(u)

func load_game(slot: int = 0) -> bool:
	var f := FileAccess.open(PATH % slot, FileAccess.READ)
	if f == null: return false
	var d = f.get_var()
	if not (d is Dictionary) or d.get("v", 0) != VERSION: return false
	G.restore(d)
	for e in G.ents: _revive(e)
	G.finish_restore(d)
	return true

func delete_save(slot: int = 0) -> void:
	if has_save(slot): DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH % slot))

extends Node
## Map types. Each one shapes the land before the Town Centers go down, sets how much forest
## grows, and adds its own features once the bases are placed. Port of js/maps.js.
## Terrain codes: 0..3 grass, 4 worn earth, 5 deep water, 6 shallow ford, 7 sand, 8 rock ridge.
## Deep water and rock ridges block every unit (block = -1); fords and sand are walkable.

const WATER := 5
const FORD := 6
const SAND := 7
const ROCK := 8
const WALL := -1

const MAPS := {
	"grasslands": {"name": "Grasslands", "desc": "Open meadows and scattered woods. A fair, classic fight."},
	"blackforest": {"name": "Black Forest", "desc": "Dense forest everywhere. Narrow paths, lots of wood, slow attacks."},
	"highlands": {"name": "Highlands", "desc": "Rocky ridges with narrow passes. Extra stone and gold."},
	"greatlake": {"name": "Great Lake", "desc": "A great lake in the middle. Armies march around its shores."},
	"twinrivers": {"name": "Twin Rivers", "desc": "Two rivers split the land. Cross only at the shallow fords."},
	"goldrush": {"name": "Gold Rush", "desc": "A rich gold field in the centre. Whoever holds it gets rich."},
	"fortress": {"name": "Fortress", "desc": "Every base starts inside a wall. Breaking in takes siege."},
	"desertoasis": {"name": "Desert Oasis", "desc": "Sand everywhere. Wood grows only around the oases."},
}
const FOREST := {"blackforest": 3.2, "desertoasis": 0.0, "goldrush": 0.8, "highlands": 0.8, "greatlake": 0.9, "fortress": 0.9}

var _oases: Array = []

func blocking(t: int) -> bool:
	return t == WATER or t == ROCK

func pick_map(k: String, r: Callable) -> String:
	if MAPS.has(k): return k
	var keys := MAPS.keys()
	return keys[floori(r.call() * keys.size())]

func _paint(x: int, y: int, t: int) -> void:
	var n := M.N
	if x < 1 or y < 1 or x >= n - 1 or y >= n - 1: return
	var i := M.idx(x, y)
	M.terrain[i] = t
	M.block[i] = WALL if blocking(t) else (0 if M.block[i] == WALL else M.block[i])

## keep a clear circle around every base
func _near_base(spots: Array, x: float, y: float, r: float) -> bool:
	for s in spots:
		if Vector2(x - s.x - 2, y - s.y - 2).length() < r: return true
	return false

func _blob(cx: float, cy: float, rad: float, t: int, spots: Array, keep: float = 11.0) -> void:
	for y in range(floori(cy - rad - 2), floori(cy + rad + 2) + 1):
		for x in range(floori(cx - rad - 2), floori(cx + rad + 2) + 1):
			var a := atan2(y - cy, x - cx)
			var wob := rad * (1 + 0.18 * sin(a * 3 + cx) + 0.1 * cos(a * 5 + cy))
			if Vector2(x - cx, y - cy).length() <= wob and not _near_base(spots, x, y, keep): _paint(x, y, t)

## a wavy band from (x0,y0) to (x1,y1); with pass_gap, the middle is left open as a pass
func _band(x0: float, y0: float, x1: float, y1: float, width: float, t: int, spots: Array, r: Callable, pass_gap: bool = false) -> void:
	var L := Vector2(x1 - x0, y1 - y0).length()
	var nx := -(y1 - y0) / L
	var ny := (x1 - x0) / L
	var ph: float = r.call() * 6
	var s := 0.0
	while s <= L:
		var k := s / L
		var w := sin(k * 7 + ph) * 2.2
		var cx := x0 + (x1 - x0) * k + nx * w
		var cy := y0 + (y1 - y0) * k + ny * w
		var d := -width / 2.0
		while d <= width / 2.0:
			var x := roundi(cx + nx * d)
			var y := roundi(cy + ny * d)
			if not _near_base(spots, x, y, 10):
				if not pass_gap or k < 0.42 or k > 0.58: _paint(x, y, t)
			d += 0.5
		s += 0.4

## shape the land: runs right after the map is cleared, before anything is placed
func paint(key: String, r: Callable, spots: Array) -> void:
	var n := M.N
	var c := n / 2.0
	if key == "greatlake": _blob(c, c, n * 0.17, WATER, spots, 13)
	if key == "twinrivers":
		for off in [-0.17, 0.17]:
			var o: float = n * off
			_band(o + 1, 1 - o, n - 2 + o, n - 2 - o, 4, WATER, spots, r)
			# fords: three shallow crossings per river
			for k in [0.22, 0.5, 0.78]:
				var fx := roundi(o + (n - 3) * k + 1)
				var fy := roundi(-o + (n - 3) * k + 1)
				for j in range(-3, 4):
					for i in range(-3, 4):
						var x := fx + i
						var y := fy + j
						if x > 0 and y > 0 and x < n - 1 and y < n - 1 and M.terrain[M.idx(x, y)] == WATER and absi(i + j) <= 2: _paint(x, y, FORD)
		# sandy banks
		for y in range(1, n - 1):
			for x in range(1, n - 1):
				var t := M.terrain[M.idx(x, y)]
				if t == WATER or t == FORD or t == SAND: continue
				var wet := false
				for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
					var u := M.terrain[M.idx(x + d[0], y + d[1])]
					if u == WATER or u == FORD:
						wet = true; break
				if wet and r.call() < 0.8: M.terrain[M.idx(x, y)] = SAND
	if key == "highlands":
		for k in roundi(n / 9.0):
			var x0: float = 4 + r.call() * (n - 8)
			var y0: float = 4 + r.call() * (n - 8)
			var a: float = r.call() * 6.28
			var L: float = 10 + r.call() * 16
			_band(x0, y0, x0 + cos(a) * L, y0 + sin(a) * L, 2, ROCK, spots, r, true)   # a pass in the middle
		# dirt patches around the ridges
		for y in range(1, n - 1):
			for x in range(1, n - 1):
				if M.terrain[M.idx(x, y)] < 4 and M.terrain[M.idx(x + 1, y)] == ROCK and r.call() < 0.6: M.terrain[M.idx(x, y)] = 4
	if key == "desertoasis":
		for i in n * n:
			if M.terrain[i] != 4: M.terrain[i] = SAND
		# green ground around each base, so it still feels like home
		for y in n:
			for x in n:
				if _near_base(spots, x, y, 7 + r.call() * 2): M.terrain[M.idx(x, y)] = 1 if r.call() < 0.5 else 2
		_oases = []
		var k := 0
		var tries := 0
		while k < 3 + roundi(n / 30.0) and tries < 200:
			tries += 1
			var x: float = 8 + r.call() * (n - 16)
			var y: float = 8 + r.call() * (n - 16)
			if _near_base(spots, x, y, 18): continue
			var close := false
			for o in _oases:
				if o.distance_to(Vector2(x, y)) < 14: close = true
			if close: continue
			_oases.append(Vector2(x, y)); k += 1
			_blob(x, y, 5.5, 1, spots); _blob(x, y, 2.6, WATER, spots)

## how much forest the map grows (1 = Grasslands)
func forest(key: String) -> float:
	return FOREST.get(key, 1.0)

## features added after the bases and their starting resources
func extras(key: String, r: Callable, cluster: Callable) -> void:
	var n := M.N
	var c := n / 2.0
	if key == "goldrush":
		cluster.call("gold", roundi(c), roundi(c), 26, 1)
		for k in 10:
			var a := k / 10.0 * 6.28
			cluster.call("tree", roundi(c + cos(a) * 9), roundi(c + sin(a) * 9), 8, 1)
	if key == "highlands":
		for k in 6: cluster.call("stone" if k % 2 == 1 else "gold", 6 + floori(r.call() * (n - 12)), 6 + floori(r.call() * (n - 12)), 6, 1)
	if key == "desertoasis":
		for o in _oases:
			for k in 7:
				var a: float = k / 7.0 * 6.28 + r.call()
				cluster.call("tree", roundi(o.x + cos(a) * 4.2), roundi(o.y + sin(a) * 4.2), 4, 1)
			cluster.call("berry", roundi(o.x + 5), roundi(o.y - 5), 4, 1)

func walls(key: String, starts: Array) -> void:
	var n := M.N
	if key != "fortress": return
	for s in starts:
		# a stone wall ring around the base, with four gates
		var cx: int = s.x + 2
		var cy: int = s.y + 2
		var R := 11
		for y in range(cy - R, cy + R + 1):
			for x in range(cx - R, cx + R + 1):
				if maxi(absi(x - cx), absi(y - cy)) != R or not M.in_map(x, y) or x < 1 or y < 1 or x > n - 2 or y > n - 2: continue
				if M.is_free(x, y): E.add_building("gate" if (x == cx or y == cy) else "stonewall", s.p, x, y, true)

## after loading a save, put the water and rock back into the blocking grid
func apply_terrain_blocks() -> void:
	for i in M.terrain.size():
		if blocking(M.terrain[i]) and M.block[i] == 0: M.block[i] = WALL

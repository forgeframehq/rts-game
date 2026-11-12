extends Node
## Map grid, blocking, fog of war and A* pathfinding. Port of js/map.js.

var N := 72
var terrain := PackedByteArray()    # visual variant 0..3 (grass shades), 4 = dirt
var block := PackedInt32Array()     # entity id blocking the tile, 0 = free
var explored := PackedByteArray()
var visible := PackedByteArray()
var map_rng: Callable
var _rng_ref: Rng   # keeps the generator alive: a Callable alone does not

var _g := PackedFloat32Array()
var _parent := PackedInt32Array()
var _stamp := PackedInt32Array()
var _cur := 0

const DIRS := [[1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]

## mulberry32, the same generator the JavaScript edition uses, so a seed gives the same map.
class Rng:
	var s := 0
	func _init(seed_: int) -> void:
		s = seed_ & 0xFFFFFFFF
	func next() -> float:
		s = (s + 0x6D2B79F5) & 0xFFFFFFFF
		var t := s
		t = imul(t ^ (t >> 15), t | 1)
		t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
		return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
	static func imul(a: int, b: int) -> int:
		a &= 0xFFFFFFFF; b &= 0xFFFFFFFF
		return ((a & 0xFFFF) * b + ((((a >> 16) * b) & 0xFFFF) << 16)) & 0xFFFFFFFF

func idx(x: int, y: int) -> int:
	return y * N + x

func in_map(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < N and y < N

func init_map(seed_: int) -> void:
	N = G.MAP
	var n2 := N * N
	_g.resize(n2); _parent.resize(n2); _stamp.resize(n2); _stamp.fill(0); _cur = 0
	terrain.resize(n2); terrain.fill(0)
	block.resize(n2); block.fill(0)
	explored.resize(n2); explored.fill(0)
	visible.resize(n2); visible.fill(0)
	var r := Rng.new(seed_)
	_rng_ref = r
	for y in N:
		for x in N:
			var n := sin(x * 0.21 + seed_) * cos(y * 0.17 - seed_) + r.next() * 0.6
			terrain[idx(x, y)] = 4 if n > 0.95 else mini(3, floori((n + 1.3) * 1.4))
	map_rng = r.next

func is_free(x: int, y: int) -> bool:
	return in_map(x, y) and block[y * N + x] == 0

## A gate is a hole in your own wall: your men and your allies walk through it, the enemy
## has to break it down. Everything else that blocks a tile blocks everyone.
func open_to(block_id: int, owner_: int) -> bool:
	if block_id == 0 or owner_ == 0: return false
	var e = G.by_id.get(block_id)
	return e != null and e.def.get("gate", false) and e.built and not e.dead and E.allied(e.owner, owner_)

func free_for(x: int, y: int, owner_: int) -> bool:
	if not in_map(x, y): return false
	var b := block[y * N + x]
	return b == 0 or open_to(b, owner_)

func area_free(x: int, y: int, size: int) -> bool:
	for j in size:
		for i in size:
			if not is_free(x + i, y + j): return false
	return true

func set_block(e: Dictionary, val: int) -> void:
	var s: int = e.size
	for j in s:
		for i in s:
			var tx: int = e.tx + i
			var ty: int = e.ty + j
			if in_map(tx, ty): block[ty * N + tx] = val

# ---------- Fog of war (for the human player) ----------
func update_fog() -> void:
	visible.fill(0)
	for e in G.ents:
		if e.dead or not E.allied(1, e.owner): continue
		var los: float = e.def.get("los", 4)
		var cx: float = e.tx + e.size / 2.0 if e.kind == "building" else e.x
		var cy: float = e.ty + e.size / 2.0 if e.kind == "building" else e.y
		var r2 := los * los
		for y in range(floori(cy - los), floori(cy + los) + 1):
			if y < 0 or y >= N: continue
			for x in range(floori(cx - los), floori(cx + los) + 1):
				if x < 0 or x >= N: continue
				var dx := x + 0.5 - cx
				var dy := y + 0.5 - cy
				if dx * dx + dy * dy <= r2:
					var i := y * N + x
					visible[i] = 1; explored[i] = 1

func is_visible(x: float, y: float) -> bool:
	return in_map(int(x), int(y)) and visible[int(y) * N + int(x)] == 1

func is_explored(x: float, y: float) -> bool:
	return in_map(int(x), int(y)) and explored[int(y) * N + int(x)] == 1

# ---------- A* pathfinding ----------
# Binary heap of [f, index] pairs.
var _heap: Array = []

func _hpush(f: float, i: int) -> void:
	_heap.append([f, i])
	var k := _heap.size() - 1
	while k > 0:
		var p := (k - 1) >> 1
		if _heap[p][0] <= _heap[k][0]: break
		var t = _heap[p]; _heap[p] = _heap[k]; _heap[k] = t
		k = p

func _hpop() -> Array:
	var top = _heap[0]
	var last = _heap.pop_back()
	var n := _heap.size()
	if n > 0:
		_heap[0] = last
		var i := 0
		while true:
			var l := i * 2 + 1
			var r := l + 1
			var m := i
			if l < n and _heap[l][0] < _heap[m][0]: m = l
			if r < n and _heap[r][0] < _heap[m][0]: m = r
			if m == i: break
			var t = _heap[m]; _heap[m] = _heap[i]; _heap[i] = t
			i = m
	return top

func _pfree(x: int, y: int, ignore_id: int, owner_: int) -> bool:
	if x < 0 or y < 0 or x >= N or y >= N: return false
	var b := block[y * N + x]
	return b == 0 or b == ignore_id or open_to(b, owner_)

## rect: target footprint [x0, y0, x1, y1] inclusive. With adjacent, the goal is any free
## tile touching the rect. Returns an Array of Vector2 waypoints (tile centres).
func find_path(sxf: float, syf: float, rect: Array, adjacent: bool, ignore_id: int, owner_: int) -> Array:
	var sx := clampi(int(sxf), 0, N - 1)
	var sy := clampi(int(syf), 0, N - 1)
	_cur += 1
	var x0: int = rect[0]; var y0: int = rect[1]; var x1: int = rect[2]; var y1: int = rect[3]
	var tcx := (x0 + x1) / 2.0
	var tcy := (y0 + y1) / 2.0
	_heap.clear()
	var si := sy * N + sx
	_g[si] = 0; _parent[si] = -1; _stamp[si] = _cur
	var h0 := _h(sx, sy, tcx, tcy)
	_hpush(h0, si)
	var best := si
	var best_h := h0
	var found := -1
	var expanded := 0
	var limit := 7000 if G.rules.get("map", "grasslands") != "grasslands" else 3000
	while _heap.size() > 0 and expanded < limit:
		var n = _hpop()
		expanded += 1
		var ni: int = n[1]
		var nx := ni % N
		var ny := ni / N
		var goal: bool
		if adjacent:
			goal = nx >= x0 - 1 and nx <= x1 + 1 and ny >= y0 - 1 and ny <= y1 + 1 and not (nx >= x0 and nx <= x1 and ny >= y0 and ny <= y1)
		else:
			goal = nx >= x0 and nx <= x1 and ny >= y0 and ny <= y1
		if goal:
			found = ni; break
		var hn := _h(nx, ny, tcx, tcy)
		if hn < best_h:
			best_h = hn; best = ni
		for d in DIRS:
			var dx: int = d[0]; var dy: int = d[1]
			var ax := nx + dx
			var ay := ny + dy
			if not _pfree(ax, ay, ignore_id, owner_): continue
			if dx != 0 and dy != 0 and (not _pfree(nx + dx, ny, ignore_id, owner_) or not _pfree(nx, ny + dy, ignore_id, owner_)): continue   # no corner cutting
			var ai := ay * N + ax
			var g: float = _g[ni] + d[2]
			if _stamp[ai] == _cur and _g[ai] <= g: continue
			_stamp[ai] = _cur; _g[ai] = g; _parent[ai] = ni
			_hpush(g + _h(ax, ay, tcx, tcy), ai)
	var end := found if found >= 0 else best
	var path: Array = []
	while end != -1 and end != si:
		path.append(Vector2((end % N) + 0.5, (end / N) + 0.5))
		end = _parent[end]
	path.reverse()
	return _smooth(sx + 0.5, sy + 0.5, path, ignore_id, owner_)

func _h(x: int, y: int, tcx: float, tcy: float) -> float:
	var dx := absf(x - tcx)
	var dy := absf(y - tcy)
	return maxf(dx, dy) + 0.414 * minf(dx, dy)

func _line_free(ax: float, ay: float, bx: float, by: float, ignore_id: int, owner_: int) -> bool:
	var d := Vector2(bx - ax, by - ay).length()
	var steps := ceili(d * 3)
	for s in range(1, steps + 1):
		var t := float(s) / steps
		for o in [-0.3, 0.3]:
			var x := floori(ax + (bx - ax) * t + o)
			var y := floori(ay + (by - ay) * t + o)
			if not _pfree(x, y, ignore_id, owner_): return false
	return true

func _smooth(sx: float, sy: float, path: Array, ignore_id: int, owner_: int) -> Array:
	if path.size() < 3: return path
	var out: Array = []
	var ax := sx
	var ay := sy
	var i := 0
	while i < path.size():
		var j := path.size() - 1
		while j > i and not _line_free(ax, ay, path[j].x, path[j].y, ignore_id, owner_): j -= 1
		out.append(path[j]); ax = path[j].x; ay = path[j].y; i = j + 1
	return out

## Nearest free tile, spiral search. Returns Vector2i or null.
func nearest_free(xf: float, yf: float, max_r: int = 12):
	var x := int(xf)
	var y := int(yf)
	if is_free(x, y): return Vector2i(x, y)
	for r in range(1, max_r + 1):
		for j in range(-r, r + 1):
			for i in range(-r, r + 1):
				if maxi(absi(i), absi(j)) != r: continue
				if is_free(x + i, y + j): return Vector2i(x + i, y + j)
	return null

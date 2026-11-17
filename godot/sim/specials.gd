extends Node
## Specials: one simple move per kind of soldier, on one button. Plus Combined Arms, a small
## automatic bonus for armies that mix melee, archers and cavalry. Port of js/specials.js.

const COOL := 30.0
const BY_TYPE := {"spearman": "brace", "militia": "rush", "archer": "volley", "scout": "charge", "knight": "charge",
	"longbowman": "firearrows", "axethrower": "axestorm", "cataphract": "greekfire", "repeater": "rocket", "elephant": "charge", "kamayuk": "brace", "templeguard": "rush"}
const SPECIALS := {
	"brace": {"name": "Brace", "desc": "Spearmen plant their spears and hold: tougher for 8 s, and cavalry that charge them get hurt."},
	"rush": {"name": "Rush", "desc": "Swordsmen sprint for 5 s to close in fast."},
	"volley": {"name": "Volley", "desc": "Archers loose one big volley together: harder hits that splash."},
	"charge": {"name": "Charge", "desc": "Cavalry burst forward; the first blow hits twice as hard and knocks back. Tired for a while after."},
	"firearrows": {"name": "Fire Arrows", "desc": "Britons: a burning volley. Buildings hit keep burning."},
	"axestorm": {"name": "Axe Storm", "desc": "Franks: two throws at once that stun the target."},
	"greekfire": {"name": "Greek Fire", "desc": "Byzantines: a line of fire on the ground ahead that burns the enemy crossing it."},
	"rocket": {"name": "Rocket Barrage", "desc": "Chinese: a salvo that lands on an area after a moment."},
}

var fires: Array = []
var later: Array = []
var _combo_t := 0.0

func _ready() -> void:
	G.specials_node = self
	G.new_game_started.connect(func(): fires = []; later = []; _combo_t = 0.0)

## the Special this unit has, or ""
func special_of(u) -> String:
	if u == null or u.kind != "unit" or u.type == "villager" or u.def.get("siege", false) or u.def.cls == "hero" or u.def.has("heal"): return ""
	return BY_TYPE.get(u.type, "volley" if u.def.get("ranged", false) else ("charge" if u.def.cls == "cav" else "rush"))

func ready_in(u: Dictionary) -> float:
	return maxf(0.0, u.get("spReady", 0.0) - G.time)

func _enemy_near(u: Dictionary, r: float):
	return E.nearest(u.x, u.y, func(e): return (e.kind == "unit" or e.kind == "building") and E.enemies(e.owner, u.owner), r)

func _fx(x: float, y: float) -> void:
	G.effects.append({"t": "ping", "x": x, "y": y, "life": 0.6})

## use the Special of every ready unit in the group; returns how many acted
func use_special(units: Array) -> int:
	var n := 0
	var charged := false
	for u in units:
		if u.dead or ready_in(u) > 0: continue
		var k := special_of(u)
		if k == "": continue
		if _do(u, k):
			u.spReady = G.time + COOL; n += 1
			if k == "charge": charged = true
	if n > 0: G.snd("charge" if charged else "special", units[0].x, units[0].y)
	return n

func _do(u: Dictionary, k: String) -> bool:
	var t = G.by_id.get(u.task.id) if u.task.t == "attack" else null
	if t == null: t = _enemy_near(u, maxf(u.def.get("range", 1), 1) + (1.5 if u.def.get("ranged", false) else 7.0))
	match k:
		"brace":
			u.brace = G.time + 8; u.task = {"t": "idle"}; u.path = []; _fx(u.x, u.y)
			return true
		"rush":
			u.rush = G.time + 5
			if t != null and u.task.t != "attack": E.cmd_attack([u], t)
			_fx(u.x, u.y)
			return true
		"charge":
			u.charge = G.time + 3; u.chargeHit = true; u.tired = G.time + 13
			if t != null: E.cmd_attack([u], t)
			_fx(u.x, u.y)
			return true
		"volley", "firearrows", "axestorm", "rocket":
			if t == null or E.dist(u, t) > u.def.get("range", 1) + 2: return false   # nothing in range: the move isn't spent
			u.boost = {"k": k, "until": G.time + 0.6}
			if k == "rocket":
				later.append({"at": G.time + 1, "x": t.x, "y": t.y, "owner": u.owner, "dmg": u.def.get("atk", 4) * 2.5, "r": 1.6})
				_fx(t.x, t.y)
			else:
				E.fire(u, t)
				if k == "axestorm": E.fire(u, t)
			u.cool = u.def.rate
			return true
		"greekfire":
			var d := Vector2(t.x - u.x, t.y - u.y) if t != null else Vector2(1, 0)
			if d.length() < 0.001: d = Vector2(1, 0)
			d = d.normalized()
			for i in range(1, 5): fires.append({"x": u.x + d.x * i * 0.9, "y": u.y + d.y * i * 0.9, "owner": u.owner, "until": G.time + 6})
			if t != null: E.cmd_attack([u], t)
			return true
	return false

# ---------- hooks used by the core ----------
func speed_mul(u: Dictionary) -> float:
	if u.get("stun", 0.0) > G.time or u.get("brace", 0.0) > G.time: return 0.0
	var m := 1.0
	if u.get("charge", 0.0) > G.time: m *= 1.8
	elif u.get("tired", 0.0) > G.time: m *= 0.8
	if u.get("rush", 0.0) > G.time: m *= 1.6
	return m

## damage modifiers: Specials, Combined Arms, Brace
func dmg_mod(att: Dictionary, t: Dictionary, dmg: float) -> float:
	if att.kind != "unit": return dmg
	var boost = att.get("boost")
	if boost != null and boost.until > G.time:
		var k: String = boost.k
		dmg *= 1.2 if k == "axestorm" else 1.5
		if k == "axestorm" and t.kind == "unit": t.stun = G.time + 1.5
		if k == "firearrows" and t.kind == "building": t.burn = {"until": G.time + 10, "owner": att.owner}
		if k == "volley" or k == "firearrows": _splash(att, t, dmg * 0.4)
	if att.get("chargeHit", false) and att.get("charge", 0.0) > G.time:
		dmg *= 2; att.chargeHit = false
		if t.kind == "unit" and not t.def.get("siege", false):
			var d := Vector2(t.x - att.x, t.y - att.y)
			if d.length() < 0.001: d = Vector2(1, 0)
			d = d.normalized() * 0.8
			if M.is_free(int(t.x + d.x), int(t.y + d.y)):
				t.x += d.x; t.y += d.y; t.path = []
	if att.get("combo", false): dmg *= 1.1
	if t.get("brace", 0.0) > G.time:
		dmg = maxf(1, dmg - 4)
		if att.def.cls == "cav" and not att.def.get("ranged", false):
			att.hp -= 6; att.hitT = 0.2
			if att.hp <= 0: E.kill(att)
	return maxf(1, roundi(dmg))

func _splash(att: Dictionary, t: Dictionary, d: float) -> void:
	for e in G.ents:
		if not e.dead and e.id != t.id and e.kind == "unit" and E.enemies(e.owner, att.owner) and Vector2(e.x - t.x, e.y - t.y).length() < 1.1:
			e.hp -= maxf(1, roundi(d)); e.hitT = 0.2
			if e.hp <= 0: E.kill(e)

# ---------- per step: fire zones, burning buildings, delayed rockets, Combined Arms ----------
func step(dt: float) -> void:
	if fires.size() > 0:
		fires = fires.filter(func(f): return f.until > G.time)
		for f in fires:
			for e in G.ents:
				if not e.dead and e.kind == "unit" and E.enemies(e.owner, f.owner) and absf(e.x - f.x) < 0.7 and absf(e.y - f.y) < 0.7:
					e.hp -= 6 * dt
					if e.hp <= 0: E.kill(e)
	for b in G.ents:
		if b.dead or b.get("burn") == null: continue
		if b.burn.until < G.time: b.burn = null
		else:
			b.hp -= 5 * dt
			var fl = G.hp_floor(b)
			if fl != null:
				if b.hp < fl: b.hp = fl
			elif b.hp <= 0: E.kill(b)
	if later.size() > 0:
		var due := later.filter(func(l): return l.at <= G.time)
		later = later.filter(func(l): return l.at > G.time)
		for l in due:
			_fx(l.x, l.y)
			G.snd("stonehit", l.x, l.y)
			for e in G.ents:
				if e.dead or not (e.kind == "unit" or e.kind == "building") or not E.enemies(e.owner, l.owner): continue
				if Vector2(e.x - l.x, e.y - l.y).length() >= l.r + e.size / 2.0: continue
				var fl = G.hp_floor(e)
				e.hp -= l.dmg * 0.3 if e.kind == "building" else l.dmg
				e.hitT = 0.2
				if fl != null and e.hp < fl: e.hp = fl
				elif e.hp <= 0: E.kill(e)
	# Combined Arms: a soldier with melee, archers and cavalry of its own side within 7 tiles
	_combo_t -= dt
	if _combo_t > 0: return
	_combo_t = 1.0
	var sol := []
	for e in G.ents:
		if not e.dead and e.kind == "unit" and e.type != "villager" and not e.def.get("siege", false) and e.def.cls != "hero": sol.append(e)
	for u in sol:
		var inf := false
		var arc := false
		var cav := false
		for o in sol:
			if o.owner != u.owner or absf(o.x - u.x) > 7 or absf(o.y - u.y) > 7: continue
			if o.def.get("ranged", false): arc = true
			elif o.def.cls == "cav": cav = true
			else: inf = true
			if inf and arc and cav: break
		u.combo = inf and arc and cav

## the computer uses Specials too: when its soldiers are fighting, now and then
func ai_specials(p: int) -> void:
	var fighting := []
	for u in G.ents:
		if u.dead or u.owner != p or u.kind != "unit" or u.task.t != "attack" or ready_in(u) > 0 or special_of(u) == "": continue
		var t = G.by_id.get(u.task.id)
		if t != null and not t.dead and E.dist(u, t) < u.def.get("range", 1) + 3: fighting.append(u)
	if fighting.size() >= 3: use_special(fighting)

func save_state() -> Dictionary:
	return {"fires": fires, "later": later}

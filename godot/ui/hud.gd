extends Control
## The match interface: resources, minimap, alerts, the command panel, building placement,
## and all touch input on the map. Buttons stay in fixed places (muscle memory).

const Kit := preload("res://ui/kit.gd")
const Minimap := preload("res://ui/minimap.gd")

signal pause_pressed

const ECON := ["house", "mill", "lumbercamp", "miningcamp", "farm", "blacksmith", "monastery", "university", "infirmary"]
const MILITARY := ["barracks", "range", "stable", "siegeworkshop", "tower", "castle", "palisade", "stonewall", "towncenter"]
const STANCE_NAME := {"aggressive": "Aggressive", "defensive": "Defensive", "stand": "Stand ground", "passive": "Hold fire"}
const FORM_NAME := {"line": "Line", "box": "Box", "staggered": "Spread", "wedge": "Wedge"}
const JOBS := [["food", "berry"], ["wood", "tree"], ["gold", "gold"], ["stone", "stone"]]
const COLS := 5

var world: Node3D
var res_labels := {}
var pop_label: Label
var age_label: Label
var clock_label: Label
var alerts: VBoxContainer
var panel: PanelContainer
var info_icon: TextureRect
var info_name: Label
var info_sub: Label
var info_bar: ProgressBar
var grid: GridContainer
var idle_btn: Button
var army_btn: Button
var box_btn: Button
var minimap: Control
var overlay: Control

var page := ""               # "", "econ" or "military": which build page the villager panel shows
var placing := ""            # building type being placed
var place_at := Vector2i(-1, -1)
var place_from := Vector2i(-1, -1)   # walls: the first end of the line
var box_mode := false
var _sig := ""
var _touches := {}
var _moved := 0.0
var _down := Vector2.ZERO
var _box_start := Vector2.ZERO
var _box_now := Vector2.ZERO
var _boxing := false
var _last_tap := 0
var _last_tap_id := 0
var _idle_i := 0
var _refresh_t := 0.0

func _init() -> void:
	# anchors are set before the node enters the tree; set in _ready they left the root zero-sized
	set_anchors_preset(Control.PRESET_FULL_RECT)

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	_build()
	G.alerted.connect(_alert)

func _build() -> void:
	overlay = Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT); overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.draw.connect(_draw_overlay)
	add_child(overlay)
	# ---- top bar ----
	var top := Kit.panel()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.custom_minimum_size.y = 70
	add_child(top)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 6)
	top.add_child(row)
	for k in ["food", "wood", "gold", "stone"]:
		var ic := TextureRect.new(); ic.texture = Kit.icon(k); ic.custom_minimum_size = Vector2(36, 36)
		ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		row.add_child(ic)
		var l := Kit.label("0", 24); l.custom_minimum_size.x = 60
		row.add_child(l); res_labels[k] = l
	pop_label = Kit.label("0/0", 24, Kit.GOLD); pop_label.custom_minimum_size.x = 80
	row.add_child(pop_label)
	age_label = Kit.label("", 20, Kit.DIM); age_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; age_label.clip_text = true
	row.add_child(age_label)
	clock_label = Kit.label("0:00", 22, Kit.DIM)
	row.add_child(clock_label)
	var pb := Kit.button("II", func(): pause_pressed.emit(), 24, Vector2(56, 52))
	row.add_child(pb)
	# ---- minimap ----
	minimap = Minimap.new()
	minimap.world = world
	minimap.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	minimap.offset_left = -236; minimap.offset_right = -8; minimap.offset_top = 86; minimap.offset_bottom = 86 + 118
	add_child(minimap)
	# ---- alerts ----
	alerts = VBoxContainer.new()
	alerts.set_anchors_preset(Control.PRESET_TOP_LEFT)
	alerts.position = Vector2(12, 88); alerts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(alerts)
	# ---- side buttons ----
	var side := VBoxContainer.new()
	side.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	side.offset_left = -92; side.offset_right = -8; side.offset_top = -292 - 5 * 84; side.offset_bottom = -300
	side.alignment = BoxContainer.ALIGNMENT_END
	side.add_theme_constant_override("separation", 8)
	add_child(side)
	box_btn = Kit.button("▭", _toggle_box, 30, Vector2(84, 72)); side.add_child(box_btn)
	army_btn = Kit.button("⚔", _select_army, 30, Vector2(84, 72)); side.add_child(army_btn)
	idle_btn = Kit.button("0", _next_idle, 26, Vector2(84, 72)); idle_btn.icon = Kit.icon("idle"); idle_btn.expand_icon = true
	side.add_child(idle_btn)
	side.add_child(Kit.button("+", func(): world.zoom(1), 30, Vector2(84, 64)))
	side.add_child(Kit.button("−", func(): world.zoom(-1), 30, Vector2(84, 64)))
	# ---- command panel ----
	panel = Kit.panel()
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.offset_top = -292; panel.offset_left = 6; panel.offset_right = -6; panel.offset_bottom = -6
	add_child(panel)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 6)
	panel.add_child(v)
	var head := HBoxContainer.new(); head.add_theme_constant_override("separation", 10)
	v.add_child(head)
	info_icon = TextureRect.new(); info_icon.custom_minimum_size = Vector2(56, 56)
	info_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; info_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	head.add_child(info_icon)
	var names := VBoxContainer.new(); names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(names)
	info_name = Kit.label("", 24, Kit.GOLD); info_name.add_theme_font_override("font", Kit.heading()); info_name.clip_text = true
	names.add_child(info_name)
	info_sub = Kit.label("", 19, Kit.DIM); info_sub.clip_text = true; names.add_child(info_sub)
	info_bar = ProgressBar.new(); info_bar.custom_minimum_size = Vector2(110, 16); info_bar.show_percentage = false
	info_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	info_bar.add_theme_stylebox_override("background", Kit.box(Color(0.2, 0.05, 0.05), Kit.EDGE, 4, 1))
	info_bar.add_theme_stylebox_override("fill", Kit.box(Kit.GOOD, Kit.GOOD, 4, 0))
	head.add_child(info_bar)
	# always in the same place: lets go of whatever is selected (a tap on the ground is a move order)
	var desel := func():
		G.selection = []; page = ""; placing = ""
	head.add_child(Kit.button("✕ Deselect", desel, 20, Vector2(150, 56)))
	grid = GridContainer.new(); grid.columns = COLS
	grid.add_theme_constant_override("h_separation", 6); grid.add_theme_constant_override("v_separation", 6)
	v.add_child(grid)

# ---------------------------------------------------------------- helpers
func selected() -> Array:
	var out := []
	for id in G.selection:
		var e = G.by_id.get(id)
		if e != null and not e.dead and e.inside == 0: out.append(e)
	return out

func my_units() -> Array:
	return selected().filter(func(e): return e.kind == "unit" and e.owner == 1)

func _alert(text: String) -> void:
	var l := Kit.label(text, 22)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.custom_minimum_size.x = 440
	alerts.add_child(l)
	if alerts.get_child_count() > 4: alerts.get_child(0).queue_free()
	var tw := l.create_tween()
	tw.tween_interval(4.5); tw.tween_property(l, "modulate:a", 0.0, 0.8); tw.tween_callback(l.queue_free)

func _civ() -> String:
	return G.players[1].civ

func _cmd(text: String, icon_tex: Texture2D, on: Callable, sub: String = "", enabled: bool = true, tint = null) -> void:
	var b := Button.new()
	b.custom_minimum_size = Vector2(100, 98)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Kit.style_button(b, 17)
	b.disabled = not enabled
	b.clip_text = true
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_FULL_RECT); box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.alignment = BoxContainer.ALIGNMENT_CENTER; box.add_theme_constant_override("separation", 0)
	b.add_child(box)
	if icon_tex != null:
		var ic := TextureRect.new(); ic.texture = icon_tex; ic.custom_minimum_size = Vector2(46, 46)
		ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if not enabled: ic.modulate = Color(1, 1, 1, 0.4)
		box.add_child(ic)
	var l := Kit.label(text, 17 if icon_tex != null else 21, Kit.INK if enabled else Kit.DIM)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; l.clip_text = true; l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(l)
	if sub != "":
		var s := Kit.label(sub, 15, tint if tint != null else Kit.GOLD)
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; s.clip_text = true; s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(s)
	var press := func():
		Sfx.ui("click")
		on.call()
		_sig = ""
	b.pressed.connect(press)
	grid.add_child(b)

func _cost_sub(cost: Dictionary) -> Array:
	return [Kit.cost_text(cost), Kit.GOLD if E.can_afford(1, cost) else Kit.BAD]

# ---------------------------------------------------------------- per frame
func _process(dt: float) -> void:
	if not G.players.has(1): return
	var r: Dictionary = G.players[1].res
	for k in res_labels: res_labels[k].text = str(int(r[k]))
	var pc := E.pop_of(1)
	pop_label.text = "%d/%d" % [pc.x, pc.y]
	pop_label.add_theme_color_override("font_color", Kit.BAD if pc.x >= pc.y else Kit.GOLD)
	age_label.text = D.AGES[E.age_of(1)].short
	var lim: float = G.rules.get("time", 0.0) * 60
	var tsec := int(maxf(0, lim - G.time)) if lim > 0 else int(G.time)
	clock_label.text = "%s%d:%02d" % ["⏳" if lim > 0 else "", tsec / 60, tsec % 60]
	Sfx.listener = world.look
	_refresh_t -= dt
	if _refresh_t <= 0:
		_refresh_t = 0.25
		var idle := 0
		for e in G.ents:
			if not e.dead and e.owner == 1 and e.type == "villager" and e.task.t == "idle": idle += 1
		idle_btn.text = str(idle)
		idle_btn.modulate = Color(1, 1, 1) if idle > 0 else Color(1, 1, 1, 0.5)
		_refresh_panel()
	overlay.queue_redraw()

# ---------------------------------------------------------------- command panel
func _refresh_panel() -> void:
	var sel := selected()
	G.selection = sel.map(func(e): return e.id)
	var sig := placing + "|" + page + "|" + str(E.age_of(1)) + "|"
	for e in sel.slice(0, 12): sig += "%d," % e.id
	sig += "|%d" % sel.size()
	var first = sel[0] if sel.size() > 0 else null
	if first != null and first.kind == "building":
		sig += "|%s|%d|%s|%s|%d|%d" % [first.built, first.queue.size(), first.research != null, first.aging != null, first.garrison.size(), G.players[1].techs.size()]
		for k in G.players[1].up: sig += str(G.players[1].up[k])
	if first != null and first.kind == "unit": sig += "|" + E.stance_of(first) + first.form
	var r: Dictionary = G.players[1].res
	sig += "|%d%d%d%d" % [int(r.food) / 25, int(r.wood) / 25, int(r.gold) / 25, int(r.stone) / 25]
	_update_info(sel)
	if sig == _sig: return
	_sig = sig
	for c in grid.get_children(): c.queue_free()
	panel.visible = true
	if placing != "":
		_cmd("Build here", Kit.icon("build"), _confirm_place, "", _can_place())
		_cmd("Cancel", Kit.icon("cancel"), func(): placing = "")
		return
	if first == null:
		panel.visible = false
		return
	if first.owner != 1: return
	if first.kind == "unit":
		var vils := sel.filter(func(e): return e.type == "villager")
		if vils.size() > 0 and vils.size() == sel.size(): _villager_cmds(vils)
		else: _soldier_cmds(sel)
	elif first.kind == "building": _building_cmds(first)

func _update_info(sel: Array) -> void:
	if placing != "":
		info_icon.texture = Kit.building_icon(_civ(), placing)
		info_name.text = "Place: %s" % D.BUILDINGS[placing].name
		info_sub.text = "Tap the map to move it" if not D.BUILDINGS[placing].has("wall") else "Tap two points to draw the wall"
		info_bar.visible = false
		return
	if sel.is_empty(): return
	var e: Dictionary = sel[0]
	var civ: String = G.players[e.owner].civ if G.players.has(e.owner) else _civ()
	info_bar.visible = e.kind != "res"
	if e.kind == "res":
		info_icon.texture = Kit.icon({"tree": "wood", "berry": "food", "gold": "gold", "stone": "stone"}[e.type])
		info_name.text = e.def.get("name", e.type.capitalize()); info_sub.text = "%d left" % int(e.amount)
		return
	info_bar.max_value = e.maxHp; info_bar.value = e.hp
	var who := "" if e.owner == 1 else " (%s)" % D.CIVS[civ].name
	if e.kind == "unit":
		info_icon.texture = Kit.unit_icon(civ, e.type)
		info_name.text = (("%d units" % sel.size()) if sel.size() > 1 else (G.royal_name(e.owner, e.type) if e.def.cls == "hero" else e.def.name)) + who
		var sub := "HP %d/%d" % [int(e.hp), int(e.maxHp)]
		if e.carry != null and e.carry.amt >= 1: sub += "  ·  carrying %d %s" % [int(e.carry.amt), e.carry.res]
		elif e.type != "villager": sub += "  ·  attack %d" % e.def.atk
		info_sub.text = sub
	else:
		info_icon.texture = Kit.building_icon(civ, e.type)
		info_name.text = e.def.name + who
		var sub := "HP %d/%d" % [int(e.hp), int(e.maxHp)]
		if not e.built: sub = "Building… %d%%" % int(e.progress * 100)
		elif e.type == "farm": sub = "Food left %d" % int(e.food)
		elif e.aging != null: sub = "Advancing to the %s  %d%%" % [D.AGES[e.aging.to].name, int(e.aging.t / D.AGES[e.aging.to].time * 100)]
		elif e.research != null:
			var rd: Dictionary = D.UPGRADES[e.research.id] if e.research.kind == "up" else D.TECHS[e.research.id]
			sub = "Researching %s  %d%%" % [rd.name, int(e.research.t / rd.time * 100)]
		elif e.queue.size() > 0:
			sub = "%s %d%%" % [D.UNITS[e.queue[0].type].name, int(e.qt / D.UNITS[e.queue[0].type].time * 100)]
			if e.queue.size() > 1: sub += "  (+%d waiting)" % (e.queue.size() - 1)
			if e.housed: sub = "Build more houses!"
		elif e.garrison.size() > 0: sub += "  ·  %d inside" % e.garrison.size()
		info_sub.text = sub

func _villager_cmds(vils: Array) -> void:
	if page != "":
		for type in (ECON if page == "econ" else MILITARY):
			if not D.BUILDINGS.has(type) or E.civ_blocks(1, type): continue
			var need: int = D.BUILD_AGE.get(type, 1)
			var cost := E.build_cost(1, type)
			if E.age_of(1) < need: _cmd(D.BUILDINGS[type].name, Kit.building_icon(_civ(), type), func(): pass, D.AGES[need].short + " Age", false)
			elif E.at_build_limit(1, type): _cmd(D.BUILDINGS[type].name, Kit.building_icon(_civ(), type), func(): pass, "Limit reached", false)
			else:
				var cs := _cost_sub(cost)
				_cmd(D.BUILDINGS[type].name, Kit.building_icon(_civ(), type), _start_place.bind(type), cs[0], true, cs[1])
		_cmd("Back", Kit.icon("back"), func(): page = "")
		return
	_cmd("Economy", Kit.icon("build"), func(): page = "econ", "buildings")
	_cmd("Military", Kit.icon("barracks"), func(): page = "military", "buildings")
	for j in JOBS: _cmd(j[0].capitalize(), Kit.icon(j[0]), _send_to.bind(j[1]), "gather")
	var shelter := func():
		for v in my_units():
			var tc = E.nearest(v.x, v.y, func(e): return e.type == "towncenter" and E.can_garrison(v, e))
			if tc != null: E.garrison_to(v, tc)
	_cmd("Shelter", Kit.icon("garrison"), shelter)
	_cmd("Stop", Kit.icon("stop"), func(): E.cmd_stop(my_units()))

func _soldier_cmds(sel: Array) -> void:
	var u: Dictionary = sel[0]
	var next_stance := func():
		var k: String = E.STANCES[(E.STANCES.find(E.stance_of(u)) + 1) % E.STANCES.size()]
		E.set_stance(my_units(), k)
	_cmd(STANCE_NAME[E.stance_of(u)], Kit.icon("guard"), next_stance, "stance")
	var form: String = u.form if u.form != "" else (G.players[1].formation if G.players[1].formation != "" else "line")
	var next_form := func():
		var k: String = E.FORMATIONS[(E.FORMATIONS.find(form) + 1) % E.FORMATIONS.size()]
		E.set_form(my_units(), k)
		var us := my_units()
		if us.size() > 1:
			var c := Vector2.ZERO
			for x in us: c += Vector2(x.x, x.y)
			c /= us.size()
			E.cmd_move(us, c.x + 0.01, c.y + 0.01)
	_cmd(FORM_NAME[form], Kit.icon("box"), next_form, "formation")
	_cmd("Stop", Kit.icon("stop"), func(): E.cmd_stop(my_units()))
	var heal := func():
		for x in my_units():
			var inf = E.nearest(x.x, x.y, func(e): return e.type == "infirmary" and E.can_garrison(x, e))
			if inf != null: E.garrison_to(x, inf)
	_cmd("Heal", Kit.icon("heal"), heal, "at Infirmary")

func _building_cmds(b: Dictionary) -> void:
	if not b.built:
		var cancel_site := func():
			E.refund(1, b.cost); E.kill(b); G.selection = []
		_cmd("Cancel", Kit.icon("cancel"), cancel_site, "refund")
		return
	var civ := _civ()
	for type in E.trains_for(b):
		var need: int = D.UNIT_AGE.get(type, 1)
		var def := E.unit_def(1, type)
		if E.age_of(1) < need:
			_cmd(def.name, Kit.unit_icon(civ, type), func(): pass, D.AGES[need].short + " Age", false)
			continue
		var cs := _cost_sub(E.unit_cost(1, type))
		var n: int = b.queue.filter(func(q): return q.type == type).size()
		_cmd(def.name + ("  ×%d" % n if n > 0 else ""), Kit.unit_icon(civ, type), _train.bind(b, type), cs[0], true, cs[1])
	if b.type == "towncenter":
		var a := E.age_of(1)
		if a + 1 < D.AGES.size():
			var blk = E.age_block(1, b)
			var cost = E.age_cost(1, a + 1)
			if b.aging != null: _cmd("Cancel Age", Kit.icon("cancel"), func(): E.cancel_age(b), "refund")
			elif blk != null: _cmd(D.AGES[a + 1].short + " Age", Kit.icon("ageup"), func(): G.alert(str(blk)), _age_hint(), true, Kit.BAD)
			else:
				var cs := _cost_sub(cost)
				var go := func():
					var r = E.advance_age(b)
					if r is String: G.alert("Not enough resources")
				_cmd(D.AGES[a + 1].short + " Age", Kit.icon("ageup"), go, cs[0], true, cs[1])
		_cmd("Bell", Kit.icon("bell"), func(): E.ring_bell(1), "all inside")
	# two rows of five: research fills what the train buttons leave, keeping room for Cancel and Delete
	var shown := 0
	var room := 8 - E.trains_for(b).size() - (2 if b.type == "towncenter" else 0)
	for r in E.researches_for(b):
		if shown >= room: break
		shown += 1
		var ic := Kit.icon("t/" + r.id)
		if ic == null and r.kind == "up": ic = Kit.unit_icon(civ, r.def.line, r.id)
		if r.why != null: _cmd(r.def.name, ic, func(): pass, r.why, false)
		else:
			var cs := _cost_sub(r.def.cost)
			var go := func():
				var res = E.start_research(b, r.id)
				if res is String: G.alert("Not enough resources")
				elif res is bool and not res: G.alert("Already being researched")
			_cmd(r.def.name, ic, go, cs[0], true, cs[1])
	if b.research != null: _cmd("Cancel", Kit.icon("cancel"), func(): E.cancel_research(b), "research")
	if b.queue.size() > 0: _cmd("Cancel", Kit.icon("cancel"), func(): E.cancel_train(b, b.queue.size() - 1), "last unit")
	if b.garrison.size() > 0: _cmd("Send out", Kit.icon("garrison"), func(): E.ungarrison(b), "%d inside" % b.garrison.size())
	if b.def.has("wall") and b.type != "gate":
		var gate := func():
			var r = E.wall_to_gate(b)
			if r is String: G.alert("Can't make a gate here: " + r)
		_cmd("Make gate", Kit.icon("gate"), gate, Kit.cost_text(E.build_cost(1, "gate")))
	if b.type != "towncenter" or _count("towncenter") > 1:
		var del := func():
			E.delete_ent(b); G.selection = []
		_cmd("Delete", Kit.icon("delete"), del)

func _count(type: String) -> int:
	var n := 0
	for e in G.ents:
		if not e.dead and e.owner == 1 and e.type == type: n += 1
	return n

func _age_hint() -> String:
	var need = E.age_needs(1)
	if need != null and need.got < need.want: return "%d of %d built" % [need.got, need.want]
	return "TC busy"

func _train(b: Dictionary, type: String) -> void:
	var r = E.train(b, type)
	if r is String: G.alert({"pop": "Build more houses", "res": "Not enough resources", "busy": "The building is busy"}.get(r, r))

func _send_to(rtype: String) -> void:
	var vils := my_units().filter(func(u): return u.type == "villager")
	if vils.is_empty(): return
	if rtype == "berry":
		# food: berries near home first, then your fields
		var b = E.nearest(vils[0].x, vils[0].y, func(e): return e.kind == "res" and e.type == "berry" and M.is_explored(e.x, e.y), 16)
		if b != null:
			E.cmd_gather_spread(vils, b); return
		var left := 0
		for v in vils:
			var f = E.free_farm_near(v.x, v.y, 1, v)
			if f != null: E.cmd_farm([v], f)
			else: left += 1
		if left > 0: G.alert("No berries or free farms nearby. Build a farm.")
		return
	var r = E.nearest(vils[0].x, vils[0].y, func(e): return e.kind == "res" and e.type == rtype and M.is_explored(e.x, e.y), 40)
	if r == null: G.alert("None found nearby. Explore to find more.")
	else: E.cmd_gather_spread(vils, r)

# ---------------------------------------------------------------- side buttons
func _toggle_box() -> void:
	box_mode = not box_mode
	box_btn.add_theme_stylebox_override("normal", Kit.box(Color("#6b4a1c") if box_mode else Color("#3a2a17"), Kit.GOLD if box_mode else Kit.EDGE))
	if box_mode: G.alert("Drag to select a group")

func _select_army() -> void:
	var ids := []
	for e in G.ents:
		if not e.dead and e.owner == 1 and e.kind == "unit" and e.type != "villager" and e.def.cls != "hero": ids.append(e.id)
	G.selection = ids; page = ""
	if ids.is_empty(): G.alert("You have no soldiers yet")

func _next_idle() -> void:
	var idle := []
	for e in G.ents:
		if not e.dead and e.owner == 1 and e.type == "villager" and e.task.t == "idle": idle.append(e)
	if idle.is_empty(): return
	_idle_i = (_idle_i + 1) % idle.size()
	var v: Dictionary = idle[_idle_i]
	G.selection = [v.id]; page = ""
	world.look = Vector2(v.x, v.y)

# ---------------------------------------------------------------- placing buildings
func _start_place(type: String) -> void:
	placing = type; page = ""
	var g: Vector2 = world.ground_at(get_viewport_rect().size * Vector2(0.5, 0.42))
	var s: int = D.BUILDINGS[type].size
	place_at = Vector2i(roundi(g.x - s / 2.0), roundi(g.y - s / 2.0))
	place_from = Vector2i(-1, -1)

func wall_line() -> Array:
	if place_from.x < 0: return [place_at]
	var out := []
	var d := place_at - place_from
	if absi(d.x) >= absi(d.y):
		for i in range(0, absi(d.x) + 1): out.append(Vector2i(place_from.x + i * signi(d.x), place_from.y))
	else:
		for i in range(0, absi(d.y) + 1): out.append(Vector2i(place_from.x, place_from.y + i * signi(d.y)))
	return out

func tile_ok(type: String, t: Vector2i) -> bool:
	var s: int = D.BUILDINGS[type].size
	if not M.area_free(t.x, t.y, s) or E.farm_overlap(t.x, t.y, s) or G.rule_block(1, type, t.x, t.y): return false
	for j in s:
		for i in s:
			if not M.is_explored(t.x + i, t.y + j): return false
	return true

func _can_place() -> bool:
	if placing == "": return false
	if not E.can_afford(1, E.build_cost(1, placing)): return false
	if D.BUILDINGS[placing].has("wall"): return wall_line().any(func(t): return tile_ok(placing, t))
	return tile_ok(placing, place_at)

func _confirm_place() -> void:
	var vils := my_units().filter(func(u): return u.type == "villager")
	var placed := 0
	if D.BUILDINGS[placing].has("wall"):
		var first = null
		for t in wall_line():
			if not tile_ok(placing, t): continue
			var b = E.place_building(1, placing, t.x, t.y, [])
			if b == null: break
			placed += 1
			if first == null: first = b
		if first != null: E.cmd_build(vils, first)
	else:
		var b = E.place_building(1, placing, place_at.x, place_at.y, vils)
		if b != null: placed = 1
	if placed == 0: G.alert("Can't build there" if E.can_afford(1, E.build_cost(1, placing)) else "Not enough resources")
	else: placing = ""

# ---------------------------------------------------------------- touch input on the map
func _gui_input(ev: InputEvent) -> void:
	if ev is InputEventScreenTouch:
		if ev.pressed:
			_touches[ev.index] = ev.position
			if _touches.size() == 1:
				_moved = 0.0; _down = ev.position
				_boxing = box_mode and placing == ""
				_box_start = ev.position; _box_now = ev.position
		else:
			var was_single := _touches.size() == 1
			_touches.erase(ev.index)
			if was_single:
				if _boxing and _moved >= 16.0: _finish_box()
				elif _moved < 16.0: _tap(ev.position)
			_boxing = false
		accept_event()
	elif ev is InputEventScreenDrag:
		if _touches.size() >= 2:
			# two fingers always pan, so the map can be moved while the select box is on
			_touches[ev.index] = ev.position
			world.pan_pixels(ev.relative * 0.5)
		else:
			_moved += ev.relative.length()
			if _boxing: _box_now = ev.position
			elif _moved >= 16.0: world.pan_pixels(ev.relative)
		accept_event()

func _pick(screen: Vector2):
	var best = null
	var bd := 40.0
	for e in G.ents:
		if e.dead or e.kind != "unit" or world.seen(e) == 0: continue
		var d: float = world.screen_of(e.x, e.y, 0.45).distance_to(screen)
		if d < bd:
			bd = d; best = e
	if best != null: return best
	var g: Vector2 = world.ground_at(screen)
	if M.in_map(int(g.x), int(g.y)) and (G.reveal_all or M.is_explored(g.x, g.y)):
		var id := M.block[M.idx(int(g.x), int(g.y))]
		if id > 0 and G.by_id.has(id): return G.by_id[id]
		for e in G.ents:
			if not e.dead and e.type == "farm" and g.x >= e.tx and g.x < e.tx + e.size and g.y >= e.ty and g.y < e.ty + e.size: return e
	return null

func _tap(screen: Vector2) -> void:
	var g: Vector2 = world.ground_at(screen)
	if placing != "":
		var s: int = D.BUILDINGS[placing].size
		var t := Vector2i(floori(g.x - (s - 1) / 2.0), floori(g.y - (s - 1) / 2.0))
		if D.BUILDINGS[placing].has("wall") and place_from.x < 0 and t != place_at: place_from = place_at
		elif D.BUILDINGS[placing].has("wall") and place_from.x >= 0: place_from = place_at
		place_at = t
		_sig = ""
		return
	var t = _pick(screen)
	var mine := my_units()
	var now := Time.get_ticks_msec()
	if t != null and t.kind == "unit" and t.owner == 1:
		# a second quick tap on the same unit takes every one of its kind on screen
		if now - _last_tap < 380 and _last_tap_id == t.id:
			var ids := []
			var vr := get_viewport_rect()
			for e in G.ents:
				if not e.dead and e.owner == 1 and e.kind == "unit" and e.type == t.type and vr.has_point(world.screen_of(e.x, e.y)): ids.append(e.id)
			G.selection = ids
		else: G.selection = [t.id]
		_last_tap = now; _last_tap_id = t.id; page = ""
		Sfx.ui("select")
		return
	if mine.size() > 0 and t != null and t.kind == "building" and t.owner == 1 and t.built and t.hp >= t.maxHp and t.type != "farm" \
			and not (t.def.has("drop") and mine.any(func(u): return u.carry != null)) \
			and not mine.any(func(u): return u.type != "villager"):
		# villagers have no work at a finished building: the tap picks the building instead of walking them to it
		G.selection = [t.id]; page = ""
		Sfx.ui("select")
		return
	if mine.size() > 0:
		var r = E.cmd_smart(mine, g.x, g.y, t)
		world.ping(g.x, g.y, {"attack": Color(1, 0.3, 0.2), "gather": Color(0.5, 0.9, 0.4), "build": Color(1, 0.8, 0.3)}.get(r, Color(1, 1, 1)))
		if r == "farm-busy": G.alert("That farm already has a farmer")
		Sfx.ui("command")
		return
	var sel := selected()
	if sel.size() == 1 and sel[0].kind == "building" and sel[0].owner == 1 and sel[0].built and E.trains_for(sel[0]).size() > 0 and (t == null or t.id != sel[0].id):
		# a production building is selected: a tap on the map sets where its new units gather
		E.set_rally(sel[0], {"x": g.x, "y": g.y, "id": t.id if t != null else 0})
		world.ping(g.x, g.y, Color(0.4, 0.8, 1.0)); G.alert("Gather point set")
		if t == null or t.owner != 1: return
	if t != null and (G.reveal_all or t.kind != "unit" or M.is_visible(t.x, t.y)):
		G.selection = [t.id]; page = ""
		Sfx.ui("select")
	else: G.selection = []

func _finish_box() -> void:
	var r := Rect2(_box_start, _box_now - _box_start).abs()
	var ids := []
	var soldiers := []
	for e in G.ents:
		if e.dead or e.owner != 1 or e.kind != "unit": continue
		if r.has_point(world.screen_of(e.x, e.y, 0.4)):
			ids.append(e.id)
			if e.type != "villager": soldiers.append(e.id)
	# a mixed box takes the soldiers: villagers caught in it stay at work
	G.selection = soldiers if soldiers.size() > 0 else ids
	page = ""
	if ids.size() > 0: _toggle_box()

# ---------------------------------------------------------------- overlay: health bars, select box
func _draw_overlay() -> void:
	var sel := {}
	for id in G.selection: sel[id] = true
	var vr := get_viewport_rect().grow(40)
	for e in G.ents:
		if e.dead or e.kind == "res": continue
		var hurt: bool = e.hp < e.maxHp - 0.5
		var building: bool = e.kind == "building" and not e.built
		if not hurt and not sel.has(e.id) and not building: continue
		if world.seen(e) != 2: continue
		var h: float = 1.15 if e.kind == "unit" else 0.4 + e.size * 0.55
		var p: Vector2 = world.screen_of(e.x, e.y, h)
		if not vr.has_point(p): continue
		var w: float = 44.0 if e.kind == "unit" else 30.0 + e.size * 22.0
		var f: float = clampf(e.hp / e.maxHp, 0.0, 1.0)
		overlay.draw_rect(Rect2(p.x - w / 2 - 1, p.y - 1, w + 2, 7), Color(0, 0, 0, 0.75))
		var col := Color(0.35, 0.85, 0.3) if f > 0.6 else (Color(0.95, 0.8, 0.2) if f > 0.3 else Color(0.9, 0.25, 0.2))
		if building: col = Color(0.4, 0.7, 1.0)
		overlay.draw_rect(Rect2(p.x - w / 2, p.y, w * (e.progress if building else f), 5), col)
	if _boxing and _moved >= 16.0:
		var r := Rect2(_box_start, _box_now - _box_start).abs()
		overlay.draw_rect(r, Color(1, 1, 1, 0.12))
		overlay.draw_rect(r, Color(1, 1, 1, 0.9), false, 2.0)

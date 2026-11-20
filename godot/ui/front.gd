extends Control
## The screens before a match, laid out like the web edition's: "Tap to begin" title, main menu,
## Battle (Quick Match, game mode cards, players, battle settings), Saved Games, Dynasties, Options.

const Kit := preload("res://ui/kit.gd")

signal start_battle(cfg: Dictionary)
signal load_slot(slot: int)
signal learn
signal prefs_changed

## The dynasties on offer. Persians, Incas and Cholas are set aside for now (20 Nov): their rules, crests and art
## stay in the project, so putting them back is adding their names to this list.
const CIV_ORDER := ["britons", "franks", "byzantines", "chinese"]
const MODES := [["conquest", "Conquest", "Destroy everything"], ["regicide", "Regicide", "Kill the King and Queen"],
	["capture", "Capture", "Take the Town Centers"], ["survival", "Siege Survival", "Hold off the waves"], ["empirewars", "Empire Wars", "Skip the slow start"]]
const MODE_TXT := {"conquest": "Destroy every enemy building and unit.",
	"regicide": "Each dynasty has a King and a Queen. Kill both and it falls; lose yours and so do you.",
	"capture": "Beat a Town Center below a quarter health, then stand soldiers beside it to take it. Hold an enemy's home Town Center for 3 minutes to win.",
	"survival": "No enemy town: raiders come in growing waves from the map's edge. Every fifth wave brings siege. How long can you hold?",
	"empirewars": "Everyone starts in the Feudal Age with a working town and twenty villagers, so the fighting starts within minutes."}
const LEVELS := [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]]

var prefs: Dictionary          # main.gd's prefs; "setup" holds the Battle screen's choices
var body: Control              # the current screen
var _serif: Font

func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

func _setup() -> Dictionary:
	if not prefs.has("setup"):
		prefs.setup = {"mode": "conquest", "map": "random", "size": "small", "pace": "quick", "wave": 60, "neutral": false, "age": 1, "time": 0,
			"teamColors": false, "res": "standard", "pop": 100, "reveal": "normal",
			"players": [{"civ": "britons", "color": 0, "team": 0}, {"civ": "random", "color": 1, "team": 0, "ai": "normal"}]}
	for p in prefs.setup.players:
		if p.civ != "random" and not p.civ in CIV_ORDER: p.civ = "britons" if is_same(p, prefs.setup.players[0]) else "random"
	return prefs.setup

func serif() -> Font:
	if _serif == null:
		var f := SystemFont.new(); f.font_names = PackedStringArray(["Noto Serif", "Georgia", "serif"]); f.font_weight = 700
		_serif = f
	return _serif

# ------------------------------------------------------------------ building blocks
func _clear() -> void:
	if body != null: body.queue_free()
	body = Control.new()
	body.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(body)

## where a screen's text and buttons go: clear of the notch and the gesture bar (the backdrop runs under both)
func _safe() -> MarginContainer:
	var m := Kit.safe_box()
	body.add_child(m)
	return m

func _backdrop(dark: float) -> void:
	var bg := TextureRect.new(); bg.texture = load("res://assets/ui/title_bg.jpg")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT); bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	body.add_child(bg)
	if dark > 0:
		var sh := ColorRect.new(); sh.color = Color(0.035, 0.027, 0.02, dark); sh.set_anchors_preset(Control.PRESET_FULL_RECT)
		body.add_child(sh)

## the picture fades into the dark lower part of the screen where the logo and buttons sit
func _fade(from: float, to: float) -> void:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, from, to, 1.0])
	g.colors = PackedColorArray([Color(0.04, 0.03, 0.02, 0.0), Color(0.04, 0.03, 0.02, 0.0), Color(0.04, 0.03, 0.02, 1.0), Color(0.04, 0.03, 0.02, 1.0)])
	var t := GradientTexture2D.new(); t.gradient = g; t.fill_from = Vector2(0, 0); t.fill_to = Vector2(0, 1); t.width = 4; t.height = 256
	var r := TextureRect.new(); r.texture = t; r.set_anchors_preset(Control.PRESET_FULL_RECT)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; r.stretch_mode = TextureRect.STRETCH_SCALE; r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(r)

func _img(path: String, size: Vector2) -> TextureRect:
	var t := TextureRect.new()
	if ResourceLoader.exists(path): t.texture = load(path)
	t.custom_minimum_size = size
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t

func _credit() -> Control:
	var h := HBoxContainer.new(); h.alignment = BoxContainer.ALIGNMENT_CENTER; h.add_theme_constant_override("separation", 14)
	h.add_child(_img("res://assets/ui/studio_mark.png", Vector2(52, 52)))
	var l := Kit.label("A  FORGE  FRAME  GAME", 17, Color("#c9b98f")); l.add_theme_font_override("font", Kit.heading(false))
	h.add_child(l)
	return h

func _tile_style(bg_top: Color, edge: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg_top; s.border_color = edge; s.set_border_width_all(2); s.set_corner_radius_all(14)
	s.shadow_color = Color(0, 0, 0, 0.5); s.shadow_size = 5
	s.content_margin_left = 26; s.content_margin_right = 14; s.content_margin_top = 12; s.content_margin_bottom = 12
	return s

## a menu tile: a Cinzel title with a line of small text under it
func mbtn(title: String, small: String, on: Callable, enabled: bool = true, height: float = 100.0) -> Button:
	var b := Button.new(); b.custom_minimum_size = Vector2(0, height); b.focus_mode = Control.FOCUS_NONE
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.disabled = not enabled
	b.add_theme_stylebox_override("normal", _tile_style(Color(0.16, 0.115, 0.07, 0.94), Color("#b8862f")))
	b.add_theme_stylebox_override("hover", _tile_style(Color(0.2, 0.145, 0.09, 0.96), Color("#e9c46a")))
	b.add_theme_stylebox_override("pressed", _tile_style(Color(0.3, 0.21, 0.1, 0.98), Color("#e9c46a")))
	b.add_theme_stylebox_override("disabled", _tile_style(Color(0.1, 0.075, 0.05, 0.9), Color("#5a4420")))
	var v := VBoxContainer.new(); v.set_anchors_preset(Control.PRESET_FULL_RECT); v.offset_left = 26; v.offset_right = -10
	v.alignment = BoxContainer.ALIGNMENT_CENTER; v.mouse_filter = Control.MOUSE_FILTER_IGNORE; v.add_theme_constant_override("separation", 0)
	b.add_child(v)
	var t := Kit.label(title, 27, Color("#f3ead7") if enabled else Color("#7d735f")); t.add_theme_font_override("font", Kit.heading()); t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(t)
	if small != "":
		var s := Kit.label(small, 19, Color("#b8a888") if enabled else Color("#6a614f")); s.mouse_filter = Control.MOUSE_FILTER_IGNORE; s.clip_text = true
		v.add_child(s)
	var press := func():
		Sfx.ui("click"); on.call()
	b.pressed.connect(press)
	return b

## the painted red-and-gold button with laurels: one per screen, for its main action
func grand(title: String, small: String, on: Callable, height: float = 112.0) -> Button:
	var b := Button.new(); b.custom_minimum_size = Vector2(0, height); b.focus_mode = Control.FOCUS_NONE
	var tex: Texture2D = load("res://assets/ui/button.png")
	for state in ["normal", "hover", "pressed"]:
		var sb := StyleBoxTexture.new(); sb.texture = tex
		sb.modulate_color = Color(1, 1, 1) if state != "pressed" else Color(0.8, 0.8, 0.8)
		b.add_theme_stylebox_override(state, sb)
	var v := VBoxContainer.new(); v.set_anchors_preset(Control.PRESET_FULL_RECT); v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE; v.add_theme_constant_override("separation", -2)
	b.add_child(v)
	var t := Kit.label(title, 31 if small != "" else 34, Color("#fff3d0")); t.add_theme_font_override("font", Kit.heading())
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	t.add_theme_color_override("font_outline_color", Color(0.25, 0.03, 0.02, 0.95)); t.add_theme_constant_override("outline_size", 6)
	v.add_child(t)
	if small != "":
		var s := Kit.label(small, 17, Color("#ffe9c9")); s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(s)
	var press := func():
		Sfx.ui("click"); on.call()
	b.pressed.connect(press)
	return b

## a full-screen sheet with a back button and title; returns the column its content goes in
func _sheet(title: String, back: Callable, footer: Control = null) -> VBoxContainer:
	_clear()
	_backdrop(0.86)
	var root := VBoxContainer.new(); root.add_theme_constant_override("separation", 0)
	_safe().add_child(root)
	var head := HBoxContainer.new(); head.custom_minimum_size.y = 96; head.add_theme_constant_override("separation", 18)
	var pad := MarginContainer.new(); pad.add_theme_constant_override("margin_left", 22); pad.add_theme_constant_override("margin_top", 18); pad.add_theme_constant_override("margin_bottom", 12)
	pad.add_child(head); root.add_child(pad)
	var bb := Kit.button("‹", back, 40, Vector2(Kit.TOUCH, Kit.TOUCH))
	bb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(bb)
	var t := Kit.label(title, 38, Kit.GOLD); t.add_theme_font_override("font", Kit.heading()); t.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(t)
	var line := ColorRect.new(); line.color = Color(0.72, 0.53, 0.18, 0.45); line.custom_minimum_size.y = 2
	root.add_child(line)
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(sc)
	var m := MarginContainer.new(); m.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["left", "right"]: m.add_theme_constant_override("margin_" + side, 28)
	m.add_theme_constant_override("margin_top", 22); m.add_theme_constant_override("margin_bottom", 26)
	sc.add_child(m)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 22); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	m.add_child(col)
	if footer != null:
		var fm := MarginContainer.new()
		for side in ["left", "right"]: fm.add_theme_constant_override("margin_" + side, 28)
		fm.add_theme_constant_override("margin_top", 10); fm.add_theme_constant_override("margin_bottom", 22)
		fm.add_child(footer); root.add_child(fm)
	return col

## a framed section with a red ribbon heading and gold corner ornaments
func frame(title: String) -> VBoxContainer:
	var p := PanelContainer.new()
	var s := StyleBoxFlat.new(); s.bg_color = Color(0.13, 0.095, 0.055, 0.93); s.border_color = Color("#c9a24a"); s.set_border_width_all(2); s.set_corner_radius_all(14)
	s.shadow_color = Color(0, 0, 0, 0.5); s.shadow_size = 8
	s.content_margin_left = 18; s.content_margin_right = 18; s.content_margin_top = 16; s.content_margin_bottom = 18
	p.add_theme_stylebox_override("panel", s)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 14)
	p.add_child(v)
	var rib := TextureRect.new(); rib.texture = load("res://assets/ui/ribbon.png"); rib.custom_minimum_size = Vector2(560, 62)
	rib.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; rib.stretch_mode = TextureRect.STRETCH_SCALE; rib.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var rl := Kit.label(title.to_upper(), 21, Color("#fff0c8")); rl.add_theme_font_override("font", Kit.heading())
	rl.set_anchors_preset(Control.PRESET_FULL_RECT); rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; rl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rl.add_theme_constant_override("outline_size", 5); rl.add_theme_color_override("font_outline_color", Color(0.23, 0.04, 0.02))
	rib.add_child(rl)
	v.add_child(rib)
	# corner ornaments sit just outside the frame, top-left and bottom-right
	for k in 2:
		var holder := Control.new(); holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.add_child(holder)
		var c := TextureRect.new(); c.texture = load("res://assets/ui/corner.png")
		c.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; c.stretch_mode = TextureRect.STRETCH_SCALE; c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(c)
		# 46 px ornaments just outside the frame's top-left and bottom-right corners
		if k == 0:
			c.anchor_left = 0; c.anchor_top = 0; c.anchor_right = 0; c.anchor_bottom = 0
			c.offset_left = -26; c.offset_top = -24; c.offset_right = 20; c.offset_bottom = 24
		else:
			c.flip_h = true; c.flip_v = true
			c.anchor_left = 1; c.anchor_top = 1; c.anchor_right = 1; c.anchor_bottom = 1
			c.offset_left = -20; c.offset_top = -24; c.offset_right = 26; c.offset_bottom = 24
	set_meta("last_frame", p)
	return v

func _frame_node(v: VBoxContainer) -> Control:
	return v.get_parent()

## a label with a row of pick-one buttons under it
func seg(parent: Control, label: String, options: Array, value, on: Callable) -> void:
	var box := VBoxContainer.new(); box.add_theme_constant_override("separation", 6)
	parent.add_child(box)
	box.add_child(Kit.label(label, 21, Color("#b8a888")))
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", Kit.GAP)
	box.add_child(row)
	var btns := []
	var paint := func(v):
		for i in btns.size():
			var on_: bool = options[i][0] == v
			btns[i].add_theme_stylebox_override("normal", Kit.box(Color("#6e5220") if on_ else Color(0.16, 0.115, 0.07), Color("#e9c46a") if on_ else Color("#6b5230"), 10))
			btns[i].add_theme_color_override("font_color", Color("#fff3d0") if on_ else Color("#cbbd9c"))
	for o in options:
		var b := Button.new(); b.text = o[1]; b.custom_minimum_size = Vector2(0, Kit.TOUCH); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		Kit.style_button(b, 21)
		b.add_theme_font_override("font", ThemeDB.fallback_font)
		var press := func():
			Sfx.ui("toggle"); paint.call(o[0]); on.call(o[0]); prefs_changed.emit()
		b.pressed.connect(press)
		row.add_child(b); btns.append(b)
	paint.call(value)

# ------------------------------------------------------------------ title: "Tap to begin"
func show_title() -> void:
	_clear()
	_backdrop(0.0)
	_fade(0.42, 0.6)
	var v := VBoxContainer.new(); v.alignment = BoxContainer.ALIGNMENT_END
	v.add_theme_constant_override("separation", 0); v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_safe().add_child(v)
	v.add_child(_img("res://assets/ui/logo.png", Vector2(640, 380)))
	var gap := Control.new(); gap.custom_minimum_size.y = 70; v.add_child(gap)
	var row := HBoxContainer.new(); row.alignment = BoxContainer.ALIGNMENT_CENTER; row.add_theme_constant_override("separation", 22)
	v.add_child(row)
	for k in 3:
		if k == 1:
			var l := Kit.label("TAP  TO  BEGIN", 27, Color("#f1d68a")); l.add_theme_font_override("font", Kit.heading(false))
			row.add_child(l)
		else:
			var ln := ColorRect.new(); ln.color = Color(0.91, 0.77, 0.42, 0.7); ln.custom_minimum_size = Vector2(90, 2); ln.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			row.add_child(ln)
	var tw := row.create_tween().set_loops()
	tw.tween_property(row, "modulate:a", 0.4, 1.1).set_trans(Tween.TRANS_SINE)
	tw.tween_property(row, "modulate:a", 1.0, 1.1).set_trans(Tween.TRANS_SINE)
	var gap2 := Control.new(); gap2.custom_minimum_size.y = 110; v.add_child(gap2)
	v.add_child(_credit())
	var gap3 := Control.new(); gap3.custom_minimum_size.y = 34; v.add_child(gap3)
	var tap := Button.new(); tap.flat = true; tap.set_anchors_preset(Control.PRESET_FULL_RECT); tap.focus_mode = Control.FOCUS_NONE
	tap.add_theme_stylebox_override("normal", StyleBoxEmpty.new()); tap.add_theme_stylebox_override("pressed", StyleBoxEmpty.new()); tap.add_theme_stylebox_override("hover", StyleBoxEmpty.new())
	var go := func():
		Sfx.ui("click"); show_menu()
	tap.pressed.connect(go)
	body.add_child(tap)

# ------------------------------------------------------------------ main menu
func show_menu() -> void:
	_clear()
	_backdrop(0.0)
	_fade(0.1, 0.36)
	var c := VBoxContainer.new(); c.alignment = BoxContainer.ALIGNMENT_END
	c.add_theme_constant_override("separation", 0)
	_safe().add_child(c)
	c.add_child(_img("res://assets/ui/logo.png", Vector2(640, 372)))
	var m := MarginContainer.new()
	for side in ["left", "right"]: m.add_theme_constant_override("margin_" + side, 36)
	m.add_theme_constant_override("margin_top", 16)
	c.add_child(m)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 14)
	m.add_child(v)
	if Save.has_save(0):
		var i := Save.info(0)
		if not i.is_empty():
			var mode_name: String = "Conquest"
			for mo in MODES:
				if mo[0] == i.get("mode", ""): mode_name = mo[1]
			v.add_child(grand("Continue", "%s  ·  %s  ·  %d min played" % [D.CIVS[i.civ].name, mode_name, int(i.time / 60)], func(): load_slot.emit(0)))
	v.add_child(mbtn("Play", "Quick Match or a custom battle: 5 modes, 8 maps", show_battle))
	var g := GridContainer.new(); g.columns = 2
	g.add_theme_constant_override("h_separation", 14); g.add_theme_constant_override("v_separation", 14)
	v.add_child(g)
	g.add_child(mbtn("Campaign", "Coming soon", func(): pass, false))
	g.add_child(mbtn("Multiplayer", "Play a friend with a code", show_multiplayer))
	g.add_child(mbtn("Saved Games", "Load a match", show_saves))
	g.add_child(mbtn("Dynasties", "History & bonuses", show_dynasties.bind("")))
	g.add_child(mbtn("Learn to Play", "Guided tutorial match", func(): learn.emit()))
	g.add_child(mbtn("Options", "Speed, sound, films", show_options))
	var gap := Control.new(); gap.custom_minimum_size.y = 26; c.add_child(gap)
	c.add_child(_credit())
	var gap2 := Control.new(); gap2.custom_minimum_size.y = 26; c.add_child(gap2)
	body.modulate.a = 0.0
	body.create_tween().tween_property(body, "modulate:a", 1.0, 0.35)

# ------------------------------------------------------------------ Battle
func _civ_name(civ: String) -> String:
	return "Random" if civ == "random" else D.CIVS[civ].name

func _quick_sub() -> String:
	var me: String = _setup().players[0].civ
	var lvl: String = prefs.get("level", "normal")
	return "%s vs a %s computer  ·  Regicide  ·  small map" % [_civ_name(me if me != "random" else "britons"), lvl.capitalize()]

func show_battle() -> void:
	var S := _setup()
	var start := grand("⚔  Start Battle", "", _start)
	var col := _sheet("Battle", show_menu, start)
	col.add_child(grand("Quick Match", _quick_sub(), _quick))
	# ---- game mode ----
	var fm := frame("Game mode")
	col.add_child(_frame_node(fm))
	var grid := GridContainer.new(); grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12); grid.add_theme_constant_override("v_separation", 12)
	fm.add_child(grid)
	var hint := Kit.label(MODE_TXT[S.mode], 19, Color("#cbbd9c")); hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var cards := {}
	var paint := func():
		for k in cards:
			var on_: bool = k == S.mode
			cards[k].add_theme_stylebox_override("normal", Kit.box(Color(0.42, 0.33, 0.14, 0.95) if on_ else Color(0.14, 0.11, 0.08, 0.9), Color("#f1d68a") if on_ else Color("#6b5a3a"), 12))
		hint.text = MODE_TXT[S.mode]
	for i in MODES.size():
		var mo: Array = MODES[i]
		var b := Button.new(); b.custom_minimum_size = Vector2(0, 122); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.focus_mode = Control.FOCUS_NONE
		b.add_theme_stylebox_override("hover", Kit.box(Color(0.2, 0.16, 0.1, 0.95), Color("#b8862f"), 12))
		b.add_theme_stylebox_override("pressed", Kit.box(Color(0.42, 0.33, 0.14, 0.95), Color("#f1d68a"), 12))
		var h := HBoxContainer.new(); h.set_anchors_preset(Control.PRESET_FULL_RECT); h.offset_left = 16; h.offset_right = -8
		h.add_theme_constant_override("separation", 16); h.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(h)
		var ic := _img("res://assets/ui/icons/mode_%s.jpg" % mo[0], Vector2(86, 86)); ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(ic)
		var tv := VBoxContainer.new(); tv.alignment = BoxContainer.ALIGNMENT_CENTER; tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; tv.mouse_filter = Control.MOUSE_FILTER_IGNORE
		h.add_child(tv)
		var n := Kit.label(mo[1], 23, Color("#f3ead7")); n.add_theme_font_override("font", serif()); n.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; n.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tv.add_child(n)
		var sm := Kit.label(mo[2], 19, Color("#b8a888")); sm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; sm.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tv.add_child(sm)
		var pick := func():
			Sfx.ui("toggle"); S.mode = mo[0]; prefs_changed.emit(); show_battle()
		b.pressed.connect(pick)
		cards[mo[0]] = b
		if i == MODES.size() - 1 and MODES.size() % 2 == 1:
			fm.add_child(b)       # the last, odd card runs the full width
		else: grid.add_child(b)
	fm.add_child(hint)
	paint.call()
	# ---- players ----
	var fp := frame("Players")
	col.add_child(_frame_node(fp))
	var players: Array = S.players
	if S.mode == "survival": fp.add_child(Kit.label("You against the raiders. Difficulty: how hard the waves hit.", 18, Color("#b8a888")))
	for i in players.size():
		if S.mode == "survival" and i > 0: break
		fp.add_child(_player_row(i))
	if S.mode == "survival":
		seg(fp, "Raiders", [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"], ["brutal", "Brutal"]], prefs.get("raid", "normal"), func(v): prefs.raid = v)
	elif players.size() < 4:
		var add := func():
			var used := {}
			for p in players: used[p.color] = true
			var c := 0
			while used.has(c): c += 1
			players.append({"civ": "random", "color": c, "team": 0, "ai": "normal"}); prefs_changed.emit(); show_battle()
		var ab := mbtn("+  Add computer player", "", add, true, Kit.TOUCH)
		fp.add_child(ab)
	# ---- battle settings ----
	var fs := frame("Battle settings")
	col.add_child(_frame_node(fs))
	fs.add_child(Kit.label("Map", 19, Color("#b8a888")))
	var mg := GridContainer.new(); mg.columns = 3
	mg.add_theme_constant_override("h_separation", 10); mg.add_theme_constant_override("v_separation", 10)
	fs.add_child(mg)
	var maps := ["random"] + Maps.MAPS.keys()
	for k in maps:
		var b := Button.new(); b.custom_minimum_size = Vector2(0, 150); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.focus_mode = Control.FOCUS_NONE
		var on_: bool = S.map == k
		for st in ["normal", "hover", "pressed"]: b.add_theme_stylebox_override(st, Kit.box(Color(0.1, 0.08, 0.05), Color("#f1d68a") if on_ else Color("#5a4a2c"), 10, 3 if on_ else 2))
		var im := _img("res://assets/ui/maps/%s.jpg" % k, Vector2(0, 0)); im.set_anchors_preset(Control.PRESET_FULL_RECT)
		im.offset_left = 5; im.offset_top = 5; im.offset_right = -5; im.offset_bottom = -34; im.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		b.add_child(im)
		var nl := Kit.label("Random" if k == "random" else Maps.MAPS[k].name, 19, Color("#fff3d0") if on_ else Color("#cbbd9c"))
		nl.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); nl.offset_top = -32; nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; nl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(nl)
		var pickm := func():
			Sfx.ui("toggle"); S.map = k; prefs_changed.emit(); show_battle()
		b.pressed.connect(pickm)
		mg.add_child(b)
	seg(fs, "Match length", [["quick", "Quick\n10–15 min"], ["classic", "Classic\nAoE2 pace"]], S.pace, func(v): S.pace = v)
	if S.mode == "survival": seg(fs, "Break between waves", [[30, "30 s"], [60, "60 s"], [90, "90 s"]], S.wave, func(v): S.wave = v)
	if S.mode == "capture": seg(fs, "Neutral Town Center in the middle", [[false, "Off"], [true, "On"]], S.neutral, func(v): S.neutral = v)
	if S.mode != "empirewars": seg(fs, "Starting Age", [[1, "Dark"], [2, "Feudal"], [3, "Castle"], [4, "Imperial"]], S.age, func(v): S.age = v)
	if S.mode != "survival": seg(fs, "Time limit", [[0, "Off"], [15, "15 min"], [20, "20 min"], [30, "30 min"]], S.time, func(v): S.time = v)
	seg(fs, "Map size", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], S.size, func(v): S.size = v)
	var more := Kit.label("MORE SETTINGS", 17, Color("#c9a24a")); more.add_theme_font_override("font", Kit.heading(false))
	fs.add_child(more)
	seg(fs, "Team colours", [[false, "Off"], [true, "On"]], S.teamColors, func(v): S.teamColors = v)
	if S.mode != "empirewars": seg(fs, "Starting resources", [["standard", "Standard"], ["medium", "Medium"], ["high", "High"]], S.res, func(v): S.res = v)
	seg(fs, "Population limit", [[50, "50"], [100, "100"], [150, "150"], [200, "200"]], S.pop, func(v): S.pop = v)
	seg(fs, "Map visibility", [["normal", "Normal"], ["explored", "Explored"], ["all", "All visible"]], S.reveal, func(v): S.reveal = v)

func _player_row(i: int) -> Control:
	var S := _setup()
	var p: Dictionary = S.players[i]
	var me := i == 0
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Kit.box(Color(0.2, 0.15, 0.09, 0.95) if me else Color(0.14, 0.105, 0.07, 0.95), Color("#f1d68a") if me else Color("#8a6c30"), 14))
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", Kit.GAP); h.custom_minimum_size.y = 116
	panel.add_child(h)
	# colour: tap to change
	# the colour dot is small to look at, but the button around it is a full fingertip
	var dot := Button.new(); dot.custom_minimum_size = Vector2(76, Kit.TOUCH); dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER; dot.focus_mode = Control.FOCUS_NONE
	var col := Color(D.PALETTE[p.color][1])
	var ds := StyleBoxFlat.new(); ds.bg_color = col; ds.set_corner_radius_all(26); ds.border_color = Color("#c9a24a"); ds.set_border_width_all(3)
	ds.expand_margin_left = -12; ds.expand_margin_right = -12; ds.expand_margin_top = -22; ds.expand_margin_bottom = -22
	for st in ["normal", "hover", "pressed"]: dot.add_theme_stylebox_override(st, ds)
	var recolor := func():
		var used := {}
		for q in S.players:
			if not is_same(q, p): used[q.color] = true
		var c: int = (p.color + 1) % D.PALETTE.size()
		while used.has(c): c = (c + 1) % D.PALETTE.size()
		p.color = c; prefs_changed.emit(); show_battle()
	dot.pressed.connect(recolor)
	h.add_child(dot)
	# crest and name: tap to choose the dynasty
	var pick := Button.new(); pick.flat = true; pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL; pick.focus_mode = Control.FOCUS_NONE
	pick.add_theme_stylebox_override("normal", StyleBoxEmpty.new()); pick.add_theme_stylebox_override("hover", StyleBoxEmpty.new()); pick.add_theme_stylebox_override("pressed", StyleBoxEmpty.new())
	var ph := HBoxContainer.new(); ph.set_anchors_preset(Control.PRESET_FULL_RECT); ph.add_theme_constant_override("separation", 14); ph.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pick.add_child(ph)
	if p.civ == "random":
		var q := Kit.label("?", 44, Color("#f1d68a")); q.add_theme_font_override("font", Kit.heading()); q.custom_minimum_size = Vector2(76, 76)
		q.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; q.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; q.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ph.add_child(q)
	else: ph.add_child(_img("res://assets/ui/crest_%s.png" % p.civ, Vector2(76, 92)))
	var tv := VBoxContainer.new(); tv.alignment = BoxContainer.ALIGNMENT_CENTER; tv.add_theme_constant_override("separation", -2); tv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ph.add_child(tv)
	var who := Kit.label("YOU" if me else "COMPUTER", 16, Color("#b8a888")); who.mouse_filter = Control.MOUSE_FILTER_IGNORE; tv.add_child(who)
	var nm := Kit.label(_civ_name(p.civ).to_upper(), 26, Color("#f1d68a")); nm.add_theme_font_override("font", Kit.heading()); nm.mouse_filter = Control.MOUSE_FILTER_IGNORE; tv.add_child(nm)
	var role := Kit.label("Any dynasty" if p.civ == "random" else D.CIVS[p.civ].get("role", ""), 18, Color("#cbbd9c")); role.add_theme_font_override("font", serif()); role.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tv.add_child(role)
	pick.pressed.connect(_picker.bind(i))
	h.add_child(pick)
	# team: none, 1-4
	var tb := Kit.button(("–" if p.team == 0 else str(p.team)) + "\nTEAM", func(): pass, 19, Vector2(Kit.TOUCH, Kit.TOUCH))
	tb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var team := func():
		p.team = (p.team + 1) % 5; prefs_changed.emit(); show_battle()
	tb.pressed.connect(team)
	h.add_child(tb)
	if not me:
		var lb := Kit.button(str(p.get("ai", "normal")).to_upper(), func(): pass, 19, Vector2(124, Kit.TOUCH))
		lb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var lvl := func():
			var order := ["easy", "normal", "hard"]
			p.ai = order[(order.find(p.get("ai", "normal")) + 1) % 3]; prefs_changed.emit(); show_battle()
		lb.pressed.connect(lvl)
		h.add_child(lb)
		if i > 1:
			var rm := Kit.button("✕", func(): pass, 24, Vector2(Kit.TOUCH, Kit.TOUCH)); rm.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var drop := func():
				S.players.remove_at(i); prefs_changed.emit(); show_battle()
			rm.pressed.connect(drop)
			h.add_child(rm)
	return panel

## choose a dynasty for a player row
func _picker(i: int) -> void:
	var S := _setup()
	var col := _sheet("Choose a Dynasty", show_battle)
	var set_civ := func(civ: String):
		S.players[i].civ = civ; prefs_changed.emit(); show_battle()
	if i > 0: col.add_child(mbtn("Random", "Any dynasty", set_civ.bind("random")))
	for civ in CIV_ORDER:
		if not D.CIVS.has(civ): continue
		var b := mbtn(D.CIVS[civ].name, D.CIVS[civ].get("role", ""), set_civ.bind(civ), true, 104)
		var cr := _img("res://assets/ui/crest_%s.png" % civ, Vector2(70, 84))
		cr.set_anchors_preset(Control.PRESET_CENTER_RIGHT); cr.offset_left = -96; cr.offset_right = -22; cr.offset_top = -42; cr.offset_bottom = 42
		b.add_child(cr)
		col.add_child(b)

func _resolve(players: Array) -> Array:
	var out := []
	var taken := {}
	for p in players:
		if p.civ != "random": taken[p.civ] = true
	for p in players:
		var q: Dictionary = p.duplicate()
		if q.civ == "random":
			var pool := CIV_ORDER.filter(func(c): return D.CIVS.has(c) and not taken.has(c))
			if pool.is_empty(): pool = CIV_ORDER.filter(func(c): return D.CIVS.has(c))
			q.civ = pool[randi() % pool.size()]; taken[q.civ] = true
		out.append(q)
	return out

func _start() -> void:
	var S := _setup()
	var players := _resolve(S.players)
	if S.mode == "survival": players = [players[0]]
	var cfg := {"players": players, "mode": S.mode, "map": S.map, "size": S.size, "pace": S.pace, "pop": S.pop, "res": S.res, "reveal": S.reveal,
		"time": S.time, "wave": S.wave, "neutral": S.neutral, "teamColors": S.teamColors, "raidLvl": prefs.get("raid", "normal")}
	if S.mode != "empirewars": cfg.startAge = S.age
	start_battle.emit(cfg)

## one tap: Regicide on a small map against the computer, as on the web
func _quick() -> void:
	var S := _setup()
	var me: Dictionary = S.players[0].duplicate()
	if me.civ == "random": me.civ = "britons"
	var players := _resolve([me, {"civ": "random", "color": 1 if me.color != 1 else 0, "team": 0, "ai": prefs.get("level", "normal")}])
	start_battle.emit({"players": players, "mode": "regicide", "map": "random", "size": "small", "pace": S.pace, "pop": 100, "res": "medium"})

# ------------------------------------------------------------------ saved games
func show_saves() -> void:
	var col := _sheet("Saved Games", show_menu)
	var any := false
	for slot in range(0, 11):
		if not Save.has_save(slot): continue
		var i := Save.info(slot)
		if i.is_empty(): continue
		any = true
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10)
		col.add_child(row)
		var mode_name: String = "Conquest"
		for mo in MODES:
			if mo[0] == i.get("mode", ""): mode_name = mo[1]
		row.add_child(mbtn(("Autosave" if slot == 0 else "Save %d" % slot) + "  ·  " + D.CIVS[i.civ].name, "%s  ·  %s  ·  %d min  ·  %s" % [mode_name, Maps.MAPS.get(i.get("map", ""), {}).get("name", ""), int(i.time / 60), str(i.get("when", "")).replace("T", " ").left(16)], func(): load_slot.emit(slot)))
		var del := func():
			Save.delete_save(slot); show_saves()
		row.add_child(Kit.button("✕", del, 26, Vector2(Kit.TOUCH, 100)))
	if not any:
		var l := Kit.label("No saved games yet. A match saves itself as you play, and you can save from the pause menu.", Kit.TEXT, Color("#cbbd9c"))
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		col.add_child(l)

# ------------------------------------------------------------------ dynasties
func show_dynasties(civ: String) -> void:
	if civ == "": civ = _setup().players[0].civ
	if not D.CIVS.has(civ): civ = "britons"
	var col := _sheet("Dynasties", show_menu)
	var tabs := HBoxContainer.new(); tabs.add_theme_constant_override("separation", Kit.GAP)
	col.add_child(tabs)
	for c in CIV_ORDER:
		if not D.CIVS.has(c): continue
		var b := Button.new(); b.custom_minimum_size = Vector2(0, 132); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.focus_mode = Control.FOCUS_NONE
		for st in ["normal", "hover", "pressed"]: b.add_theme_stylebox_override(st, Kit.box(Color(0.3, 0.22, 0.1) if c == civ else Color(0.13, 0.1, 0.06), Color("#f1d68a") if c == civ else Color("#5a4a2c"), 10))
		var cr := _img("res://assets/ui/crest_%s.png" % c, Vector2.ZERO); cr.set_anchors_preset(Control.PRESET_FULL_RECT)
		cr.offset_left = 6; cr.offset_top = 6; cr.offset_right = -6; cr.offset_bottom = -6
		b.add_child(cr)
		b.pressed.connect(show_dynasties.bind(c))
		tabs.add_child(b)
	var d: Dictionary = D.CIVS[civ]
	var f := frame(d.name)
	col.add_child(_frame_node(f))
	var role := Kit.label(d.get("role", ""), 22, Kit.GOLD); role.add_theme_font_override("font", serif()); role.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	f.add_child(role)
	var hist := Kit.label(d.get("history", d.get("desc", "")), Kit.TEXT, Color("#e6dcc4")); hist.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	f.add_child(hist)
	var fb := frame("Bonuses")
	col.add_child(_frame_node(fb))
	for bonus in d.get("bonuses", []):
		var l := Kit.label("•  " + bonus, Kit.TEXT, Color("#e6dcc4")); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		fb.add_child(l)
	if d.has("unique"):
		var fu := frame("Unique unit")
		col.add_child(_frame_node(fu))
		var l := Kit.label(d.unique.get("text", ""), Kit.TEXT, Color("#e6dcc4")); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		fu.add_child(l)

# ------------------------------------------------------------------ options
func show_options() -> void:
	var col := _sheet("Options", show_menu)
	var f := frame("Gameplay")
	col.add_child(_frame_node(f))
	seg(f, "Game speed", [[1.0, "Normal"], [1.5, "Fast"], [2.0, "Very fast"]], prefs.get("speed", 1.0), func(v): prefs.speed = v)
	seg(f, "Quick Match opponent", LEVELS, prefs.get("level", "normal"), func(v): prefs.level = v)
	seg(f, "Dynasty films before a battle", [[true, "On"], [false, "Off"]], prefs.get("films", true), func(v): prefs.films = v)
	seg(f, "Tutorial narrator voice", [[true, "On"], [false, "Off"]], prefs.get("voice", true), func(v): prefs.voice = v)
	seg(f, "Vibration", [[true, "On"], [false, "Off"]], prefs.get("buzz", true), func(v): prefs.buzz = v)
	var s := frame("Sound")
	col.add_child(_frame_node(s))
	seg(s, "Music", [[true, "On"], [false, "Off"]], prefs.get("music", true), _set_music)
	seg(s, "Sound effects", [[true, "On"], [false, "Off"]], prefs.get("sound", true), _set_sound)

func _set_music(on: bool) -> void:
	prefs.music = on
	Sfx.set_music(on)

func _set_sound(on: bool) -> void:
	prefs.sound = on
	Sfx.enabled = on

# ------------------------------------------------------------------ multiplayer (not in this edition yet)
func show_multiplayer() -> void:
	var col := _sheet("Multiplayer", show_menu)
	var f := frame("Play a friend")
	col.add_child(_frame_node(f))
	var l := Kit.label("Online play with a room code is not in the Godot edition yet. It is in the web edition; this one will connect to the same rooms once it is ported.", Kit.TEXT, Color("#e6dcc4"))
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	f.add_child(l)

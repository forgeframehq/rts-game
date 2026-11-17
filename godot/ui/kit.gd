extends RefCounted
## Shared look for the interface: colours, buttons, panels, and icons cut from the web edition's atlases.

const INK := Color("#f3e6c8")
const DIM := Color("#b9a987")
const GOLD := Color("#e2b34a")
const BAD := Color("#e0604c")
const GOOD := Color("#7fc66b")
const PANEL := Color(0.10, 0.075, 0.05, 0.94)
const EDGE := Color("#6b5230")
const CELL := 128

static var _atlas: Dictionary = {}
static var _icons := {}

static func box(bg: Color, edge: Color = EDGE, radius: int = 10, border: int = 2) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg; s.border_color = edge
	s.set_border_width_all(border); s.set_corner_radius_all(radius)
	s.content_margin_left = 8; s.content_margin_right = 8; s.content_margin_top = 6; s.content_margin_bottom = 6
	return s

static func panel(bg: Color = PANEL) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(bg))
	return p

static func label(text: String, size: int = 24, col: Color = INK) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	l.add_theme_constant_override("outline_size", 4)
	return l

static func style_button(b: Button, size: int = 26, bg: Color = Color("#3a2a17")) -> void:
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_color_override("font_color", INK)
	b.add_theme_color_override("font_disabled_color", Color(0.6, 0.55, 0.45, 0.7))
	b.add_theme_stylebox_override("normal", box(bg))
	b.add_theme_stylebox_override("hover", box(bg.lightened(0.08)))
	b.add_theme_stylebox_override("pressed", box(bg.lightened(0.2), GOLD))
	b.add_theme_stylebox_override("disabled", box(bg.darkened(0.35), EDGE.darkened(0.3)))

static func button(text: String, on: Callable, size: int = 26, min_size: Vector2 = Vector2(0, 72)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	style_button(b, size)
	var press := func():
		Sfx.ui("click")
		on.call()
	b.pressed.connect(press)
	return b

## A pick-one row: tapping cycles through the options. get_value() via meta "value".
static func cycler(title: String, options: Array, start, on: Callable) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 76)
	style_button(b, 26)
	var idx := 0
	for i in options.size():
		if options[i][0] == start: idx = i
	b.set_meta("i", idx); b.set_meta("value", options[idx][0])
	b.text = "%s:  %s" % [title, options[idx][1]]
	var press := func():
		Sfx.ui("toggle")
		var i: int = (b.get_meta("i") + 1) % options.size()
		b.set_meta("i", i); b.set_meta("value", options[i][0])
		b.text = "%s:  %s" % [title, options[i][1]]
		on.call(options[i][0])
	b.pressed.connect(press)
	return b

## An icon from the atlases ("u/britons_archer", "t/fletching", "b/western_house") or a single file in assets/ui/icons.
static func icon(key: String) -> Texture2D:
	if _icons.has(key): return _icons[key]
	if _atlas.is_empty(): _atlas = JSON.parse_string(FileAccess.get_file_as_string("res://assets/ui/icons/atlas.json"))
	var t: Texture2D = null
	if _atlas.has(key):
		var a: Array = _atlas[key]
		var ext: String = "png" if a[0] in _atlas.get("_png", []) else "jpg"
		var sheet := "res://assets/ui/icons/atlas_%s.%s" % [a[0], ext]
		if ResourceLoader.exists(sheet):
			var at := AtlasTexture.new()
			at.atlas = load(sheet)
			at.region = Rect2(int(a[1]) * CELL, int(a[2]) * CELL, CELL, CELL)
			t = at
	else:
		var f := "res://assets/ui/icons/%s.png" % key
		if ResourceLoader.exists(f): t = load(f)
	_icons[key] = t
	return t

static func unit_icon(civ: String, type: String, tier_name: String = "") -> Texture2D:
	for k in ["u/%s_%s" % [civ, tier_name], "u/%s_%s" % [civ, type], "u/britons_%s" % type]:
		if k.ends_with("_"): continue
		var t := icon(k)
		if t != null: return t
	return icon(type)

static func building_icon(civ: String, type: String) -> Texture2D:
	var t := icon("b/%s_%s" % [D.REGION.get(civ, "western"), type])
	if t == null: t = icon("b/western_%s" % type)
	return t if t != null else icon(type)

static func cost_text(cost: Dictionary) -> String:
	var parts := []
	for k in ["food", "wood", "gold", "stone"]:
		if cost.get(k, 0) > 0: parts.append("%d%s" % [cost[k], k[0].to_upper()])
	return " ".join(parts)

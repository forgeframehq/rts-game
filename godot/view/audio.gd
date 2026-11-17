extends Node
## Sound: effects from the rules' G.sound signal, and music on two decks that cross-fade.
## Peaceful tracks open on the player's dynasty theme, the battle theme takes over while the player fights.

const POOL := 10
var man: Dictionary = {}
var enabled := true
var music_on := true
var listener := Vector2(-1, -1)      # the ground point at the middle of the screen
var _players: Array = []
var _next := 0
var _last := {}
var _decks: Array = []
var _cur := 0
var _mood := ""
var _battle_until := 0.0
var _queue: Array = []
var _cache := {}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var f := "res://assets/sound/manifest.json"
	if FileAccess.file_exists(f): man = JSON.parse_string(FileAccess.get_file_as_string(f))
	for i in POOL:
		var p := AudioStreamPlayer.new(); add_child(p); _players.append(p)
	for i in 2:
		var d := AudioStreamPlayer.new(); d.volume_db = -60; add_child(d); _decks.append(d)
		d.finished.connect(_on_track_end.bind(i))
	G.sound.connect(_on_sound)
	G.fighting.connect(func(): _battle_until = Time.get_ticks_msec() / 1000.0 + 25.0)

func _stream(path: String) -> AudioStream:
	if not _cache.has(path):
		var full := "res://assets/sound/" + path
		_cache[path] = load(full) if ResourceLoader.exists(full) else null
	return _cache[path]

func _on_sound(key: String, x: float, y: float) -> void:
	if not enabled or not man.has(key): return
	var vol := 0.0
	if x >= 0 and listener.x >= 0:
		var d := Vector2(x, y).distance_to(listener)
		if d > 16: return
		vol = -18.0 * clampf((d - 5.0) / 11.0, 0.0, 1.0)
	var now := Time.get_ticks_msec()
	if now - _last.get(key, -9999) < 90: return      # a battle must not stack the same clang twenty times
	_last[key] = now
	var list: Array = man[key]
	var s := _stream(list[randi() % list.size()])
	if s == null: return
	var p: AudioStreamPlayer = _players[_next]
	_next = (_next + 1) % POOL
	p.stream = s; p.volume_db = vol - 4.0; p.pitch_scale = randf_range(0.94, 1.06)
	p.play()

func ui(key: String) -> void:
	_on_sound(key, -1, -1)

## "menu", "match" or "" (silence)
func set_scene(mood: String, civ: String = "") -> void:
	if mood == "menu": _play_list("menu", man.get("menuMusic", []))
	elif mood == "match":
		var list: Array = []
		for i in [1, 2]:
			if ResourceLoader.exists("res://assets/sound/music/peaceful_%s_%d.mp3" % [civ, i]): list.append("peaceful_%s_%d.mp3" % [civ, i])
		var rest: Array = man.get("music", []).duplicate()
		rest.shuffle()
		_play_list("peace", list + rest)
	else:
		_mood = ""
		for d in _decks: _fade(d, -60.0, true)

func _play_list(mood: String, list: Array) -> void:
	if _mood == mood: return
	_mood = mood; _queue = list.duplicate()
	_next_track()

func _next_track() -> void:
	if _queue.is_empty() or not music_on: return
	var name_: String = _queue.pop_front()
	_queue.append(name_)
	var s := _stream("music/" + name_)
	if s == null: return
	_fade(_decks[_cur], -60.0, true)
	_cur = 1 - _cur
	var d: AudioStreamPlayer = _decks[_cur]
	d.stream = s; d.volume_db = -60.0; d.play()
	_fade(d, -9.0, false)

func _fade(d: AudioStreamPlayer, to: float, stop: bool) -> void:
	var tw := create_tween()
	tw.tween_property(d, "volume_db", to, 1.6)
	if stop: tw.tween_callback(d.stop)

func _on_track_end(i: int) -> void:
	if i == _cur: _next_track()

func _process(_dt: float) -> void:
	if _mood != "peace" and _mood != "battle": return
	var fight := Time.get_ticks_msec() / 1000.0 < _battle_until
	if fight and _mood == "peace":
		var saved := _queue
		_mood = ""; _play_list("battle", man.get("battleMusic", []))
		set_meta("peace", saved)
	elif not fight and _mood == "battle":
		_mood = ""; _play_list("peace", get_meta("peace", man.get("music", [])))

func set_music(on: bool) -> void:
	music_on = on
	if not on:
		for d in _decks: _fade(d, -60.0, true)
	else:
		var m := _mood
		_mood = ""
		if m == "menu": set_scene("menu")

extends Node
## Sound: effects from the rules' G.sound signal, and music on two decks that cross-fade.
## Peaceful tracks open on the player's dynasty theme, the battle theme takes over while the player fights.

const POOL := 12
const GAP := {"chop": 260, "mine": 300, "farm": 420, "build": 260}
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
var _tw: Array = [null, null]
var _peace: Array = []
var _civ := ""
var _quiet := 0.0

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
	if now - _last.get(key, -9999) < GAP.get(key, 90): return      # a battle must not stack the same clang twenty times
	_last[key] = now
	var list: Array = man[key]
	var s := _stream(list[randi() % list.size()])
	if s == null: return
	var p: AudioStreamPlayer = _players[_next]
	_next = (_next + 1) % POOL
	p.stream = s; p.volume_db = vol - (9.0 if GAP.has(key) else 4.0); p.pitch_scale = randf_range(0.94, 1.06)
	p.play()

func ui(key: String) -> void:
	_on_sound(key, -1, -1)

## "menu", "match" or "" (silence)
func set_scene(mood: String, civ: String = "") -> void:
	_civ = civ
	if mood == "menu": _play_list("menu", man.get("menuMusic", []))
	elif mood == "match":
		_battle_until = 0.0
		var list: Array = []
		for i in [1, 2]:
			if ResourceLoader.exists("res://assets/sound/music/peaceful_%s_%d.mp3" % [civ, i]): list.append("peaceful_%s_%d.mp3" % [civ, i])
		var rest: Array = man.get("music", []).duplicate()
		rest.shuffle()
		_peace = list + rest
		_play_list("peace", _peace)
	else:
		_mood = ""
		for i in 2: _fade(i, -60.0, true)

func _play_list(mood: String, list: Array) -> void:
	if _mood == mood and _decks[_cur].playing: return
	_mood = mood; _queue = list.duplicate()
	_next_track()

func _next_track() -> void:
	if _queue.is_empty() or not music_on: return
	var name_: String = _queue.pop_front()
	_queue.append(name_)
	var s := _stream("music/" + name_)
	if s == null: return
	_fade(_cur, -60.0, true)
	_cur = 1 - _cur
	var d: AudioStreamPlayer = _decks[_cur]
	d.stream = s; d.volume_db = -60.0; d.play()
	_fade(_cur, -9.0, false)

## One fade per deck at a time. An older fade-out left running used to reach its end and stop
## the deck after a new track had started on it, which is how a match could play with no music.
func _fade(i: int, to: float, stop: bool) -> void:
	if _tw[i] != null and _tw[i].is_valid(): _tw[i].kill()
	var d: AudioStreamPlayer = _decks[i]
	if stop and not d.playing:
		d.volume_db = -60.0; return
	var tw := create_tween()
	_tw[i] = tw
	tw.tween_property(d, "volume_db", to, 1.6)
	if stop: tw.tween_callback(d.stop)

func _on_track_end(i: int) -> void:
	if i == _cur: _next_track()

func _process(dt: float) -> void:
	if _mood != "peace" and _mood != "battle": return
	var fight := Time.get_ticks_msec() / 1000.0 < _battle_until
	if fight and _mood == "peace":
		_peace = _queue.duplicate()
		_play_list("battle", man.get("battleMusic", []))
	elif not fight and _mood == "battle":
		_play_list("peace", _peace if not _peace.is_empty() else man.get("music", []))
	# a watchdog: music is on, a mood is set and nothing is sounding, so start the next track
	_quiet = 0.0 if (_decks[_cur].playing or not music_on) else _quiet + dt
	if _quiet > 2.5:
		_quiet = 0.0; _next_track()

func set_music(on: bool) -> void:
	music_on = on
	if not on:
		for i in 2: _fade(i, -60.0, true)
	elif _mood != "": _next_track()

extends Node
## Game data: dynasties, units, buildings, techs. Loaded from data/gamedata.json, which
## tools/export_godot_data.mjs writes from js/data.js so both editions share one set of numbers.

var TW := 64
var TH := 32
var PALETTE: Array = []
var ROYALS: Dictionary = {}
var CIVS: Dictionary = {}
var UNITS: Dictionary = {}
var BUILDINGS: Dictionary = {}
var AGES: Array = []
var BUILD_AGE: Dictionary = {}
var UPGRADES: Dictionary = {}
var TECHS: Dictionary = {}
var UNIT_AGE: Dictionary = {}
var VIL_BUILDS = null
var GATHER_PACE := 1.6
var RES: Dictionary = {}
var REGION: Dictionary = {}
var CIV_LOOK: Dictionary = {}
var CARRY := 10
var FARM_RATE := 0.5
var START_RES: Dictionary = {}
var RES_PRESETS: Dictionary = {}
var MAP_SIZES: Dictionary = {}
var raw: Dictionary = {}

func _init() -> void:
	var txt := FileAccess.get_file_as_string("res://data/gamedata.json")
	raw = _ints(JSON.parse_string(txt))
	TW = raw.TW; TH = raw.TH
	PALETTE = raw.PALETTE; ROYALS = raw.ROYALS; CIVS = raw.CIVS; UNITS = raw.UNITS
	BUILDINGS = raw.BUILDINGS; AGES = raw.AGES; BUILD_AGE = raw.BUILD_AGE
	UPGRADES = raw.UPGRADES; TECHS = raw.TECHS; UNIT_AGE = raw.UNIT_AGE
	VIL_BUILDS = raw.VIL_BUILDS; GATHER_PACE = raw.GATHER_PACE; RES = raw.RES
	REGION = raw.REGION; CIV_LOOK = raw.CIV_LOOK; CARRY = raw.CARRY
	FARM_RATE = raw.FARM_RATE; START_RES = raw.START_RES; RES_PRESETS = raw.RES_PRESETS
	MAP_SIZES = raw.MAP_SIZES

## JSON gives every number as a float; whole numbers become ints so sizes and counts loop cleanly.
func _ints(v):
	if v is float:
		return int(v) if v == floorf(v) and absf(v) < 1e15 else v
	if v is Array:
		for i in v.size(): v[i] = _ints(v[i])
	elif v is Dictionary:
		for k in v.keys(): v[k] = _ints(v[k])
	return v

func mods(civ: String) -> Dictionary:
	return CIVS[civ].mods

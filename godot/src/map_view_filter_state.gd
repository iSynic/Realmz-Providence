extends RefCounted

signal changed
const DEFAULTS := {"realTiles":true,"coordinates":false,"secrets":false,"combatClearing":false,"actionPoints":true,"randomRectangles":false,"playerMaps":false,"smooth":false}
var identity := ""
var flags: Dictionary = DEFAULTS.duplicate()
var entries := {"randomRectangles":[],"playerMaps":[]}
var selected := {"randomRectangles":{},"playerMaps":{}}


func set_context(map_identity: String, rectangles: Array, footprints: Array) -> void:
	var replaced := identity!=map_identity
	identity=map_identity
	entries={"randomRectangles":rectangles.duplicate(true),"playerMaps":footprints.duplicate(true)}
	for group in entries:
		entries[group].sort_custom(func(a,b): return _entry_id(group,a)<_entry_id(group,b))
		var previous: Dictionary = selected[group]
		var next := {}
		for entry: Dictionary in entries[group]:
			var key := str(entry.identity)
			if replaced or previous.has(key): next[key]=true
		selected[group]=next
		if entries[group].is_empty(): flags[group]=false
	changed.emit()


func _entry_id(group: String, entry: Dictionary) -> int:
	return int(entry.nativeId) if group=="playerMaps" else int(str(entry.identity).get_slice(":rect:",1))


func set_flag(key: String, enabled: bool) -> void:
	if entries.has(key):
		selected[key]={}
		if enabled:
			for entry: Dictionary in entries[key]: selected[key][str(entry.identity)]=true
		flags[key]=enabled and not selected[key].is_empty()
	else: flags[key]=enabled
	changed.emit()


func set_entry(group: String, key: String, enabled: bool) -> void:
	if not entries[group].any(func(entry): return str(entry.identity)==key): return
	if enabled: selected[group][key]=true
	else: selected[group].erase(key)
	flags[group]=not selected[group].is_empty()
	changed.emit()


func visible_entries(group: String) -> Array:
	return entries[group].filter(func(entry): return selected[group].has(str(entry.identity))) if flags[group] else []


func set_all(enabled: bool) -> void:
	for key in flags: set_flag(key,enabled)


func read_navigation_state() -> Dictionary:
	return {"identity":identity,"flags":flags.duplicate(),"selected":selected.duplicate(true)}


func restore_navigation_state(state: Dictionary) -> bool:
	if str(state.get("identity",""))!=identity: return false
	for key in DEFAULTS: flags[key]=bool(state.get("flags",{}).get(key,DEFAULTS[key]))
	for group in entries:
		selected[group]={}
		for entry: Dictionary in entries[group]:
			if state.get("selected",{}).get(group,{}).has(str(entry.identity)): selected[group][str(entry.identity)]=true
		flags[group]=flags[group] and not selected[group].is_empty()
	changed.emit()
	return true

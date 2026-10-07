extends RefCounted

signal changed

var baseline: Dictionary = {}
var record: Dictionary = {}
var revision := -1
var creation := false
var copy_source: Variant = null
var generation := 0
var _gesture: Dictionary = {}


func bind(document: Dictionary) -> void:
	generation += 1
	revision = int(document.get("revision", -1))
	baseline = document.get("battle", {}).duplicate(true)
	record = baseline.duplicate(true)
	creation = false
	copy_source = null
	_gesture.clear()
	changed.emit()


func allocate(result: Dictionary) -> void:
	bind({"revision": result.revision, "battle": result.allocation.battle})
	creation = true
	copy_source = result.allocation.get("copySource")
	changed.emit()


func has_changes() -> bool:
	return creation or record != baseline


func edit(field: String, value: Variant) -> void:
	if record.is_empty(): return
	var current: Variant = record.get(field)
	var numbers: bool = (current is int or current is float) and (value is int or value is float)
	if (numbers or typeof(current) == typeof(value)) and current == value: return
	record[field] = value
	changed.emit()


func begin_gesture() -> void:
	if _gesture.is_empty(): _gesture = record.duplicate(true)


func finish_gesture() -> void:
	_gesture.clear()


func cancel_gesture() -> void:
	if _gesture.is_empty(): return
	record = _gesture.duplicate(true)
	_gesture.clear()
	changed.emit()


func edit_cell(slot: int, value: int) -> void:
	if record.is_empty() or slot < 0 or slot >= 169 or record.grid[slot] == value: return
	record.grid[slot] = value
	changed.emit()


func discard() -> void:
	bind({"revision": revision, "battle": {} if creation else baseline})


func submission() -> Dictionary:
	return {"expectedRevision": revision, "battle": record.duplicate(true),
		"creation": creation, "copySource": copy_source}


func issue() -> String:
	if record.is_empty(): return "Select or create a Battle."
	var distance: Variant = record.get("distance")
	if not (distance is int or distance is float) or int(distance) != distance or distance < -128 or distance > 127:
		return "Distance: enter a whole number from −128 to 127."
	if record.grid.filter(func(value): return int(value) != 0).size() > 100:
		return "Grid: remove occupants to meet the 100-anchor limit."
	return ""

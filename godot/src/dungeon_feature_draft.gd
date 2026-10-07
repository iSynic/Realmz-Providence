extends RefCounted

signal changed

var identity := ""
var revision := -1
var generation := 0
var edit_sequence := 0
var cells: Array = []
var features: Dictionary = {}
var baseline: Dictionary = {}


func bind_selection(document: Dictionary) -> void:
	generation += 1
	edit_sequence = 0
	identity = str(document.get("mapIdentity", ""))
	revision = int(document.get("revision", -1))
	cells.clear()
	for cell: Dictionary in document.get("cells", []):
		cells.append({"x": int(cell.x), "y": int(cell.y)})
	features.clear()
	for feature: Dictionary in document.get("features", []):
		features[str(feature.primitive)] = feature.get("enabled")
	baseline = features.duplicate(true)
	changed.emit()


func bind_cell(document: Dictionary) -> void:
	var selection := document.duplicate(true)
	selection.cells = [{"x": int(document.get("x", -1)), "y": int(document.get("y", -1))}]
	selection.features = []
	for policy: Dictionary in document.get("primitivePolicies", []):
		if str(policy.get("writerStatus", "")) == "writer-safe-primitive":
			selection.features.append({"primitive": str(policy.primitive), "enabled": policy.enabled})
	bind_selection(selection)


func edit(primitive: String, enabled: bool) -> void:
	if not features.has(primitive) or features[primitive] == enabled: return
	features[primitive] = enabled
	edit_sequence += 1
	changed.emit()


func clear_to_wall() -> void:
	if features.is_empty(): return
	for primitive: String in features:
		features[primitive] = primitive == "wall"
	edit_sequence += 1
	changed.emit()


func has_changes() -> bool:
	return features != baseline


func changes() -> Array:
	var result: Array = []
	for primitive: String in features:
		if features[primitive] != baseline.get(primitive):
			result.append({"primitive": primitive, "enabled": features[primitive]})
	return result


func discard() -> void:
	features = baseline.duplicate(true)
	edit_sequence += 1
	changed.emit()


func submitted() -> Dictionary:
	return {"identity": identity, "expectedRevision": revision,
		"edit": {"cells": cells.duplicate(true), "changes": changes()}}


func clear() -> void:
	bind_selection({})

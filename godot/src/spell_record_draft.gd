extends RefCounted

signal changed
var document: Dictionary = {}
var definition: Dictionary = {}
var baseline: Dictionary = {}
var allocation: Variant = null
var copy_source: Variant = null
var revision := -1
var generation := 0
var edit_sequence := 0
var editable := false


func bind_document(value: Dictionary) -> void:
	generation += 1
	edit_sequence = 0
	document = value.duplicate(true)
	definition = value.get("definition", {}).duplicate(true)
	baseline = definition.duplicate(true)
	allocation = null
	copy_source = null
	revision = int(value.get("revision", -1))
	editable = bool(value.get("editable", false))
	changed.emit()


func begin_allocation(value: Dictionary, project_revision: int) -> void:
	generation += 1
	edit_sequence = 0
	definition = value.definition.duplicate(true)
	baseline = {}
	allocation = value.get("allocation")
	copy_source = value.get("copySource")
	revision = project_revision
	editable = true
	document = {"definition": definition.duplicate(true), "scope": "scenario", "editable": true,
		"revision": project_revision, "uses": [], "usedBy": 0}
	changed.emit()


func edit_field(field: String, value: Variant) -> void:
	if not editable or definition.is_empty() or definition.get(field) == value: return
	definition[field] = value
	edit_sequence += 1
	changed.emit()


func replace_definition(value: Dictionary) -> void:
	if not editable or value.get("id") != definition.get("id"): return
	definition = value.duplicate(true)
	edit_sequence += 1
	changed.emit()


func dirty() -> bool:
	return editable and (allocation != null or definition != baseline)


func submitted() -> Dictionary:
	return {"recordIndex": int(definition.get("recordIndex", -1)), "definition": definition.duplicate(true),
		"allocation": allocation, "copySource": copy_source}


func discard() -> void:
	if allocation != null: clear()
	else:
		definition = baseline.duplicate(true)
		edit_sequence += 1
		changed.emit()


func clear() -> void:
	generation += 1
	edit_sequence = 0
	document.clear()
	definition.clear()
	baseline.clear()
	allocation = null
	copy_source = null
	revision = -1
	editable = false
	changed.emit()

class_name ProvidenceDivinityHelpCatalog
extends RefCounted

const MANUAL_PATH := "res://data/divinity_help/manual.json"
const OPCODES_PATH := "res://data/divinity_help/opcodes.json"
const LAYOUT_PATH := "res://data/divinity_help/pages/layout.json"

var sections: Array = []
var entries: Array = []
var by_code: Dictionary = {}
var layouts: Dictionary = {}


func load_bundled() -> String:
	var manual := _read_json(MANUAL_PATH)
	if manual.is_empty():
		return "The bundled Divinity Manual could not be read."
	if int(manual.get("sectionCount", 0)) != 38:
		return "The bundled Divinity Manual is incomplete."
	var opcode_help := _read_json(OPCODES_PATH)
	if opcode_help.is_empty():
		return "The bundled Code Helper could not be read."
	sections = (manual.get("sections", []) as Array).duplicate(true)
	var rendered := _read_json(LAYOUT_PATH)
	if int(rendered.get("schemaVersion", 0)) != 1 or rendered.get("pages", []).size() != 38:
		return "The bundled Divinity Manual layout is incomplete."
	layouts.clear()
	for layout: Dictionary in rendered.pages:
		layouts[int(layout.page)] = layout
	entries = (opcode_help.get("entries", []) as Array).duplicate(true)
	by_code.clear()
	for value in entries:
		var entry := value as Dictionary
		for code in entry.get("codes", []) as Array:
			by_code[int(code)] = entry
	return ""


func entry_for_code(code: int) -> Dictionary:
	return (by_code.get(abs(code), {}) as Dictionary).duplicate(true)


func matching_entries(query: String) -> Array:
	var needle := query.strip_edges().to_lower()
	if needle.is_empty():
		return entries.duplicate()
	var matches: Array = []
	for value in entries:
		var entry := value as Dictionary
		var haystack := "%s %s %s %s %s" % [
			str(entry.get("codes", [])), str(entry.get("title", "")),
			str(entry.get("summary", "")), str(entry.get("use", "")),
			str(entry.get("fullText", ""))]
		if haystack.to_lower().contains(needle):
			matches.append(entry)
	return matches


func matching_sections(query: String) -> Array:
	var needle := query.strip_edges().to_lower()
	if needle.is_empty():
		return sections.duplicate()
	return sections.filter(func(value):
		var section := value as Dictionary
		return ("%s %s %s" % [section.get("page", ""), section.get("title", ""), section.get("text", "")]).to_lower().contains(needle))


func _read_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed as Dictionary if parsed is Dictionary else {}

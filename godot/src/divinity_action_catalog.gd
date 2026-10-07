class_name ProvidenceDivinityActionCatalog
extends RefCounted

var entries: Array = []
var _help: ProvidenceDivinityHelpCatalog


func configure(definitions: Array, help: ProvidenceDivinityHelpCatalog) -> void:
	_help = help
	entries.clear()
	var documented_codes := {}
	for value in definitions:
		var action := (value as Dictionary).duplicate(true)
		action["manual"] = help.entry_for_code(int(action.get("opcode", 0)))
		entries.append(action)
		documented_codes[abs(int(action.get("opcode", 0)))] = true
	for value in help.entries:
		var manual := value as Dictionary
		var code := int(manual.get("primaryCode", 0))
		if documented_codes.has(code): continue
		entries.append({"identity": "", "opcode": code, "label": manual.get("title", ""),
			"category": "Reference only", "selectable": false, "manual": manual})


func categories() -> Array[String]:
	var result: Array[String] = []
	for value in entries:
		var category := str((value as Dictionary).get("category", ""))
		if not category.is_empty() and not result.has(category): result.append(category)
	return result


func availability(entry: Dictionary, script_kind: String) -> Dictionary:
	if not bool(entry.get("selectable", false)) or str(entry.get("identity", "")).is_empty():
		return {"available": false, "reason": "Reference only · this manual entry has no authoring action."}
	var contexts := entry.get("availabilityByScriptKind", {}) as Dictionary
	if script_kind.is_empty() or not contexts.has(script_kind):
		return {"available": false, "reason": "No current script context is available for selection."}
	return (contexts[script_kind] as Dictionary).duplicate(true)


func matching(query: String, category: String, show_unavailable: bool, script_kind: String) -> Array:
	var needle := query.strip_edges().to_lower()
	var exact: Array = []
	var available: Array = []
	var unavailable: Array = []
	for value in entries:
		var entry := value as Dictionary
		var eligibility := availability(entry, script_kind)
		if not show_unavailable and not bool(eligibility.get("available", false)): continue
		if not category.is_empty() and str(entry.get("category", "")) != category: continue
		var code_match := needle.is_valid_int() and int(entry.get("opcode", 0)) == needle.to_int()
		if not needle.is_empty() and not code_match and not _search_text(entry).contains(needle): continue
		if code_match: exact.append(entry)
		elif bool(eligibility.get("available", false)): available.append(entry)
		else: unavailable.append(entry)
	return exact + available + unavailable


func entry_for_identity(identity: String) -> Dictionary:
	for value in entries:
		if str((value as Dictionary).get("identity", "")) == identity: return value as Dictionary
	return {}


func _search_text(entry: Dictionary) -> String:
	var manual := entry.get("manual", {}) as Dictionary
	return ("%s %s %s %s %s %s %s" % [entry.get("opcode", ""), entry.get("label", ""),
		entry.get("category", ""), entry.get("description", ""), manual.get("title", ""),
		str(manual.get("codes", [])), manual.get("fullText", "")]).to_lower()


extends "res://src/monster_record_draft.gd"

var preferred_id: Variant = null


func clear() -> void:
	super.clear()
	preferred_id = null


func has_changes() -> bool:
	return super.has_changes() or preferred_id != null


func edit_preferred_id(value: Variant) -> void:
	preferred_id = null if values_match(value, document.get("preferredScenarioMonsterId")) else value
	changed.emit()


func submission() -> Dictionary:
	var result := {"identity": str(document.get("entry", {}).get("identity", "")), "fields": fields.duplicate(true)}
	if description != null: result["description"] = description
	if normal_not_on_menu != null: result["notOnMenu"] = normal_not_on_menu
	if preferred_id != null: result["preferredScenarioMonsterId"] = preferred_id
	return result


func current_document() -> Dictionary:
	var result := super.current_document()
	if preferred_id != null: result["preferredScenarioMonsterId"] = preferred_id
	return result


func accept(submitted: Dictionary, saved: Dictionary) -> void:
	var retained: Variant = preferred_id if not values_match(preferred_id, submitted.get("preferredScenarioMonsterId")) else null
	var adapted := submitted.duplicate(true)
	if adapted.has("notOnMenu"): adapted["normalNotOnMenu"] = adapted.notOnMenu
	super.accept(adapted, saved)
	if retained != null: edit_preferred_id(retained)


func retained_values() -> Dictionary:
	var result := super.retained_values()
	if preferred_id != null: result["preferredScenarioMonsterId"] = preferred_id
	return result


func comparison_value(source: Dictionary, path: String) -> Variant:
	return source.get("preferredScenarioMonsterId") if path == "preferredScenarioMonsterId" else super.comparison_value(source, path)


func restore_retained(path: String, value: Variant) -> void:
	if path == "preferredScenarioMonsterId": edit_preferred_id(value)
	else: super.restore_retained(path, value)

extends VBoxContainer

var _identity := ""


func _ready() -> void:
	clear_projection()


func set_projection(result: Dictionary, replacement_id := -1) -> bool:
	clear_projection()
	var entry: Dictionary = result.get("entry", {})
	if str(entry.get("ownership", "")) != "custom" or bool(result.get("protected", true)) or str(entry.get("identity", "")).is_empty():
		return false
	_identity = str(entry.identity)
	$RecordBody.set_library_template(entry.get("template", {}), str(entry.get("description", "")))
	$Ownership.text = "%s · Custom Library Entry · read-only" % str(entry.get("label", ""))
	$Actions/ReplaceScenario.visible = replacement_id >= 0
	$Actions/ReplaceScenario.text = "Replace Scenario %d" % replacement_id
	var origin: Dictionary = entry.get("origin", {})
	$Actions/RemoveEntry.text = "Restore Scrapbook Default" if str(origin.get("kind", "")) == "built-in-override" else "Delete Library Entry"
	return true


func clear_projection() -> void:
	_identity = ""
	$RecordBody.set_library_template({}, "")
	$Ownership.text = "Custom Library Entry · read-only"
	$Actions/ReplaceScenario.hide()
	$Actions/RemoveEntry.text = "Delete Library Entry"


func set_appearance(appearance: Dictionary) -> void:
	$RecordBody.set_appearance(appearance)


func current_identity() -> String:
	return _identity

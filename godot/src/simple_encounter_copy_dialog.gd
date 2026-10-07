class_name ProvidenceSimpleEncounterCopyDialog
extends Window

signal source_requested(identity: String)
signal accepted(source_document: Dictionary, sections: Dictionary)

var _items: Array = []
var _source_document: Dictionary = {}
var _origin: Control
var _kind := "Simple"


func _ready() -> void:
	close_requested.connect(cancel)
	%Source.item_selected.connect(_select_source)
	%Cancel.pressed.connect(cancel)
	%Replace.pressed.connect(_accept)


func open_for(target_identity: String, summaries: Array, origin: Control, kind: String = "Simple") -> void:
	_origin = origin
	_kind = kind
	title = "Copy From %s Encounter" % kind
	_items.clear()
	%Source.clear()
	for value in summaries:
		var summary := value as Dictionary
		if str(summary.get("identity", "")) == target_identity:
			continue
		_items.append(summary.duplicate(true))
		%Source.add_item("%03d  %s" % [int(summary.get("nativeId", 0)), str(summary.get("label", "Unnamed encounter"))])
	%Target.text = "CURRENT %s DRAFT  ·  %s" % [kind.to_upper(), target_identity]
	%PromptSettings.button_pressed = true
	%Responses.button_pressed = true
	%Programs.button_pressed = true
	_source_document.clear()
	_update_preview()
	popup_centered_clamped(Vector2i(760, 620), 0.85)
	if not _items.is_empty():
		%Source.select(0)
		_select_source(0)


func set_source_document(result: Dictionary) -> void:
	var identity := str((result.get("encounter", {}) as Dictionary).get("identity", ""))
	if identity != _selected_identity():
		return
	_source_document = result.duplicate(true)
	_update_preview()


func _select_source(index: int) -> void:
	_source_document.clear()
	_update_preview()
	if index >= 0 and index < _items.size():
		source_requested.emit(str((_items[index] as Dictionary).get("identity", "")))


func _selected_identity() -> String:
	var index: int = %Source.selected
	return str((_items[index] as Dictionary).get("identity", "")) if index >= 0 and index < _items.size() else ""


func _update_preview() -> void:
	var encounter := _source_document.get("encounter", {}) as Dictionary
	var loaded := not encounter.is_empty()
	%Replace.disabled = not loaded
	if not loaded:
		%Preview.text = "Choose a source to preview its prompt, responses, and result programs."
		return
	var texts := encounter.get("texts", []) as Array
	var nonempty_responses := 0
	for text in texts:
		if not str(text).is_empty(): nonempty_responses += 1
	var populated_steps := (_source_document.get("steps", []) as Array).size()
	var response_total := 9 if _kind == "Complex" else 4
	%Preview.text = "PROMPT\n%s\n\nSOURCE CONTENT\n%d of %d text fields authored\n%d of 32 result steps populated" % [
		str(_source_document.get("promptPreview", "No readable prompt preview")), nonempty_responses, response_total, populated_steps]


func _accept() -> void:
	if _source_document.is_empty(): return
	var sections := {"promptSettings": %PromptSettings.button_pressed,
		"responses": %Responses.button_pressed, "programs": %Programs.button_pressed}
	if not sections.values().has(true):
		%Status.text = "Select at least one section to replace."
		return
	hide()
	accepted.emit(_source_document.duplicate(true), sections)
	_restore_origin()


func cancel() -> void:
	hide()
	_restore_origin()


func _restore_origin() -> void:
	if is_instance_valid(_origin): _origin.grab_focus()

extends ConfirmationDialog

var _bridge
var _revision := -1
var item_opener: Callable
var _operations: ProvidenceEditorOperation
var _generation := 0


func _ready() -> void:
	canceled.connect(func(): _generation += 1)
	%CopyNumber.value_changed.connect(_number_changed)
	%CheckCopyNumber.pressed.connect(check_number)
	%ViewUses.pressed.connect(func(): _load_uses(0))
	%MoreUses.pressed.connect(func(): _load_uses(%ItemUses.item_count))
	%ItemUses.item_selected.connect(func(_index): %OpenItem.disabled = not item_opener.is_valid())
	%ItemUses.item_activated.connect(_open_item)
	%OpenItem.pressed.connect(func():
		if not %ItemUses.get_selected_items().is_empty():
			await _open_item(%ItemUses.get_selected_items()[0]))


func begin(bridge, revision: int, incoming: Texture2D, number: int, minimum: int = -32768) -> void:
	_generation += 1
	_bridge = bridge
	_revision = revision
	title = "Copy to Scenario"
	ok_button_text = "Copy"
	%CopyNumber.min_value = minimum
	%CopyNumber.value = number
	%CopyIncoming.texture = incoming
	$Content/Explanation.text = "32 × 32 icon · unused nonzero picture number required." if minimum == 1 else "Unused nonzero picture number required."
	popup_centered()
	await check_number()
	get_cancel_button().grab_focus()


func picture_number() -> int:
	return int(%CopyNumber.value)


func _number_changed(_value: float) -> void:
	_generation += 1
	_clear_uses()
	get_ok_button().disabled = true
	%CopyExisting.texture = null
	%CopyExistingName.text = "Check this number before copying."


func check_number() -> bool:
	var response := await check_number_response()
	return response.get("ok", false) and response.get("result", {}).get("available", false)


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations


func cancel_selection() -> void:
	_generation += 1
	_bridge = null
	hide()


func check_number_response(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await _run("Check picture number", _check_number, operation)


func _check_number(operation: ProvidenceEditorOperation) -> Dictionary:
	_clear_uses()
	get_ok_button().disabled = true
	%CopyExisting.texture = null
	if _bridge == null:
		return {"ok": false, "error": "Open a project before copying artwork."}
	var generation := _generation
	var response := await _request(operation, "artwork.check-copy-number", {"resourceId": picture_number(), "expectedRevision": _revision})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation: return _stale()
	if not bool(response.get("ok", false)):
		%CopyExistingName.text = str(response.get("error", "The number could not be checked."))
		return response
	var result: Dictionary = response.get("result", {})
	if bool(result.get("available", false)):
		%CopyExistingName.text = "Available. Nothing will be replaced."
		get_ok_button().disabled = false
		return response
	var existing: Dictionary = result.get("existing", {})
	%ViewUses.disabled = int(result.get("itemUses", 0)) == 0
	%CopyExistingName.text = "%s · %d item uses\nChoose another number. Nothing was replaced." % [str(existing.get("label", "Existing artwork")), int(result.get("itemUses", 0))]
	var method := str(existing.get("previewCommand", ""))
	if not method.is_empty() and not bool(existing.get("ambiguous", false)):
		var preview := await _request(operation, method, {"identity": existing.identity})
		if preview.get("outcomeUnknown", false): return preview
		if generation != _generation: return _stale()
		%CopyExisting.texture = preload("res://src/item_artwork_lookup.gd").decode_texture(preview)
	if %CopyExisting.texture == null:
		%CopyExistingName.text += "\nPreview unavailable."
	return response


func _run(label: String, workflow: Callable, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project before copying artwork."}
	if _operations == null: return await workflow.call(null)
	return await _operations.run_workflow(_bridge, label, workflow, borrowed)


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return _bridge.request(method, params) if operation == null else await operation.request(method, params)


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The copy dialog changed while checking artwork."}


func _clear_uses() -> void:
	%OpenItem.disabled = true
	%OpenItem.hide()
	%ViewUses.disabled = true
	%ItemUses.clear()
	%ItemUses.hide()
	%MoreUses.hide()


func _load_uses(offset: int) -> void:
	await _run("Load artwork uses", _load_uses_workflow.bind(offset))


func _load_uses_workflow(operation: ProvidenceEditorOperation, offset: int) -> Dictionary:
	var generation := _generation
	var response := await _request(operation, "artwork.item-uses", {"resourceId": picture_number(), "expectedRevision": _revision, "offset": offset, "limit": 32})
	if response.get("outcomeUnknown", false): return response
	if generation != _generation: return _stale()
	if not bool(response.get("ok", false)):
		_clear_uses()
		get_ok_button().disabled = true
		%CopyExistingName.text = str(response.get("error", "Item uses could not be loaded."))
		return response
	if offset == 0:
		%ItemUses.clear()
	var result: Dictionary = response.get("result", {})
	for item: Dictionary in (result.get("items", []) as Array).slice(0, 32):
		var label := str(item.get("name", "")).strip_edges()
		if label.is_empty():
			label = str(item.get("unidentifiedName", "")).strip_edges()
		if label.is_empty():
			label = "Unnamed item"
		var index: int = %ItemUses.add_item("%d · %s" % [int(item.classicId), label])
		%ItemUses.set_item_metadata(index, item.identity)
	%ItemUses.show()
	%OpenItem.show()
	%OpenItem.tooltip_text = "" if item_opener.is_valid() else "Item-editor navigation is not connected in this host."
	%MoreUses.visible = bool(result.get("truncated", false))
	return response


func _open_item(index: int) -> void:
	if not item_opener.is_valid() or index < 0 or index >= %ItemUses.item_count:
		return
	var identity := str(%ItemUses.get_item_metadata(index))
	var generation := _generation
	var response := await _run("Check artwork use", _read_item_uses.bind(index))
	if generation != _generation: return
	if not bool(response.get("ok", false)):
		_clear_uses()
		%CopyExistingName.text = str(response.get("error", "Item uses changed. Reopen this dialog."))
		return
	var rows: Array = response.get("result", {}).get("items", [])
	if not rows.any(func(row): return str(row.get("identity", "")) == identity):
		_clear_uses()
		%CopyExistingName.text = "This item no longer uses the artwork. Reopen this dialog."
		return
	hide()
	item_opener.call(identity)


func _read_item_uses(operation: ProvidenceEditorOperation, index: int) -> Dictionary:
	return await _request(operation, "artwork.item-uses", {"resourceId": picture_number(), "expectedRevision": _revision, "offset": (index / 32) * 32, "limit": 32})


func show_failure(message: String) -> void:
	%CopyExistingName.text = message
	get_ok_button().disabled = true
	call_deferred("popup_centered")

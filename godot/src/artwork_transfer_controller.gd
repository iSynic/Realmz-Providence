extends RefCounted

signal artwork_applied(projection: Dictionary, record_index: int)
signal scenario_changed(projection: Dictionary)
signal status_changed(message: String)
signal picker_closed

var operations: ProvidenceEditorOperation
var _copy: ConfirmationDialog
var _picker: ProvidenceItemArtworkPicker
var _window: Window
var _target: Control
var _read_selection: Callable
var _bridge: RefCounted
var _generation := 0
var _pending: Dictionary = {}
var _copy_for_item := false
var _converted: Texture2D
var _assignment_scope := ""
var _assignment_identity := ""
var _picture_number := 0
var _applying := false


func initialize(copy: ConfirmationDialog, picker: ProvidenceItemArtworkPicker, window: Window, target: Control, read_selection: Callable) -> void:
	_copy = copy
	_picker = picker
	_window = window
	_target = target
	_read_selection = read_selection
	_copy.confirmed.connect(copy_selected)
	_copy.canceled.connect(func():
		if operations == null or not operations.busy: cancel())
	_picker.search_requested.connect(search_items)
	_picker.current_picture_requested.connect(current_picture)
	_picker.apply_requested.connect(apply_artwork)
	_picker.cancelled.connect(close_picker)
	_window.close_requested.connect(close_picker)


func configure_operations(value: ProvidenceEditorOperation) -> void:
	operations = value
	_copy.configure_operations(value)


func attach_session(bridge: RefCounted) -> void:
	if bridge == _bridge: return
	cancel()
	_bridge = bridge


func cancel() -> void:
	_generation += 1
	_pending.clear()
	_assignment_scope = ""
	_assignment_identity = ""
	_converted = null
	_copy.cancel_selection()
	_picker.close_selection()
	_window.hide()


func has_draft() -> bool:
	return _copy.visible or _window.visible


func use_artwork() -> void:
	var selection: Dictionary = _read_selection.call()
	if selection.is_empty() or _bridge == null or operations.busy: return
	if selection.scope == "personal":
		await begin_copy(true)
		return
	_assignment_scope = selection.scope
	_assignment_identity = selection.identity
	if not _target.item.is_empty():
		await apply_artwork(selection.identity, _target.record_index(), _target.revision)
	else:
		_open_picker(selection.texture)


func begin_copy(for_item := false) -> void:
	var selection: Dictionary = _read_selection.call()
	if selection.is_empty() or selection.scope != "personal" or _bridge == null or operations.busy: return
	cancel()
	var generation := _generation
	var response := await operations.run_workflow(_bridge, "Prepare artwork copy", _prepare_copy.bind(selection, generation))
	if generation != _generation or selection != _read_selection.call(): return
	if not response.get("ok", false):
		status_changed.emit(str(response.get("error", "The artwork copy could not be prepared.")))
		return
	_pending = {"identity": selection.identity, "expectedLibraryRevision": selection.libraryRevision, "expectedRevision": int(response.result.revision)}
	_converted = response.texture
	_copy_for_item = for_item
	_assignment_scope = "personal"
	_assignment_identity = selection.identity
	await _copy.begin(_bridge, int(_pending.expectedRevision), _converted, 30126, 1)
	if generation != _generation: return
	if for_item:
		_copy.title = "Use personal artwork in an item"
		_copy.ok_button_text = "Choose Item…" if _target.item.is_empty() else "Apply Artwork"


func _prepare_copy(operation: ProvidenceEditorOperation, selection: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("session.describe")
	if not response.get("ok", false): return response
	if generation != _generation or selection != _read_selection.call(): return _stale()
	var preview := await operation.request("personal-library.preview-icon", {"identity": selection.identity, "expectedLibraryRevision": selection.libraryRevision})
	if not preview.get("ok", false): return preview
	if generation != _generation or selection != _read_selection.call(): return _stale()
	var texture := preload("res://src/item_artwork_lookup.gd").decode_texture(preview)
	if texture == null: return {"ok": false, "error": "The converted artwork could not be previewed."}
	response["texture"] = texture
	return response


func copy_selected() -> void:
	if _pending.is_empty() or _bridge == null or operations.busy: return
	var generation := _generation
	_picture_number = _copy.picture_number()
	var params := _pending.duplicate()
	params["resourceId"] = _picture_number
	if _copy_for_item and not _target.item.is_empty():
		params["recordIndex"] = _target.record_index()
		params["expectedRevision"] = _target.revision
	var response := await operations.run_workflow(_bridge, "Copy artwork to scenario", _copy_workflow.bind(params, generation))
	if generation != _generation: return
	if not response.get("ok", false):
		_present_failure(response)
		if _target.item.is_empty(): _copy.show_failure(str(response.get("error", "Artwork could not be copied.")))
		return
	if response.get("chooseItem", false):
		_copy.hide()
		_open_picker(_converted)
	elif _copy_for_item:
		_copy.hide()
		artwork_applied.emit(response.result, int(params.recordIndex))
	else:
		_copy.hide()
		_pending.clear()
		status_changed.emit("Copied to Scenario Assets. Your library original is unchanged.")
		scenario_changed.emit(response.result)


func _copy_workflow(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var checked: Dictionary = await _copy.check_number_response(operation)
	if not checked.get("ok", false): return checked
	if generation != _generation or not _assignment_matches(): return _stale()
	if not checked.get("result", {}).get("available", false) or params.resourceId != _copy.picture_number():
		return {"ok": false, "error": "Choose and check an available picture number before copying."}
	if not _copy_for_item: return await operation.request("personal-library.copy-icon", params)
	if not params.has("recordIndex"): return {"ok": true, "chooseItem": true}
	if _target.item.is_empty() or params.recordIndex != _target.record_index() or params.expectedRevision != _target.revision: return _stale()
	return await operation.request("personal-library.apply-item-artwork", params)


func _open_picker(texture: Texture2D) -> void:
	_window.title = {"personal": "Use personal artwork in an item", "scenario": "Use scenario artwork in an item", "stock": "Use stock artwork in an item", "supplied": "Use supplied artwork in an item"}[_assignment_scope]
	_window.popup_centered(Vector2i(1120, 540))
	_picker.begin(_assignment_identity, texture)


func close_picker() -> void:
	if _picker.is_pending(): return
	cancel()
	picker_closed.emit()


func search_items(query: String, offset: int, request_id: int) -> void:
	var generation := _generation
	if not await _wait_for_read(generation) or not _picker.accepts_search(request_id): return
	var response := await operations.run_workflow(_bridge, "Search scenario items", func(operation):
		return await operation.request("item.list", {"scope": "scenario", "query": query, "offset": offset, "limit": 32}))
	if generation != _generation: return
	if response.get("ok", false): _picker.receive_items(response.result, request_id)
	else: _picker.receive_failure(str(response.get("error", "Items could not be loaded.")), request_id)


func current_picture(item: Dictionary, request_id: int) -> void:
	var generation := _generation
	if not await _wait_for_read(generation) or not _picker.accepts_preview(request_id): return
	var response := await operations.run_workflow(_bridge, "Read item picture", func(operation):
		return await preload("res://src/item_artwork_lookup.gd").resolve(operation.request, int(item.get("iconId", 0))))
	if generation != _generation or response.get("outcomeUnknown", false): return
	_picker.receive_current_picture(response.get("texture"), request_id)


func _wait_for_read(generation: int) -> bool:
	# Search/preview coalesces by the picker's request identity. Mutations never
	# wait here: their submission must fail immediately when the transport is busy.
	while operations.busy:
		await operations.completed
		await operations.get_tree().process_frame
	return generation == _generation and _bridge != null and not operations.requires_reopen


func apply_artwork(identity: String, record_index: int, revision: int) -> void:
	if _bridge == null or not _assignment_matches() or identity != _assignment_identity: return
	if operations.busy:
		if not _applying: _present_failure({"ok": false, "error": "Wait for the current operation to finish."})
		return
	var methods := {"personal": "personal-library.apply-item-artwork", "supplied": "scenario-item.apply-library-artwork", "stock": "scenario-item.use-stock-artwork", "scenario": "scenario-item.use-scenario-artwork"}
	var params := {"identity": identity, "recordIndex": record_index, "expectedRevision": revision}
	if _assignment_scope == "personal":
		params["expectedLibraryRevision"] = int(_pending.get("expectedLibraryRevision", -1))
		params["resourceId"] = _picture_number
	var generation := _generation
	_applying = true
	var response := await operations.run_workflow(_bridge, "Apply item artwork", func(operation):
		return await operation.request(methods[_assignment_scope], params))
	_applying = false
	if generation != _generation: return
	if not response.get("ok", false):
		_present_failure(response)
		return
	_window.hide()
	_picker.close_selection()
	artwork_applied.emit(response.result, record_index)


func _present_failure(response: Dictionary) -> void:
	var message := str(response.get("error", "Artwork could not be applied."))
	status_changed.emit(message)
	if not _target.item.is_empty():
		status_changed.emit(message + " Cancel and reopen the chooser to review the current item.")
	elif response.get("outcomeUnknown", false):
		_picker.apply_unknown(message)
	else:
		_picker.apply_failed(message, message.contains("Review its current state"))
	if response.get("outcomeUnknown", false): status_changed.emit("Outcome unknown. Reopen the project before applying again.")


func _assignment_matches() -> bool:
	var selection: Dictionary = _read_selection.call()
	return selection.get("identity", "") == _assignment_identity and selection.get("scope", "") == _assignment_scope


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The selected artwork changed while preparing its destination."}

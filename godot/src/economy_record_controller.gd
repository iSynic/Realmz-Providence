class_name ProvidenceEconomyRecordController
extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

var _view: ProvidenceEconomyRecordEditor
var _operations: ProvidenceEditorOperation
var _context: Callable
var _read_bridge: Callable
var _accept_draft: Callable
var _generation := 0
var _item_request := 0
var _item_references: Dictionary = {}
var _loaded_icon_ids: Dictionary = {}
var _reference_revision := -1
var _hydrated_state: Array = []


func initialize(view: ProvidenceEconomyRecordEditor, operations: ProvidenceEditorOperation, context: Callable, read_bridge: Callable, accept_draft: Callable) -> void:
	_view = view
	_operations = operations
	_context = context
	_read_bridge = read_bridge
	_accept_draft = accept_draft
	_view.configure_operations(operations, read_bridge)
	_view.commit_handler = commit
	_view.create_requested.connect(create_record)
	_view.clear_requested.connect(clear_record)
	_view.item_filter_changed.connect(request_items)
	_view.catalog_item_selected.connect(_load_selected_icon)
	# Browser selection and linked returns open through the view, not this controller.
	_view.document_applied.connect(func(_result: Dictionary): request_items())


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project before loading %s." % _view._record_label()}
	var response := await _view.reload(bridge, _view.current_selection(), operation)
	if response.get("ok", false):
		await _load_items(_catalog_state(), operation)
	return response


func open_native_id(native_id: int) -> Dictionary:
	var response := await _view.open_native_id(native_id)
	if response.get("ok", false):
		await _load_items(_catalog_state())
	return response


func commit(record: Dictionary, draft_serial: int) -> Dictionary:
	var bridge = _read_bridge.call()
	var response := {"ok": false, "error": "Open a project before applying this record."}
	if bridge != null:
		var submitted := record.duplicate(true)
		response = await _operations.run_workflow(bridge, "Apply " + _view._record_label(), _commit.bind(submitted, draft_serial, _generation))
	_accept_draft.call(response)
	return response


func create_record(native_id: int) -> void:
	await _direct_mutation(_view._create_method(), native_id, "Create " + _view._record_label())


func clear_record(native_id: int) -> void:
	await _direct_mutation(_view._clear_method(), native_id, "Clear " + _view._record_label())


func request_items(_query: String = "", _category: String = "all") -> void:
	_item_request += 1
	_hydrated_state.clear()
	if _view.current_selection() < 0: return
	_view.show_item_pool_loading()
	_load_items_when_available.call_deferred(_item_request, _generation, _catalog_state())


func teardown() -> void:
	_generation += 1
	_item_request += 1
	_item_references.clear()
	_loaded_icon_ids.clear()
	_hydrated_state.clear(); _reference_revision = -1
	_view.teardown_session()


func dispose() -> void:
	teardown()
	_view.commit_handler = Callable()


func _commit(operation: ProvidenceEditorOperation, submitted: Dictionary, submitted_serial: int, generation: int) -> Dictionary:
	var params := {"expectedRevision": int(_context.call().revision)}
	params[_view._record_key()] = submitted
	var response := await operation.request(_view._update_method(), params)
	if not response.get("ok", false): return response
	if generation != _generation: return _connection_changed(response)
	_view.accept_submitted_record(submitted, int(response.result.revision), submitted_serial)
	projection_applied.emit(response.result)
	if not _view.has_unapplied_changes():
		var refreshed := await _view.reload(_read_bridge.call(), int(submitted.nativeId), operation)
		if not refreshed.get("ok", false): response["viewRefreshError"] = str(refreshed.get("error", "Reload the record."))
	await _load_items(_catalog_state(), operation)
	status_changed.emit("Updated %s %d · revision %d" % [_view._record_label(), int(submitted.nativeId), int(response.result.revision)])
	return response


func _direct_mutation(method: String, native_id: int, label: String) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project before changing records."}
	var response: Dictionary = await _operations.run_workflow(bridge, label, func(operation):
		var changed: Dictionary = await operation.request(method, {"expectedRevision": int(_context.call().revision), "nativeId": native_id})
		if not changed.get("ok", false): return changed
		projection_applied.emit(changed.result)
		var refreshed: Dictionary = await _view.reload(bridge, native_id, operation)
		if not refreshed.get("ok", false): changed["viewRefreshError"] = str(refreshed.get("error", "Reload the record."))
		await _load_items(_catalog_state(), operation)
		return changed)
	if not response.get("ok", false): failed.emit(str(response.get("error", "%s failed." % label)))
	else:
		status_changed.emit("%s %d · revision %d" % [label, native_id, int(response.result.revision)])
	return response


func _load_items_when_available(request_id: int, generation: int, state: Array) -> void:
	if request_id != _item_request or generation != _generation: return
	while is_instance_valid(_operations) and _operations.busy:
		if request_id != _item_request or generation != _generation: return
		await _view.get_tree().process_frame
	if request_id != _item_request or generation != _generation or not is_instance_valid(_operations): return
	await _load_items(state)


func _catalog_state() -> Array:
	return [_view.current_selection(), _view.item_catalog_query(), int(_context.call().revision)]


func _load_items(state: Array, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _view.current_selection() < 0: return {"ok": true}
	if state == _hydrated_state: return {"ok": true}
	if borrowed != null: return await _hydrate_pool(borrowed, state, _generation, _item_request)
	return await _operations.run_workflow(_read_bridge.call(), "Load item pool", _hydrate_pool.bind(state, _generation, _item_request))


func _hydrate_pool(operation: ProvidenceEditorOperation, state: Array, generation: int, request_id: int) -> Dictionary:
	var response := await _load_item_references(operation)
	if response.get("ok", false): response = await operation.request("item.list", state[1])
	if generation != _generation or request_id != _item_request or state != _catalog_state():
		return {"ok": false, "stale": true, "error": "The item destination changed while loading."}
	if not response.get("ok", false):
		_view.show_item_pool_error(str(response.get("error", "The item catalog is unavailable.")))
		failed.emit(str(response.get("error", "The item catalog is unavailable.")))
		return response
	_view.set_item_catalog(response.result)
	await _load_visible_artwork(operation, state, generation, request_id)
	if generation == _generation and request_id == _item_request and state == _catalog_state():
		_hydrated_state = state.duplicate(true)
		status_changed.emit("%s %d ready · item pool and artwork loaded" % [_view._record_label(), _view.current_selection()])
	return response


func _pool_current(state: Array, generation: int, request_id: int) -> bool:
	return generation == _generation and request_id == _item_request and state == _catalog_state()


func _load_item_references(operation: ProvidenceEditorOperation) -> Dictionary:
	var revision := int(_context.call().revision)
	var generation := _generation
	if _reference_revision == revision and not _item_references.is_empty():
		_view.set_item_references(_item_references)
		return {"ok": true}
	var references := {}
	var offset := 0
	while true:
		var response := await operation.request("item.list", {"scope": "all", "category": "all", "query": "", "offset": offset, "limit": 128})
		if not response.get("ok", false): return response
		if generation != _generation: return {"ok": false, "stale": true}
		for item: Dictionary in response.result.get("items", []): references[int(item.get("classicId", 0))] = item.duplicate(true)
		if not response.result.get("truncated", false): break
		offset += 128
	_item_references = references; _reference_revision = revision
	_loaded_icon_ids.clear(); _view.reset_item_artwork()
	_view.set_item_references(_item_references)
	return {"ok": true}


func _load_visible_artwork(operation: ProvidenceEditorOperation, state: Array, generation: int, request_id: int) -> void:
	for icon_id in _view.visible_artwork_icon_ids():
		if not _pool_current(state, generation, request_id): return
		await _load_icon(icon_id, operation)


func _load_selected_icon(item: Dictionary, index: int) -> void:
	var icon_id := int(item.get("iconId", 0))
	if icon_id == 0: return
	await _load_icon(icon_id)
	if item == _view.selected_catalog_item() and _loaded_icon_ids.has(icon_id):
		_view.set_catalog_icon(index, _loaded_icon_ids[icon_id])


func _load_icon(icon_id: int, borrowed: ProvidenceEditorOperation = null) -> void:
	if icon_id == 0: return
	if _loaded_icon_ids.has(icon_id):
		_view.set_resolved_artwork(icon_id, _loaded_icon_ids[icon_id])
		return
	var generation := _generation
	var response: Dictionary
	if borrowed == null:
		response = await _operations.run_workflow(_read_bridge.call(), "Load Realmz artwork", func(operation):
			return await preload("res://src/item_artwork_lookup.gd").resolve(operation.request, icon_id))
	else:
		response = await preload("res://src/item_artwork_lookup.gd").resolve(borrowed.request, icon_id)
	if generation != _generation or response.get("busy", false): return
	var texture: Texture2D = response.get("texture")
	var reason := str(response.get("error", "Artwork unavailable.")) if not response.get("ok", false) else ""
	if response.get("ok", false): _loaded_icon_ids[icon_id] = texture
	_view.set_resolved_artwork(icon_id, texture, reason)


func _connection_changed(response: Dictionary) -> Dictionary:
	response["ok"] = false
	response["connectionChanged"] = true
	response["error"] = "The project session changed while applying the record."
	return response

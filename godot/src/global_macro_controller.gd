extends RefCounted

signal projection_applied(projection: Dictionary)

var _view: Control
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept_draft: Callable
var _bridge: RefCounted
var _generation := 0


func initialize(view: Control, operations: ProvidenceEditorOperation, read_context: Callable, accept_draft: Callable) -> void:
	_view = view
	_operations = operations
	_read_context = read_context
	_accept_draft = accept_draft
	_view.commit_handler = update_hooks
	_view.reference_requested.connect(_open_picker)
	_view.preview_requested.connect(_preview_assigned)
	_view.picker.search_requested.connect(_search)
	_view.picker.preview_requested.connect(_preview_choice)
	_view.picker.accepted.connect(_view.accept_choice)
	_operations.busy_changed.connect(_busy_changed)
	_operations.completed.connect(_completed)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_view.set_document({})
	_view.set_operation_state(false, _operations.requires_reopen)


func teardown() -> void:
	attach_session(null)


func dispose() -> void:
	_generation += 1
	_view.commit_handler = Callable()
	_operations.busy_changed.disconnect(_busy_changed)
	_operations.completed.disconnect(_completed)
	_view.reference_requested.disconnect(_open_picker)
	_view.preview_requested.disconnect(_preview_assigned)
	_view.picker.search_requested.disconnect(_search)
	_view.picker.preview_requested.disconnect(_preview_choice)
	_view.picker.accepted.disconnect(_view.accept_choice)
	for connection in projection_applied.get_connections(): projection_applied.disconnect(connection.callable)


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project before loading Global Macros."}
	if _view.has_unapplied_changes(): return {"ok": false, "draftKept": true, "error": "Apply or discard the hook drafts before refreshing."}
	return await _operations.run_workflow(_bridge, "Load Global Macros", _reload.bind(_guard(), false), operation)


func update_hooks(hooks: Dictionary) -> Dictionary:
	var response := {"ok": false, "error": "Open a project before editing Global Macros."}
	if _bridge != null:
		var params := {"expectedRevision": int(_read_context.call().revision), "hooks": hooks}
		response = await _operations.run_workflow(_bridge, "Apply Global Macro hooks", _update.bind(params, _guard()))
	if not response.get("ok", false): _view.show_failure(response)
	_accept_draft.call(response)
	return response


func _update(operation: ProvidenceEditorOperation, params: Dictionary, guard: Dictionary) -> Dictionary:
	var response := await operation.request("global-macro.update-all", params)
	if not response.get("ok", false): return response
	if guard.generation != _generation:
		response["viewRefreshError"] = "The Global Macro session changed."
		return response
	_view.accept_saved_hooks(params.hooks)
	projection_applied.emit(response.result)
	var refreshed := await _reload(operation, guard, true)
	if not refreshed.get("ok", false):
		response["viewRefreshError"] = str(refreshed.get("error", "Reload Global Macros."))
		if refreshed.get("outcomeUnknown", false): response["outcomeUnknown"] = true
	return response


func _reload(operation: ProvidenceEditorOperation, guard: Dictionary, preserve_drafts: bool) -> Dictionary:
	var response := await operation.request("global-macro.open")
	if not response.get("ok", false): return response
	if guard.generation != _generation:
		return {"ok": false, "connectionChanged": true, "error": "The Global Macro session changed before loading finished."}
	if guard.state != _view.read_state():
		return {"ok": false, "draftKept": true, "error": "The hook drafts changed while loading. Your changes are kept."}
	_view.set_document(response.result, preserve_drafts)
	return response


func _guard() -> Dictionary:
	return {"generation": _generation, "state": _view.read_state()}


func _open_picker(_hook: String, destination: Dictionary) -> void:
	if _bridge != null: _view.picker.begin(destination, _view.get_viewport().gui_get_focus_owner())


func _search(query: Dictionary, generation: int) -> void:
	var destination: Dictionary = _view.picker.context.duplicate(true)
	var response := await _read("global-macro.catalog", query, destination)
	if _view.context_matches(destination): _view.picker.receive_page(response, generation)
	else: _view.picker.cancel(false)


func _preview_choice(choice: Dictionary, generation: int) -> void:
	if not choice.get("available", false): return
	var destination: Dictionary = _view.picker.context.duplicate(true)
	var response := await _read("extra-action-point.open", {"identity":choice.identity}, destination)
	if _view.context_matches(destination): _view.picker.receive_script(response, generation, str(choice.identity))


func _preview_assigned(identity: String, generation: int) -> void:
	var session_generation := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if session_generation != _generation or identity != _view.current_selection(): return
	if _bridge == null or session_generation != _generation: return
	var response: Dictionary = await _operations.run_workflow(_bridge, "Preview assigned XAP", _request.bind("extra-action-point.open", {"identity":identity}))
	if session_generation == _generation: _view.receive_preview(response, identity, generation)


func _read(method: String, params: Dictionary, destination: Dictionary) -> Dictionary:
	while _view.context_matches(destination) and _view.picker.visible:
		if _bridge == null: break
		var response: Dictionary = await _operations.run_workflow(_bridge, "Browse Global Macro XAPs", _request.bind(method, params))
		if not response.get("busy", false): return response
		await _view.get_tree().process_frame
	return {"ok":false, "stale":true}


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func _busy_changed(busy: bool, _label: String) -> void:
	_view.set_operation_state(busy, _operations.requires_reopen)


func _completed(_response: Dictionary) -> void:
	_view.set_operation_state(false, _operations.requires_reopen)

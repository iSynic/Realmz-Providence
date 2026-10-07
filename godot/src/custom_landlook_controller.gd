extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal submission_finished(response: Dictionary)

var view: Window
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept: Callable
var _guard: Callable
var _behavior: Callable
var _bridge: RefCounted
var _dock
var _generation := 0
var _source_sequence := 0
var _origin: Dictionary = {}
var _submitted: Dictionary = {}
var _pending: Dictionary = {}
var _waiting := false
var _reading_source := false
var _queued_source := -1


func initialize(owner: Node, map: ProvidenceMapDocumentController, dock, operations: ProvidenceEditorOperation, read_context: Callable, accept: Callable, guard: Callable, behavior: Callable) -> void:
	_map = map; _dock = dock; _operations = operations; _read_context = read_context; _accept = accept; _guard = guard; _behavior = behavior
	view = preload("res://src/custom_landlook_window.tscn").instantiate(); owner.add_child(view)
	view.source_requested.connect(_read_source); view.review_requested.connect(review); view.apply_requested.connect(apply_review)
	view.recovery_requested.connect(check_original); view.canceled.connect(_canceled)
	view.behavior_requested.connect(_open_behavior)
	view.behavior_decided.connect(_behavior_decision)
	dock.customization_requested.connect(_open_from_dock)
	map.document_opened.connect(_document_opened); map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _pending.clear(); _clear()


func _open_from_dock() -> void:
	_guard.call(open, "opening Custom Landlooks")


func _open_behavior() -> void:
	if not _pending.is_empty(): return
	if view.has_unapplied_changes(): view.choose_behavior_navigation()
	else: _edit_behavior()


func _behavior_decision(choice: String) -> void:
	var origin := _origin.duplicate(true)
	if choice == "apply":
		var response := await commit_selected()
		if not response.get("ok", false) or not _matches(origin): return
	elif choice == "discard": discard_draft()
	else: return
	_edit_behavior()


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if reset: _generation += 1; _clear()


func _clear() -> void:
	_source_sequence += 1; _queued_source = -1; _origin.clear(); _submitted.clear()
	if is_instance_valid(view): view.dismiss()
	if _waiting: submission_finished.emit(_stale())


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and str(origin.identity) == _map.identity and not _map.is_dungeon and is_instance_valid(view)


func _params() -> Dictionary:
	return {"identity":_origin.identity,"expectedRevision":int(view.context.revision)}


func open() -> Dictionary:
	if _bridge == null or _map.identity.is_empty() or _map.is_dungeon: return _stale()
	if view.visible: return {"ok":true}
	var origin := {"identity":_map.identity,"generation":_generation}
	var params := {"identity":_map.identity,"expectedRevision":int(_read_context.call().revision)}
	var response := await _operations.run_workflow(_bridge, "Open Custom Landlooks", _request.bind("custom-landlook.open", params), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok", false): failed.emit(str(response.get("error", "Custom Landlooks could not be opened."))); return response
	_origin = origin; _submitted.clear(); view.open(response.result, _dock.ui.customization)
	return response


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func _read_source(look: int) -> void:
	if not _matches(_origin) or not view.visible: return
	_queued_source = look
	if _reading_source: return
	_reading_source = true
	while _queued_source >= 0 and _matches(_origin) and view.visible:
		var next := _queued_source; _queued_source = -1
		await _load_source(next)
	_reading_source = false


func _load_source(look: int) -> void:
	_source_sequence += 1; var sequence := _source_sequence; var origin := _origin.duplicate(true)
	var params := _params(); params.sourceLook = look
	var response := await _operations.run_workflow(_bridge, "Read Landlook template artwork", _request.bind("custom-landlook.source", params), null, true)
	if not _matches(origin) or sequence != _source_sequence or not view.visible or _queued_source >= 0: return
	if response.get("ok", false): view.set_source(response.result)
	else: _failure(response)


func review() -> Dictionary:
	if not _matches(_origin) or not _pending.is_empty(): return _stale()
	var origin := _origin.duplicate(true); _submitted = _params(); _submitted.draft = view.draft(); view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Review Custom Landlook impact", _preview.bind(origin), null, true)
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok", false): _failure(response)
	return response


func _preview(operation: ProvidenceEditorOperation, origin: Dictionary) -> Dictionary:
	var params := _submitted.duplicate(true); var maps: Array = []; var first := {}
	while true:
		params.offset = maps.size()
		var response := await operation.request("custom-landlook.preview", params)
		if not _matches(origin): return _stale()
		if not response.get("ok", false): return response
		if first.is_empty(): first = response.result
		maps.append_array(response.result.affectedMaps)
		if not response.result.truncated:
			_submitted.reviewHash = first.reviewHash; view.show_review(first, maps); return response
		if response.result.affectedMaps.is_empty(): return {"ok":false,"error":"The affected-map page did not advance."}
	return {"ok":false}


func apply_review() -> Dictionary:
	if not _matches(_origin) or not view.review_is_current() or _submitted.is_empty() or not _pending.is_empty(): return _stale()
	var origin := _origin.duplicate(true); view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Apply Custom Landlook", _commit.bind(origin), null, true)
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok", false): _failure(response)
	if _waiting: submission_finished.emit(response)
	else: _accept.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, origin: Dictionary) -> Dictionary:
	var params := _submitted.duplicate(true); params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"origin":origin,"params":params}
	var response := await operation.request("custom-landlook.apply", params)
	if not _matches(origin): return _stale()
	if response.get("outcomeUnknown", false): return response
	_pending.clear()
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation, response.result)
	if not refreshed.get("ok", false): _pending = {"origin":origin,"readOnly":true,"committed":true}; return refreshed
	view.dismiss(); _submitted.clear(); return response


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or view.has_unapplied_changes()


func discard_draft() -> void:
	if _pending.is_empty(): view.dismiss(); _submitted.clear()


func commit_selected() -> Dictionary:
	if not has_unapplied_changes(): return {"ok":true}
	_waiting = true; var response := await review()
	if response.get("ok", false): response = await submission_finished
	_waiting = false; _accept.call(response); return response


func _canceled() -> void:
	_submitted.clear()
	if _waiting: submission_finished.emit({"ok":false,"canceled":true})


func _failure(response: Dictionary) -> void:
	if response.get("outcomeUnknown", false) and _pending.is_empty(): _pending = {"origin":_origin.duplicate(true),"readOnly":true}
	if not _pending.is_empty(): view.set_busy(true, true)
	view.show_failure(str(response.get("error", "The Landlook operation failed.")))
	failed.emit(str(response.get("error", "Your Landlook draft is kept.")))


func check_original() -> void:
	if _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true); var lookup := {}
	if not pending.get("readOnly", false): lookup = {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"custom-landlook.apply","params":pending.params}}
	var response := await _operations.recover_world(_bridge, lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false): response.outcomeUnknown = true; _failure(response); return
	var committed: bool = pending.get("committed", false) or not pending.get("readOnly", false) and response.result.outcome == "committed"
	var kept: Dictionary = view.draft(); _pending.clear()
	response = await _operations.run_workflow(_bridge, "Read original Landlook result", _reconcile.bind(committed, kept), null, true)
	if not response.get("ok", false): _pending = {"origin":_origin.duplicate(true),"readOnly":true,"committed":committed}; _failure(response)


func _reconcile(operation: ProvidenceEditorOperation, committed: bool, kept: Dictionary) -> Dictionary:
	var response := await operation.request("session.describe", {})
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation, response.result)
	if not refreshed.get("ok", false): return refreshed
	if committed: view.dismiss(); _submitted.clear(); return response
	var params := _params(); params.expectedRevision = int(_read_context.call().revision)
	response = await operation.request("custom-landlook.open", params)
	if not response.get("ok", false): return response
	view.open(response.result, _dock.ui.customization, false); view.restore_draft(kept, false)
	params.sourceLook = int(kept.destination) if kept.operation == "import" else int(kept.sourceLook)
	response = await operation.request("custom-landlook.source", params)
	if response.get("ok", false): view.set_source(response.result)
	_submitted.clear(); return response


func _edit_behavior() -> void:
	view.dismiss(); _behavior.call()


func _stale() -> Dictionary:
	return {"ok":false,"stale":true,"error":"The Landlook destination changed. Reopen it before applying."}


func dispose() -> void:
	attach_session(null)
	if _map != null: _map.document_opened.disconnect(_document_opened); _map.document_cleared.disconnect(_clear)
	if is_instance_valid(_dock): _dock.customization_requested.disconnect(_open_from_dock)
	_map = null; _dock = null; _read_context = Callable(); _accept = Callable(); _guard = Callable(); _behavior = Callable()
	for relay in [projection_applied, failed, submission_finished]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

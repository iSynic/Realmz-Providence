extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal submission_finished(response: Dictionary)

var view: Window
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _generation := 0
var _accept_draft: Callable
var _origin: Button
var _recovery_button: Button
var _submitted: Dictionary = {}
var _pending: Dictionary = {}
var _waiting := false
var _local_preview: Dictionary = {}
var _artwork_queue: Dictionary = {}
var _artwork_reading := false


func initialize(owner: Node, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, accept_draft: Callable, origin: Button, recovery: Button) -> void:
	_map = map
	_operations = operations
	_accept_draft = accept_draft
	_origin = origin
	_recovery_button = recovery
	view = preload("res://src/level_settings_view.tscn").instantiate()
	owner.add_child(view)
	view.review_requested.connect(review)
	view.preview_changed.connect(_present_preview)
	view.erase_artwork_requested.connect(_read_erase_artwork)
	view.get_node("%LandlookPicker").artwork_requested.connect(_read_artwork)
	view.get_node("%SettingsImpact").accepted.connect(apply_review)
	view.get_node("%SettingsImpact").canceled.connect(_cancel_review)
	view.get_node("%ReconcileSettings").pressed.connect(check_original)
	_recovery_button.pressed.connect(check_original)
	_map.document_opened.connect(_document_opened)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_pending.clear()
	_submitted.clear()
	_local_preview.clear()
	_artwork_queue.clear()
	_artwork_reading = false
	view.get_node("%LandlookPicker").cancel()
	view.get_node("%EraseTilePicker").cancel()
	view.get_node("%SettingsImpact").hide()
	view.hide()
	view.identity = ""
	view.set_projection({"identity": "", "revision": 0, "dungeon": false, "settings": {}, "landlooks": []}, _origin)
	_recovery_button.hide()
	if _waiting: submission_finished.emit(_stale())


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or view.has_unapplied_changes()


func discard_draft() -> void:
	if not _pending.is_empty(): return
	view.discard_draft()
	view.close()
	view.get_node("%SettingsImpact").hide()
	_submitted.clear()


func open() -> void:
	if _bridge == null or _map.identity.is_empty(): return
	if has_unapplied_changes() and view.identity == _map.identity: view.show_draft(); return
	var origin := {"generation": _generation, "identity": _map.identity}
	var response := await _operations.run_workflow(_bridge, "Open level setup", _open.bind(origin), null, true)
	if not _matches(origin): return
	if not response.get("ok", false): _keep_read_failure(response, origin); _show_failure(response)


func _open(operation: ProvidenceEditorOperation, origin: Dictionary) -> Dictionary:
	var response := await operation.request("level-settings.open", {"identity": origin.identity})
	if not _matches(origin): return _stale()
	if not response.get("ok", false): return response
	view.set_projection(response.result, _origin)
	view.set_current_cell(_map.selected_cell)
	view.set_preview_preferences(_local_preview.get(str(origin.identity), {"mode": "off", "focal": Vector2i(25, 25)}))
	view.show_draft()
	return response


func review() -> Dictionary:
	if _bridge == null or not _pending.is_empty(): return {"ok": false, "error": "Reconcile the original settings result first."}
	var origin := {"generation": _generation, "identity": view.identity}
	if not _matches(origin): return _stale()
	view.set_loading(true)
	_submitted = view.submitted().duplicate(true)
	var response := await _operations.run_workflow(_bridge, "Review level settings", _prepare.bind(_submitted, origin), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok", false):
		_keep_read_failure(response, origin)
		_show_failure(response, not _waiting)
	view.set_loading(false)
	return response


func _prepare(operation: ProvidenceEditorOperation, params: Dictionary, origin: Dictionary) -> Dictionary:
	var affected: Array = []
	while true:
		var page_params := params.duplicate(true)
		page_params.offset = affected.size()
		var response := await operation.request("level-settings.preview", page_params)
		if not _matches(origin): return _stale()
		if not response.get("ok", false): return response
		var page: Dictionary = response.result
		if not page.canApply: return {"ok": false, "error": "The level settings already match. No changes are needed."}
		if page.affectedMaps.size() > 128 or int(page.offset) != affected.size() or affected.size() + page.affectedMaps.size() > int(page.total) or (page.affectedMaps.is_empty() and affected.size() < int(page.total)):
			return {"ok": false, "error": "The level impact list is incomplete. Your draft is kept."}
		affected.append_array(page.affectedMaps)
		if affected.size() == int(page.total):
			page.affectedMaps = affected
			view.get_node("%SettingsImpact").open_review(page, str(params.edit.name))
			return response
	return _stale()


func commit_selected() -> Dictionary:
	if not has_unapplied_changes(): return {"ok": true}
	_waiting = true
	var prepared := await review()
	if not prepared.get("ok", false):
		_waiting = false
		_accept_draft.call(prepared)
		return prepared
	var response: Dictionary = await submission_finished
	_waiting = false
	_accept_draft.call(response)
	return response


func apply_review() -> Dictionary:
	if _bridge == null or not _pending.is_empty() or _submitted.is_empty(): return _stale()
	if not view.get_node("%SettingsImpact").visible: return _stale()
	var origin := {"generation": _generation, "identity": view.identity}
	if not _matches(origin): return _stale()
	view.set_loading(true)
	view.get_node("%SettingsImpact").set_loading(true)
	var response := await _operations.run_workflow(_bridge, "Apply level settings", _commit.bind(_submitted.duplicate(true), origin), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok", false): _show_failure(response, false)
	view.set_loading(false)
	if _waiting: submission_finished.emit(response)
	else: _accept_draft.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, params: Dictionary, origin: Dictionary) -> Dictionary:
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"origin": origin, "params": params}
	var response := await operation.request("level-settings.apply", params)
	if not _matches(origin): return _stale()
	if response.get("outcomeUnknown", false): return response
	_pending.clear()
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	view.acknowledge(response.result)
	view.get_node("%SettingsImpact").hide()
	_submitted.clear()
	var refreshed := await _map.refresh_history(operation, response.result)
	if not _matches(origin): return _stale()
	if not refreshed.get("ok", false): return _keep_read_failure(refreshed, origin, true)
	return response


func _keep_read_failure(response: Dictionary, origin: Dictionary, applied := false) -> Dictionary:
	if response.get("outcomeUnknown", false) or applied:
		_pending = {"origin": origin, "readOnly": true, "applied": applied}
		if applied:
			response.viewRefreshPending = true
			response.error = "Level settings Apply is confirmed. Reconcile to refresh the view; the write will not be repeated."
	return response


func _show_failure(response: Dictionary, notify := true) -> void:
	view.show_failure(response)
	view.get_node("%SettingsImpact").show_failure(response)
	_recovery_button.visible = not _pending.is_empty()
	if notify: failed.emit(str(response.get("error", "Your settings draft is kept.")))


func _cancel_review() -> void:
	if _pending.is_empty(): _submitted.clear()
	if _waiting: submission_finished.emit({"ok": false, "canceled": true, "error": "Settings review canceled. Your draft is kept."})


func check_original() -> void:
	if _bridge == null or _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true)
	var lookup: Dictionary = {}
	if not pending.get("readOnly", false): lookup = {"domain": "project", "operationId": pending.params.operationId, "expectedIntent": {"method": "level-settings.apply", "params": pending.params}}
	var response := await _operations.recover_world(_bridge, lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false): response.outcomeUnknown = true; _show_failure(response); return
	_pending.clear()
	var committed: bool = pending.get("applied", false) or (not pending.get("readOnly", false) and response.result.outcome == "committed")
	var refreshed := await _operations.run_workflow(_bridge, "Read reconciled level settings", _reconciled.bind(pending.origin, committed), null, true)
	if not _matches(pending.origin): return
	if not refreshed.get("ok", false): _show_failure(_keep_read_failure(refreshed, pending.origin, committed))
	else:
		_recovery_button.hide()
		view.get_node("%SettingsImpact").hide()
		_submitted.clear()
		view.show_draft()


func _reconciled(operation: ProvidenceEditorOperation, origin: Dictionary, committed: bool) -> Dictionary:
	var described := await operation.request("session.describe", {})
	if not _matches(origin): return _stale()
	if not described.get("ok", false): return described
	projection_applied.emit({"revision": described.result.revision, "canUndo": described.result.canUndo, "canRedo": described.result.canRedo, "truncated": true})
	var refreshed := await _map.refresh_history(operation, described.result)
	if not _matches(origin): return _stale()
	if not refreshed.get("ok", false): return refreshed
	if committed or view.identity != origin.identity: return await _open(operation, origin)
	view.rebase(int(described.result.revision))
	return refreshed


func _read_artwork(landlook: int, request_id: int) -> void:
	_artwork_queue = {"landlook": landlook, "requestId": request_id, "generation": _generation, "identity": view.identity}
	if _artwork_reading: return
	_artwork_reading = true
	var generation := _generation
	while not _artwork_queue.is_empty() and generation == _generation:
		var origin := _artwork_queue.duplicate(true)
		_artwork_queue.clear()
		while _operations.busy and _matches(origin): await view.get_tree().process_frame
		if not _matches(origin): break
		var response := await _operations.run_workflow(_bridge, "Preview Landlook", func(operation):
			return await operation.request("level-settings.artwork", {"identity": origin.identity, "landlook": origin.landlook}), null, true)
		if not _matches(origin): break
		view.get_node("%LandlookPicker").present_artwork(response.get("result", {"available": false, "reason": response.get("error", "The artwork could not be loaded.")}), int(origin.requestId))
		if response.get("outcomeUnknown", false): _keep_read_failure(response, origin); _show_failure(response); break
	if generation == _generation: _artwork_reading = false


func _present_preview(mode: String, focal: Vector2i) -> void:
	if view.identity != _map.identity: return
	_local_preview[_map.identity] = {"mode": mode, "focal": focal}
	_map.preview_control().configure(mode, focal)


func _read_erase_artwork() -> void:
	var origin := {"generation": _generation, "identity": view.identity}
	var landlook: Variant = view.submitted().edit.landlook
	var response := await _operations.run_workflow(_bridge, "Choose shared erase tile", func(operation):
		return await operation.request("level-settings.artwork", {"identity": origin.identity, "landlook": landlook}), null, true)
	if not _matches(origin) or not view.visible or view.submitted().edit.landlook != landlook: return
	if response.get("ok", false): view.present_erase_artwork(response.result)
	else: _keep_read_failure(response, origin); _show_failure(response)


func _document_opened(map: Dictionary, _reset_selection: bool) -> void:
	var preference: Dictionary = _local_preview.get(str(map.identity), {"mode": "off", "focal": Vector2i(25, 25)})
	_map.preview_control().configure(preference.mode, preference.focal)
	if view.identity != str(map.identity): view.close()


func _matches(origin: Dictionary) -> bool:
	return is_instance_valid(view) and view.is_inside_tree() and int(origin.generation) == _generation and str(origin.identity) == _map.identity


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The level setup destination changed. Your selection was not accepted."}


func dispose() -> void:
	_generation += 1
	_bridge = null
	_accept_draft = Callable()
	if _map != null: _map.document_opened.disconnect(_document_opened)
	_map = null
	for relay in [projection_applied, failed, submission_finished]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

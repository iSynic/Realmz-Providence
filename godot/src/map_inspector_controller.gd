extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

var _view: ProvidenceMapInspector
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _context: Callable
var _fallback_references: Callable
var _bridge: RefCounted
var _generation := 0
var _selection := 0
var _queued := false
var _refresh_scheduled := false
var _reference: Dictionary = {}
var _reference_revision := -1
var _presented_identity := ""
var _presented_cell := Vector2i(-1, -1)
var _presented_tile := 0


func initialize(view: ProvidenceMapInspector, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, context: Callable, fallback_references: Callable) -> void:
	_view = view
	_map = map
	_operations = operations
	_context = context
	_fallback_references = fallback_references
	view.repair_reference_requested.connect(repair_reference)
	view.visibility_changed.connect(_visibility_changed)
	operations.completed.connect(_operation_completed)
	map.refresh_selection = refresh_selection


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_clear_reference()
	_presented_identity = ""


func teardown() -> void:
	attach_session(null)


func _clear_reference() -> void:
	_selection += 1
	_queued = false
	_reference.clear()
	_reference_revision = -1


func show_overview() -> void:
	_clear_reference()
	_presented_identity = ""
	_view.set_overview(_map.identity, "dungeon" if _map.is_dungeon else "land", not _map.is_dungeon,
		"Dungeon cell flags are edited in Dungeon Draw." if _map.is_dungeon else "No cell selected.")


func select_cell() -> void:
	_clear_reference()
	var cell := _map.selected_cell
	var draft := _view.tile_value()
	var retain_draft := _presented_identity == _map.identity and _presented_cell == cell and draft != _presented_tile
	_view.set_cell(_map.identity, cell.x, cell.y, _map.original_tile, _map.selected_action_point, {}, not _map.is_dungeon,
		"Dungeon cell flags are edited in Dungeon Draw." if _map.is_dungeon else "Commit this one signed-short land tile.")
	_presented_identity = _map.identity
	_presented_cell = cell
	_presented_tile = _map.original_tile
	if retain_draft: _view.set_tile_value(draft)
	if _bridge == null or _source().is_empty() or not _view.is_visible_in_tree(): return
	_queued = true
	if not _operations.busy: await _read_queued_selection()


func _visibility_changed() -> void:
	if not _view.is_visible_in_tree():
		_selection += 1
		_queued = false
		return
	if _bridge == null or _source().is_empty(): return
	_queued = true
	if not _operations.busy: await _read_queued_selection()


func _operation_completed(_response: Dictionary) -> void:
	# Completion is emitted before the command caller resumes. Let its projection
	# publish first. A one-shot connection disappears with this owner; a suspended
	# coroutine would instead resume against a released RefCounted during shutdown.
	if not _queued or _refresh_scheduled or not _operations.is_inside_tree(): return
	_refresh_scheduled = true
	_operations.get_tree().process_frame.connect(_resume_queued_selection, CONNECT_ONE_SHOT)


func _resume_queued_selection() -> void:
	_refresh_scheduled = false
	if not is_instance_valid(_operations) or not is_instance_valid(_view): return
	if _queued and not _operations.busy: _read_queued_selection()


func _read_queued_selection() -> void:
	if not _queued or _bridge == null or _operations.requires_reopen: return
	_queued = false
	var response := await refresh_selection()
	if not response.get("ok", false) and not response.get("stale", false):
		failed.emit(str(response.get("error", "The map reference could not be read.")))


func refresh_selection(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	_queued = false
	if _bridge == null or _source().is_empty() or _map.is_dungeon or not _view.is_visible_in_tree(): return {"ok": true}
	return await _operations.run_workflow(_bridge, "Read map reference", _read_reference.bind(_guard()), borrowed)


func _read_reference(operation: ProvidenceEditorOperation, guard: Dictionary) -> Dictionary:
	var response := await operation.request("action-point.open", {"identity": guard.source})
	if not response.get("ok", false): return response
	if not _matches(guard): return _stale()
	var candidates: Array = response.result.get("references", [])
	if candidates.is_empty(): candidates = _fallback_references.call()
	var chosen: Dictionary = {}
	for reference: Dictionary in candidates:
		if str(reference.get("source", "")) != guard.source: continue
		if chosen.is_empty(): chosen = reference
		if str(reference.get("resolution", "")) != "resolved":
			chosen = reference
			break
	_reference = chosen.duplicate(true)
	_reference_revision = guard.revision
	# This read must not overwrite tile text entered while it was in flight.
	_view.set_reference(_reference)
	return response


func repair_reference(target_native_id: int) -> void:
	if _bridge == null or _operations.busy or _reference.is_empty(): return
	var source := str(_reference.get("source", ""))
	var field := str(_reference.get("field", ""))
	if source != _source() or not field.begins_with("actions["): return
	var slot := field.get_slice("[", 1).get_slice("]", 0)
	if not slot.is_valid_int() or int(slot) < 0: return
	if _reference_revision != int(_context.call().revision):
		failed.emit("The map reference changed. Select the cell again before repairing it.")
		return
	var params := {"expectedRevision": _reference_revision, "source": source, "slot": int(slot), "targetNativeId": target_native_id}
	var response := await _operations.run_workflow(_bridge, "Repair map reference", _repair.bind(params, _generation, _map.identity))
	if not response.get("ok", false):
		if not response.get("stale", false): failed.emit(str(response.get("error", "Map reference repair failed.")))
	elif response.has("viewRefreshError"):
		failed.emit("The map reference was repaired, but its view could not refresh. " + str(response.viewRefreshError))
	else:
		status_changed.emit("Repaired map Action Point target · revision %d" % int(response.result.revision))


func _repair(operation: ProvidenceEditorOperation, params: Dictionary, generation: int, identity: String) -> Dictionary:
	var response := await operation.request("action-reference.retarget", params)
	if not response.get("ok", false): return response
	if generation != _generation or identity != _map.identity: return _stale()
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation)
	if not refreshed.get("ok", false):
		response["viewRefreshError"] = str(refreshed.get("error", "The map could not refresh."))
		response["outcomeUnknown"] = refreshed.get("outcomeUnknown", false)
	return response


func _source() -> String:
	return str(_map.selected_action_point.get("identity", ""))


func _guard() -> Dictionary:
	return {"generation": _generation, "selection": _selection, "identity": _map.identity,
		"cell": _map.selected_cell, "source": _source(), "revision": int(_context.call().revision)}


func _matches(guard: Dictionary) -> bool:
	return _map != null and guard == _guard()


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The map selection changed while its reference was loading."}


func dispose() -> void:
	_generation += 1
	_bridge = null; _map = null
	_context = Callable(); _fallback_references = Callable()
	if is_instance_valid(_operations): _operations.completed.disconnect(_operation_completed)
	for relay in [projection_applied, status_changed, failed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

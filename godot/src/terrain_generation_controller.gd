extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal active_changed(active: bool)

var view: Control
var _map: ProvidenceMapDocumentController
var _land: ProvidenceLandEditor
var _authoring: RefCounted
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _context: Callable
var _accept: Callable
var _route_overlay: Control
var _generation := 0
var _origin: Dictionary = {}
var _saved: Dictionary = {}
var _pending: Dictionary = {}
var _busy := false
var _applying := false
var _drawing := false
var _cancel_requested := false


func initialize(owner: Node, map: ProvidenceMapDocumentController, land: ProvidenceLandEditor, authoring: RefCounted, operations: ProvidenceEditorOperation, context: Callable, accept: Callable) -> void:
	_map = map; _land = land; _authoring = authoring; _operations = operations; _context = context; _accept = accept
	view = preload("res://src/terrain_generation_view.tscn").instantiate(); owner.add_child(view)
	_route_overlay = land.get_node("%GenerationRouteOverlay")
	view.generate_requested.connect(generate)
	view.apply_requested.connect(commit_selected)
	view.cancel_requested.connect(_cancel)
	view.close_requested.connect(discard_draft)
	view.draw_requested.connect(_draw)
	view.check_routes_requested.connect(check_routes)
	view.recovery_requested.connect(check_original)
	view.invalidated.connect(_show_overlay)
	view.comparison_changed.connect(_show_overlay)
	view.route_selected.connect(_route_selected)
	authoring.mask_accepted.connect(_accept_selection)
	authoring.mask_canceled.connect(_finish_drawing)
	authoring.mask_started.connect(_gesture_started)
	authoring.mask_failed.connect(_selection_failed)
	map.document_opened.connect(_document_opened)
	map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _cancel_requested = true
	_bridge = bridge; _pending.clear(); _clear()


func _clear() -> void:
	_cancel_requested = true
	if _drawing and _authoring != null: _authoring.end_mask()
	_drawing = false; _origin.clear(); _saved.clear()
	if is_instance_valid(view): view.hide()
	if is_instance_valid(_route_overlay): _route_overlay.present({})
	active_changed.emit(false)


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if not is_open():
		if reset: _saved.clear()
		return
	if reset or _origin.identity != _map.identity: _generation += 1; _clear()
	elif not _busy and _pending.is_empty(): view.invalidate()


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and origin.generation == _generation and origin.identity == _map.identity and not _map.is_dungeon


func is_open() -> bool:
	return not _origin.is_empty()


func _params() -> Dictionary:
	return {"identity":_map.identity, "expectedRevision":int(_context.call().revision)}


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func open() -> Dictionary:
	if _bridge == null or _map.identity.is_empty() or _map.is_dungeon: return _stale()
	if is_open(): active_changed.emit(true); return {"ok":true}
	var origin := {"identity":_map.identity, "generation":_generation}
	var response := await _operations.run_workflow(_bridge, "Open Generate Terrain", _request.bind("terrain-generation.open", _params()), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok", false): failed.emit(str(response.get("error", "Terrain generation is unavailable."))); return response
	_origin = origin
	response.result.mapIdentity = origin.identity
	response.result.name = _land.get_node("%MapTitle").text
	view.open(response.result, _authoring.selected, _saved)
	active_changed.emit(true); _draw()
	return response


func _draw() -> void:
	if _busy or not _pending.is_empty() or not _matches(_origin): return
	_drawing = true
	_authoring.begin_mask(view.drawing_cells(), view.shape_options(), true)
	_show_overlay()


func _accept_selection(cells: Array) -> void:
	if _drawing and _matches(_origin): view.accept_selection(cells)


func _gesture_started() -> void:
	if _drawing and _matches(_origin): view.invalidate()


func _finish_drawing() -> void:
	if not _drawing or not is_open(): return
	_authoring.end_mask(); _drawing = false; _show_overlay()


func _selection_failed(response: Dictionary) -> void:
	if _matches(_origin): view.show_failure(str(response.get("error", "Selection unavailable.")))


func _route_selected(_index: int) -> void:
	_show_overlay()


func _show_overlay() -> void:
	if not _matches(_origin): return
	_authoring.preview_mask(view.mask, view.display_plan())
	_route_overlay.present({} if view.showing_before() else view.selected_route())


func generate() -> Dictionary:
	if _busy or not _pending.is_empty() or not _matches(_origin): return _stale()
	var origin := _origin.duplicate(true)
	var params := _params(); params.intent = view.draft()
	_cancel_requested = false; _busy = true
	view.set_busy(true); _authoring.lock_mask(true)
	var response := await _operations.run_workflow(_bridge, "Generate Terrain", _generate_job.bind(origin, params), null, true)
	_busy = false
	if not _matches(origin): return _stale()
	view.set_busy(false); _authoring.lock_mask(false)
	if not response.get("ok", false): _failure(response, origin); return response
	if response.result.get("status", "") == "canceled": view.invalidate(); view.show_failure("Generation canceled. The map is unchanged.")
	elif params.intent == view.draft(): view.present(response.result.preview)
	_show_overlay()
	return response


func _generate_job(operation: ProvidenceEditorOperation, origin: Dictionary, params: Dictionary) -> Dictionary:
	var started := await operation.request("terrain-generation.begin", params)
	if not started.get("ok", false): return started
	var job := {"jobId":int(started.result.jobId)}
	operation.show_progress("Generating terrain…", "", _request_cancel)
	while true:
		if _cancel_requested or not _matches(origin): return await operation.request("terrain-generation.cancel", job)
		var response := await operation.request("terrain-generation.poll", job)
		if not response.get("ok", false) or response.result.get("status", "") != "pending": return response
		await view.get_tree().create_timer(0.05).timeout
	return _stale()


func _request_cancel() -> void:
	if not _applying: _cancel_requested = true


func _cancel() -> void:
	if _busy: _request_cancel()
	else: discard_draft()


func check_routes() -> Dictionary:
	if _busy or not _pending.is_empty() or not _matches(_origin): return _stale()
	view.invalidate()
	var origin := _origin.duplicate(true); var params := _params()
	params.connections = view.connections.duplicate(true)
	_busy = true; view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Check walking connections", _request.bind("map-connectivity.preview", params), null, true)
	_busy = false
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok", false): _failure(response, origin); return response
	view.show_routes(response.result.routes)
	view.show_failure("Routes checked. Generate a fresh terrain preview before Apply.")
	_show_overlay()
	return response


func has_unapplied_changes() -> bool:
	return _busy or not _pending.is_empty() or is_open() and not view.mask.is_empty()


func discard_draft(keep := true) -> void:
	if _applying or not _pending.is_empty(): return
	_cancel_requested = true
	if is_open(): _saved = view.draft() if keep else {}
	if _drawing: _authoring.end_mask()
	_drawing = false; _origin.clear()
	_authoring.preview_mask([], {}); _route_overlay.present({}); view.hide()
	active_changed.emit(false)


func commit_selected() -> Dictionary:
	if _busy or not _pending.is_empty() or not _matches(_origin) or not view.can_apply(): return _stale()
	var origin := _origin.duplicate(true)
	var params := {"identity":origin.identity, "expectedRevision":int(_context.call().revision),
		"intent":view.draft(), "reviewHash":view.review_hash(), "operationId":Crypto.new().generate_random_bytes(32).hex_encode()}
	_busy = true; _applying = true; view.set_busy(true); _authoring.lock_mask(true)
	var response := await _operations.run_workflow(_bridge, "Apply generated terrain", _submit.bind(origin, params), null, true)
	_busy = false; _applying = false
	if not _matches(origin): return response
	view.set_busy(false); _authoring.lock_mask(false)
	if not response.get("ok", false): _failure(response, origin)
	else:
		if _accept.call(response):
			projection_applied.emit(response.result)
			for cell: Dictionary in response.result.paintedCells: _land.update_cell(int(cell.x), int(cell.y), int(cell.tile))
			_land.apply_terrain_delta(response.result)
		discard_draft(false)
	return response


func _submit(operation: ProvidenceEditorOperation, origin: Dictionary, params: Dictionary) -> Dictionary:
	var response := await operation.request("terrain-generation.apply", params)
	if _matches(origin) and response.get("outcomeUnknown", false): _pending = {"origin":origin, "params":params}
	return response


func _failure(response: Dictionary, origin: Dictionary) -> void:
	if response.get("outcomeUnknown", false):
		if _pending.is_empty(): _pending = {"origin":origin, "readOnly":true}
		view.set_busy(false, true); _authoring.lock_mask(true)
	view.show_failure("Apply result is uncertain. Check the original operation before editing." if not _pending.is_empty() else str(response.get("error", "Terrain generation could not complete. Your draft is kept.")))
	failed.emit(str(response.get("error", "Terrain generation could not complete.")))


func check_original() -> void:
	if _busy or _pending.is_empty(): return
	var pending := _pending.duplicate(true)
	var lookup := {} if pending.get("readOnly", false) else {"domain":"project", "operationId":pending.params.operationId,
		"expectedIntent":{"method":"terrain-generation.apply", "params":pending.params}}
	_busy = true; view.set_busy(true, true)
	var response := await _operations.recover_world(_bridge, lookup)
	_busy = false
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false): response.outcomeUnknown = true; _failure(response, pending.origin); return
	var committed: bool = not pending.get("readOnly", false) and response.result.outcome == "committed"
	response = await _operations.run_workflow(_bridge, "Read recovered generated terrain", _refresh, null, true)
	if not _matches(pending.origin): return
	if not response.get("ok", false): response.outcomeUnknown = true; _failure(response, pending.origin); return
	_pending.clear(); view.set_busy(false); view.invalidate(); _authoring.lock_mask(false)
	if committed: discard_draft(false)
	else: _draw()


func _refresh(operation: ProvidenceEditorOperation) -> Dictionary:
	var response := await operation.request("session.describe", {})
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	return await _map.refresh_history(operation, response.result)


func _stale() -> Dictionary:
	return {"ok":false, "error":"Generate and review a fresh terrain preview for this map before applying."}


func dispose() -> void:
	attach_session(null)
	_map.document_opened.disconnect(_document_opened); _map.document_cleared.disconnect(_clear)
	_authoring.mask_accepted.disconnect(_accept_selection); _authoring.mask_canceled.disconnect(_finish_drawing)
	_authoring.mask_started.disconnect(_gesture_started); _authoring.mask_failed.disconnect(_selection_failed)
	_map = null; _authoring = null; _context = Callable(); _accept = Callable()
	for relay in [projection_applied, failed, active_changed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal active_changed(active: bool)
signal history_changed

var view: Control
var _map: ProvidenceMapDocumentController
var _land: ProvidenceLandEditor
var _authoring: RefCounted
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _read_context: Callable
var _accept: Callable
var _guard: Callable
var _button: Button
var _focus_origin: Control
var _generation := 0
var _origin: Dictionary = {}
var _pending: Dictionary = {}
var _saved_draft: Dictionary = {}
var _drawing := false
var _busy := false
var _reviewing := false
var _preview_generation := 0


func initialize(owner: Node, map: ProvidenceMapDocumentController, land: ProvidenceLandEditor, authoring: RefCounted, operations: ProvidenceEditorOperation, read_context: Callable, accept: Callable, guard: Callable) -> void:
	_map = map; _land = land; _authoring = authoring; _operations = operations; _read_context = read_context; _accept = accept; _guard = guard
	view = preload("res://src/smart_terrain_window.tscn").instantiate(); owner.add_child(view)
	_button = land.get_node("%SmartTerrain")
	_button.pressed.connect(_open_from_toolbar)
	view.review_requested.connect(review); view.apply_requested.connect(commit_selected)
	view.draw_requested.connect(_draw_mask); view.reshape_requested.connect(reshape)
	view.recovery_requested.connect(check_original); view.canceled.connect(_cancel)
	view.review_invalidated.connect(_invalidate_preview)
	view.comparison_changed.connect(func(): _authoring.preview_mask(view.mask,view.display_plan()))
	view.history_requested.connect(step_history)
	view.history_changed.connect(history_changed.emit)
	authoring.mask_accepted.connect(_accept_mask); authoring.mask_canceled.connect(_return_from_mask)
	authoring.mask_started.connect(view.invalidate)
	authoring.mask_settled.connect(_review_mask)
	authoring.mask_failed.connect(_mask_failed)
	map.document_opened.connect(_document_opened); map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _pending.clear(); _clear()


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if reset: _generation += 1; _clear()
	elif not _origin.is_empty() and _pending.is_empty() and not _busy: view.invalidate()


func _clear() -> void:
	_preview_generation += 1
	_origin.clear(); _saved_draft.clear(); _drawing = false
	if _authoring != null: _authoring.end_mask(); _authoring.preview_mask([], {})
	if is_instance_valid(view): view.dismiss()
	active_changed.emit(false)


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and origin.identity == _map.identity and not _map.is_dungeon


func _open_from_toolbar() -> void:
	await _guard.call(open, "opening Smart terrain")


func open() -> Dictionary:
	if _bridge == null or _map.identity.is_empty() or _map.is_dungeon: return _stale()
	if is_open(): active_changed.emit(true); return {"ok":true}
	var origin := {"identity":_map.identity,"generation":_generation}
	var response := await _operations.run_workflow(_bridge, "Open Smart terrain", _request.bind("smart-terrain.open", _params()), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok",false): _failure(response,origin); return response
	_origin = origin
	response.result.tilesetId = _land.atlas_projection.get("tilesetId", "")
	response.result.name = _land.get_node("%MapTitle").text
	view.open(response.result, _saved_draft.get("mask",_authoring.selected), _focus_origin if is_instance_valid(_focus_origin) else _button, _saved_draft.get("history",{}))
	active_changed.emit(true)
	_draw_mask(view.shape_options())
	if view.context.available and not view.mask.is_empty(): await review()
	return response


func is_open() -> bool:
	return not _origin.is_empty()


func set_focus_origin(origin: Control) -> void:
	_focus_origin = origin


func _params() -> Dictionary:
	return {"identity":_map.identity,"expectedRevision":int(_read_context.call().revision)}


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func _draw_mask(options: Dictionary) -> void:
	if _busy or not _pending.is_empty(): return
	options = options.duplicate(true); options.match = "connected-exact"
	_drawing = true; _authoring.begin_mask(view.mask, options, true)
	if view.review_is_current(): _authoring.preview_mask(view.mask, view.display_plan())


func _accept_mask(cells: Array) -> void:
	if not _drawing or not _matches(_origin): return
	view.accept_mask(cells)
	if not _authoring.has_mask_gesture(): await _review_mask()


func _review_mask() -> void:
	if _matches(_origin) and view.context.available and not view.mask.is_empty(): await review()


func _mask_failed(response: Dictionary) -> void:
	if _matches(_origin): _failure(response,_origin)


func step_history(redo: bool) -> void:
	if _busy or not _pending.is_empty() or _authoring.has_mask_gesture() or not _matches(_origin): return
	if view.step_history(redo):
		_draw_mask(view.shape_options())
		await _review_mask()


func history_state() -> Dictionary:
	if _busy or not _pending.is_empty() or _authoring.has_mask_gesture():
		return {"canUndo":false,"canRedo":false}
	return view.history_state()


func _return_from_mask() -> void:
	if not _drawing or not _matches(_origin) or not _pending.is_empty(): return
	while _reviewing or _authoring.has_mask_gesture(): await view.get_tree().process_frame
	if not _matches(_origin): return
	if view.review_is_current(): _authoring.preview_mask(view.mask,view.display_plan())
	else: await _review_mask()


func _invalidate_preview() -> void:
	_preview_generation += 1
	_authoring.preview_mask(view.mask, {})


func reshape(operation: String) -> Dictionary:
	if _busy or not _pending.is_empty() or not _matches(_origin): return _stale()
	var origin := _origin.duplicate(true); var params := _params()
	params.mask = view.draft().mask; params.operation = operation
	_busy = true; view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Reshape Smart terrain mask", _request.bind("smart-terrain.reshape",params), null, true)
	_busy = false
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok",false): _failure(response,origin); return response
	view.accept_mask(response.result.mask); _draw_mask(view.shape_options()); _authoring.preview_mask(view.mask,{})
	if view.context.available and not view.mask.is_empty(): await review()
	return response


func review() -> Dictionary:
	var waiting_origin := _origin.duplicate(true)
	while _operations.busy or _authoring.has_mask_gesture():
		await view.get_tree().process_frame
		if not _matches(waiting_origin) or not _pending.is_empty(): return _stale()
	if _reviewing:
		var generation := _generation
		while _reviewing and generation == _generation: await view.get_tree().process_frame
	if _busy or not _pending.is_empty() or not _matches(_origin): return _stale()
	var origin := _origin.duplicate(true); var params := _params(); params.intent = view.draft()
	var preview_generation := _preview_generation
	_busy = true; _reviewing = true; view.set_busy(true,false,true)
	var response := await _operations.run_workflow(_bridge, "Review Smart terrain", _request.bind("smart-terrain.preview",params), null, true)
	_busy = false; _reviewing = false
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok",false): view.invalidate(); _failure(response,origin); return response
	if preview_generation != _preview_generation or params.intent != view.draft() or _authoring.has_mask_gesture(): return _stale()
	view.context.revision = int(response.result.revision)
	view.present(response.result); _authoring.preview_mask(view.mask,view.display_plan())
	return response


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or _busy or _authoring.has_mask_gesture() or not _origin.is_empty() and view.has_unapplied_changes()


func _cancel(keep_mask := true) -> void:
	if (_busy and not _reviewing) or not _pending.is_empty(): return
	_generation += 1; _preview_generation += 1
	_saved_draft = {"mask":view.draft().mask,"history":view.mask_history()} if keep_mask else {}
	_origin.clear(); _drawing = false
	_authoring.end_mask()
	if not keep_mask: _authoring.clear_selection()
	_authoring.preview_mask([],{}); view.dismiss()
	active_changed.emit(false)


func discard_draft() -> void:
	_cancel()


func commit_selected() -> Dictionary:
	if _busy or not _pending.is_empty() or not _matches(_origin): return _stale()
	if not view.review_is_current():
		active_changed.emit(true); view.show_failure("Review the resolved cells before Apply.")
		return {"ok":false,"error":"Review at least one resolved changed cell before Apply."}
	var origin := _origin.duplicate(true)
	var params := {"identity":origin.identity,"expectedRevision":int(view.context.revision),"intent":view.draft(),"operationId":Crypto.new().generate_random_bytes(32).hex_encode()}
	_busy = true; view.set_busy(true); _authoring.lock_mask(true)
	var response := await _operations.run_workflow(_bridge,"Apply Smart terrain",_submit.bind(origin,params),null,true)
	_busy = false
	if not _matches(origin): return response
	view.set_busy(false); _authoring.lock_mask(false)
	if not response.get("ok",false): _failure(response,origin)
	else: _accept_result(response); _cancel(false)
	return response


func _submit(operation: ProvidenceEditorOperation, origin: Dictionary, params: Dictionary) -> Dictionary:
	var response := await operation.request("smart-terrain.apply",params)
	if _matches(origin) and response.get("outcomeUnknown",false): _pending = {"origin":origin,"params":params}
	return response


func _accept_result(response: Dictionary) -> void:
	if not _accept.call(response): return
	projection_applied.emit(response.result)
	for cell: Dictionary in response.result.paintedCells: _land.update_cell(int(cell.x),int(cell.y),int(cell.tile))
	_land.apply_terrain_delta(response.result)


func _failure(response: Dictionary, origin: Dictionary) -> void:
	if response.get("outcomeUnknown",false):
		if _pending.is_empty(): _pending = {"origin":origin,"readOnly":true}
		view.set_busy(true,true)
		_authoring.lock_mask(true)
	var message := str(response.get("error","Smart terrain could not complete. Your mask is kept."))
	view.show_failure(message); failed.emit(message)


func check_original() -> void:
	if _busy or _pending.is_empty(): return
	var pending := _pending.duplicate(true)
	var lookup := {} if pending.get("readOnly",false) else {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"smart-terrain.apply","params":pending.params}}
	_busy = true; view.set_busy(true)
	var response := await _operations.recover_world(_bridge,lookup)
	_busy = false
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed",false): response.outcomeUnknown = true; _failure(response,pending.origin); return
	var committed: bool = not pending.get("readOnly",false) and response.result.outcome == "committed"
	response = await _operations.run_workflow(_bridge,"Read recovered Smart terrain",_refresh,null,true)
	if not _matches(pending.origin): return
	if not response.get("ok",false): response.outcomeUnknown = true; _failure(response,pending.origin); return
	_pending.clear(); view.set_busy(false); view.invalidate(); _authoring.lock_mask(false)
	if committed: _cancel(false)
	else: _draw_mask(view.shape_options())


func _refresh(operation: ProvidenceEditorOperation) -> Dictionary:
	var response := await operation.request("session.describe",{})
	if not response.get("ok",false): return response
	projection_applied.emit(response.result)
	return await _map.refresh_history(operation,response.result)


func _stale() -> Dictionary:
	return {"ok":false,"error":"The Smart terrain destination changed. Reopen it before applying."}


func dispose() -> void:
	attach_session(null)
	_map.document_opened.disconnect(_document_opened); _map.document_cleared.disconnect(_clear)
	_button.pressed.disconnect(_open_from_toolbar)
	_authoring.mask_accepted.disconnect(_accept_mask); _authoring.mask_canceled.disconnect(_return_from_mask)
	_authoring.mask_started.disconnect(view.invalidate)
	_authoring.mask_settled.disconnect(_review_mask)
	_authoring.mask_failed.disconnect(_mask_failed)
	_map = null; _authoring = null; _read_context = Callable(); _accept = Callable(); _guard = Callable()
	for relay in [projection_applied,failed,active_changed,history_changed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

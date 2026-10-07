extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal status_changed(message: String)
signal stamp_selected(resource: Dictionary, presentation: Dictionary)
signal stamp_state_changed(state: Dictionary)

var _view: ProvidenceDungeonEditor
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _context: Callable
var _accept: Callable
var _overlay: Control
var _review: Window
var _bridge: RefCounted
var _generation := 0
var _resource: Dictionary = {}
var _resource_revision := 0
var _origin: Dictionary = {}
var _draft: Dictionary = {}
var _pending: Dictionary = {}
var _submitting := false
var _placing := false
var _reading := false
var _preview_sequence := 0
var _preview_queue: Dictionary = {}


func initialize(owner: Node, view: ProvidenceDungeonEditor, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, context: Callable, accept: Callable) -> void:
	_view = view; _map = map; _operations = operations; _context = context; _accept = accept
	_overlay = view.get_node("%DungeonStampOverlay")
	_review = preload("res://src/land_area_review.tscn").instantiate(); owner.add_child(_review)
	_review.title = "Review Dungeon stamp"
	_review.close_requested.connect(discard_draft)
	_review.get_node("%CancelArea").pressed.connect(discard_draft)
	_review.get_node("%ApplyArea").pressed.connect(commit_selected)
	_review.get_node("%CheckStamp").pressed.connect(check_original)
	_overlay.gesture_started.connect(_begin)
	_overlay.gesture_finished.connect(_finish)
	_overlay.gesture_changed.connect(func(_start,end,_positions): _hover(end))
	_overlay.pointer_cell_changed.connect(_hover)
	_overlay.gesture_canceled.connect(_cancel_preview)
	view.tool_changed.connect(func(_mode): _deactivate(false))
	map.document_opened.connect(_document_changed)
	map.document_cleared.connect(_deactivate)
	attach_session(_bridge)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _resource.clear(); _origin.clear(); _draft.clear(); _pending.clear(); _submitting = false
	if _view != null: _deactivate(); _review.hide(); _review.get_node("%CheckStamp").hide()


func select_stamp(resource: Dictionary, revision: int, presentation: Dictionary = {}) -> void:
	if not _map.is_dungeon or resource.levelType != "dungeon": return
	_resource = resource.duplicate(true); _resource_revision = revision
	_view.set_stamp_active(true); _overlay.set_active(true)
	stamp_selected.emit(_resource, presentation); _stamp_state()
	_status("%s · move to preview · release to place · Esc cancels" % resource.name)


func _document_changed(_projection: Dictionary, reset: bool) -> void:
	if reset: _generation += 1; _deactivate(); _draft.clear(); _review.hide()


func _deactivate(reset_mode := true) -> void:
	if _overlay == null: return
	_cancel_preview()
	_overlay.set_active(false); _view.clear_paint_preview()
	if reset_mode: _view.set_stamp_active(false)
	else: _view.clear_stamp_indicator()


func _begin(_cell: Vector2i) -> void:
	_origin = {"identity":_map.identity,"generation":_generation,"revision":int(_context.call().revision)}


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and origin.identity == _map.identity and _map.is_dungeon


func _finish(_start: Vector2i, cell: Vector2i, _positions: Array) -> void:
	if _placing: return
	_placing = true; _overlay.set_locked(true); _cancel_preview()
	while _reading or _operations.busy: await _view.get_tree().process_frame
	await _place(cell)
	_placing = false; _overlay.set_locked(false)


func _place(cell: Vector2i) -> void:
	if not _matches(_origin) or _resource.is_empty() or has_unapplied_changes(): return
	var origin := _origin.duplicate(true)
	var params := {"identity":origin.identity,"expectedRevision":int(origin.revision),"resourceIdentity":_resource.identity,
		"resourceRevision":_resource_revision,"origin":{"x":cell.x,"y":cell.y}}
	var response := await _operations.run_workflow(_bridge, "Preview Dungeon stamp", _request.bind("map-stamp.preview", params), null, true)
	if not _matches(origin): return
	if not response.get("ok", false):
		if response.get("outcomeUnknown", false): _pending = {"origin":origin,"readOnly":true}
		if response.get("outcomeUnknown",false): _failure(response)
		else: _invalid_preview(response,cell)
		return
	_view.show_paint_preview(response.result)
	_overlay.show_preview(response.result.paintedCells)
	_status(preload("res://src/stamp_preview.gd").status(_resource,response.result))
	if response.result.canApply:
		_draft = {"origin":origin,"params":params}
		await commit_selected()


func _cancel_preview() -> void:
	_preview_sequence += 1; _preview_queue.clear()
	_view.clear_paint_preview(); _overlay.cancel_gesture()


func _hover(cell: Vector2i) -> void:
	if _placing or _submitting or has_unapplied_changes() or not _overlay.active or _resource.is_empty(): return
	_preview_sequence += 1; _preview_queue.clear()
	if cell.x<0: _view.clear_paint_preview(); _overlay.cancel_gesture(); return
	_preview_queue = {"cell":cell,"sequence":_preview_sequence,"origin":{"identity":_map.identity,"generation":_generation,"revision":int(_context.call().revision)}}
	if not _reading: _read_previews()


func _read_previews() -> void:
	_reading = true
	while not _preview_queue.is_empty():
		if _operations.busy: await _view.get_tree().process_frame; continue
		var queued := _preview_queue.duplicate(true); _preview_queue.clear()
		var params := {"identity":queued.origin.identity,"expectedRevision":int(queued.origin.revision),"resourceIdentity":_resource.identity,
			"resourceRevision":_resource_revision,"origin":{"x":queued.cell.x,"y":queued.cell.y}}
		var response := await _operations.run_workflow(_bridge,"Preview Dungeon stamp",_request.bind("map-stamp.preview",params),null,true)
		if not _matches(queued.origin) or queued.sequence != _preview_sequence: continue
		if response.get("ok",false):
			_view.show_paint_preview(response.result); _overlay.show_preview(response.result.paintedCells)
			_status(preload("res://src/stamp_preview.gd").status(_resource,response.result))
		elif response.get("outcomeUnknown",false):
			_pending = {"origin":queued.origin,"readOnly":true}; _failure(response)
		else: _invalid_preview(response,queued.cell)
	_reading = false


func _invalid_preview(response: Dictionary, cell: Vector2i) -> void:
	var plan := preload("res://src/stamp_preview.gd").invalid(_resource,cell)
	_view.clear_paint_preview(); _overlay.show_preview(plan.terrainCells,{"protectedCells":plan.protectedCells})
	_status(str(response.get("error","Stamp unavailable."))+" · no cells changed")


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method, params)


func has_unapplied_changes() -> bool:
	return not _draft.is_empty() or not _pending.is_empty()


func discard_draft() -> void:
	if _submitting or not _pending.is_empty(): return
	_draft.clear(); _review.hide(); _view.clear_paint_preview(); _overlay.cancel_gesture(); _overlay.grab_focus()
	_stamp_state(); _status("Placement discarded · move to preview another placement")


func commit_selected() -> Dictionary:
	if _submitting or not _pending.is_empty() or _draft.is_empty(): return {"ok":false,"error":"Check the original stamp operation before applying."}
	var draft := _draft.duplicate(true)
	if not _matches(draft.origin): return {"ok":false,"error":"The stamp destination changed."}
	_submitting = true; _stamp_state(); _review.get_node("%ApplyArea").disabled = true; _review.get_node("%CancelArea").disabled = true
	var response := await _operations.run_workflow(_bridge, "Apply Dungeon stamp", _submit.bind(draft), null, true)
	_submitting = false
	_review.get_node("%CancelArea").disabled = not _pending.is_empty(); _review.get_node("%ApplyArea").disabled = not _pending.is_empty()
	if not response.get("ok", false): _failure(response)
	_stamp_state()
	return response


func _submit(operation: ProvidenceEditorOperation, draft: Dictionary) -> Dictionary:
	var params: Dictionary = draft.params.duplicate(true)
	var preview := await operation.request("map-stamp.preview", params)
	if not _matches(draft.origin): return {"ok":false,"error":"The stamp destination changed."}
	if not preview.get("ok", false):
		if preview.get("outcomeUnknown", false): _pending = {"origin":draft.origin,"readOnly":true}
		return preview
	if not preview.result.canApply: _draft.clear(); return preview
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	var response := await operation.request("map-stamp.apply", params)
	if not _matches(draft.origin): return {"ok":false,"error":"The stamp destination changed."}
	if response.get("outcomeUnknown", false): _pending = {"origin":draft.origin,"params":params}; return response
	if not response.get("ok", false): return response
	if not _accept.call(response): return response
	projection_applied.emit(response.result)
	for cell: Dictionary in response.result.paintedCells: _view.update_cell_value(int(cell.x), int(cell.y), int(cell.tile))
	_draft.clear(); _review.hide(); _view.clear_paint_preview(); _overlay.cancel_gesture(); _overlay.grab_focus()
	_status("Stamp placed.")
	return response


func _failure(response: Dictionary) -> void:
	var message := str(response.get("error", "Your Dungeon stamp draft is kept."))
	if _pending.get("confirmedCommitted", false): message = "Placement saved; refresh failed. Check again to refresh the map. " + message
	_review.get_node("%ReviewStatus").text = message
	if not _pending.is_empty(): _overlay.set_active(false)
	_status(message + " · placement kept"); _stamp_state()
	failed.emit(message)


func check_original() -> void:
	if _pending.is_empty() or _submitting: return
	var pending := _pending.duplicate(true)
	var lookup := {} if pending.get("readOnly", false) else {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"map-stamp.apply","params":pending.params}}
	var response := await _operations.recover_world(_bridge, lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed", false): _failure(response); return
	var committed: bool = pending.get("confirmedCommitted", false) or not pending.get("readOnly", false) and response.result.outcome == "committed"
	# Keep the original identity through refresh failures; a saved placement is not retryable.
	_pending.confirmedCommitted = committed
	var refreshed := await _operations.run_workflow(_bridge, "Read current Dungeon stamp destination", _refresh.bind(committed), null, true)
	if not _matches(pending.origin): return
	if not refreshed.get("ok", false): _failure(refreshed); return
	_pending.clear()
	_review.get_node("%CheckStamp").hide(); _review.get_node("%ApplyArea").disabled = false; _review.get_node("%CancelArea").disabled = false
	_overlay.set_active(true)
	if committed: discard_draft()
	_stamp_state(); _status("Original placement confirmed · move to place again" if committed else "Original placement did not commit · retry or discard the retained placement")


func _refresh(operation: ProvidenceEditorOperation, committed: bool) -> Dictionary:
	var response := await operation.request("session.describe", {})
	if not response.get("ok", false): return response
	projection_applied.emit({"revision":int(response.result.revision),"canUndo":response.result.canUndo,"canRedo":response.result.canRedo,"truncated":true})
	var refreshed := await _map.refresh_history(operation)
	if refreshed.get("ok", false) and not committed and not _draft.is_empty(): _draft.params.expectedRevision = int(response.result.revision)
	return refreshed


func dispose() -> void:
	_generation += 1; _bridge = null; _context = Callable(); _accept = Callable()
	for source in [_map.document_opened, _map.document_cleared]:
		for connection in source.get_connections():
			if connection.callable.get_object() == self: source.disconnect(connection.callable)
	for relay in [projection_applied, failed, status_changed, stamp_selected, stamp_state_changed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)


func _status(message: String) -> void:
	_view.show_feature_status(message); status_changed.emit(message)


func _stamp_state() -> void:
	stamp_state_changed.emit({"busy": _submitting, "unknown": not _pending.is_empty(), "retained": not _draft.is_empty()})

extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)
signal submission_finished(response: Dictionary)
var view: Window
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept: Callable
var _bridge: RefCounted
var _generation := 0
var _origin: Dictionary = {}
var _pending: Dictionary = {}
var _reviewed: Dictionary = {}
var _focus: Control
var _waiting := false
var _owner: WeakRef
var _presentation: Callable
var _default_focus: Control


func initialize(owner: Node, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, read_context: Callable, accept: Callable, focus: Control, presentation: Callable = Callable()) -> void:
	_map = map; _operations = operations; _read_context = read_context; _accept = accept; _focus = focus
	_default_focus = focus
	_owner = weakref(owner)
	_presentation = presentation
	view = preload("res://src/land_cell_behavior_window.tscn").instantiate(); owner.add_child(view)
	view.review_requested.connect(review); view.apply_requested.connect(apply_review)
	view.recovery_requested.connect(check_original); view.canceled.connect(_canceled)
	map.document_opened.connect(_document_changed); map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _pending.clear(); _clear()


func _document_changed(_data: Dictionary, reset: bool) -> void:
	if reset: _generation += 1; _clear()


func selection_changed() -> void:
	if not _origin.is_empty() and not _matches(_origin): _clear()


func _clear() -> void:
	_origin.clear(); _reviewed.clear()
	if is_instance_valid(view): view.dismiss()
	if _waiting: submission_finished.emit(_stale())


func _canceled() -> void:
	_reviewed.clear()
	if _waiting: submission_finished.emit({"ok":false,"canceled":true})


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and str(origin.identity) == _map.identity and _map.selected_cell == Vector2i(int(origin.x),int(origin.y)) and not _map.is_dungeon


func open(focus: Control = null) -> Dictionary:
	if _map.selected_cell.x < 0 or _map.is_dungeon or _bridge == null or not _pending.is_empty(): return _stale()
	_focus = focus if focus != null else _default_focus
	var origin := {"identity":_map.identity,"x":_map.selected_cell.x,"y":_map.selected_cell.y,"generation":_generation}
	var params := {"identity":origin.identity,"x":origin.x,"y":origin.y,"expectedRevision":int(_read_context.call().revision)}
	var response := await _operations.run_workflow(_bridge,"Open cell behavior",func(operation): return await operation.request("land-cell.open",params),null,true)
	if not _matches(origin): return _stale()
	_origin = origin; _reviewed.clear(); _attach_modal_owner()
	if not response.get("ok",false):
		if response.get("outcomeUnknown",false): _pending = {"origin":origin,"readOnly":true,"opening":true}
		view.present_unavailable(origin,_focus,str(response.get("error","Cell behavior could not open.")),not _pending.is_empty())
		failed.emit(str(response.get("error","Cell behavior could not open."))); return response
	view.present(response.result,_focus)
	if _presentation.is_valid(): view.present_selection(_presentation.call())
	return response


func _attach_modal_owner() -> void:
	var host: Window = _focus.get_window()
	var owner: Node = _owner.get_ref()
	var target: Node = owner if owner.get_window() == host else host
	if view.get_parent() != target: view.reparent(target)


func has_unapplied_changes() -> bool: return not _pending.is_empty() or view.has_unapplied_changes()


func discard_draft() -> void:
	if _pending.is_empty() and not _operations.busy: view.dismiss(); _reviewed.clear()


func _params() -> Dictionary:
	return {"identity":_origin.identity,"expectedRevision":int(view.context.revision),"edit":view.draft()}


func review() -> Dictionary:
	if not _matches(_origin) or not _pending.is_empty(): return _stale()
	var origin := _origin.duplicate(true); var params := _params(); _reviewed.clear(); view.set_busy(true)
	var response := await _operations.run_workflow(_bridge,"Review cell behavior",_read_review.bind(params,origin),null,true)
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if response.get("ok",false): _reviewed = params; view.present_review(response.result)
	else: _failure(response)
	return response


func _read_review(operation: ProvidenceEditorOperation, params: Dictionary, origin: Dictionary) -> Dictionary:
	var rows: Array = []; var total := -1
	while true:
		params.offset = rows.size()
		var response := await operation.request("land-cell.preview",params)
		if not _matches(origin): return _stale()
		if not response.get("ok",false): return response
		var page: Dictionary = response.result
		if total < 0: total = int(page.total)
		if int(page.total) != total or int(page.offset) != rows.size() or page.cell.affectedMaps.size() > 128 or rows.size() + page.cell.affectedMaps.size() > total or page.cell.affectedMaps.is_empty() and rows.size() < total:
			return {"ok":false,"error":"The shared passability impact list is incomplete."}
		rows.append_array(page.cell.affectedMaps)
		if rows.size() == total: page.cell.affectedMaps = rows; return response
	return _stale()


func apply_review() -> Dictionary:
	if not _matches(_origin) or not _pending.is_empty() or not view.review_is_current() or _reviewed.edit != view.draft(): return _stale()
	var origin := _origin.duplicate(true); view.set_busy(true)
	var response := await _operations.run_workflow(_bridge,"Apply cell behavior",_commit.bind(origin),null,true)
	if not _matches(origin): return _stale()
	view.set_busy(false)
	if not response.get("ok",false): _failure(response)
	if _waiting: submission_finished.emit(response)
	else: _accept.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, origin: Dictionary) -> Dictionary:
	var params := _reviewed.duplicate(true); params.erase("offset"); params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"origin":origin,"params":params}
	var response := await operation.request("land-cell.apply",params)
	if not _matches(origin): return _stale()
	if response.get("outcomeUnknown",false): return response
	_pending.clear()
	if not response.get("ok",false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation,response.result)
	if not refreshed.get("ok",false): _pending = {"origin":origin,"readOnly":true,"committed":true}; return refreshed
	view.dismiss(); _reviewed.clear(); return response


func commit_selected() -> Dictionary:
	_waiting = true; var response := await review()
	if response.get("ok",false): response = await submission_finished
	_waiting = false; _accept.call(response); return response


func _failure(response: Dictionary) -> void:
	if response.get("outcomeUnknown",false) and _pending.is_empty(): _pending = {"origin":_origin.duplicate(true),"readOnly":true}
	view.show_failure(str(response.get("error","Cell behavior could not apply.")),not _pending.is_empty())
	failed.emit(str(response.get("error","Your cell draft is kept.")))


func check_original() -> void:
	if _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true); var lookup := {}
	if not pending.get("readOnly",false): lookup = {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"land-cell.apply","params":pending.params}}
	var response := await _operations.recover_world(_bridge,lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed",false): response.outcomeUnknown = true; _failure(response); return
	var committed: bool = pending.get("committed",false) or not pending.get("readOnly",false) and response.result.outcome == "committed"
	response = await _operations.run_workflow(_bridge,"Read original cell result",func(operation):
		var described: Dictionary = await operation.request("session.describe",{})
		if not described.get("ok",false): return described
		projection_applied.emit(described.result)
		return await _map.refresh_history(operation,described.result),null,true)
	if not _matches(pending.origin): return
	if not response.get("ok",false): _failure(response); return
	_pending.clear(); view.set_busy(false)
	if pending.get("opening",false): await open(_focus)
	elif committed: view.dismiss(); _reviewed.clear()
	else: view.context.revision = int(_read_context.call().revision); await review()


func _stale() -> Dictionary: return {"ok":false,"stale":true,"error":"The selected map cell changed. Reopen its behavior before applying."}


func dispose() -> void:
	attach_session(null); _map.document_opened.disconnect(_document_changed); _map.document_cleared.disconnect(_clear)
	view.queue_free()
	_read_context = Callable(); _accept = Callable(); _presentation = Callable(); _focus = null; _default_focus = null
	for relay in [projection_applied,failed,submission_finished]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

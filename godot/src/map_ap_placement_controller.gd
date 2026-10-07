extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)

var view: Window
var _workspace
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _land: Control
var _dungeon: Control
var _generation := 0
var _intent: Dictionary = {}
var _reviewed: Dictionary = {}
var _pending: Dictionary = {}
var _submitting := false


func initialize(owner: Node, workspace, land: Control, dungeon: Control, operations: ProvidenceEditorOperation) -> void:
	_workspace = workspace; _land = land; _dungeon = dungeon; _operations = operations
	view = preload("res://src/map_ap_placement_review.tscn").instantiate(); owner.add_child(view)
	view.accepted.connect(commit_selected); view.canceled.connect(discard_draft)
	view.review_requested.connect(review_again); view.recovery_requested.connect(check_original)
	for editor in [land,dungeon]:
		editor.action_point_placement_requested.connect(place)
		editor.placement_canceled.connect(_cancel_tool)
	workspace.document.document_opened.connect(_document_opened)
	workspace.document.document_cleared.connect(discard_draft)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _intent.clear(); _reviewed.clear(); _pending.clear(); _submitting = false
	if is_instance_valid(view): view.dismiss()


func place(cell: Vector2i, action_point: Dictionary) -> void:
	if _bridge == null or _operations.busy or has_unapplied_changes(): return
	if not action_point.is_empty(): await _workspace.open_action_point(str(action_point.identity)); return
	_intent = {"mapIdentity":_workspace.document.identity,"x":cell.x,"y":cell.y}
	await review_again()


func review_again() -> Dictionary:
	if _bridge == null or _intent.is_empty() or not _pending.is_empty() or _operations.busy: return _stale()
	var generation := _generation; var params := _intent.duplicate(true)
	params.expectedRevision = int(_workspace.paint_context().revision)
	var editor: Control = _dungeon if _workspace.document.is_dungeon else _land
	_reviewed.clear(); view.loading(Vector2i(params.x,params.y),str(params.mapIdentity),editor.placement_focus_control())
	var response := await _operations.run_workflow(_bridge,"Review Action Point placement",func(op):
		return await op.request("action-point.creation-review",params),null,true)
	if generation != _generation or params.mapIdentity != _workspace.document.identity: return _stale()
	if not response.get("ok",false):
		if response.get("outcomeUnknown",false): _pending = {"readOnly":true,"generation":generation}
		view.failure(str(response.get("error","Placement could not be reviewed.")),not _pending.is_empty()); return response
	_intent = params; _reviewed = response.result.duplicate(true); view.present(_reviewed)
	return response


func has_unapplied_changes() -> bool:
	return not _intent.is_empty() or not _pending.is_empty()


func discard_draft() -> void:
	if _submitting or not _pending.is_empty(): return
	_intent.clear(); _reviewed.clear()
	if is_instance_valid(view): view.dismiss()


func commit_selected() -> Dictionary:
	if _bridge == null or _reviewed.is_empty() or not _pending.is_empty() or _submitting: return _stale()
	var generation := _generation; var params := _intent.duplicate(true)
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_submitting = true; view.set_busy(true)
	var response := await _operations.run_workflow(_bridge,"Create Action Point",func(op):
		return await op.request("action-point.create",params),null,true)
	if generation != _generation: return _stale()
	_submitting = false
	if response.get("outcomeUnknown",false): _pending = {"generation":generation,"params":params,"identity":_reviewed.identity}
	if not response.get("ok",false): view.failure(str(response.get("error","Placement failed. The draft is kept.")),not _pending.is_empty()); return response
	if not response.result.get("changedEntities",[]).has(_reviewed.identity):
		view.failure("Creation was acknowledged, but the returned identity did not match. Reopen the project to inspect it.",true)
		_pending = {"readOnly":true,"generation":generation}; return response
	projection_applied.emit(response.result)
	var identity: String = _reviewed.identity
	var refreshed: Dictionary = await _workspace.document.refresh_history()
	if generation != _generation: return _stale()
	if not refreshed.get("ok",false):
		_pending = {"generation":generation,"params":params,"identity":identity}
		view.failure("The Action Point was created, but the map could not refresh. Check the original result to recover without creating another.",true)
		return refreshed
	discard_draft()
	await _workspace.open_action_point(identity)
	return response


func check_original() -> void:
	if _bridge == null or _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true)
	var lookup := {} if pending.get("readOnly",false) else {"domain":"project","operationId":pending.params.operationId,
		"expectedIntent":{"method":"action-point.create","params":pending.params}}
	var response := await _operations.recover_world(_bridge,lookup)
	if int(pending.generation) != _generation: return
	if not response.get("worldRecoveryConfirmed",false): view.failure(str(response.get("error","The original result remains unconfirmed.")),true); return
	var committed: bool = not pending.get("readOnly",false) and response.result.outcome == "committed"
	var refreshed := await _operations.run_workflow(_bridge,"Refresh recovered Action Point",_refresh_recovered,null,true)
	if int(pending.generation) != _generation: return
	if not refreshed.get("ok",false): view.failure(str(refreshed.get("error","The recovered map could not refresh.")),true); return
	_pending.clear()
	if committed:
		discard_draft(); await _workspace.open_action_point(str(pending.identity))
	else: await review_again()


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if reset: discard_draft()


func _cancel_tool() -> void:
	if not has_unapplied_changes(): await _workspace.chrome.request_tool("select")


func _stale() -> Dictionary:
	return {"ok":false,"error":"The map or Action Point placement draft changed. Choose the cell again."}


func dispose() -> void:
	attach_session(null)
	for editor in [_land,_dungeon]:
		editor.action_point_placement_requested.disconnect(place); editor.placement_canceled.disconnect(_cancel_tool)
	_workspace.document.document_opened.disconnect(_document_opened)
	_workspace.document.document_cleared.disconnect(discard_draft)
	for source in [projection_applied,failed]:
		for connection in source.get_connections(): source.disconnect(connection.callable)
	view.queue_free(); _workspace = null


func _refresh_recovered(operation: ProvidenceEditorOperation) -> Dictionary:
	var response := await operation.request("session.describe",{})
	if not response.get("ok",false): return response
	projection_applied.emit(response.result)
	return await _workspace.document.refresh_history(operation)

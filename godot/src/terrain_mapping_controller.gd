extends RefCounted

signal projection_applied(projection: Dictionary)
signal failed(message: String)

var view: Window
var _map: ProvidenceMapDocumentController
var _land: ProvidenceLandEditor
var _operations: ProvidenceEditorOperation
var _bridge: RefCounted
var _read_context: Callable
var _accept: Callable
var _guard: Callable
var _button: Button
var _generation := 0
var _origin: Dictionary = {}
var _pending: Dictionary = {}
var _busy := false


func initialize(owner: Node, map: ProvidenceMapDocumentController, land: ProvidenceLandEditor, sidebar: Control, operations: ProvidenceEditorOperation, read_context: Callable, accept: Callable, guard: Callable) -> void:
	_map = map; _land = land; _operations = operations; _read_context = read_context; _accept = accept; _guard = guard
	view = preload("res://src/terrain_mapping_window.tscn").instantiate(); owner.add_child(view)
	_button = sidebar.get_node("%TerrainMapping")
	_button.pressed.connect(_open_from_toolbar)
	view.layout_requested.connect(_review); view.accept_requested.connect(commit_selected); view.recovery_requested.connect(check_original)
	view.retry_requested.connect(open)
	map.document_opened.connect(_document_opened); map.document_cleared.connect(_clear)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1; _bridge = bridge; _pending.clear(); _clear()


func _clear() -> void:
	_origin.clear(); _busy = false
	if is_instance_valid(view): view.dismiss()


func _document_opened(_data: Dictionary, reset: bool) -> void:
	if reset: _generation += 1; _clear()


func _matches(origin: Dictionary) -> bool:
	return _bridge != null and not origin.is_empty() and int(origin.generation) == _generation and origin.identity == _map.identity and not _map.is_dungeon


func _open_from_toolbar() -> void:
	await _guard.call(open, "opening Terrain Mapping")


func open() -> Dictionary:
	if _bridge == null or _map.identity.is_empty() or _map.is_dungeon: return _stale()
	var origin := {"identity":_map.identity,"generation":_generation}
	var params := {"identity":_map.identity,"expectedRevision":int(_read_context.call().revision)}
	var response := await _operations.run_workflow(_bridge, "Open Terrain Mapping", _request.bind("terrain-mapping.open",params), null, true)
	if not _matches(origin): return _stale()
	if not response.get("ok",false):
		_origin.clear()
		view.open_failure(str(response.get("error", "Terrain Mapping could not load.")),_map.identity,_button)
		return response
	_origin = origin; view.open(response.result,_land.atlas_projection,_button)
	return response


func _request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	return await operation.request(method,params)


func _params() -> Dictionary:
	return {"identity":_origin.identity,"expectedRevision":int(view.context.revision)}


func _review(layout: String) -> void:
	if _busy or not _pending.is_empty() or not _matches(_origin): return
	var origin := _origin.duplicate(true); var params := _params(); params.layoutIdentity = layout
	_busy = true; view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Review Terrain Mapping", _request.bind("terrain-mapping.review",params), null, true)
	_busy = false
	if not _matches(origin): return
	view.set_busy(false)
	if response.get("ok",false): view.present_review(response.result)
	else: _failure(response)


func has_unapplied_changes() -> bool:
	return not _pending.is_empty() or view.has_unapplied_changes()


func discard_draft() -> void:
	if not _busy and _pending.is_empty(): view.dismiss()


func commit_selected() -> Dictionary:
	if _busy or not _pending.is_empty() or not _matches(_origin): return _stale()
	var params := _params(); params.edit = view.draft(); params.atlasBlob = view.context.atlasBlob
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	var origin := _origin.duplicate(true)
	_pending = {"origin":origin,"params":params}; _busy = true; view.set_busy(true)
	var response := await _operations.run_workflow(_bridge, "Accept Terrain Mapping", _commit.bind(params,origin), null, true)
	_busy = false
	if not _matches(origin): return _stale()
	if not response.get("ok",false): _failure(response)
	_accept.call(response)
	return response


func _commit(operation: ProvidenceEditorOperation, params: Dictionary, origin: Dictionary) -> Dictionary:
	var response := await operation.request("terrain-mapping.accept",params)
	if not _matches(origin): return _stale()
	if response.get("outcomeUnknown",false): return response
	_pending.clear()
	if not response.get("ok",false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation,response.result)
	if not refreshed.get("ok",false): _pending = {"origin":origin,"readOnly":true,"committed":true}; return refreshed
	view.dismiss(); return response


func _failure(response: Dictionary) -> void:
	view.set_busy(not _pending.is_empty(),not _pending.is_empty())
	var message := str(response.get("error", "The mapping was not accepted. Your draft is kept."))
	view.show_failure(message); failed.emit(message)


func check_original() -> void:
	if _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true); var lookup := {}
	if not pending.get("readOnly",false): lookup = {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":"terrain-mapping.accept","params":pending.params}}
	var response := await _operations.recover_world(_bridge,lookup)
	if not _matches(pending.origin): return
	if not response.get("worldRecoveryConfirmed",false): response.outcomeUnknown = true; _failure(response); return
	var committed: bool = pending.get("committed",false) or not pending.get("readOnly",false) and response.result.outcome == "committed"
	var kept: Dictionary = view.draft()
	_pending.clear()
	response = await _operations.run_workflow(_bridge,"Read original mapping result",_reconcile.bind(committed,kept),null,true)
	if not response.get("ok",false): _pending = {"origin":_origin.duplicate(true),"readOnly":true,"committed":committed}; _failure(response)


func _reconcile(operation: ProvidenceEditorOperation, committed: bool, kept: Dictionary) -> Dictionary:
	var response := await operation.request("session.describe",{})
	if not response.get("ok",false): return response
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation,response.result)
	if not refreshed.get("ok",false): return refreshed
	if committed: view.dismiss(); return response
	var params := _params(); params.expectedRevision = int(_read_context.call().revision); params.layoutIdentity = kept.layoutIdentity
	response = await operation.request("terrain-mapping.review",params)
	if response.get("ok",false): view.open(response.result,_land.atlas_projection,_button); view.restore_draft(kept)
	return response


func _stale() -> Dictionary:
	return {"ok":false,"stale":true,"error":"The mapping destination changed. Reopen Terrain Mapping before applying."}


func dispose() -> void:
	attach_session(null)
	if _map != null: _map.document_opened.disconnect(_document_opened); _map.document_cleared.disconnect(_clear)
	if is_instance_valid(_button): _button.pressed.disconnect(_open_from_toolbar)
	_map = null; _land = null; _read_context = Callable(); _accept = Callable(); _guard = Callable()
	for relay in [projection_applied,failed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

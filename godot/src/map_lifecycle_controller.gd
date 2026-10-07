extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _context: Callable
var _show_created: Callable
var _bridge: RefCounted
var _generation := 0
var view: Window
var _sidebar: ProvidenceMapContextSidebar
var _intent: Dictionary = {}
var _reviewed: Dictionary = {}
var _pending: Dictionary = {}
var _submitting := false


func initialize_review(owner: Node, sidebar: ProvidenceMapContextSidebar) -> void:
	_sidebar = sidebar
	view = preload("res://src/map_creation_review.tscn").instantiate(); owner.add_child(view)
	view.accepted.connect(apply_review); view.canceled.connect(discard_draft)
	view.review_requested.connect(review_again); view.recovery_requested.connect(check_original)
	_map.document_opened.connect(_document_changed); _map.document_cleared.connect(_document_cleared)


func _document_changed(_data: Dictionary, reset: bool) -> void:
	if reset and not _submitting and _pending.is_empty(): discard_draft()


func _document_cleared() -> void:
	if not _submitting and _pending.is_empty(): discard_draft()


func initialize(map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, context: Callable, show_created: Callable) -> void:
	_map = map
	_operations = operations
	_context = context
	_show_created = show_created


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_pending.clear(); _intent.clear(); _reviewed.clear()
	if is_instance_valid(view): view.dismiss()


func teardown() -> void:
	attach_session(null)


func create_map(level_type: String) -> Dictionary:
	return await _submit("map.create", {"levelType": level_type}, "Created %s map" % level_type.capitalize())


func duplicate_map(source: String) -> Dictionary:
	return await _submit("map.duplicate", {"source": source}, "Duplicated %s" % source)


func review_create_map(level_type: String) -> Dictionary:
	if _submitting or not _pending.is_empty(): return _stale()
	_intent = {"method":"map.create","params":{"levelType":level_type}}
	return await review_again()


func review_duplicate_map(source: String) -> Dictionary:
	if _submitting or not _pending.is_empty(): return _stale()
	_intent = {"method":"map.duplicate","params":{"source":source}}
	return await review_again()


func review_again() -> Dictionary:
	if _bridge == null or _intent.is_empty() or not _pending.is_empty(): return _stale()
	var generation := _generation; var params: Dictionary = _intent.params.duplicate(true)
	params.expectedRevision = int(_context.call().revision)
	var origin: Control = _sidebar.get_node("%DuplicateMap") if params.has("source") else _sidebar.get_node("%NewLand" if params.levelType == "land" else "%NewDungeon")
	_reviewed.clear(); view.loading(origin)
	var response := await _operations.run_workflow(_bridge,"Review map allocation",func(op): return await op.request("map.creation-review",params),null,true)
	if generation != _generation: return _stale()
	if not response.get("ok",false):
		if response.get("outcomeUnknown",false): _pending = {"generation":generation,"readOnly":true,"committed":false,"identity":""}
		view.show_failure(str(response.get("error","Map allocation could not be reviewed.")),response.get("outcomeUnknown",false)); return response
	_intent.params = params; _reviewed = response.result.duplicate(true)
	view.present(response.result,origin); return response


func has_unapplied_changes() -> bool:
	return not _intent.is_empty() or not _pending.is_empty()


func discard_draft() -> void:
	if _submitting or not _pending.is_empty(): return
	_intent.clear(); _reviewed.clear()
	if is_instance_valid(view): view.dismiss()


func apply_review() -> Dictionary:
	if _reviewed.is_empty() or _intent.is_empty() or not _pending.is_empty(): return _stale()
	var generation := _generation
	_submitting = true; view.set_busy(true)
	var response := await _submit(_intent.method,_intent.params.duplicate(true),"Created " + str(_reviewed.plan.name))
	if generation != _generation: return _stale()
	_submitting = false
	if response.get("ok",false) and not response.has("viewRefreshError"): discard_draft()
	else: view.show_failure(str(response.get("error",response.get("viewRefreshError","The allocation draft is kept."))),not _pending.is_empty())
	return response


func commit_selected() -> Dictionary:
	return await apply_review()


func _submit(method: String, params: Dictionary, summary: String) -> Dictionary:
	if _bridge == null: return _stale()
	if not params.has("expectedRevision"): params.expectedRevision = int(_context.call().revision)
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	var generation := _generation
	var response := await _operations.run_workflow(_bridge, summary, _mutate.bind(method, params, generation),null,true)
	if generation != _generation: return _stale()
	if not response.get("ok", false):
		failed.emit(str(response.get("error", "The map could not be created.")))
	elif response.has("viewRefreshError"):
		failed.emit("The map was created, but its view could not refresh. " + str(response.viewRefreshError))
	else:
		_intent.clear(); _reviewed.clear()
		if is_instance_valid(view): view.dismiss()
		var shown: bool = await _show_created.call(response.mapIdentity)
		if shown and generation == _generation:
			status_changed.emit("%s · revision %d" % [summary, int(response.result.revision)])
	return response


func _mutate(operation: ProvidenceEditorOperation, method: String, params: Dictionary, generation: int) -> Dictionary:
	var existing: Array = _map.maps.map(func(map): return str(map.identity))
	var response := await operation.request(method, params)
	if generation == _generation and response.get("outcomeUnknown",false):
		_pending = {"generation":generation,"method":method,"params":params,"identity":_reviewed.get("plan",{}).get("identity","")}
	if not response.get("ok", false): return response
	if generation != _generation: return _stale()
	projection_applied.emit(response.result)
	# Catalog and document reads borrow the submission lease. A failed read
	# preserves the durable acknowledgement and must never retry creation.
	var refreshed := await _map.reload_catalog(operation)
	if generation != _generation: return _stale()
	if not refreshed.get("ok", false): return _refresh_failed(response, refreshed)
	var created: Array = _map.maps.filter(func(map): return str(map.identity) not in existing)
	if created.size() != 1:
		return _refresh_failed(response, {"error": "The map catalog did not identify exactly one new map. Reopen the project to inspect it."})
	response["mapIdentity"] = str(created[0].identity)
	var opened := await _map.load_map(response.mapIdentity, operation)
	if generation != _generation: return _stale()
	if not opened.get("ok", false): return _refresh_failed(response, opened)
	return response


func _refresh_failed(response: Dictionary, refreshed: Dictionary) -> Dictionary:
	_pending = {"generation":_generation,"readOnly":true,"committed":true,"identity":response.get("mapIdentity",_reviewed.get("plan",{}).get("identity",""))}
	response["viewRefreshError"] = str(refreshed.get("error", "The new map could not be opened."))
	response["outcomeUnknown"] = refreshed.get("outcomeUnknown", false)
	return response


func check_original() -> void:
	if _pending.is_empty() or _submitting: return
	var pending := _pending.duplicate(true)
	var lookup := {} if pending.get("readOnly",false) else {"domain":"project","operationId":pending.params.operationId,"expectedIntent":{"method":pending.method,"params":pending.params}}
	var response := await _operations.recover_world(_bridge,lookup)
	if int(pending.generation) != _generation: return
	if not response.get("worldRecoveryConfirmed",false): view.show_failure(str(response.get("error","The original creation result remains unconfirmed.")),true); return
	var committed: bool = pending.get("committed",false) or not pending.get("readOnly",false) and response.result.outcome == "committed"
	_submitting = true
	response = await _operations.run_workflow(_bridge,"Read recovered map allocation",_recover_read.bind(pending,committed),null,true)
	_submitting = false
	if int(pending.generation) != _generation: return
	if not response.get("ok",false): view.show_failure(str(response.get("error","The recovered view could not refresh.")),true); return
	_pending.clear()
	if committed:
		discard_draft(); await _show_created.call(pending.identity)
	else: await review_again()


func _recover_read(operation: ProvidenceEditorOperation, pending: Dictionary, committed: bool) -> Dictionary:
	var response := await operation.request("session.describe",{})
	if not response.get("ok",false): return response
	projection_applied.emit(response.result)
	response = await _map.reload_catalog(operation)
	if not response.get("ok",false) or not committed: return response
	return await _map.load_map(str(pending.identity),operation)


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The map session changed before creation finished."}


func dispose() -> void:
	if is_instance_valid(view):
		_map.document_opened.disconnect(_document_changed); _map.document_cleared.disconnect(_document_cleared)
		view.dismiss()
	_generation += 1
	_bridge = null; _map = null
	_context = Callable(); _show_created = Callable()
	for relay in [projection_applied, status_changed, failed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

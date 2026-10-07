extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

var _view: ProvidenceLandLayoutEditor
var _operations: ProvidenceEditorOperation
var _context: Callable
var _bridge: RefCounted
var _generation := 0
var _review: Window
var _accept_draft: Callable
var _intent: Dictionary = {}
var _pending: Dictionary = {}
var _thumbnails := preload("res://src/layout_thumbnail_controller.gd").new()


func initialize(view: ProvidenceLandLayoutEditor, operations: ProvidenceEditorOperation, context: Callable, accept_draft := Callable()) -> void:
	_view = view
	_thumbnails.initialize(view,operations)
	_operations = operations
	_context = context
	_accept_draft = accept_draft
	_review = view.get_node("%LayoutPlacementReview")
	_review.accepted.connect(apply_review)
	_review.canceled.connect(_cancel_review)
	view.recovery_button().pressed.connect(check_original)
	view.commit_handler = apply_review


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_thumbnails.attach_session(bridge)
	_intent.clear()
	_pending.clear()
	_review.hide()
	if _view.is_node_ready(): _view.set_pending(false)


func teardown() -> void:
	attach_session(null)
	_view.clear()


func reload(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _bridge == null: return _stale()
	return await _operations.run_workflow(_bridge, "Load Land Layout", _read.bind(_generation), borrowed)


func _read(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var response := await operation.request("land-layout.open")
	if not response.get("ok", false): return response
	if generation != _generation: return _stale()
	_view.set_projection(response.result)
	var thumbnails := await _thumbnails.read_visible(operation)
	if not thumbnails.get("ok",false): return thumbnails
	_thumbnails.request_visible.call_deferred()
	return response


func set_cell(row: int, column: int, target: Variant) -> void:
	if _bridge == null or not _pending.is_empty(): return
	await _thumbnails.pause()
	var params := {"row": row, "column": column, "target": target, "expectedRevision": int(_context.call().revision)}
	_intent = {"params": params, "generation": _generation, "method": "land-layout.apply-cell"}
	_view.set_pending(true)
	var response := await _operations.run_workflow(_bridge, "Review layout placement", _prepare.bind(params, _generation), null, true)
	if _generation != _intent.get("generation", -1): return
	if not response.get("ok", false):
		if response.get("outcomeUnknown", false): _pending = {"readOnly": true, "applied": false, "intent": _intent.duplicate(true)}
		_show_failure(response)
		if _pending.is_empty(): _view.set_pending(false)


func remove() -> void:
	if _bridge == null or not _pending.is_empty(): return
	await _thumbnails.pause()
	_intent = {"generation": _generation, "method": "land-layout.remove", "params": {"expectedRevision": int(_context.call().revision)}}
	_view.set_pending(true)
	await apply_review()


func apply_review() -> Dictionary:
	if _bridge == null or _intent.is_empty(): return _stale()
	if not _pending.is_empty(): return {"ok": false, "error": "Reconcile the original layout result first."}
	if int(_intent.generation) != _generation: return _stale()
	var generation := _generation
	_view.set_loading(true)
	_review.set_loading(true)
	var response := await _operations.run_workflow(_bridge, "Apply world layout", _mutate.bind(_intent.duplicate(true)), null, true)
	if generation != _generation: return _stale()
	if not response.get("ok", false): _show_failure(response, not _accept_draft.is_valid())
	if _accept_draft.is_valid(): _accept_draft.call(response)
	return response


func _mutate(operation: ProvidenceEditorOperation, intent: Dictionary) -> Dictionary:
	var params: Dictionary = intent.params.duplicate(true)
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"intent": intent, "params": params}
	var response := await operation.request(str(intent.method), params)
	if int(intent.generation) != _generation: return _stale()
	if response.get("outcomeUnknown", false): return response
	_pending.clear()
	if not response.get("ok", false): return response
	projection_applied.emit(response.result)
	_review.complete()
	_view.set_pending(false)
	var refreshed := await _read(operation, int(intent.generation))
	if int(intent.generation) != _generation: return _stale()
	if not refreshed.get("ok", false):
		_pending = {"readOnly": true, "applied": true, "intent": intent}
		refreshed.viewRefreshPending = true
		refreshed.error = "Layout Apply is confirmed. Reconcile to refresh the view; the write will not be repeated."
		return refreshed
	_intent.clear()
	_thumbnails.resume()
	status_changed.emit("World layout applied · revision %d" % int(response.result.revision))
	return response


func _prepare(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("land-layout.preview-cell", params)
	if not response.get("ok", false): return response
	if generation != _generation: return _stale()
	_review.open_review(response.result, _view.get_node("%PlaceCurrentLand") if params.target != null else _view.get_node("%ClearLayoutCell"))
	if not response.result.canApply:
		_intent.clear()
		_view.set_pending(false)
		_thumbnails.resume()
	_view.set_loading(false)
	return response


func _cancel_review() -> void:
	if not _pending.is_empty(): return
	_intent.clear()
	_view.set_pending(false)
	_thumbnails.resume()


func _show_failure(response: Dictionary, notify := true) -> void:
	var recovery := bool(response.get("outcomeUnknown", false)) or bool(response.get("viewRefreshPending", false))
	var message := str(response.get("error", "The layout review is kept."))
	_view.show_submission_failure(message, recovery)
	_review.show_failure(message, recovery)
	if notify: failed.emit(message)


func check_original() -> void:
	if _bridge == null or _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true)
	var generation: int = pending.intent.generation
	var lookup: Dictionary = {}
	if not pending.get("readOnly", false):
		lookup = {"domain": "project", "operationId": pending.params.operationId,
			"expectedIntent": {"method": pending.intent.method, "params": pending.params}}
	_view.recovery_button().disabled = true
	var response := await _operations.recover_world(_bridge, lookup)
	if generation != _generation: return
	_view.recovery_button().disabled = false
	if not response.get("worldRecoveryConfirmed", false):
		response.outcomeUnknown = true
		_show_failure(response)
		return
	_pending.clear()
	var committed: bool = bool(pending.get("applied", false)) or (not pending.get("readOnly", false) and response.result.outcome == "committed")
	var refreshed := await _operations.run_workflow(_bridge, "Read reconciled layout", _reconciled.bind(committed, generation), null, true)
	if generation != _generation: return
	if not refreshed.get("ok", false):
		_pending = {"readOnly": true, "applied": committed, "intent": pending.intent}
		refreshed.viewRefreshPending = true
		_show_failure(refreshed)


func _reconciled(operation: ProvidenceEditorOperation, committed: bool, generation: int) -> Dictionary:
	var described := await operation.request("session.describe", {})
	if generation != _generation: return _stale()
	if not described.get("ok", false): return described
	projection_applied.emit({"revision": described.result.revision, "canUndo": described.result.canUndo, "canRedo": described.result.canRedo, "truncated": true})
	var refreshed := await _read(operation, generation)
	if not refreshed.get("ok", false): return refreshed
	_view.set_pending(false)
	if committed:
		_intent.clear()
		_review.complete()
	elif _intent.get("method") == "land-layout.apply-cell":
		_intent.params.expectedRevision = int(described.result.revision)
		_view.set_pending(true)
		return await _prepare(operation, _intent.params, generation)
	else: _intent.clear()
	_thumbnails.resume()
	return refreshed


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The Land Layout session changed while loading."}


func dispose() -> void:
	attach_session(null); _thumbnails.dispose()
	_view.commit_handler = Callable(); _context = Callable(); _accept_draft = Callable()
	for relay in [projection_applied,status_changed,failed]:
		for connection in relay.get_connections(): relay.disconnect(connection.callable)

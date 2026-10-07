extends RefCounted

signal projection_applied(projection: Dictionary)

var _view: ProvidenceScenarioSectionEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _bridge
var _generation := 0
var _accept_draft: Callable
var _pending: Dictionary = {}


func initialize(view: ProvidenceScenarioSectionEditor, operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_view = view
	_operations = operations
	_read_bridge = read_bridge


func configure_authoring(accept_draft: Callable) -> void:
	_accept_draft = accept_draft


func teardown() -> void:
	_generation += 1
	_bridge = null
	_pending.clear()
	_view.clear_projection()


func reload(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge != _bridge:
		teardown()
		_bridge = bridge
	if _bridge == null: return {"ok": false, "error": "Open a project to edit Scenario."}
	if _view.has_unapplied_changes(): return {"ok": false, "draftPreserved": true, "error": "Apply or discard this section before reloading."}
	_view.clear_projection()
	_view.set_interaction(true)
	_view.status("Loading " + _view.section_title + "…")
	var response := await _operations.run_workflow(_bridge, "Load " + _view.section_title, _load.bind(_generation), borrowed)
	_view.set_interaction(false)
	if not response.get("ok", false): _view.show_result(response)
	return response


func _load(operation: ProvidenceEditorOperation, generation: int) -> Dictionary:
	var response := await operation.request(_view.projection_method)
	if generation != _generation: return _stale()
	if not response.get("ok", false): return response
	response = await _view.complete_projection(operation, response)
	if generation != _generation: return _stale()
	if response.get("ok", false): _view.set_projection(response.result)
	return response


func apply() -> Dictionary:
	if _bridge == null or not _view.can_commit(): return {"ok": false, "error": "Resolve the section draft before applying."}
	var token := _view.draft_token()
	var params := _view.draft_params()
	params["expectedRevision"] = _view.applied_revision()
	_view.set_interaction(true)
	var response := await _operations.run_workflow(_bridge, "Apply " + _view.section_title, _write.bind(params, token, _generation))
	_view.set_interaction(false)
	if _accept_draft.is_valid(): _accept_draft.call(response)
	_view.show_result(response)
	return response


func _write(operation: ProvidenceEditorOperation, params: Dictionary, token: Dictionary, generation: int) -> Dictionary:
	if generation != _generation or token != _view.draft_token(): return _stale()
	params["operationId"] = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"method": _view.write_method, "params": params.duplicate(true), "token": token.duplicate(true), "generation": generation}
	var response := await operation.request(_view.write_method, params)
	if generation != _generation or token != _view.draft_token(): return _stale()
	if not response.get("outcomeUnknown", false): _pending.clear()
	if not response.get("ok", false): return response
	_view.acknowledge_saved(int(response.result.revision))
	projection_applied.emit(response.result)
	var refreshed := await _load(operation, generation)
	if not refreshed.get("ok", false): response["viewRefreshError"] = "Saved. Reload this section to refresh its presentation."
	return response


func validate() -> void:
	if _bridge == null or _operations.requires_reopen: return
	if _operations.busy:
		_view.schedule_validation()
		return
	var token := _view.draft_token()
	var params := _view.draft_params()
	if params.has("localError"):
		_view.accept_validation(false, str(params.localError))
		return
	params["expectedRevision"] = _view.applied_revision()
	var response := await query(_view.write_method.replace(".update", ".validate"), params)
	if token != _view.draft_token(): return
	if response.get("ok", false): _view.accept_validation(response.result.get("valid", false), str(response.result.get("error", "") if response.result.get("error") != null else ""))
	elif not response.get("busy", false): _view.accept_validation(false, str(response.get("error", "Validation unavailable.")))


func query(method: String, params: Dictionary) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project first."}
	return await _operations.run_workflow(_bridge, "Read Scenario", _query.bind(method, params, _generation))


func is_busy() -> bool: return _operations.busy


func _query(operation: ProvidenceEditorOperation, method: String, params: Dictionary, generation: int) -> Dictionary:
	if generation != _generation: return _stale()
	var response := await operation.request(method, params)
	return response if generation == _generation else _stale()


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The Scenario session changed. The previous operation cannot affect this view."}


func resolve_original_result() -> void:
	if _bridge == null: return
	if _pending.is_empty():
		_view.set_interaction(true)
		var response := await _operations.run_workflow(_bridge, "Refresh saved Scenario section", _load.bind(_generation))
		_view.set_interaction(false)
		if not response.get("ok", false): response["viewRefreshError"] = "Saved section is still unavailable."
		_view.show_result(response)
		return
	var pending := _pending.duplicate(true)
	_view.set_interaction(true)
	var response := await _operations.recover_world(_bridge, {"operationId": pending.params.operationId,
		"domain": "project", "expectedIntent": {"method": pending.method, "params": pending.params}})
	if pending.generation != _generation or _pending.is_empty(): return
	_view.set_interaction(false)
	if not response.get("worldRecoveryConfirmed", false): _view.show_result(response); return
	var original: Dictionary = response.result.get("response", {})
	var committed: bool = response.result.get("outcome") == "committed" and original.get("ok", false)
	_view.unlock_recovery()
	var refreshed := await _operations.run_workflow(_bridge, "Read resolved Scenario section", _load.bind(_generation))
	if not refreshed.get("ok", false):
		_view.show_result({"ok": false, "outcomeUnknown": true, "error": "Original result resolved, but saved section is unavailable. Your draft is retained."})
		return
	if committed:
		projection_applied.emit(original.result)
		if _accept_draft.is_valid(): _accept_draft.call(original)
		_view.status("Original Apply committed. The saved section is restored; no mutation was retried.")
	else:
		_view.restore_draft_token(pending.token)
		_view.status("Original Apply did not commit. The draft is retained for explicit review and Apply.")
	_pending.clear()

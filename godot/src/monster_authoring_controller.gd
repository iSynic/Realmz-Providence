extends RefCounted

signal projection_applied(projection: Dictionary)

var _view
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _accept_draft: Callable
var _generation := 0
var _pending: Dictionary = {}


func initialize(view, operations: ProvidenceEditorOperation, read_bridge: Callable, accept_draft: Callable) -> void:
	_view = view
	_operations = operations
	_read_bridge = read_bridge
	_accept_draft = accept_draft
	view.commit_requested.connect(commit)
	view.recovery_requested.connect(check_original_result)
	view.comparison_requested.connect(compare_with_current)
	view.commit_handler = commit


func teardown() -> void:
	_generation += 1
	_pending.clear()


func commit() -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return _failure("Open a project before applying this Monster draft.")
	if not _pending.is_empty(): return _failure("Check the original operation result before making changes.")
	var draft: Dictionary = _view.submitted_draft()
	if not _view.has_unapplied_changes(): return {"ok": true}
	var result: Dictionary = await _operations.run_workflow(bridge, "Apply monster", _commit.bind(draft), null, true)
	if not result.get("ok", false): _view.show_submission_failure(result)
	if result.get("ok", false) and _view.draft_domain() == "project": _accept_draft.call(result)
	return result


func _commit(operation: ProvidenceEditorOperation, draft: Dictionary) -> Dictionary:
	var generation := _generation
	var origin: Vector2i = _view.authoring_generation()
	var revision: int = _view.draft_revision()
	var domain: String = _view.draft_domain()
	var prefix := "monster-library" if domain == "library" else "monster"
	var params := {"expectedRevision": revision, "draft": draft}
	var prepared := await operation.request(prefix + ".draft.prepare", params)
	if not prepared.get("ok", false): return prepared
	if not prepared.result.get("valid", false):
		return {"ok": false, "issues": prepared.result.get("issues", []), "error": "Correct the marked fields before applying. Your draft is kept."}
	if generation != _generation or origin != _view.authoring_generation(): return _changed()
	return await submit_reviewed(operation, prefix + ".draft.apply", params, domain, _accept_saved.bind(draft))


func submit_reviewed(operation: ProvidenceEditorOperation, method: String, params: Dictionary, domain: String, acknowledgement: Callable) -> Dictionary:
	if not _pending.is_empty(): return _failure("Check the original operation result before making changes.")
	var generation := _generation
	var origin: Vector2i = _view.authoring_generation()
	var id := Crypto.new().generate_random_bytes(32).hex_encode()
	params = params.duplicate(true)
	params["operationId"] = id
	_pending = {"operationId": id, "domain": domain, "params": params.duplicate(true),
		"method": method, "origin": origin, "acknowledge": acknowledgement}
	var response := await operation.request(method, params)
	if response.get("outcomeUnknown", false): return response
	if generation != _generation or origin != _view.authoring_generation(): return _changed()
	if response.get("ok", false):
		await acknowledgement.call(operation, response, false)
		if domain == "project" and response.result.has("change"): projection_applied.emit(response.result.change)
	_pending.clear()
	return response


func _accept_saved(operation: ProvidenceEditorOperation, response: Dictionary, recovered: bool, submitted: Dictionary) -> void:
	var saved: Dictionary = response.result.document
	if recovered:
		var params := {"identity": submitted.identity} if _view.draft_domain() == "library" else {"setId": submitted.setId, "nativeId": submitted.nativeId}
		var fresh := await operation.request("monster-library.open" if _view.draft_domain() == "library" else "monster.open", params)
		if not fresh.get("ok", false):
			_view.release_recovery_lock()
			_view.show_submission_failure({"ok": false, "error": "The original change committed. Reload this document to inspect its current state. Your draft is kept."})
			return
		saved = fresh.result
	_view.accept_saved_document(submitted, saved)
	if _view.draft_domain() == "library":
		var history := await operation.request("monster-library.describe", {})
		if history.get("ok", false): _view.library.set_history_state(history.result)


func check_original_result() -> void:
	if _pending.is_empty() or _read_bridge.call() == null: return
	var generation := _generation
	var response := await _operations.recover_monster(_read_bridge.call(), {
		"operationId": _pending.operationId, "domain": _pending.domain,
		"expectedIntent": {"method": _pending.method, "params": _pending.params}})
	if generation != _generation or _pending.is_empty(): return
	if not response.get("monsterRecoveryConfirmed", false):
		_view.show_submission_failure({"ok": false, "outcomeUnknown": true,
			"error": "The original result is still uncertain. Your draft is kept and changes remain locked."})
		return
	var receipt: Dictionary = response.result
	if receipt.get("intent", {}).get("method") != _pending.method or not preload("res://src/monster_operation_identity.gd").matches(receipt.get("intent", {}).get("params"), _pending.params):
		_view.show_submission_failure({"ok": false, "outcomeUnknown": true, "error": "The receipt does not identify this submitted draft. Changes remain locked."})
		return
	if _pending.origin != _view.authoring_generation():
		_pending.clear()
		_view.release_recovery_lock()
		_view.show_submission_failure(_changed())
		return
	var original: Dictionary = receipt.get("response", {})
	if receipt.outcome == "committed" and original.get("ok", false):
		_view.release_recovery_lock()
		await _operations.run_workflow(_read_bridge.call(), "Read confirmed Monster result", _confirmed.bind(original, _pending.acknowledge))
	else:
		_view.release_recovery_lock()
		_view.show_submission_failure(original)
	_pending.clear()


func _confirmed(operation: ProvidenceEditorOperation, original: Dictionary, acknowledgement: Callable) -> Dictionary:
	await acknowledgement.call(operation, original, true)
	if _pending.domain == "project":
		var current := await operation.request("session.describe", {})
		if current.get("ok", false):
			var change: Dictionary = original.result.get("change", {}).duplicate(true)
			change.merge({"revision": current.result.revision, "canUndo": current.result.canUndo, "canRedo": current.result.canRedo, "truncated": true}, true)
			projection_applied.emit(change)
	return original


func compare_with_current() -> void:
	if _view.draft.document.is_empty() or not _pending.is_empty(): return
	var origin: Vector2i = _view.authoring_generation()
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Compare Monster draft", _read_current)
	if origin != _view.authoring_generation(): return
	if response.get("ok", false): _view.show_draft_comparison(response.result)
	else: _view.show_submission_failure(response)


func _read_current(operation: ProvidenceEditorOperation) -> Dictionary:
	var submitted: Dictionary = _view.submitted_draft()
	var params := {"identity": submitted.identity} if _view.draft_domain() == "library" else {"setId": submitted.setId, "nativeId": submitted.nativeId}
	return await operation.request("monster-library.open" if _view.draft_domain() == "library" else "monster.open", params)


func _failure(message: String) -> Dictionary:
	return {"ok": false, "error": message}


func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The originating Monster document changed. The submitted operation was not repeated."}

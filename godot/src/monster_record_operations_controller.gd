extends RefCounted

var _view
var _dialog
var _operations: ProvidenceEditorOperation
var _authoring
var _read_bridge: Callable
var _reload: Callable
var _context: Dictionary = {}
var _review: Dictionary = {}
var _generation := 0
var _input_revision := -1
var _retarget_picker := preload("res://src/monster_use_retarget_picker.gd").new()


func initialize(view, dialog, authoring, operations: ProvidenceEditorOperation, read_bridge: Callable, reload_view: Callable) -> void:
	_view = view
	_dialog = dialog
	_authoring = authoring
	_operations = operations
	_read_bridge = read_bridge
	_reload = reload_view
	view.record_operation_requested.connect(open_review)
	dialog.review_requested.connect(prepare)
	dialog.commit_requested.connect(commit)
	_retarget_picker.initialize(view, dialog, operations, read_bridge)


func open_review(action: String) -> void:
	if action not in ["NewMonster", "Duplicate", "ClearSelection", "Switch", "Variants"]: return
	if action != "NewMonster" and _view.draft_domain() != "project": return
	if _read_bridge.call() == null or not await _view.request_draft_navigation("reviewing this record operation"): return
	_context = _view.record_operation_context()
	if action == "NewMonster": _context["domain"] = "project"
	if _context.is_empty() or _context.domain != "project": return
	_generation += 1
	_review.clear()
	_dialog.set_meta("owner", "record")
	_dialog.begin(action, _context.destination, -1, _view.get_viewport().gui_get_focus_owner())


func prepare(kind: String, target: Variant) -> void:
	if _dialog.get_meta("owner", "") != "record": return
	_generation += 1
	var generation := _generation
	_input_revision = _dialog.input_revision
	_review.clear()
	var action := _action(kind, target)
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Review Monster operation", _prepare.bind(action, generation))
	if generation != _generation or not _dialog.visible or _input_revision != _dialog.input_revision: return
	_dialog.receive_review(response, response.get("sections", {}))


func _action(kind: String, target: Variant) -> Dictionary:
	var action := {"kind": kind}
	if kind in ["create", "duplicate", "clear", "switch"]: action["setId"] = _context.setId
	if kind in ["create", "clear", "copy-all-sets", "generate-variants"]: action["nativeId"] = target if kind == "create" else _context.nativeId
	if kind == "duplicate": action.merge({"sourceId": _context.nativeId, "targetId": target})
	if kind == "switch": action.merge({"firstId": _context.nativeId, "secondId": target})
	if kind == "copy-all-sets": action["sourceSetId"] = _context.setId
	return {"action": action, "retargetUses": _dialog.use_edits()}


func _prepare(operation: ProvidenceEditorOperation, action: Dictionary, generation: int) -> Dictionary:
	var sections := {"changes": [], "uses": [], "excluded": []}
	var hash := ""
	for section in sections:
		var offset := 0
		while true:
			if not _matches() or generation != _generation: return _stale()
			var response := await operation.request("monster.operation.prepare", {"expectedRevision": _context.revision,
				"operation": action, "section": section, "offset": offset, "limit": 128})
			if not response.get("ok", false): return response
			var page: Dictionary = response.result
			if hash.is_empty(): hash = page.reviewHash
			if hash != page.reviewHash or int(page.offset) != offset: return _stale()
			sections[section].append_array(page.items)
			offset += page.items.size()
			if offset == int(page.total): break
			if page.items.is_empty(): return _stale()
			await _view.get_tree().process_frame
	_review = {"operation": action, "reviewHash": hash, "expectedRevision": _context.revision}
	return {"ok": true, "sections": sections}


func commit() -> void:
	if _dialog.get_meta("owner", "") != "record": return
	if _input_revision != _dialog.input_revision: return
	if _review.is_empty() or not _matches(): _dialog.receive_review(_stale()); return
	_dialog.set_committing()
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Commit Monster operation", _commit)
	if response.get("ok", false): _dialog.cancel()
	else:
		_dialog.cancel()
		_view.show_submission_failure(response)


func _commit(operation: ProvidenceEditorOperation) -> Dictionary:
	if not _matches(): return _stale()
	return await _authoring.submit_reviewed(operation, "monster.operation.commit", _review, "project", _acknowledge)


func _acknowledge(operation: ProvidenceEditorOperation, _response: Dictionary, _recovered: bool) -> void:
	var selection: Dictionary = _view.selection_snapshot()
	var action: Dictionary = _review.operation.action
	selection["nativeId"] = action.get("targetId", action.get("nativeId", action.get("firstId", _context.nativeId)))
	selection["active"] = "scenario"
	var refreshed: Dictionary = await _reload.call(selection, operation)
	if not refreshed.get("ok", false):
		_view.show_submission_failure({"ok": false, "error": "The operation committed, but the record could not be refreshed. Reload to see the saved result. " + str(refreshed.get("error", ""))})


func _matches() -> bool:
	return not _context.is_empty() and _view.authoring_generation() == _context.origin and _view.browser.revision == _context.revision


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The originating record or project changed. Review the operation again."}

extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

var _view: ProvidenceQuestEditor
var _operations: ProvidenceEditorOperation
var _context: Callable
var _read_bridge: Callable
var _accept_draft: Callable
var _generation := 0


func initialize(view: ProvidenceQuestEditor, operations: ProvidenceEditorOperation, context: Callable, read_bridge: Callable, accept_draft: Callable) -> void:
	_view = view
	_operations = operations
	_context = context
	_read_bridge = read_bridge
	_accept_draft = accept_draft
	_view.open_handler = open_id
	_view.commit_handler = commit
	_view.delete_handler = delete
	_view.flow_handler = read_flow
	_view.source_context = context


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project before loading Quests."}
	if _view.has_unapplied_changes(): return {"ok": false, "draftKept": true, "error": "Apply or discard the Quest label draft before refreshing."}
	return await _operations.run_workflow(bridge, "Load Quests", _reload.bind(_guard()), operation)


func open_id(id: int) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project before opening a Quest."}
	if _view.has_unapplied_changes(): return {"ok": false, "draftKept": true, "error": "Apply or discard the Quest label draft before changing selection."}
	var response := await _operations.run_workflow(bridge, "Open Quest", _open.bind(id, _guard()))
	if not response.get("ok", false): failed.emit(str(response.get("error", "The Quest could not be opened.")))
	return response


func commit(quest_label: Dictionary) -> Dictionary:
	var params := {"expectedRevision": _view.document_revision(), "questLabel": quest_label.duplicate(true)}
	var response := await _mutate("quest-label.upsert", params, "Apply Quest Label", _accept_upsert.bind(quest_label))
	_accept_draft.call(response)
	return response


func delete(id: int) -> Dictionary:
	var params := {"expectedRevision": _view.document_revision(), "id": id}
	var submitted := _view.read_state().duplicate(true)
	var response := await _mutate("quest-label.delete", params, "Delete Quest Label", func(result): _view.accept_deleted(int(result.revision), submitted))
	_accept_draft.call(response)
	return response


func teardown() -> void:
	_generation += 1
	_view.clear()


func dispose() -> void:
	teardown()
	_view.open_handler = Callable()
	_view.commit_handler = Callable()
	_view.delete_handler = Callable()
	_view.flow_handler = Callable()
	_view.source_context = Callable()


func read_flow(id: int, role: String, query: String, offset: int, origin := "") -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project before tracing Quests."}
	var context: Dictionary = _context.call()
	var params := {"projectId": context.projectId, "expectedRevision": context.revision, "id": id, "role": role, "query": query, "offset": offset, "limit": 64}
	params["origin"] = origin
	var generation := _generation
	while _operations.busy:
		await _view.get_tree().process_frame
		if generation != _generation or context != _context.call(): return _stale()
	var response := await _operations.run_workflow(bridge, "Read Quest flow", func(operation): return await operation.request("quest.flow", params))
	if generation != _generation or context != _context.call(): return _stale()
	return response


func _reload(operation: ProvidenceEditorOperation, guard: Dictionary) -> Dictionary:
	var catalog := await operation.request("quest.list", {"offset": 0, "limit": 126})
	if not catalog.get("ok", false): return catalog
	var preferred := _view.current_id()
	if preferred <= 0: preferred = 1
	var opened := await operation.request("quest.open", {"id": preferred})
	if not opened.get("ok", false): return opened
	if not _matches(guard): return _stale()
	_view.set_catalog(catalog.result)
	_view.set_document(opened.result)
	return opened


func _open(operation: ProvidenceEditorOperation, id: int, guard: Dictionary) -> Dictionary:
	var response := await operation.request("quest.open", {"id": id})
	if response.get("ok", false) and _matches(guard): _view.set_document(response.result)
	elif response.get("ok", false): return _stale()
	return response


func _mutate(method: String, params: Dictionary, label: String, accept: Callable) -> Dictionary:
	var bridge = _read_bridge.call()
	if bridge == null: return {"ok": false, "error": "Open a project before changing Quest labels."}
	var generation := _generation
	var response := await _operations.run_workflow(bridge, label, func(operation): return await operation.request(method, params))
	if response.get("ok", false) and generation == _generation:
		accept.call(response.result)
		projection_applied.emit(response.result)
		status_changed.emit("%s · revision %d" % [label, int(response.result.revision)])
	elif not response.get("ok", false): failed.emit(str(response.get("error", "%s failed." % label)))
	return response


func _accept_upsert(result: Dictionary, quest_label: Dictionary) -> void:
	if _view.current_id() == int(quest_label.get("id", 0)): _view.accept_saved(quest_label, int(result.revision))


func _guard() -> Dictionary:
	return {"generation": _generation, "state": _view.read_state(), "context":_context.call().duplicate(true)}


func _matches(guard: Dictionary) -> bool:
	return int(guard.generation) == _generation and guard.state == _view.read_state() and guard.context == _context.call()


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The Quest selection changed while loading."}

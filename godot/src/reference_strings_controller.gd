extends RefCounted

signal selection_changed

var _view: ProvidenceReferenceStrings
var _preview: ProvidenceRebuiltPreviewSelection
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation := 0


func initialize(view: ProvidenceReferenceStrings, preview: ProvidenceRebuiltPreviewSelection, operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_view = view
	_preview = preview
	_operations = operations
	_read_bridge = read_bridge
	_view.open_handler = open_group


func teardown() -> void:
	_generation += 1
	_view.clear()
	_preview.clear_scrolling_text()


func dispose() -> void:
	_generation += 1
	_view.open_handler = Callable()


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await _operations.run_workflow(_read_bridge.call(), "Load reference strings", _reload.bind(_guard()), operation)


func open_group(identity: String) -> Dictionary:
	var response := await _operations.run_workflow(_read_bridge.call(), "Open reference strings", _open.bind(identity, _guard()))
	_view.restore_selection()
	if not response.get("ok", false): _view.show_failure(response)
	return response


func _reload(operation: ProvidenceEditorOperation, guard: Dictionary) -> Dictionary:
	var catalog := await operation.request("reference-string.list", {"offset": 0, "limit": 128})
	if not catalog.get("ok", false): return catalog
	if not _matches(guard): return _stale()
	var identity := _view.catalog_identity(catalog.result.get("items", []))
	var opened := await _read_document(operation, identity)
	if not opened.get("ok", false): return opened
	if not _matches(guard): return _stale()
	var state := _view.capture_view_state()
	_view.set_catalog(catalog.result)
	_apply_document(opened)
	_view.restore_view_state(state)
	return opened


func _open(operation: ProvidenceEditorOperation, identity: String, guard: Dictionary) -> Dictionary:
	var opened := await _read_document(operation, identity)
	if not opened.get("ok", false): return opened
	if not _matches(guard): return _stale()
	_apply_document(opened)
	return opened


func _read_document(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	if identity.is_empty(): return {"ok": true, "result": {}}
	var response := await operation.request("reference-string.open", {"identity": identity, "entryOffset": 0, "entryLimit": 128})
	if not response.get("ok", false): return response
	var group: Dictionary = response.result.get("group", {})
	if str(group.get("identity", "")) != identity:
		return {"ok": false, "error": "The reference group returned a different identity."}
	var resource_id := _view.project_text_id(group)
	if resource_id != 0:
		# Preview resolution shares the read lease; a signal callback must never
		# start an independent request while the group is still being loaded.
		var text := await operation.request("text-resource.resolve-exact", {"resourceId": resource_id})
		if text.get("outcomeUnknown", false): return text
		response["textResolution"] = text
	return response


func _apply_document(response: Dictionary) -> void:
	_preview.clear_scrolling_text()
	if response.has("textResolution"):
		_preview.apply_scrolling_text_resolution(_view.project_text_id(response.result.group), response.textResolution)
	_view.set_document(response.result)
	selection_changed.emit()


func _guard() -> Dictionary:
	return {"generation": _generation, "state": _view.read_state()}


func _matches(guard: Dictionary) -> bool:
	return guard.generation == _generation and guard.state == _view.read_state()


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The reference string selection or session changed while loading."}

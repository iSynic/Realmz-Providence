extends RefCounted

signal status_changed(message: String)

var _history
var _session
var _operations: ProvidenceEditorOperation
var _tabs: TabContainer
var _documents
var _changes
var _presentation
var _read_bridge: Callable


func dispose() -> void:
	if _history != null: _history.refresh_visible = Callable()
	_read_bridge = Callable()
	_history = null


func initialize(history, session, operations: ProvidenceEditorOperation, tabs: TabContainer, documents, changes, presentation, read_bridge: Callable) -> void:
	_history = history
	_session = session
	_operations = operations
	_tabs = tabs
	_documents = documents
	_changes = changes
	_presentation = presentation
	_read_bridge = read_bridge
	history.operations = operations
	history.refresh_visible = refresh_visible
	history.projection_applied.connect(func(projection: Dictionary): session.apply(projection, false))


func execute(direction: String) -> Dictionary:
	var response: Dictionary = await _history.execute(_read_bridge.call(), _session.revision, direction)
	if response.get("busy", false): return response
	if _history.requires_reopen: _session.connected = false
	if not response.get("ok", false):
		status_changed.emit(str(response.get("error", "History could not be applied.")))
	elif response.has("viewRefreshError"):
		status_changed.emit("%s applied, but the view could not refresh. %s" % [direction.capitalize(), response.viewRefreshError])
	else:
		var document := _tabs.get_current_tab_control()
		var asset_catalog: bool = document.get_meta("owns_asset_workspace", false) and document.uses_async_catalog()
		if not asset_catalog and _documents.controller(_documents.identity_for_tab(_tabs.current_tab)) == null:
			await _presentation.refresh_current()
			if document.get_meta("owns_asset_workspace", false): document.refresh_after_history(_read_bridge.call())
		status_changed.emit("%s applied · revision %d" % [direction.capitalize(), _session.revision])
	return response


func refresh_visible(projection: Dictionary) -> Dictionary:
	var document := _tabs.get_current_tab_control()
	if document.get_meta("owns_asset_workspace", false) and document.uses_async_catalog():
		return await document.refresh_after_history(_read_bridge.call(), _operations)
	var route: String = _documents.identity_for_tab(_tabs.current_tab)
	var controller = _documents.controller(route)
	if controller != null: return await controller.activate(_changes, _operations, projection)
	return {"ok": true}


func refresh_external(summary: Dictionary, operation: ProvidenceEditorOperation) -> Dictionary:
	assert(operation == _operations)
	var projection := {"revision": summary.revision, "changedEntities": [summary.projectId], "truncated": true,
		"canUndo": summary.get("canUndo", false), "canRedo": summary.get("canRedo", false)}
	_session.apply(projection, false)
	var response := await refresh_visible(projection)
	if response.get("ok", false): status_changed.emit("Connected client changed this project · revision %d" % summary.revision)
	return response

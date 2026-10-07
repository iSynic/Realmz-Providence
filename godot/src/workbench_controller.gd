class_name ProvidenceWorkbenchController
extends RefCounted

var route_identity: String
var _view: Control
var _refresh: Callable
var _teardown: Callable
var _contextual_refresh := false
var _generation := 0
var _refreshing := false


func refresh_in_progress() -> bool:
	return _refreshing


func _init(identity: String, view: Control, refresh: Callable, teardown: Callable = Callable(), contextual_refresh := false) -> void:
	route_identity = identity
	_view = view
	_refresh = refresh
	_teardown = teardown
	_contextual_refresh = contextual_refresh


func attach_session() -> void:
	_generation += 1


func has_draft() -> bool:
	return _view.has_method("has_unapplied_changes") and _view.has_unapplied_changes()


func discard_draft() -> void:
	if _view.has_method("discard_draft"): _view.discard_draft()


func activate(changes: ProvidenceDocumentChanges, operation: ProvidenceEditorOperation = null, context: Dictionary = {}) -> Dictionary:
	if not changes.needs_refresh(route_identity):
		if _view.has_method("present_selection"): _view.present_selection()
		return {"ok": true}
	return await refresh(changes, operation, context)


func refresh(changes: ProvidenceDocumentChanges, operation: ProvidenceEditorOperation = null, context: Dictionary = {}) -> Dictionary:
	if _refreshing: return {"ok": false, "busy": true}
	# A refresh cannot replace a local draft. Keep its invalidation for after Apply
	# or Discard; no projection here is an alternate copy of authored truth.
	if has_draft(): return {"ok": false, "draftKept": true, "error": "Apply or discard the local draft before refreshing this document."}
	var generation := _generation
	var token := changes.refresh_token(route_identity)
	_refreshing = true
	var response: Dictionary = await _refresh.call(operation, context) if _contextual_refresh else await _refresh.call(operation)
	_refreshing = false
	if not response.get("ok", false): return response
	if generation != _generation:
		return {"ok": false, "connectionChanged": true, "error": "The document session changed before refresh completed."}
	changes.refreshed(route_identity, token)
	if changes.needs_refresh(route_identity):
		return {"ok": false, "stale": true, "error": "A newer document change still needs to be refreshed."}
	return response


func teardown() -> void:
	_generation += 1
	if _teardown.is_valid(): _teardown.call()

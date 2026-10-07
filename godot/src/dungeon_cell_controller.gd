extends RefCounted

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)
signal failed(message: String)

var _view: ProvidenceDungeonEditor
var _map: ProvidenceMapDocumentController
var _operations: ProvidenceEditorOperation
var _context: Callable
var _bridge: RefCounted
var _generation := 0
var _accept_draft: Callable
var _pending: Dictionary = {}
var _paint := preload("res://src/dungeon_paint_controller.gd").new()
var _selection := preload("res://src/dungeon_selection_controller.gd").new()


func initialize(view: ProvidenceDungeonEditor, map: ProvidenceMapDocumentController, operations: ProvidenceEditorOperation, context: Callable, accept_draft: Callable = Callable()) -> void:
	_view = view
	_map = map
	_operations = operations
	_context = context
	_accept_draft = accept_draft
	view.commit_handler = commit
	view.recovery_button().pressed.connect(check_original)
	view.cell_open_requested.connect(open_cell)
	view.primitive_update_requested.connect(update_primitive)
	_paint.initialize(view, _paint_context, _preview_paint, _paint_preview_failed)
	_selection.initialize(view, _paint_context, _preview_selection, _paint_preview_failed)


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_paint.cancel()
	_selection.cancel()
	_bridge = bridge
	_pending.clear()


func teardown() -> void:
	attach_session(null)


func open_cell(x: int, y: int) -> void:
	if _bridge == null or not _map.is_dungeon or _map.identity.is_empty(): return
	var response := await _operations.run_workflow(_bridge, "Open dungeon cell", _open.bind(x, y, _map.identity, _generation, _view.selected_coordinate()))
	if _accept(response): status_changed.emit("Opened dungeon cell %d,%d · preserve-only bits remain read-only" % [x, y])


func _open(operation: ProvidenceEditorOperation, x: int, y: int, identity: String, generation: int, selection: Vector2i) -> Dictionary:
	var response := await operation.request("dungeon-cell.open", {"identity": identity, "x": x, "y": y})
	if not response.get("ok", false): return response
	if not _matches(generation, identity) or selection != _view.selected_coordinate(): return _stale()
	response.result["revision"] = response.result.get("revision", int(_context.call().revision))
	response.result["mapIdentity"] = identity
	_view.set_cell_projection(response.result)
	return response


func commit() -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project first."}
	if not _pending.is_empty(): return {"ok": false, "error": "Reconcile the original result before making changes."}
	if not _view.has_unapplied_changes(): return {"ok": true}
	_view.set_loading(true)
	var submitted: Dictionary = _view.submitted_features()
	var origin := Vector2i(_generation, _view.draft.generation)
	var response := await _operations.run_workflow(_bridge, "Apply Dungeon features", _commit.bind(submitted, origin), null, true)
	if origin.x != _generation: return response
	if _accept_draft.is_valid(): _accept_draft.call(response)
	if not response.get("ok", false): _view.show_submission_failure(response)
	if not response.get("outcomeUnknown", false): _view.set_loading(false)
	return response


func _commit(operation: ProvidenceEditorOperation, submitted: Dictionary, origin: Vector2i) -> Dictionary:
	var preview := await operation.request("dungeon-cell.preview-features", submitted)
	if not preview.get("ok", false): return _keep_read_failure(preview, origin)
	if not _origin_matches(origin, str(submitted.identity)): return _stale()
	if not preview.result.get("canApply", false): return {"ok": false, "error": "The selected features already match. Your draft is kept."}
	var params := submitted.duplicate(true)
	params.operationId = Crypto.new().generate_random_bytes(32).hex_encode()
	_pending = {"params": params, "origin": origin}
	var response := await operation.request("dungeon-cell.apply-features", params)
	if response.get("outcomeUnknown", false): return response
	_pending.clear()
	if not response.get("ok", false): return response
	if not _origin_matches(origin, str(submitted.identity)): return response
	projection_applied.emit(response.result)
	_view.complete_submission(int(response.result.revision))
	var refreshed := await _map.refresh_history(operation, response.result)
	if not refreshed.get("ok", false): return _keep_read_failure(refreshed, Vector2i(_generation, _view.draft.generation), true)
	return response


func _keep_read_failure(response: Dictionary, origin: Vector2i, applied := false) -> Dictionary:
	if response.get("outcomeUnknown", false) or applied:
		_pending = {"readOnly": true, "origin": origin, "applied": applied}
		if applied: response["viewRefreshPending"] = true
		response["error"] = "Apply is confirmed. Reconcile to refresh the view; the write will not be repeated." if applied else "The connection was lost while reading. Your feature draft is kept; Apply was not submitted. Reconcile to continue."
	return response


func check_original() -> void:
	if _bridge == null or _pending.is_empty() or _operations.busy: return
	var pending := _pending.duplicate(true)
	var origin: Vector2i = pending.origin
	var intent: Dictionary = {}
	if not pending.get("readOnly", false):
		intent = {"operationId": pending.params.operationId, "domain": "project",
			"expectedIntent": {"method": "dungeon-cell.apply-features", "params": pending.params}}
	_view.recovery_button().disabled = true
	var response := await _operations.recover_world(_bridge, intent)
	_view.recovery_button().disabled = false
	if not _origin_matches(origin, _map.identity): return
	if not response.get("worldRecoveryConfirmed", false): _view.show_submission_failure({"outcomeUnknown": true, "error": "The original result is still unconfirmed. Your draft is kept. Reconcile remains available."}); return
	_pending.clear()
	_view.finish_recovery()
	var committed: bool = bool(pending.get("applied", false)) or (not pending.get("readOnly", false) and response.result.outcome == "committed")
	var refreshed := await _operations.run_workflow(_bridge, "Read reconciled Dungeon", _reconciled.bind(committed), null, true)
	if not refreshed.get("ok", false): _view.show_submission_failure(_keep_read_failure(refreshed, Vector2i(_generation, _view.draft.generation), committed))
	elif not committed: _view.show_submission_failure({"ok": false, "error": "The draft is kept. Review it before applying or discarding."})


func _reconciled(operation: ProvidenceEditorOperation, committed: bool) -> Dictionary:
	var described := await operation.request("session.describe", {})
	if not described.get("ok", false): return described
	projection_applied.emit({"revision": described.result.revision, "canUndo": described.result.canUndo,
		"canRedo": described.result.canRedo, "truncated": true})
	if committed: return await _map.refresh_history(operation)
	if _view.draft.cells.is_empty(): return described
	var origin := Vector2i(_generation, _view.draft.generation)
	var selected := await operation.request("dungeon-cell.selection", {"identity": _map.identity, "cells": _view.draft.cells})
	if selected.get("ok", false) and _origin_matches(origin, str(selected.result.mapIdentity)):
		_view.rebase_kept_features(selected.result)
	return selected


func _origin_matches(origin: Vector2i, identity: String) -> bool:
	return origin.x == _generation and origin.y == _view.draft.generation and identity == _map.identity


func update_primitive(x: int, y: int, primitive: String, enabled: bool) -> void:
	if _bridge == null or not _map.is_dungeon: return
	var params := {"expectedRevision": int(_context.call().revision), "identity": _map.identity,
		"x": x, "y": y, "primitive": primitive, "enabled": enabled}
	var response := await _operations.run_workflow(_bridge, "Update dungeon cell", _update.bind(params, _generation))
	if not _accept(response): return
	if response.has("viewRefreshError"):
		failed.emit("The dungeon cell was changed, but its view could not refresh. " + str(response.viewRefreshError))
	else:
		status_changed.emit("%s %s at dungeon cell %d,%d · revision %d" % ["Set" if enabled else "Cleared", primitive.replace("-", " "), x, y, int(response.result.revision)])


func _update(operation: ProvidenceEditorOperation, params: Dictionary, generation: int) -> Dictionary:
	var response := await operation.request("dungeon-cell.update-primitive", params)
	if not response.get("ok", false): return response
	if not _matches(generation, str(params.identity)): return _stale()
	projection_applied.emit(response.result)
	var refreshed := await _map.refresh_history(operation)
	if not refreshed.get("ok", false):
		response["viewRefreshError"] = str(refreshed.get("error", "The map could not refresh."))
		response["outcomeUnknown"] = refreshed.get("outcomeUnknown", false)
	return response


func _matches(generation: int, identity: String) -> bool:
	return generation == _generation and _map.identity == identity


func _accept(response: Dictionary) -> bool:
	if response.get("ok", false): return true
	if not response.get("stale", false): failed.emit(str(response.get("error", "Dungeon cell request failed.")))
	return false


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The selected dungeon cell changed while loading."}


func _paint_context() -> Dictionary:
	return {"identity": _map.identity, "revision": int(_context.call().revision), "generation": _generation, "draftGeneration": _view.draft.generation}


func _preview_paint(params: Dictionary, origin: Dictionary) -> Dictionary:
	while _operations.busy and _paint_context() == origin: await _view.get_tree().process_frame
	if _bridge == null or _paint_context() != origin: return _stale()
	return await _operations.run_workflow(_bridge, "Preview Dungeon stroke", func(operation):
		return await operation.request("dungeon-cell.preview-features", params), null, true)


func _paint_preview_failed(response: Dictionary) -> void:
	_view.show_submission_failure(_keep_read_failure(response, Vector2i(_generation, _view.draft.generation)))


func _preview_selection(method: String, params: Dictionary, origin: Dictionary) -> Dictionary:
	while _operations.busy and _paint_context() == origin: await _view.get_tree().process_frame
	if _bridge == null or _paint_context() != origin: return _stale()
	return await _operations.run_workflow(_bridge, "Select Dungeon cells", func(operation):
		return await operation.request(method, params), null, true)

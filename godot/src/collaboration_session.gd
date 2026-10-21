extends Node

signal state_changed(state: Dictionary)
signal external_change(summary: Dictionary)
signal failed(message: String)

var _read_bridge: Callable
var _operations: ProvidenceEditorOperation
var _drafts
var _prepare_input: Callable
var _refresh_external: Callable
var _refresh_local_resources: Callable
var _resource_cursor := -1
var _read_context: Callable
var _guard := preload("res://src/collaboration_input_guard.gd").new()
var _observer := preload("res://src/collaboration_observer.gd").new()
var _command_generation := 0
var _checking := false
var _elapsed := 0.0
var _epoch := -1
var _reported_draft: Variant = null
var state: Dictionary = {}


func reset_session() -> void:
	_command_generation += 1
	_observer.close()
	_epoch = -1
	_reported_draft = null
	_resource_cursor = -1
	_present({})


func initialize(read_bridge: Callable, operations: ProvidenceEditorOperation, drafts, prepare_input: Callable, read_context: Callable, refresh_external: Callable, refresh_local_resources := Callable()) -> void:
	_read_bridge = read_bridge
	_operations = operations
	_drafts = drafts
	_prepare_input = prepare_input
	_read_context = read_context
	_refresh_external = refresh_external
	_refresh_local_resources = refresh_local_resources


func _process(delta: float) -> void:
	if not _live():
		_observer.close()
		return
	_elapsed += delta
	if _checking or _elapsed < 0.2 or not _read_bridge.is_valid(): return
	_elapsed = 0.0
	var bridge = _read_bridge.call()
	if not bridge.is_project_backed() or not bridge.shared_session_enabled() or _operations.requires_reopen:
		_observer.close()
		return
	_checking = true
	await _synchronize(bridge)
	_checking = false


func _synchronize(bridge) -> void:
	if _epoch != bridge.connection_epoch():
		_epoch = bridge.connection_epoch()
		_reported_draft = null
		_resource_cursor = -1
	var epoch := _epoch
	var command_generation := _command_generation
	var response: Dictionary = await _observer.read_status(bridge, get_tree())
	if not _live() or epoch != bridge.connection_epoch() or command_generation != _command_generation or response.get("cancelled", false): return
	if not response.get("ok", false):
		_observer.close()
		_elapsed = -1.8
		failed.emit(str(response.get("error", "Connected session status is unavailable.")))
		return
	_present(response.result)
	if _operations.busy: return
	_prepare_input.call()
	var intent: Variant = response.result.get("writeIntent")
	if _resource_cursor < 0: _resource_cursor = int(response.result.get("localResourceCursor", 0))
	var changed := int(response.result.revision) != int(_read_context.call().revision) or int(response.result.get("localResourceCursor", 0)) != _resource_cursor
	response = await _report_draft()
	if not _live() or epoch != bridge.connection_epoch() or command_generation != _command_generation: return
	if not response.get("ok", false): failed.emit(str(response.get("error", "Native draft registration is unavailable."))); return
	if not intent is Dictionary and not changed or _operations.busy: return
	# Draft reports use the bound control connection. Only a write permit or
	# applied-state refresh leases the editing stream and exposes busy state.
	var label := "Apply connected client change" if intent is Dictionary else "Update connected editing state"
	if not _operations.begin(bridge, label): return
	if intent is Dictionary: response = await _permit_write(intent)
	if response.get("ok", false) and (changed or intent is Dictionary): response = await _refresh_if_changed()
	_guard.release(get_tree())
	if not _live(): return
	_checking = false
	_operations.finish(response)
	if not response.get("ok", false): failed.emit(str(response.get("error", "Connected session could not refresh.")))


func _report_draft() -> Dictionary:
	var report := _draft_report()
	if _reported_draft == report: return {"ok": true}
	var response: Dictionary = await _observer.report_draft(_read_bridge.call(), report, get_tree())
	if response.get("ok", false): _reported_draft = report
	return response


func _draft_report() -> Dictionary:
	var locations: Array = _drafts.draft_locations() if _drafts.has_method("draft_locations") else []
	return {"active": _drafts.has_any_draft(), "locations": locations}


func _permit_write(intent: Dictionary) -> Dictionary:
	# Freeze all native windows before flushing deferred controls and checking
	# drafts. Retain the lease until that exact write settles or its permit expires.
	_guard.freeze(get_tree())
	await get_tree().process_frame
	if not _live(): return {"ok": false, "cancelled": true}
	_prepare_input.call()
	var response: Dictionary = await _report_draft()
	if not response.get("ok", false) or _drafts.has_any_draft(): return response
	response = await _operations.request("session.write-permit", {"token": intent.token, "revision": int(intent.revision), "inputFrozen": true})
	var deadline := Time.get_ticks_msec() + 17000
	while response.get("ok", false) and Time.get_ticks_msec() < deadline:
		response = await _operations.request("session.collaboration")
		if not response.get("ok", false): break
		_present(response.result)
		if response.result.get("writeIntent") == null: break
		await get_tree().create_timer(0.05).timeout
	return response


func _refresh_if_changed() -> Dictionary:
	var response: Dictionary = await _operations.request("session.describe")
	if not response.get("ok", false) or not _live(): return response
	var summary: Dictionary = response.result
	var project_changed := int(summary.revision) != int(_read_context.call().revision)
	var resources_changed := int(summary.get("localResourceCursor", 0)) != _resource_cursor
	if not project_changed and not resources_changed: return response
	# If a client changed while a dirty document was disconnected, leave its
	# draft and invalidation intact. Never replace it with an incoming projection.
	if _drafts.has_any_draft():
		external_change.emit(summary)
		return {"ok": true, "draftKept": true}
	if project_changed: response = await _refresh_external.call(summary, _operations)
	if response.get("ok", false) and resources_changed and _refresh_local_resources.is_valid():
		response = await _refresh_local_resources.call(_operations)
	if response.get("ok", false) and not response.get("draftKept", false): _resource_cursor = int(summary.get("localResourceCursor", 0))
	return response


func command(method: String, params: Dictionary = {}) -> Dictionary:
	if _operations.busy: return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var bridge = _read_bridge.call()
	if not bridge.is_project_backed() or not bridge.shared_session_enabled(): return {"ok": false, "error": "Open a project with shared sessions enabled."}
	if not _operations.begin(bridge, "Update connected clients"): return {"ok": false, "busy": true}
	_command_generation += 1
	var response: Dictionary = await _operations.request(method, params)
	_operations.finish(response)
	if response.get("ok", false): _present(response.result)
	return response


func _present(projection: Dictionary) -> void:
	if not _live(): return
	state = projection
	state_changed.emit(state)


func _live() -> bool:
	if not is_inside_tree(): return false
	var node: Node = self
	while node != null:
		if node.is_queued_for_deletion(): return false
		node = node.get_parent()
	return true


func _exit_tree() -> void:
	_observer.close()
	_guard.release(get_tree())

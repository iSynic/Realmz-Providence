class_name ProvidenceEditorOperation
extends Node

signal busy_changed(busy: bool, label: String)
signal completed(response: Dictionary)
signal recovery_required(message: String)

var busy := false
var label := ""
var last_metrics: Dictionary = {}
var requires_reopen := false
var _bridge
var _epoch := -1
var _started := 0
var _previous_frame := 0
var _maximum_frame_gap := 0
var _media_read_lease := false
var _media_read_reconnect := false


func begin(bridge, operation_label: String) -> bool:
	if requires_reopen: return false
	return _claim(bridge, operation_label)


func _claim(bridge, operation_label: String) -> bool:
	if busy or not bridge.claim_operation(get_instance_id()): return false
	_bridge = bridge
	_epoch = bridge.connection_epoch()
	label = operation_label
	busy = true
	_started = Time.get_ticks_usec()
	_previous_frame = _started
	_maximum_frame_gap = 0
	last_metrics = {}
	busy_changed.emit(true, label)
	return true


func request(method: String, params: Dictionary = {}) -> Dictionary:
	if not busy or _bridge.connection_epoch() != _epoch:
		return _unavailable()
	if _media_read_lease:
		var reconnect := _media_read_reconnect
		_media_read_reconnect = false
		return await _repair_recovery_request("media.recovery.read", {"method": method, "params": params}, reconnect)
	var started: Dictionary = _bridge.begin_request(method, params, get_instance_id())
	if not started.get("ok", false): return started
	return await _wait_for_request(_bridge, _epoch)


func run_workflow(bridge, operation_label: String, workflow: Callable, borrowed: ProvidenceEditorOperation = null, local_recovery: bool = false) -> Dictionary:
	var owns_operation := borrowed == null
	if owns_operation:
		if not begin(bridge, operation_label):
			return {"ok": false, "busy": busy, "outcomeUnknown": requires_reopen,
				"error": "Reopen the project before making changes." if requires_reopen else "Wait for the current operation to finish."}
	elif borrowed != self or not busy or bridge != _bridge:
		return _unavailable()
	# A caller may lend its lease only to a directly awaited child workflow.
	# Independent button/selection callbacks must acquire their own operation.
	var response: Dictionary = await workflow.call(self)
	if bridge.connection_epoch() != _epoch: response = _unavailable()
	if owns_operation: finish(response, local_recovery)
	return response


func commit_repair(params: Dictionary, intent: Dictionary) -> Dictionary:
	if not busy or _bridge.connection_epoch() != _epoch: return _unavailable()
	var started: Dictionary = _bridge.begin_repair(params, intent, get_instance_id())
	if not started.get("ok", false): return started
	return await _wait_for_request(_bridge, _epoch)


func recover_repair(bridge, method: String, params: Dictionary, reconnect: bool) -> Dictionary:
	# Recovery may lease a locked transport only through the bridge's restricted
	# read API. It never makes request() available for an uncertain mutation.
	if not _claim(bridge, ""): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response: Dictionary = await _repair_recovery_request(method, params, reconnect)
	if response.get("outcomeUnknown", false) and not reconnect and _bridge.connection_epoch() == _epoch:
		response = await _repair_recovery_request(method, params, true)
	if response.get("repairRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func recover_encounter(bridge, intent: Dictionary) -> Dictionary:
	if not _claim(bridge, "Check current encounter"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response := await _repair_recovery_request("encounter.reconcile-draft", intent, true)
	if response.get("encounterRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func recover_monster(bridge, intent: Dictionary) -> Dictionary:
	if not _claim(bridge, "Check original Monster result"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response := await _repair_recovery_request("monster.operation.status", intent, true)
	if response.get("monsterRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func recover_item(bridge, intent: Dictionary, read_only := false) -> Dictionary:
	if not _claim(bridge, "Check original Item result"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response := await _repair_recovery_request("item.recovery.read" if read_only else "item.operation.status", intent, true)
	if response.get("itemRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func recover_battle(bridge, intent: Dictionary) -> Dictionary:
	if not _claim(bridge, "Check original Battle result"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response := await _repair_recovery_request("battle.recovery.read" if intent.is_empty() else "battle.operation.status", intent, true)
	if response.get("battleRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func recover_media(bridge, intent: Dictionary) -> Dictionary:
	if not _claim(bridge, "Reconcile stored media"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response := await _repair_recovery_request("media.operation.status", intent, true)
	if response.get("mediaRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func recover_world(bridge, intent: Dictionary) -> Dictionary:
	if not _claim(bridge, "Reconcile original World edit"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	var response := await _repair_recovery_request("world.recovery.read" if intent.is_empty() else "world.operation.status", intent, true)
	if response.get("worldRecoveryConfirmed", false): requires_reopen = false
	finish(response, true)
	return response


func browse_media(bridge, workflow: Callable, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if not requires_reopen: return await run_workflow(bridge, "Browse media", workflow, borrowed)
	if borrowed != null:
		return await workflow.call(self) if borrowed == self and busy and _media_read_lease else _unavailable()
	if not _claim(bridge, "Browse media"): return {"ok": false, "busy": true, "error": "Wait for the current operation to finish."}
	_media_read_lease = true
	_media_read_reconnect = true
	var response: Dictionary = await workflow.call(self)
	_media_read_lease = false
	finish(response, true)
	return response


func _repair_recovery_request(method: String, params: Dictionary, reconnect: bool) -> Dictionary:
	var started: Dictionary = _bridge.begin_repair_recovery(method, params, get_instance_id(), reconnect)
	# Only this explicit reconnect adopts a new epoch on the same project.
	_epoch = _bridge.connection_epoch()
	if not started.get("ok", false): return started
	return await _wait_for_request(_bridge, _epoch)


func open_project(candidate, path: String, options: Dictionary = {}) -> Dictionary:
	if not busy or _bridge.connection_epoch() != _epoch: return _unavailable()
	var started: Dictionary = candidate.begin_project_start(path, options)
	if not started.get("ok", false): return started
	return await _wait_for_candidate(candidate)


func create_project(candidate, project_id: String, path: String) -> Dictionary:
	if not busy or _bridge.connection_epoch() != _epoch: return _unavailable()
	var started: Dictionary = candidate.begin_project_create(project_id, path)
	if not started.get("ok", false): return started
	return await _wait_for_candidate(candidate)


func configure_library(candidate, kind: String, path: String) -> Dictionary:
	if not busy or _bridge.connection_epoch() != _epoch: return _unavailable()
	var started: Dictionary = candidate.begin_library_configuration(kind, path)
	if not started.get("ok", false): return started
	return await _wait_for_candidate(candidate)


func _wait_for_candidate(candidate) -> Dictionary:
	var response: Dictionary = await _wait_for_request(candidate, candidate.connection_epoch())
	if not response.get("ok", false) and _bridge.connection_epoch() == _epoch:
		# The candidate has not edited the current session. Its failed read must
		# not impose mutation recovery on the still-intact original connection.
		response.erase("outcomeUnknown")
		if response.get("connectionChanged", false):
			response["error"] = "The new project connection changed before it opened. Your current project remains open."
	return response


func save_as(candidate, path: String) -> Dictionary:
	if not busy or _bridge.connection_epoch() != _epoch: return _unavailable()
	if not _bridge.is_project_backed():
		return {"ok": false, "error": "Save As requires an open portable project."}
	var normalized := path.strip_edges().simplify_path()
	if normalized.is_empty():
		return {"ok": false, "error": "Choose a destination project directory."}
	var options := {"applicationLibrary": _bridge.current_application_library_root(),
		"referenceCatalog": _bridge.current_reference_catalog_root(),
		"monsterLibrary": _bridge.current_monster_library_root()}
	var saved := await request("project.save-as", {"path": normalized})
	if not saved.get("ok", false): return saved
	var saved_project := saved.get("result", {}) as Dictionary
	# Keep the source connection until the independently stored copy opens.
	# A failed candidate read does not undo or retry a successful durable copy.
	var opened := await open_project(candidate, str(saved_project.get("projectPath", normalized)), options)
	opened["saveAs"] = saved_project
	return opened


func _wait_for_request(worker_bridge, worker_epoch: int) -> Dictionary:
	# Only the bridge worker touches the stream. Scene updates stay on this thread,
	# and an epoch change invalidates the response even if the old worker completed.
	while is_inside_tree():
		await get_tree().process_frame
		_record_frame()
		if _bridge.connection_epoch() != _epoch: return _unavailable()
		if worker_bridge.connection_epoch() != worker_epoch: return _unavailable()
		var polled: Dictionary = worker_bridge.poll_request()
		if not polled.get("pending", false): return polled.response
	return _unavailable()


func finish(response: Dictionary, local_recovery: bool = false, notify_completion: bool = true) -> void:
	if not busy: return
	_record_frame()
	last_metrics = {"elapsedMs": float(Time.get_ticks_usec() - _started) / 1000.0,
		"maxFrameGapMs": float(_maximum_frame_gap) / 1000.0}
	_bridge.release_operation(get_instance_id())
	_bridge = null
	busy = false
	requires_reopen = requires_reopen or bool(response.get("outcomeUnknown", false))
	busy_changed.emit(false, label)
	if requires_reopen and not local_recovery:
		recovery_required.emit("The operation outcome could not be confirmed. Check the original operation or reopen the project before making further changes.")
	if notify_completion: completed.emit(response)


func notify_completed(response: Dictionary) -> void:
	completed.emit(response)


func reset_session() -> void:
	assert(not busy, "Do not replace a session during an operation")
	requires_reopen = false


func _record_frame() -> void:
	var now := Time.get_ticks_usec()
	_maximum_frame_gap = maxi(_maximum_frame_gap, now - _previous_frame)
	_previous_frame = now


func _unavailable() -> Dictionary:
	return {"ok": false, "outcomeUnknown": true, "connectionChanged": true,
		"error": "The project connection changed. Reopen the project before retrying."}


func _exit_tree() -> void:
	if _bridge != null:
		_bridge.release_operation(get_instance_id())

extends SceneTree

const Operation = preload("res://src/editor_operation.gd")
const History = preload("res://src/history_controller.gd")

class SlowBridge extends "res://src/native_bridge.gd":
	var response := {"ok": true, "result": {"revision": 1}}
	var calls: Array = []
	func _request(method: String, _params: Dictionary) -> Dictionary:
		OS.delay_msec(40)
		calls.append(method)
		return response.duplicate(true)
	func change_epoch() -> void:
		_connection_epoch += 1

class SlowCandidate extends SlowBridge:
	func begin_project_start(_path: String, _options: Dictionary = {}) -> Dictionary:
		_connection_epoch += 1
		_request_worker = Thread.new()
		assert(_request_worker.start(_request.bind("session.describe", {})) == OK)
		return {"ok": true}

var _operation: Operation
var _history = History.new()
var _bridge = SlowBridge.new()
var _failed := false
var _frames := 0
var _projection: Dictionary = {}
var _result: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_operation = Operation.new()
	root.add_child(_operation)
	process_frame.connect(func(): _frames += 1)
	_history.operations = _operation
	_history.refresh_visible = func(_projection): return {"ok": true}
	_history.projection_applied.connect(func(projection): _projection = projection)
	await _single_flight()
	await _rejection()
	await _unknown_view_refresh()
	await _unknown_outcome()
	await _changed_connection()
	await _candidate_connection()
	await _borrowed_refresh_workflow()
	await _repair_recovery_lease()
	_bridge.stop()
	_operation.free()
	await process_frame
	if not _failed: print("PROVIDENCE_EDITOR_OPERATION_OK single-flight responsive rejected unknown epoch-guarded released")
	quit(1 if _failed else 0)


func _repair_recovery_lease() -> void:
	_operation.reset_session()
	var bridge := SlowBridge.new()
	var intent := {"source": "extra-action-point:158", "slot": 4}
	bridge.response = {"ok": false, "outcomeUnknown": true, "error": "Controlled uncertain repair"}
	var result: Dictionary = await _operation.run_workflow(bridge, "", func(op): return await op.commit_repair({}, intent), null, true)
	_check(result.get("outcomeUnknown", false) and _operation.requires_reopen, "Uncertain repair did not lock the shared operation")
	var count := bridge.calls.size()
	await _operation.recover_repair(bridge, "action-settings.reconcile-repair", {"intent": {"source": "unrelated"}}, false)
	_check(bridge.calls.size() == count and _operation.requires_reopen, "Unrelated asynchronous repair intent entered or unlocked the uncertain stream")
	bridge.response = {"ok": true, "result": {"outcome": "not-applied"}}
	result = await _operation.recover_repair(bridge, "action-settings.reconcile-repair", {"intent": intent}, false)
	_check(result.get("repairRecoveryConfirmed", false) and not _operation.requires_reopen, "Confirmed repair recovery did not release its lock")
	_check(bridge.calls == ["action-settings.commit-repair", "action-settings.reconcile-repair"], "Recovery repeated a mutation")
	_check(_operation.begin(bridge, "Read"), "Recovered repair retained the shared lease")
	_operation.finish({"ok": true})
	bridge.stop()


func _single_flight() -> void:
	var before := _frames
	call("_start_history")
	_check(_operation.busy and _operation.label == "Undo", "Busy feedback was not immediate")
	var duplicate: Dictionary = await _history.execute(_bridge, 0, "undo")
	_check(duplicate.get("busy", false), "Repeated Undo was queued or started")
	_check(_bridge.request("message.update").get("busy", false), "A conflicting command entered the reserved stream")
	await _operation.completed
	await process_frame
	_check(_frames > before + 1 and _result.get("ok", false), "History blocked frame processing")
	_check(_bridge.calls == ["history.undo"], "One press performed more than one mutation")
	_check(not _bridge.operation_busy() and _projection.get("revision") == 1, "Completion lost the projection or retained the stream")


func _start_history() -> void:
	_result = await _history.execute(_bridge, 0, "undo")


func _rejection() -> void:
	_projection.clear()
	_bridge.response = {"ok": false, "error": "Revision conflict"}
	var response: Dictionary = await _history.execute(_bridge, 0, "redo")
	_check(not response.ok and _projection.is_empty(), "A rejected command applied a projection")
	_check(not _history.requires_reopen and not _operation.busy, "A known rejection locked history permanently")


func _unknown_outcome() -> void:
	_bridge.response = {"ok": false, "outcomeUnknown": true, "error": "Connection closed"}
	await _history.execute(_bridge, 0, "undo")
	var count: int = _bridge.calls.size()
	await _history.execute(_bridge, 0, "undo")
	_check(_history.requires_reopen and _bridge.calls.size() == count, "Unknown outcome retried the mutation")
	_check(not _operation.begin(_bridge, "Save"), "Unknown history outcome allowed another mutation")
	_check(_bridge.request("message.update").get("outcomeUnknown", false), "A synchronous legacy caller bypassed unknown-outcome recovery")
	_check(_bridge.reconcile_repair({"intent": {"source": "unrelated"}}).get("outcomeUnknown", false), "An unrelated repair cleared unknown history")
	_check(_bridge.calls.size() == count, "The recovery guard sent another native request")


func _unknown_view_refresh() -> void:
	_bridge.response = {"ok": true, "result": {"revision": 2}}
	_history.refresh_visible = func(_projection): return {"ok": false, "outcomeUnknown": true, "error": "Read connection interrupted"}
	var response: Dictionary = await _history.execute(_bridge, 1, "undo")
	_check(response.ok and response.has("viewRefreshError"), "A refresh failure erased acknowledged history success")
	_check(_history.requires_reopen and _operation.requires_reopen, "Unknown refresh did not lock both operation owners")
	_history.refresh_visible = func(_projection): return {"ok": true}
	_bridge.stop()
	_history.reset()


func _borrowed_refresh_workflow() -> void:
	_bridge.stop()
	_history.reset()
	_bridge.response = {"ok": true, "result": {"revision": 3}}
	_check(_operation.begin(_bridge, "History refresh"), "Could not reserve refresh transport")
	var independent: Dictionary = await _operation.run_workflow(_bridge, "Unrelated read", _read_projection)
	_check(independent.get("busy", false), "Independent read borrowed a busy operation implicitly")
	var response: Dictionary = await _operation.run_workflow(_bridge, "Visible document", _read_projection, _operation)
	_check(response.ok and _operation.busy and _bridge.operation_busy(), "Child refresh released the parent's operation")
	_operation.finish(response)
	_check(not _bridge.operation_busy(), "Completed refresh retained the transport")


func _read_projection(operation: ProvidenceEditorOperation) -> Dictionary:
	return await operation.request("message.open", {"nativeId": 0})


func _changed_connection() -> void:
	_bridge.stop()
	_history.reset()
	_bridge.response = {"ok": true, "result": {"revision": 2}}
	_projection.clear()
	create_timer(0.01).timeout.connect(_bridge.change_epoch)
	var response: Dictionary = await _history.execute(_bridge, 1, "redo")
	_check(response.get("outcomeUnknown", false) and _projection.is_empty(), "An old connection applied its late result")
	_check(_history.requires_reopen, "A changed connection allowed a blind retry")


func _candidate_connection() -> void:
	_bridge.stop()
	for interrupt in ["none", "current", "candidate"]:
		_operation.reset_session()
		var candidate := SlowCandidate.new()
		candidate.response = {"ok": false, "error": "Controlled open rejection"}
		_check(_operation.begin(_bridge, "Open"), "Open could not reserve the current connection")
		if interrupt == "current": create_timer(0.01).timeout.connect(_bridge.change_epoch)
		if interrupt == "candidate": create_timer(0.01).timeout.connect(candidate.change_epoch)
		var response: Dictionary = await _operation.open_project(candidate, "controlled-project")
		_check(not response.ok, "Rejected candidate connection succeeded")
		_check(bool(response.get("outcomeUnknown", false)) == (interrupt == "current"), "Failed candidate reads were not isolated from the current session")
		_operation.finish(response)
		candidate.stop()
		_check(not _bridge.operation_busy(), "Candidate connection retained the current stream lease")


func _check(condition: bool, message: String) -> void:
	if condition: return
	_failed = true
	push_error("PROVIDENCE_EDITOR_OPERATION_FAILED " + message)

extends SceneTree

const Monitor = preload("res://src/library_integrity_monitor.gd")
const Operation = preload("res://src/editor_operation.gd")

class Bridge extends "res://src/native_bridge.gd":
	var calls := 0
	var result := {"status": "pending"}
	func _request(_method: String, _params: Dictionary) -> Dictionary:
		calls += 1
		return {"ok": true, "result": result.duplicate(true)}

var _errors: Array[String] = []
var _failed := false

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var operation = Operation.new()
	var monitor = Monitor.new()
	var bridge = Bridge.new()
	root.add_child(operation)
	root.add_child(monitor)
	monitor.start(bridge, operation, _errors.append)
	monitor.stop()
	await create_timer(0.3).timeout
	_check(bridge.calls <= 1 and not monitor.pending, "Stopped verification scheduled another read")
	bridge.result = {"status": "complete"}
	monitor.start(bridge, operation, _errors.append)
	await monitor.finished
	_check(not monitor.pending and _errors.is_empty(), "Successful verification did not finish cleanly")
	bridge.result = {"status": "failed", "error": "Changed Stock payload"}
	monitor.start(bridge, operation, _errors.append)
	await monitor.finished
	_check(_errors == ["Changed Stock payload"], "Integrity failure did not reach the author")
	monitor.start(bridge, operation, _errors.append)
	root.remove_child(monitor)
	await create_timer(0.3).timeout
	_check(not monitor.pending and _errors.size() == 1, "Detached monitor delivered a late failure")
	monitor.free()
	var pending_monitor = Monitor.new()
	root.add_child(pending_monitor)
	bridge.result = {"status": "pending"}
	await pending_monitor.start(bridge, operation, _errors.append)
	_check(pending_monitor.pending, "Pending verification did not schedule follow-up")
	var calls_before: int = bridge.calls
	pending_monitor.free()
	await create_timer(2.2).timeout
	_check(bridge.calls == calls_before and _errors.size() == 1, "Freed monitor retained a scheduled read")
	operation.free()
	bridge.stop()
	await process_frame
	if not _failed: print("PROVIDENCE_LIBRARY_INTEGRITY_OK stopped complete corrupt detached freed-timer")
	quit(1 if _failed else 0)

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

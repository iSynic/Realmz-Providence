extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var rejected := false
	var unknown := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(35)
		calls.append({"method": method, "params": params.duplicate(true)})
		return {"ok": not rejected, "result": {"revision": 2}, "error": "Controlled failure", "outcomeUnknown": unknown}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _commands := preload("res://src/asset_library_commands.gd").new()
var _result: Dictionary
var _refreshed := 0
var _changed := 0
var _status := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	create_timer(20.0).timeout.connect(func(): quit(1))
	root.add_child(_operations)
	_commands.operations = _operations
	_commands.attach_session(_bridge)
	_commands.library_changed.connect(func():
		assert(not _operations.busy)
		_changed += 1)
	_commands.status_changed.connect(func(_message): _status += 1)
	await _check_single_flight()
	await _check_acknowledged_refresh_failure()
	await _check_failures()
	await _check_session_teardown()
	_bridge.stop()
	_operations.free()
	print("PROVIDENCE_ASSET_LIBRARY_COMMANDS_OK single-flight borrowed-refresh rejection unknown no-retry teardown")
	quit()


func _begin_import() -> void:
	_result = await _commands.import_image("C:/fixture/Ruby.png", 1, "collection:gems", _refresh)


func _refresh(operation: ProvidenceEditorOperation, _applied: bool) -> Dictionary:
	assert(operation == _operations and operation.busy and _bridge.operation_busy())
	_refreshed += 1
	return await operation.request("personal-library.list", {"offset": 0, "limit": 25})


func _check_single_flight() -> void:
	var started := Time.get_ticks_usec()
	_begin_import()
	assert(_operations.busy and Time.get_ticks_usec() - started < 100000)
	var repeated := await _commands.mutate("personal-library.remove", {}, _refresh)
	assert(not repeated.ok and repeated.busy)
	while _operations.busy: await process_frame
	assert(_result.ok and _refreshed == 1 and _changed == 1 and _bridge.calls.size() == 2)
	assert(_bridge.calls[0].method == "personal-library.import-image")
	assert(_bridge.calls[0].params.name == "Ruby" and _bridge.calls[0].params.collection == "collection:gems")
	assert(_operations.last_metrics.maxFrameGapMs < 100.0)


func _check_failures() -> void:
	_bridge.rejected = true
	var result := await _commands.mutate("personal-library.rename", {"identity": "asset:one", "name": "Amber"}, _refresh)
	assert(not result.ok and _refreshed == 2 and _changed == 2)
	_bridge.unknown = true
	var calls := _bridge.calls.size()
	result = await _commands.mutate("personal-library.remove", {"identity": "asset:one"}, _refresh)
	assert(result.outcomeUnknown and _operations.requires_reopen and _refreshed == 2)
	await _commands.mutate("personal-library.remove", {}, _refresh)
	assert(_bridge.calls.size() == calls + 1)
	_bridge.stop()
	_operations.reset_session()
	_bridge.rejected = false
	_bridge.unknown = false


func _check_acknowledged_refresh_failure() -> void:
	var refresh_failure := func(operation: ProvidenceEditorOperation, applied: bool) -> Dictionary:
		assert(operation.busy and applied)
		return {"ok": false, "error": "Controlled view refresh failure"}
	var result := await _commands.mutate("personal-library.move", {"identity": "asset:one", "collection": null}, refresh_failure)
	assert(result.ok and result.viewRefreshError == "Controlled view refresh failure")
	assert(_changed == 2 and not _operations.requires_reopen)


func _check_session_teardown() -> void:
	var changed := _changed
	var status := _status
	_begin_import()
	_commands.attach_session(null)
	while _operations.busy: await process_frame
	assert(_changed == changed and _status == status and _refreshed == 2)

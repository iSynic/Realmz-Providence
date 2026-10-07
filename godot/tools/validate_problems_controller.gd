extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var fail := false
	var unknown := false
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if fail: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled failure"}
		if method == "validation.list":
			assert(params == {"offset": 0, "limit": 128})
			return {"ok": true, "result": {"items": [{"entity": "map:1", "code": "test", "message": "Missing target"}]}}
		assert(method == "compatibility.classify")
		return {"ok": true, "result": [{"target": "classic", "status": "ready", "blockers": []}]}

var _bridge := Bridge.new()
var _controller := preload("res://src/problems_controller.gd").new()
var _operations := ProvidenceEditorOperation.new()
var _view: ProvidenceProblemsDock
var _pending := {}
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	_view = load("res://src/problems_dock.tscn").instantiate()
	root.add_child(_view)
	_controller.initialize(_view, _operations)
	_controller.attach_session(_bridge)
	process_frame.connect(func(): _frames += 1)
	assert((await _controller.refresh()).ok and _frames > 2)
	assert(_view.diagnostic_count() == 1 and _text().contains("Missing target"))
	_view.merge_projection({"affectedEntities": ["map:2"], "affectedDiagnostics": [{"entity": "map:2", "message": "Other"}]})
	assert(_view.diagnostic_count() == 2)
	_view.merge_projection({"affectedEntities": ["map:1"], "affectedDiagnostics": []})
	assert(_view.diagnostic_count() == 1 and _text().contains("Other"))
	assert(_operations.begin(_bridge, "Open"))
	var borrowed: Dictionary = await _controller.refresh(_operations)
	assert(borrowed.ok and _operations.busy)
	_operations.finish(borrowed)
	await _check_surfaces()
	await _check_failures()
	_controller.teardown()
	_bridge.stop()
	_view.free()
	_operations.free()
	print("PROVIDENCE_PROBLEMS_CONTROLLER_OK bounded-worker borrowed-open diagnostics-merge surface-retention rejection unknown teardown")
	quit()


func _text() -> String:
	return _view.problem_rows.get_child(0).text


func _check_surfaces() -> void:
	_view.open_surface(1)
	assert(_operations.busy)
	await _operations.completed
	assert(_text() == "CLASSIC  ·  READY")
	_view.open_surface(1)
	assert(_operations.busy)
	_view.open_surface(2)
	await _operations.completed
	assert(_text().begins_with("Compiler Output has no output"))
	_view.open_surface(0)
	assert(_text().contains("Missing target"))


func _check_failures() -> void:
	_bridge.fail = true
	assert(not (await _controller.refresh()).ok)
	assert(_view.diagnostic_count() == 1 and not _operations.requires_reopen)
	_bridge.fail = false
	call("_start_refresh")
	assert(_operations.busy)
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _view.diagnostic_count() == 0)
	_controller.attach_session(_bridge)
	_bridge.fail = true
	_bridge.unknown = true
	assert(not (await _controller.refresh()).ok and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _controller.refresh()).ok and _bridge.calls.size() == count)


func _start_refresh() -> void:
	_pending = await _controller.refresh()

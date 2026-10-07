extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	var unknown := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == "compiler.describe": return {"ok": true, "result": {"commit": "controlled-preview"}}
		assert(method == "project.compile-rebuilt-package")
		assert(params.expectedRevision == 7 and params.compilerCommit == "controlled-preview")
		if unknown: return {"ok": false, "outcomeUnknown": true, "error": "Controlled compile exit"}
		var output := FileAccess.open(params.path, FileAccess.WRITE)
		output.store_string("Controlled isolated preview package")
		output.close()
		return {"ok": true, "result": {"revision": 7}}

class Controller extends "res://src/rebuilt_preview_controller.gd":
	var launched := 0
	var roots: Array[String] = []
	func _resolve_configuration() -> Dictionary:
		return {"ok": true, "previewExecutable": "powershell.exe", "rebuiltRoot": "controlled", "godotExecutable": "controlled"}
	func _create_temp_root() -> Dictionary:
		var result := super._create_temp_root()
		if result.ok: roots.append(result.root)
		return result
	func _execute_json_async(executable: String, _arguments: PackedStringArray) -> Dictionary:
		return await super._execute_json_async(executable, PackedStringArray([
			"-NoProfile", "-Command", "Start-Sleep -Milliseconds 80; @{arguments=@('controlled')} | ConvertTo-Json -Compress"]))
	func _launch_runtime(_configuration: Dictionary, plan: Dictionary) -> Dictionary:
		assert(plan.result.arguments == ["controlled"])
		launched += 1
		_active = true
		set_process(false)
		return {"ok": true, "scratchRoot": _temp_root}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _controller := Controller.new()
var _frames := 0
var _target := {"kind": "simple-encounter", "id": 4}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	root.add_child(_controller)
	_controller.configure_operations(_operations)
	process_frame.connect(func(): _frames += 1)
	await _check_launch()
	await _check_cancel()
	await _check_unknown()
	for path in _controller.roots: assert(not DirAccess.dir_exists_absolute(path))
	_bridge.stop()
	_controller.free()
	_operations.free()
	print("PROVIDENCE_PREVIEW_OPERATIONS_OK worker-compile worker-helper busy-single-launch cancel-no-launch unknown-no-retry isolated-cleanup")
	quit()


func _check_launch() -> void:
	var frames := _frames
	_controller.start_preview(_bridge, _target, 7)
	assert(_operations.busy and _controller.is_active())
	var duplicate := await _controller.start_preview(_bridge, _target, 7)
	assert(not duplicate.ok)
	await _idle()
	assert(_frames - frames > 3 and _controller.launched == 1)
	assert(_bridge.calls == ["compiler.describe", "project.compile-rebuilt-package"])
	_controller.cancel_preview()
	assert(not _controller.is_active())


func _check_cancel() -> void:
	_controller.start_preview(_bridge, _target, 7)
	assert(_operations.busy)
	_controller.cancel_preview()
	await _idle()
	assert(not _controller.is_active() and _controller.launched == 1)
	assert(_bridge.calls.size() == 3)
	_controller.start_preview(_bridge, _target, 7)
	while _controller._helper_worker == null: await process_frame
	_controller.cancel_preview()
	await _idle()
	assert(_controller.launched == 1 and not _controller.is_active())


func _check_unknown() -> void:
	_bridge.unknown = true
	var result := await _controller.start_preview(_bridge, _target, 7)
	assert(result.outcomeUnknown and _operations.requires_reopen)
	var count := _bridge.calls.size()
	await _controller.start_preview(_bridge, _target, 7)
	assert(_bridge.calls.size() == count and _controller.launched == 1)


func _idle() -> void:
	while _operations.busy: await process_frame
	await process_frame

extends SceneTree

class TimingBridge extends "res://src/native_bridge.gd":
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		var started := Time.get_ticks_usec()
		var response: Dictionary = super._request(method, params)
		var elapsed := float(Time.get_ticks_usec() - started) / 1000.0
		var result: Variant = response.get("result")
		calls.append({"method": method, "elapsedMs": elapsed, "ok": response.get("ok", false),
			"native": result.get("performance", {}) if result is Dictionary else {},
			"terrainDeltaCells": result.get("mapTerrainDelta", {}).get("cells", []).size() if result is Dictionary else 0,
			"bridge": _request_metrics.duplicate()})
		return response

var _shell
var _failed := false
var _action_started := 0
var _busy_feedback_ms := 0.0
var _last_frame := 0
var _max_frame_gap := 0
var _bridge: TimingBridge


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3 or not args[0].get_file().begins_with("providence-history-profile-"):
		push_error("Expected a disposable history-profile root, Classic source directory and new report path")
		quit(1)
		return
	await _prepare_shell(args[0])
	var described := _import_fixture(args)
	if described.is_empty(): return _finish()
	await _shell._activate_session(described)
	await _shell._load_first_map()
	await _shell._navigation.select_tab(1)
	await _frames(3)
	var probe := _paint_probe()
	if probe.is_empty(): return _finish()
	var report := _new_report(args[1], described)
	for sample_index in 11:
		if not await _paint(probe): return _finish()
		await _frames(2)
		for action in ["undo", "redo", "undo"]:
			var sample := await _measure_history(action, sample_index)
			if sample_index > 0: report.samples.append(sample)
			await _frames(2)
	report["acceptance"] = _acceptance(report.samples)
	_write_report(args[2], report)
	if not report.acceptance.passed:
		_failed = true
		push_error("History performance acceptance failed: " + JSON.stringify(report.acceptance))
	_finish()


func _prepare_shell(temporary_root: String) -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	process_frame.connect(_record_frame)
	_shell._operations.busy_changed.connect(func(busy: bool, _label: String):
		if busy and _action_started > 0 and _busy_feedback_ms < 0: _busy_feedback_ms = float(Time.get_ticks_usec() - _action_started) / 1000.0)
	await _frames(3)
	_shell._bridge.stop()
	_bridge = TimingBridge.new(temporary_root.path_join("settings.cfg"))
	_shell._bridge = _bridge
	_bridge.measure_requests = true


func _import_fixture(args: PackedStringArray) -> Dictionary:
	var created := _bridge.create_project("map-history-profile", args[0].path_join("project"))
	if not _accept(created): return {}
	if not _accept(_bridge.import_classic_scenario(args[1], 0, _bridge.bundled_classic_application_data_root())): return {}
	var described := _bridge.request("session.describe")
	return described if _accept(described) else {}


func _paint_probe() -> Dictionary:
	var opened := _bridge.request("map.open", {"identity": _shell._maps.document.identity})
	if not _accept(opened): return {}
	var terrain: Array = opened.result.get("terrainTiles", [])
	var cell_index := -1
	for index in terrain.size():
		if terrain[index] != null:
			cell_index = index
			break
	if cell_index < 0:
		_failed = true
		push_error("No ordinary terrain cell was available for the disposable probe")
		return {}
	return {"tilesetId": opened.result.map.runtime.tilesetId,
		"cells": [{"x": cell_index % 90, "y": cell_index / 90, "tile": 90 if int(terrain[cell_index]) != 90 else 164}]}


func _new_report(directory: String, described: Dictionary) -> Dictionary:
	return {"adapter": _bridge._adapter_path(), "adapterSha256": FileAccess.get_sha256(_bridge._adapter_path()),
		"cli": _bridge._cli_path(), "cliSha256": FileAccess.get_sha256(_bridge._cli_path()),
		"godot": OS.get_executable_path(), "godotVersion": Engine.get_version_info().get("string", ""),
		"processor": OS.get_processor_name(), "operatingSystem": OS.get_name(),
		"buildConfiguration": "release" if "/release/" in _bridge._adapter_path().replace("\\", "/") else "debug",
		"sourceDirectory": directory, "sourceFiles": _source_files(directory), "counts": described.result.counts,
		"mapIdentity": _shell._maps.document.identity, "warmupOperations": 3, "samples": [],
		"scope": "disposable full import; actual asynchronous Undo and Redo; headless Godot"}


func _paint(probe: Dictionary) -> bool:
	var response := _bridge.request("map.paint-terrain", {"expectedRevision": _shell._session_view.revision,
		"identity": _shell._maps.document.identity, "paint": probe})
	if not _accept(response): return false
	_shell._session_view.apply(response.result)
	await _shell._refresh_map_document_after_change(response.result)
	return true


func _measure_history(action: String, sample_index: int) -> Dictionary:
	_bridge.calls.clear()
	var before: int = _shell._session_view.revision
	var canvas = _shell._maps.document._land.get_node("%LandMapCanvas")
	var viewport: Dictionary = canvas.read_navigation_state()
	var original_tiles: Array = canvas._tiles.duplicate()
	_action_started = Time.get_ticks_usec()
	_last_frame = _action_started
	_max_frame_gap = 0
	_busy_feedback_ms = -1
	await _shell.call("_" + action)
	var calls: Array = _bridge.calls.duplicate(true)
	await process_frame
	var elapsed := float(Time.get_ticks_usec() - _action_started) / 1000.0
	var sample := {"index": sample_index, "action": action, "inputToVisibleMs": elapsed,
		"previousRevision": before, "revision": _shell._session_view.revision,
		"busyFeedbackMs": _busy_feedback_ms, "maxFrameGapMs": float(_max_frame_gap) / 1000.0,
		"viewportRetained": viewport == canvas.read_navigation_state(), "tilesUpdated": original_tiles != canvas._tiles,
		"operation": _shell._operations.last_metrics.duplicate(true), "requests": calls}
	_action_started = 0
	print("PROVIDENCE_HISTORY_TIMING action=%s sample=%d elapsedMs=%.3f requests=%d" % [action, sample_index, elapsed, calls.size()])
	return sample


func _acceptance(samples: Array) -> Dictionary:
	var elapsed := samples.map(func(sample): return float(sample.inputToVisibleMs))
	elapsed.sort()
	var median: float = (elapsed[14] + elapsed[15]) / 2.0
	var p95: float = elapsed[int(ceil(samples.size() * 0.95)) - 1]
	var feedback: bool = samples.all(func(sample): return sample.busyFeedbackMs >= 0 and sample.busyFeedbackMs <= 100)
	var frames: bool = samples.all(func(sample): return sample.maxFrameGapMs <= 100)
	var executed: bool = samples.all(func(sample): return sample.revision == sample.previousRevision + 1)
	var bounded: bool = samples.all(func(sample): return sample.requests.map(func(request): return request.method) == ["history." + sample.action] and sample.requests[0].terrainDeltaCells > 0 and sample.requests[0].terrainDeltaCells <= 1024)
	var visible: bool = samples.all(func(sample): return sample.viewportRetained and sample.tilesUpdated)
	var reused: bool = samples.all(func(sample): return not sample.requests.is_empty() and sample.requests[0].native.get("historySnapshotReused", false))
	return {"passed": samples.size() >= 30 and median <= 500 and p95 <= 1000 and feedback and frames and executed and bounded and reused and visible,
		"medianMs": median, "p95Ms": p95, "busyWithin100Ms": feedback, "framesWithin100Ms": frames,
		"everyOperationExecuted": executed, "terrainOnlyRequests": bounded, "historySnapshotsReused": reused, "visibleTilesUpdatedAndViewportRetained": visible}


func _write_report(path: String, report: Dictionary) -> void:
	if FileAccess.file_exists(path):
		_failed = true
		push_error("Refusing to replace an existing history profile")
	else:
		var file := FileAccess.open(path, FileAccess.WRITE)
		if file == null:
			_failed = true
			push_error("Could not write the history profile")
		else:
			file.store_string(JSON.stringify(report, "\t"))
			file.close()
			print("PROVIDENCE_HISTORY_PROFILE_OK ", path)


func _record_frame() -> void:
	if _action_started == 0: return
	var now := Time.get_ticks_usec()
	_max_frame_gap = maxi(_max_frame_gap, now - _last_frame)
	_last_frame = now


func _source_files(directory: String) -> Array:
	var files := DirAccess.get_files_at(directory)
	files.sort()
	var result: Array = []
	for filename in files:
		result.append({"name": filename, "sha256": FileAccess.get_sha256(directory.path_join(filename))})
	return result


func _accept(response: Dictionary) -> bool:
	if response.get("ok", false): return true
	_failed = true
	push_error(str(response.get("error", "History profile command failed")))
	return false


func _frames(count: int) -> void:
	for index in count: await process_frame


func _finish() -> void:
	if is_instance_valid(_shell): _shell.free()
	quit(1 if _failed else 0)

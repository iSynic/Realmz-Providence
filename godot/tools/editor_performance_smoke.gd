extends RefCounted

const WARMUP_SAMPLES := 5
const MEASURED_SAMPLES := 40
const ACKNOWLEDGEMENT_LIMIT_MS := 50.0
const MESSAGE_VISIBLE_LIMIT_MS := 100.0
const MAP_VISIBLE_LIMIT_MS := 125.0
const PROJECT_OPEN_LIMIT_MS := 2000.0


static func _run_performance_smoke(shell: Control, project_path: String, report_path: String) -> void:
	shell._document_tabs.current_tab = 0
	var open_started := Time.get_ticks_usec()
	var opened = shell._bridge.start_project(project_path)
	if not bool(opened.get("ok", false)):
		_performance_fail(shell, report_path, "Project open failed: %s" % str(opened.get("error", "unknown error")))
		return
	await shell._activate_session(opened)
	var project_open_ms = _elapsed_milliseconds(shell, open_started)
	if shell._strings._messages.is_empty():
		_performance_fail(shell, report_path, "The reference project has no message records to exercise.")
		return
	if shell._maps.document.maps.is_empty():
		_performance_fail(shell, report_path, "The reference project has no land maps to exercise.")
		return

	var probe := _load_probe(shell, report_path)
	if probe.is_empty(): return
	var measurements := _collect_samples(shell, report_path, probe)
	if measurements.is_empty() or not _restore_probe(shell, report_path, probe): return
	var report := _build_report(shell, project_open_ms, measurements)
	var report_error = _write_performance_report(shell, report_path, report)
	if not report_error.is_empty():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, report_error)
		return
	if not report.passed:
		push_error("PROVIDENCE_PERFORMANCE_SMOKE_FAILED: one or more latency gates failed; see %s" % report_path)
		shell.get_tree().quit(1)
		return
	print("PROVIDENCE_PERFORMANCE_SMOKE_OK openMs=%.3f ackP95Ms=%.3f messageVisibleP95Ms=%.3f mapVisibleP95Ms=%.3f" % [
		project_open_ms,
		float(report.measurements.ordinaryCommandAcknowledgement.get("p95Ms", 0.0)),
		float(report.measurements.messageCommandToVisibleUpdate.get("p95Ms", 0.0)),
		float(report.measurements.mapCommandToVisibleUpdate.get("p95Ms", 0.0)),
	])
	shell.get_tree().quit()


static func _load_probe(shell: Control, report_path: String) -> Dictionary:
	var message = shell._strings._messages[0] as Dictionary
	var message_identity := str(message.get("identity", ""))
	var original_message_text := str(message.get("text", ""))
	var bounded_message_text := original_message_text.left(250)
	var message_variants := [bounded_message_text + " A", bounded_message_text + " B"]

	var map_identity = str((shell._maps.document.maps[0] as Dictionary).get("identity", ""))
	var opened_map_response = shell._bridge.request("map.open", {"identity": map_identity})
	if not bool(opened_map_response.get("ok", false)):
		_performance_fail(shell, report_path, "Reference map open failed: %s" % str(opened_map_response.get("error", "unknown error")))
		return {}
	var opened_map := opened_map_response.result as Dictionary
	var map := opened_map.get("map", {}) as Dictionary
	var tiles := map.get("tiles", []) as Array
	if tiles.size() != 90 * 90:
		_performance_fail(shell, report_path, "The reference land map did not expose 8,100 cells.")
		return {}
	var map_cell_index := -1
	for index in range(tiles.size()):
		if int(tiles[index]) >= 0:
			map_cell_index = index
			break
	if map_cell_index < 0:
		_performance_fail(shell, report_path, "The reference land map has no ordinary cell suitable for the edit probe.")
		return {}
	var map_x := map_cell_index % 90
	var map_y := map_cell_index / 90
	var original_tile := int(tiles[map_cell_index])
	var alternate_tile := 1 if original_tile != 1 else 2
	var selected_action_point: Dictionary = {}
	for value in opened_map.get("actionPoints", []) as Array:
		var candidate := value as Dictionary
		var coordinate := candidate.get("coordinate", {}) as Dictionary
		if int(coordinate.get("x", -1)) == map_x and int(coordinate.get("y", -1)) == map_y:
			selected_action_point = candidate
			break
	return {"messageIdentity": message_identity, "originalMessage": original_message_text, "messageVariants": message_variants,
		"mapIdentity": map_identity, "x": map_x, "y": map_y, "originalTile": original_tile, "alternateTile": alternate_tile, "actionPoint": selected_action_point}


static func _sample_message(shell: Control, report_path: String, probe: Dictionary, message_text: String) -> Dictionary:
	var message_started := Time.get_ticks_usec()
	var message_response = shell._bridge.request("message.update", {
		"expectedRevision": shell._session_view.revision,
		"identity": str(probe.messageIdentity),
		"text": message_text,
		"measurePerformance": true,
	})
	var message_ack_ms = _elapsed_milliseconds(shell, message_started)
	if not bool(message_response.get("ok", false)):
		_performance_fail(shell, report_path, "Message update failed: %s" % str(message_response.get("error", "unknown error")))
		return {}
	shell._session_view.apply(message_response.result as Dictionary)
	shell._strings.apply_visible_text(str(probe.messageIdentity), message_text)
	var message_visible_ms = _elapsed_milliseconds(shell, message_started)
	var performance := (message_response.result as Dictionary).get("performance", {}) as Dictionary
	return {"ack": message_ack_ms, "visible": message_visible_ms,
		"dispatch": float(performance.get("dispatchMs", 0.0)), "checkpoint": float(performance.get("checkpointMs", 0.0))}


static func _sample_map(shell: Control, report_path: String, probe: Dictionary, next_tile: int) -> Dictionary:
	var map_started := Time.get_ticks_usec()
	var map_response = shell._bridge.request("map.paint-cells", {
		"expectedRevision": shell._session_view.revision,
		"identity": str(probe.mapIdentity),
		"cells": [{"x": int(probe.x), "y": int(probe.y), "tile": next_tile}],
		"measurePerformance": true,
	})
	var map_ack_ms = _elapsed_milliseconds(shell, map_started)
	if not bool(map_response.get("ok", false)):
		_performance_fail(shell, report_path, "Map update failed: %s" % str(map_response.get("error", "unknown error")))
		return {}
	shell._session_view.apply(map_response.result as Dictionary)
	var painted_cells := (map_response.result as Dictionary).get("paintedCells", []) as Array
	if painted_cells.is_empty():
		_performance_fail(shell, report_path, "Map paint returned no cell delta.")
		return {}
	var actual_tile := int((painted_cells[0] as Dictionary).get("tile", next_tile))
	shell._workbenches.land.update_cell(int(probe.x), int(probe.y), actual_tile)
	shell._maps.select_cell(int(probe.x), int(probe.y), actual_tile, probe.actionPoint)
	var map_visible_ms = _elapsed_milliseconds(shell, map_started)
	var performance := (map_response.result as Dictionary).get("performance", {}) as Dictionary
	return {"ack": map_ack_ms, "visible": map_visible_ms,
		"dispatch": float(performance.get("dispatchMs", 0.0)), "checkpoint": float(performance.get("checkpointMs", 0.0))}


static func _collect_samples(shell: Control, report_path: String, probe: Dictionary) -> Dictionary:
	var samples := {
		"message_ack": [] as Array[float],
		"message_visible": [] as Array[float],
		"message_dispatch": [] as Array[float],
		"message_checkpoint": [] as Array[float],
		"map_ack": [] as Array[float],
		"map_visible": [] as Array[float],
		"map_dispatch": [] as Array[float],
		"map_checkpoint": [] as Array[float],
	}
	for sample_index in range(WARMUP_SAMPLES + MEASURED_SAMPLES):
		var message := _sample_message(shell, report_path, probe, str(probe.messageVariants[sample_index % probe.messageVariants.size()]))
		if message.is_empty(): return {}
		var next_tile: int = probe.alternateTile if sample_index % 2 == 0 else probe.originalTile
		var map := _sample_map(shell, report_path, probe, next_tile)
		if map.is_empty(): return {}
		if sample_index >= WARMUP_SAMPLES:
			for metric in ["ack", "visible", "dispatch", "checkpoint"]:
				samples["message_" + metric].append(message[metric])
				samples["map_" + metric].append(map[metric])
	return _summarize_samples(shell, samples)


static func _restore_probe(shell: Control, report_path: String, probe: Dictionary) -> bool:
	var restore_message = shell._bridge.request("message.update", {
		"expectedRevision": shell._session_view.revision,
		"identity": str(probe.messageIdentity),
		"text": str(probe.originalMessage),
	})
	if not bool(restore_message.get("ok", false)):
		_performance_fail(shell, report_path, "Message restoration failed: %s" % str(restore_message.get("error", "unknown error")))
		return false
	shell._session_view.apply(restore_message.result as Dictionary)
	var restore_map = shell._bridge.request("map.paint-cells", {
		"expectedRevision": shell._session_view.revision,
		"identity": str(probe.mapIdentity),
		"cells": [{"x": int(probe.x), "y": int(probe.y), "tile": int(probe.originalTile)}],
	})
	if not bool(restore_map.get("ok", false)):
		_performance_fail(shell, report_path, "Map restoration failed: %s" % str(restore_map.get("error", "unknown error")))
		return false
	shell._session_view.apply(restore_map.result as Dictionary)
	return true


static func _summarize_samples(shell: Control, samples: Dictionary) -> Dictionary:
	var combined_ack_samples: Array[float] = []
	combined_ack_samples.append_array(samples.message_ack)
	combined_ack_samples.append_array(samples.map_ack)
	var message_ack = _timing_summary(shell, samples.message_ack)
	var message_visible = _timing_summary(shell, samples.message_visible)
	var map_ack = _timing_summary(shell, samples.map_ack)
	var map_visible = _timing_summary(shell, samples.map_visible)
	var message_dispatch = _timing_summary(shell, samples.message_dispatch)
	var message_checkpoint = _timing_summary(shell, samples.message_checkpoint)
	var map_dispatch = _timing_summary(shell, samples.map_dispatch)
	var map_checkpoint = _timing_summary(shell, samples.map_checkpoint)
	var combined_ack = _timing_summary(shell, combined_ack_samples)
	return {
		"ordinaryCommandAcknowledgement": combined_ack, "messageAcknowledgement": message_ack,
		"messageCoreDispatch": message_dispatch, "messageDurableCheckpoint": message_checkpoint, "messageCommandToVisibleUpdate": message_visible,
		"mapAcknowledgement": map_ack, "mapCoreDispatch": map_dispatch, "mapDurableCheckpoint": map_checkpoint, "mapCommandToVisibleUpdate": map_visible,
	}


static func _runtime_report(shell: Control) -> Dictionary:
	var compiler_response = shell._bridge.request("compiler.describe")
	return {
		"godot": str(Engine.get_version_info().get("string", "unknown")),
		"operatingSystem": OS.get_name(),
		"operatingSystemVersion": OS.get_version(),
		"processor": OS.get_processor_name(),
		"processorCount": OS.get_processor_count(),
		"compiler": compiler_response.get("result", {}) if bool(compiler_response.get("ok", false)) else {},
	}


static func _build_report(shell: Control, project_open_ms: float, measurements: Dictionary) -> Dictionary:
	measurements["referenceProjectColdOpenMs"] = project_open_ms
	var gates := {
		"ordinaryCommandAcknowledgement": float(measurements.ordinaryCommandAcknowledgement.get("p95Ms", INF)) <= ACKNOWLEDGEMENT_LIMIT_MS,
		"messageCommandToVisibleUpdate": float(measurements.messageCommandToVisibleUpdate.get("p95Ms", INF)) <= MESSAGE_VISIBLE_LIMIT_MS,
		"mapCommandToVisibleUpdate": float(measurements.mapCommandToVisibleUpdate.get("p95Ms", INF)) <= MAP_VISIBLE_LIMIT_MS,
		"referenceProjectColdOpen": project_open_ms < PROJECT_OPEN_LIMIT_MS,
	}
	var passed := true
	for gate in gates.values():
		passed = passed and bool(gate)
	var report := {
		"kind": "providence.godot-performance",
		"formatVersion": 1,
		"passed": passed,
		"project": {
			"projectId": shell._session_view.project_id,
			"messageCount": shell._strings._message_total,
			"mapCount": shell._maps.document.maps.size(),
		},
		"runtime": _runtime_report(shell),
		"sampling": {
			"warmupIterations": WARMUP_SAMPLES,
			"measuredIterations": MEASURED_SAMPLES,
			"clock": "Time.get_ticks_usec",
		},
		"boundaries": {
			"referenceProjectColdOpen": "fresh adapter and ProjectStore open through all currently populated shell projections; excludes Godot process startup and shell construction",
			"commandAcknowledgement": "synchronous Godot bridge request through durable command checkpoint and bounded response parse",
			"messageVisibleUpdate": "message acknowledgement plus bounded projection merge and direct update of the visible row, editor, and Inspector",
			"mapVisibleUpdate": "ordinary non-Special-Land map acknowledgement plus bounded projection merge and direct canvas/Inspector update",
		},
		"thresholdsMs": {
			"ordinaryCommandAcknowledgementP95": ACKNOWLEDGEMENT_LIMIT_MS,
			"messageCommandToVisibleUpdateP95": MESSAGE_VISIBLE_LIMIT_MS,
			"mapCommandToVisibleUpdateP95": MAP_VISIBLE_LIMIT_MS,
			"referenceProjectColdOpen": PROJECT_OPEN_LIMIT_MS,
		},
		"measurements": measurements,
		"gates": gates,
	}
	return report


static func _elapsed_milliseconds(shell: Control, started_usec: int) -> float:
	return float(Time.get_ticks_usec() - started_usec) / 1000.0

static func _timing_summary(shell: Control, samples: Array[float]) -> Dictionary:
	if samples.is_empty():
		return {}
	var sorted_samples := samples.duplicate()
	sorted_samples.sort()
	var count := sorted_samples.size()
	var median_index := count / 2
	var median := float(sorted_samples[median_index])
	if count % 2 == 0:
		median = (float(sorted_samples[median_index - 1]) + median) / 2.0
	var p95_index := mini(count - 1, maxi(0, int(ceil(float(count) * 0.95)) - 1))
	return {
		"samples": count,
		"minimumMs": float(sorted_samples[0]),
		"medianMs": median,
		"p95Ms": float(sorted_samples[p95_index]),
		"maximumMs": float(sorted_samples[count - 1]),
	}

static func _write_performance_report(shell: Control, report_path: String, report: Dictionary) -> String:
	var normalized := report_path.strip_edges()
	if normalized.is_empty():
		return "Performance report path is empty."
	var parent := normalized.get_base_dir()
	var directory_error := DirAccess.make_dir_recursive_absolute(parent)
	if directory_error != OK:
		return "Could not create performance report directory: %s" % error_string(directory_error)
	var file := FileAccess.open(normalized, FileAccess.WRITE)
	if file == null:
		return "Could not create performance report: %s" % error_string(FileAccess.get_open_error())
	file.store_string(JSON.stringify(report, "\t", true, true) + "\n")
	return ""

static func _performance_fail(shell: Control, report_path: String, message: String) -> void:
	var report := {
		"kind": "providence.godot-performance",
		"formatVersion": 1,
		"passed": false,
		"fatalError": message,
	}
	var report_error = _write_performance_report(shell, report_path, report)
	if not report_error.is_empty():
		message += " Report error: %s" % report_error
	preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, message)

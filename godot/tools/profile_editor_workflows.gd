extends "res://tools/profile_map_history.gd"

const ROUTES = preload("res://src/route_catalog.gd")
const WORKFLOWS := ["paint", "documentSwitch", "staleDocumentSwitch", "assetBrowse", "issuesRefresh", "save", "open"]
const WARMUP := 2
const SAMPLES := 8
var _project_path := ""
var _probe: Dictionary = {}
var _first_usable_ms := -1.0
var _artwork_ms := -1.0
var _status_feedback_ms := -1.0


func _prepare_shell(temporary_root: String) -> void:
	await super._prepare_shell(temporary_root)
	_shell._maps.document.document_opened.connect(func(_map, _reset): _record_milestone(false))
	_shell._maps.document.artwork_ready.connect(func(): _record_milestone(true))
	_shell._assets.catalog_ready.connect(func(): _record_milestone(false))
	_shell._assets.artwork_ready.connect(func(): _record_milestone(true))
	_shell._assets.status_changed.connect(func(_message):
		if _action_started > 0 and _status_feedback_ms < 0: _status_feedback_ms = float(Time.get_ticks_usec() - _action_started) / 1000.0)


func _record_milestone(artwork: bool) -> void:
	if _action_started == 0: return
	var elapsed := float(Time.get_ticks_usec() - _action_started) / 1000.0
	if artwork: _artwork_ms = elapsed
	elif _first_usable_ms < 0: _first_usable_ms = elapsed


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3 or not args[0].get_file().begins_with("providence-history-profile-"):
		push_error("Expected a disposable profile root, Classic source directory and new report path")
		quit(1)
		return
	await _prepare_shell(args[0])
	_project_path = args[0].path_join("project")
	var described := _import_fixture(args)
	if described.is_empty(): return _finish()
	await _shell._activate_session(described)
	await _shell._navigation.select_tab(ROUTES.tab_for_route("maps.land"))
	await _frames(3)
	await _settle()
	_probe = _paint_probe()
	if _probe.is_empty(): return _finish()
	var report := _new_report(args[1], described)
	report["kind"] = "providence.editor-workflow-profile"
	report["warmupOperations"] = WARMUP
	report["scope"] = "disposable full import; native shell workflow completion; headless Godot"
	report["boundaries"] = _boundaries()
	for workflow in WORKFLOWS:
		for index in WARMUP + SAMPLES:
			await _prepare_workflow(workflow, index)
			if _failed: return _finish()
			var sample := await _measure_workflow(workflow, index)
			if index >= WARMUP: report.samples.append(sample)
			if _failed: return _finish()
	report["passed"] = report.samples.size() == WORKFLOWS.size() * SAMPLES
	_write_report(args[2], report)
	_finish()


func _prepare_workflow(workflow: String, index: int) -> void:
	if workflow == "paint":
		await _shell._navigation.select_tab(ROUTES.tab_for_route("maps.land"))
		_shell._maps.set_tool_mode("paint")
		var tile := 90 if index % 2 == 0 else 164
		if not _shell._maps.paint.workspace.tiles_dock.select_tile(tile):
			_failed = true
			push_error("The terrain palette did not expose the probe tile")
	elif workflow == "issuesRefresh":
		await _shell._navigation.select_tab(ROUTES.tab_for_route("linter.issues"))
	elif workflow == "staleDocumentSwitch":
		_shell._document_changes.invalidate({"changedEntities": [_shell._session_view.project_id]}, _shell._session_view.project_id)
	await _settle()


func _measure_workflow(workflow: String, index: int) -> Dictionary:
	_bridge.calls.clear()
	_action_started = Time.get_ticks_usec()
	_last_frame = _action_started
	_max_frame_gap = 0
	_busy_feedback_ms = -1
	_first_usable_ms = -1
	_artwork_ms = -1
	_status_feedback_ms = -1
	_peak_static_memory = Performance.get_monitor(Performance.MEMORY_STATIC)
	var previous_revision: int = _shell._session_view.revision
	await _perform(workflow, index)
	var first_usable_ms := _first_usable_ms if _first_usable_ms >= 0 else float(Time.get_ticks_usec() - _action_started) / 1000.0
	await _settle()
	_bridge = _shell._bridge
	var calls: Array = _bridge.calls.duplicate(true)
	var sample := {"workflow": workflow, "index": index - WARMUP,
		"firstUsableMs": first_usable_ms, "artworkCompleteMs": _artwork_ms if _artwork_ms >= 0 else null,
		"backgroundCompleteMs": float(Time.get_ticks_usec() - _action_started) / 1000.0,
		"staticMemoryBytes": Performance.get_monitor(Performance.MEMORY_STATIC),
		"peakStaticMemoryBytes": _peak_static_memory, "statusFeedbackMs": _status_feedback_ms,
		"requestCount": calls.size(),
		"requestBytes": calls.reduce(func(total, call): return total + int(call.bridge.get("requestBytes", 0)), 0),
		"responseBytes": calls.reduce(func(total, call): return total + int(call.bridge.get("responseBytes", 0)), 0),
		"inputToVisibleMs": float(Time.get_ticks_usec() - _action_started) / 1000.0,
		"maxFrameGapMs": float(_max_frame_gap) / 1000.0, "busyFeedbackMs": _busy_feedback_ms,
		"previousRevision": previous_revision, "revision": _shell._session_view.revision, "requests": calls}
	_action_started = 0
	if calls.any(func(call): return not call.ok) or (workflow == "paint" and _shell._session_view.revision != previous_revision + 1):
		_failed = true
		push_error("Workflow did not complete: " + JSON.stringify(sample))
	print("PROVIDENCE_WORKFLOW_TIMING %s sample=%d elapsedMs=%.3f maxFrameGapMs=%.3f busyFeedbackMs=%.3f requests=%d" % [workflow, index, sample.inputToVisibleMs, sample.maxFrameGapMs, sample.busyFeedbackMs, calls.size()])
	return sample


func _perform(workflow: String, index: int) -> void:
	match workflow:
		"paint":
			var cell: Dictionary = _probe.cells[0]
			await _shell._maps.paint.paint_cell(int(cell.x), int(cell.y))
		"documentSwitch", "staleDocumentSwitch":
			var route := "economy.items" if index % 2 == 0 else "text.messages"
			await _shell._navigation.select_tab(ROUTES.tab_for_route(route))
		"assetBrowse":
			await _shell._assets.open_library("scenario" if index % 2 == 0 else "stock")
		"issuesRefresh":
			_shell._issues.workbench.state.refresh(_shell._session_view.revision)
		"save":
			await _shell._project_session.save()
		"open":
			await _shell._project_session.open_project(_project_path)


func _settle() -> void:
	var idle_frames := 0
	while idle_frames < 2:
		await process_frame
		idle_frames = 0 if _shell._operations.busy or _shell._issues.workbench.state.has_pending_refresh() or _shell._library_integrity.pending else idle_frames + 1


func _boundaries() -> Dictionary:
	return {
		"paint": "actual palette brush and one-cell stroke through durable acknowledgement and visible update",
		"documentSwitch": "switch between cached Items and Strings workbenches",
		"staleDocumentSwitch": "switch between Items and Strings after project-wide invalidation",
		"assetBrowse": "switch Scenario and Stock asset scopes through bounded catalog and all displayed thumbnail previews under the shared operation",
		"issuesRefresh": "request a fresh Issues check and wait for its pending refresh to finish",
		"save": "Save command through portable persistence and shell save status",
		"open": "reopen this disposable project through session activation and visible shell projections",
	}

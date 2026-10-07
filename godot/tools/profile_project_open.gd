extends "res://tools/profile_editor_workflows.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3 or not args[0].get_file().begins_with("providence-history-profile-"):
		push_error("Expected a disposable profile root, Classic source directory and report path")
		quit(1)
		return
	await _prepare_shell(args[0])
	_project_path = args[0].path_join("project")
	var described := _import_fixture(args)
	if described.is_empty(): return _finish()
	await _shell._activate_session(described)
	await _shell._navigation.select_tab(ROUTES.tab_for_route("maps.land"))
	await _settle()
	var history_edits := clampi(int(OS.get_environment("PROVIDENCE_PROFILE_HISTORY_EDITS")),0,32)
	for index in history_edits:
		if not await _paint(_paint_probe()): return _finish()
	var report := _new_report(args[1], described)
	report["kind"] = "providence.project-open-profile"
	report["warmupOperations"] = 0
	report["historyEdits"] = history_edits
	report["scope"] = "three fresh adapter processes through visible native map; OS cache warmed by fixture import"
	for index in 3:
		report.samples.append(await _measure_workflow("open", index + WARMUP))
		if _failed: return _finish()
	await _check_deferred_action_points()
	if _failed: return _finish()
	report["deferredActionPointEditorLoaded"] = true
	report["passed"] = report.samples.size() == 3
	_write_report(args[2], report)
	_finish()


func _check_deferred_action_points() -> void:
	if not _shell._scripts._action_points._document.is_empty():
		_failed = true
		push_error("Opening Maps eagerly loaded the hidden AP editor")
		return
	_bridge.calls.clear()
	await _shell._navigation.select_route("scripts.action-points")
	await _settle()
	if _shell._scripts._action_points._document.is_empty() or not _bridge.calls.any(func(call): return call.method == "action-point.open" and call.ok):
		_failed = true
		push_error("The deferred AP editor did not load when requested")

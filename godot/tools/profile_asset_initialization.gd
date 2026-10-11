extends "res://tools/profile_editor_workflows.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	await _prepare_shell(args[0])
	_project_path = args[0].path_join("project")
	var described := _import_fixture(args)
	if described.is_empty(): return _finish()
	await _shell._activate_session(described)
	await _settle()
	var report := _new_report(args[1], described)
	for index in range(2, 6): report.samples.append(await _measure_workflow("assetBrowse", index))
	report["initialization"] = _shell._assets.initialization_metrics
	report["passed"] = not _failed
	_write_report(args[2], report)
	_finish()

extends SceneTree

var _bridge := ProvidenceNativeBridge.new()
var _operations := ProvidenceEditorOperation.new()
var _view: ProvidenceIssuesWorkbench
var _repair: ProvidenceImportRepairDialog
var _output := ""
var _receipt: Dictionary = {}
var _expected_total := 0
var _interpretation_version := 0
var _functional_only := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() in [2, 3] and args[0].get_file() == "legacy-repair-project" and DirAccess.dir_exists_absolute(args[1]))
	if args.size() == 3:
		assert(args[2] == "--functional-only")
		_functional_only = true
	_output = args[1]
	root.gui_embed_subwindows = true
	root.add_child(_operations)
	var opened := _bridge.start_project(args[0], OS.get_environment("PROVIDENCE_APPLICATION_LIBRARY_ROOT"))
	assert(opened.get("ok", false), str(opened))
	var before := await _request("session.describe")
	var assessment := await _request("project.import-repair.assess")
	_expected_total = int(assessment.result.total)
	_interpretation_version = int(assessment.result.assessment.version)
	assert(_expected_total > 0)
	_view = load("res://src/issues_workbench.tscn").instantiate()
	root.add_child(_view)
	_view.state.configure_operations(_operations)
	_view.attach(_bridge, int(before.result.revision))
	_repair = load("res://src/import_repair_dialog.tscn").instantiate()
	_repair.operations = _operations
	root.add_child(_repair)
	_view.get_node("%ReviewImport").pressed.connect(func(): _repair.review(_bridge))
	await _wait(func(): return not _view.state.has_pending_refresh())
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport
		root.content_scale_size = viewport
		_view.position = Vector2(12,12)
		_view.size = Vector2(viewport) - Vector2(24,24)
		await _settle()
		await _click(_view.get_node("%ShowAll"))
		await _wait(func(): return not _view.state.has_pending_refresh())
		assert(_view.state.show_all)
		await _capture("validate-%dx%d" % [viewport.x, viewport.y])
		await _click(_view.get_node("%ReviewImport"))
		await _wait(func(): return not _repair._busy)
		assert(_repair.visible and int(_repair._assessment.total) == _expected_total)
		await _exercise_repair_page()
		await _capture("repair-%dx%d" % [viewport.x, viewport.y])
		await _click(_repair.get_node("%Cancel"))
		assert(not _repair.visible)
		var cancelled := await _request("session.describe")
		assert(cancelled.result.revision == before.result.revision)
		await _click(_view.get_node("%ShowAll"))
		await _wait(func(): return not _view.state.has_pending_refresh())
	await _recover(before.result.revision)
	if _receipt.get("failed", false):
		_bridge.stop()
		quit(1)
		return
	_bridge.stop()
	var file := FileAccess.open(_output.path_join("native-receipt.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(_receipt, "\t"))
	file.close()
	_repair.free()
	_view.free()
	_operations.free()
	print("PROVIDENCE_SCENARIO_CORRECTIONS_OK native-input viewports=2 repair cancel apply undo redo reopen")
	quit(0)


func _exercise_repair_page() -> void:
	if _expected_total <= 64:
		return
	await _click(_repair.get_node("%Next"))
	await _wait(func(): return not _repair._busy)
	assert(int(_repair._assessment.offset) == 64)
	await _click(_repair.get_node("%Previous"))
	await _wait(func(): return not _repair._busy)
	assert(int(_repair._assessment.offset) == 0)
	for row in _repair._assessment.assessment.entries:
		if row.conflict:
			var index: int = _repair._assessment.assessment.entries.find(row)
			await _click(_repair.get_node("%Entries").get_child(index))
			assert(_repair._selected.has(row.key) and _repair._selected.size() == 1)
			await _click(_repair.get_node("%Entries").get_child(index))
			assert(_repair._selected.is_empty())
			break


func _recover(revision: int) -> void:
	await _click(_view.get_node("%ReviewImport"))
	await _wait(func(): return not _repair._busy)
	await _click(_repair.get_node("%Apply"))
	await _wait(func(): return not _operations.busy and not _repair._busy)
	if _repair.visible:
		await _capture("repair-failed")
		push_error(str(_repair.get_node("%Status").text))
		_receipt["failed"] = true
		return
	var applied := await _request("session.describe")
	assert(int(applied.result.revision) == revision + 1)
	var inspected := await _request("project.import-repair.assess")
	assert(int(inspected.result.assessment.previousVersion) == _interpretation_version and int(inspected.result.total) == 0)
	assert((await _request("history.undo", {"expectedRevision":revision + 1})).get("ok", false))
	var undone := await _request("project.import-repair.assess")
	assert(int(undone.result.total) == _expected_total)
	assert((await _request("history.redo", {"expectedRevision":revision + 2})).get("ok", false))
	var project := _bridge.current_project_path()
	_bridge.stop()
	assert(_bridge.start_project(project, OS.get_environment("PROVIDENCE_APPLICATION_LIBRARY_ROOT")).get("ok", false))
	var reopened := await _request("project.import-repair.assess")
	assert(int(reopened.result.assessment.previousVersion) == _interpretation_version and int(reopened.result.total) == 0)
	_receipt["recovery"] = {"beforeRevision":revision, "afterRevision":reopened.result.revision,
		"correctedFields":_expected_total, "cancelUnchanged":true, "undoRedo":true, "reopen":true}


func _request(method: String, params: Dictionary = {}) -> Dictionary:
	var response := await _operations.run_workflow(_bridge, "", func(op): return await op.request(method, params))
	assert(response.get("ok", false), str(response))
	return response


func _click(control: Control) -> void:
	assert(not control is BaseButton or not control.disabled)
	var point := control.get_global_rect().get_center()
	if control.get_window() != root: point += Vector2(control.get_window().position)
	var motion := InputEventMouseMotion.new()
	motion.position = point
	Input.parse_input_event(motion)
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = point
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame
	await _settle()


func _wait(predicate: Callable) -> void:
	var deadline := Time.get_ticks_msec() + 30000
	while not predicate.call():
		assert(Time.get_ticks_msec() < deadline, "Native UI operation timed out")
		await process_frame
	await _settle()


func _settle() -> void:
	for _frame in 8: await process_frame


func _capture(label: String) -> void:
	await _settle()
	if _functional_only:
		_receipt[label] = {"width": root.size.x, "height": root.size.y,
			"revision": _view.state.revision, "showAll": _view.state.show_all,
			"nativeInput": true, "rendered": false}
		return
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	assert(image.save_png(_output.path_join(label + ".png")) == OK)
	_receipt[label] = {"width":root.size.x, "height":root.size.y, "revision":_view.state.revision,
		"showAll":_view.state.show_all, "nativeInput":true}

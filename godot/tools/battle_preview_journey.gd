extends SceneTree

var _shell
var _view: ProvidenceBattleEditor
var _output := ""
var _ready: Array[Dictionary] = []
var _failures: Array[Dictionary] = []
var _receipt: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 5, "Expected source, output root, Rebuilt root, Godot and preview helper"): return
	_output = args[1]
	DirAccess.make_dir_recursive_absolute(_output)
	var project := _output.path_join("project")
	var bridge := ProvidenceNativeBridge.new(_output.path_join("settings.cfg"))
	if not _ok(bridge.start_project(args[0])): return
	var copied := bridge.request("project.save-as", {"path": project})
	bridge.stop()
	if not _ok(copied): return
	OS.set_environment("PROVIDENCE_REBUILT_ROOT", args[2])
	OS.set_environment("PROVIDENCE_REBUILT_GODOT_PATH", args[3])
	OS.set_environment("PROVIDENCE_REBUILT_PREVIEW_PATH", args[4])
	ProjectSettings.set_setting("providence/rebuilt_preview_headless", true)
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	root.gui_embed_subwindows = true
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(project)
	if not _check(_shell._session_view.connected, "Preview project did not open"): return
	await _shell._navigation.select_route("combat.battles")
	_view = _shell._workbenches.battle
	_shell._rebuilt_preview_controller.preview_ready.connect(func(result: Dictionary): _ready.append(result))
	_shell._rebuilt_preview_controller.preview_failed.connect(func(error: Dictionary): _failures.append(error))
	if not await _unreachable_target(): return
	if not await _applied_target(): return
	_receipt.merge({"kind": "providence.battle-preview-journey", "status": "passed", "project": project,
		"adapter": _shell._bridge.request("build.identity").get("result", {}),
		"retention": "Retain this disposable project and bounded receipt; runtime scratch is controller-owned."})
	var file := FileAccess.open(_output.path_join("receipt.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(_receipt, "\t")); file.close()
	_shell.queue_free(); await process_frame
	print("PROVIDENCE_BATTLE_PREVIEW_JOURNEY_OK separate-Rebuilt battle=2 combat_action dirty-preview-cancel apply-before-preview unreachable-target-preserved")
	quit(0)


func _unreachable_target() -> bool:
	if not _ok(await _view.controller.open_record(1)): return false
	var revision := _shell._session_view.revision as int
	_view.get_node("%Preview").pressed.emit()
	if not await _wait_result(): return false
	if not _check(_ready.is_empty() and _failures.size() == 1, "Unreachable Battle unexpectedly launched"): return false
	if not _check(_shell._session_view.revision == revision and not _view.has_unapplied_changes(), "Failed preview changed the editor"): return false
	_receipt["unreachableTarget"] = {"battleId": 1, "failure": _failures[0], "revisionUnchanged": true,
		"status": _shell._status.text, "draftPreserved": true}
	_failures.clear()
	return true


func _applied_target() -> bool:
	if not _ok(await _view.controller.open_record(2)): return false
	var revision := _shell._session_view.revision as int
	var distance := int(_view.draft.record.distance) + 1
	_view.get_node("%Distance").text = str(distance)
	_view.get_node("%Distance").text_changed.emit(str(distance))
	_view.get_node("%Preview").pressed.emit()
	await process_frame
	if not _check(_view.get_node("%DraftGuard").visible, "Dirty Preview bypassed the draft guard"): return false
	_view.get_node("%DraftGuard").canceled.emit(); _view.get_node("%DraftGuard").hide()
	if not _check(_view.has_unapplied_changes() and _shell._session_view.revision == revision, "Keep Editing lost the draft"): return false
	_view.get_node("%Preview").pressed.emit()
	await _view._apply_guard()
	if not await _wait_result(): return false
	if not _check(_failures.is_empty() and _ready.size() == 1, "Applied Battle did not become ready: " + str(_failures)): return false
	var result: Dictionary = _ready[0]
	if not _check(result.get("status") == "ready" and result.get("targetKind") == "battle" and int(result.get("targetId", -1)) == 2 and result.get("pendingInteractionKind") == "combat_action", "Wrong runtime identity or interaction"): return false
	var controller: ProvidenceRebuiltPreviewController = _shell._rebuilt_preview_controller
	var pid: int = controller._process_id
	if not _check(pid > 0 and pid != OS.get_process_id() and OS.is_process_running(pid), "Preview was not a live separate process"): return false
	var canonical: Dictionary = _shell._bridge.request("battle.open", {"nativeId": 2}).result
	if not _check(int(canonical.battle.distance) == distance and _shell._session_view.revision == revision + 1, "Apply before Preview did not commit exactly once"): return false
	_receipt["runtime"] = {"result": result, "processId": pid, "editorProcessId": OS.get_process_id(),
		"distance": distance, "revision": _shell._session_view.revision, "dirtyCancelKeptDraft": true, "applyCount": 1}
	controller.cancel_preview("Verified Battle preview complete.")
	if not _check(not OS.is_process_running(pid), "Owned preview process did not stop"): return false
	return true


func _wait_result() -> bool:
	var deadline := Time.get_ticks_msec() + 120000
	while _ready.is_empty() and _failures.is_empty() and Time.get_ticks_msec() < deadline:
		await process_frame
	return _check(not (_ready.is_empty() and _failures.is_empty()), "Preview did not return a result within its bounded deadline")


func _ok(response: Dictionary) -> bool:
	return _check(response.get("ok", false), str(response.get("error", "Command rejected")))


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	push_error("PROVIDENCE_BATTLE_PREVIEW_JOURNEY_FAILED: " + message)
	if _shell != null: _shell.queue_free()
	quit(1)
	return false

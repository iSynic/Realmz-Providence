extends SceneTree

const Fixture = preload("res://tools/action_settings_repair_fixture.gd")

class CheckedShell extends "res://src/editor_shell.gd":
	var reported_errors: Array[String] = []
	func _show_error(message: String) -> void:
		reported_errors.append(message)
		_status.text = message

class IssuesBridge extends "res://src/native_bridge.gd":
	var fail_checks := false
	var fail_save := false
	var commits := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method in ["validation.begin", "validation.poll", "validation.list"] and fail_checks:
			return {"ok": false, "error": "Controlled check interruption after repair"}
		if method == "project.save" and fail_save: return {"ok": false, "error": "Controlled save failure: destination is unavailable"}
		if method == "action-settings.commit-repair": commits += 1
		return super._request(method, params)

var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-repair-"):
		_check(false, "A disposable Issues repair root is required")
		quit(1)
		return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	var shell = load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell)
	root.add_child(shell)
	await _frames(3)
	shell._bridge.stop()
	shell._bridge = IssuesBridge.new(args[0].path_join("issues-settings.cfg"))
	var fixture := Fixture.new()
	if fixture.create(shell._bridge, args[0].path_join("issues"), 3):
		await shell._activate_session(shell._bridge.request("session.describe"))
		await _exercise(shell, fixture)
	else: _check(false, fixture.error)
	shell.free()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	await process_frame
	if not _failed: print("PROVIDENCE_ACTION_SETTINGS_ISSUES_OK source=exact filters=retained return=refreshed retry=check-only save=explicit undo=restores")
	quit(1 if _failed else 0)


func _exercise(shell, fixture) -> void:
	var controller = shell._issues
	var workbench = controller.workbench
	controller.request_show()
	await _settle(workbench)
	workbench.state.open_category("action-settings")
	workbench.state.set_filters("extra-action-point:158", "error")
	await _settle(workbench)
	var selected: Dictionary = workbench.state.selected_finding()
	_check(selected.get("entity", "") == "extra-action-point:158", "Issues did not select the controlled missing-settings action: " + str(selected))
	workbench.get_node("%OpenFinding").pressed.emit()
	await _settle(workbench)
	var dialog = controller.repair
	_check(dialog.visible and dialog.view.draft.source == "extra-action-point:158" and int(dialog.view.draft.slot) == 4, "Open did not reach the exact action's repair")
	_check(shell._document_tabs.current_tab == 33 and controller._repair_shade.visible, "Repair did not retain and dim Issues")
	_check(shell._active_text_dialog() == dialog, "Global draft navigation omitted the repair")
	var original_revision: int = shell._session_view.revision
	for command in [&"edit.undo", &"edit.redo", &"file.save", &"file.save-as"]: shell._commands.dispatch(command)
	_check(shell._session_view.revision == original_revision and dialog.visible, "A native menu command bypassed the modal")
	for entry in [["bound0", "9"], ["bound1", "18"], ["bound2", "13"], ["bound3", "24"]]: await dialog.change_field(entry[0], entry[1])
	shell._commands.dispatch(&"file.close-project")
	_check(dialog._discard.visible and dialog.visible and shell._session_view.connected, "Project close discarded a repair without its guard")
	dialog._discard.get_cancel_button().pressed.emit()
	_check(dialog.visible and dialog.view.canApply, "Keep Editing after a global command lost the repair")
	shell._bridge.fail_checks = true
	dialog.apply_repair()
	for frame in 600:
		if not dialog._busy: break
		await process_frame
	await _settle(workbench)
	_check(not dialog.visible and shell._session_view.revision == original_revision + 1 and shell._bridge.commits == 1, "Apply did not update the shell once")
	_check(workbench.state.status == "failed" and workbench.get_node("%CheckAgain").text == "Retry Check", "Applied repair did not expose a check-only recovery")
	_check(workbench.get_node("%FindingRows").get_child(0).text.contains("repair was applied"), "Checker failure misrepresented the successful repair")
	_check(controller._saved_revision == original_revision, "Apply silently marked the project saved")
	shell._bridge.fail_checks = false
	workbench.get_node("%CheckAgain").pressed.emit()
	await _settle(workbench)
	_check(shell._bridge.commits == 1 and shell._session_view.revision == original_revision + 1, "Retry Check sent another Apply")
	_check(workbench.state.query == "extra-action-point:158" and workbench.state.severity == "error" and workbench.state.category == "action-settings", "Repair return changed the filter context")
	_check(workbench.state.status == "no-matches" and int(workbench.state.page.matchedBeforeGroup) == 0 and int(workbench.state.page.unfilteredTotal) > 0, "Repaired finding did not disappear independently of remaining scenario problems")
	_check(workbench.get_node("%OpenFinding").disabled, "Repaired source retained an actionable stale finding")
	await shell._undo()
	await _settle(workbench)
	_check(shell._session_view.revision == original_revision + 2 and not workbench.state.selected_finding().is_empty(), "Undo did not restore the missing-settings finding")
	await shell._redo()
	await _settle(workbench)
	_check(workbench.state.status == "no-matches", "Redo did not clear the repaired finding")
	await _save_and_reopen(shell, fixture, original_revision)


func _save_and_reopen(shell, fixture, original_revision: int) -> void:
	var controller = shell._issues
	var workbench = controller.workbench
	shell._bridge.fail_save = true
	await shell._project_session.save()
	_check(controller._saved_revision == original_revision and shell._session_view.connected, "Failed Save discarded the project or marked it saved")
	_check(shell.reported_errors.size() == 1 and shell.reported_errors[0].begins_with("Not saved.") and shell.reported_errors[0].contains("Controlled save failure"), "Failed Save did not explain recovery or an unexpected shell error occurred")
	shell._bridge.fail_save = false
	await shell._project_session.save()
	_check(controller._saved_revision == shell._session_view.revision, "Explicit Save did not mark this revision saved")
	var path: String = shell._bridge.current_project_path()
	var response: Dictionary = shell._bridge.start_project(path)
	_check(response.get("ok", false), "Saved repaired project did not reopen")
	await shell._activate_session(response)
	controller.request_show()
	await _settle(workbench)
	workbench.state.open_category("action-settings")
	workbench.state.set_filters("extra-action-point:158", "error")
	await _settle(workbench)
	_check(workbench.state.status == "no-matches", "Reopen restored the repaired finding")
	fixture.revision = shell._session_view.revision


func _settle(workbench) -> void:
	await _frames(3)
	for frame in 600:
		if not workbench.state.has_pending_refresh() and not workbench.state._bridge.operation_busy(): return
		await process_frame
	_check(false, "Issues check did not settle")


func _frames(count: int) -> void:
	for index in count: await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ACTION_SETTINGS_ISSUES_FAILED " + message)

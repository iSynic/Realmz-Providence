extends SceneTree

class WorkflowBridge extends "res://src/native_bridge.gd":
	var methods: Array[String] = []
	var hold_validation := false
	var validation_tickets: Dictionary = {}
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		methods.append(method)
		if method == "validation.poll" and hold_validation:
			return {"ok": true, "result": {"jobId": params.jobId, "revision": validation_tickets.get(int(params.jobId), -1), "status": "pending"}}
		var response: Dictionary = super._request(method, params)
		if method == "validation.begin" and bool(response.get("ok", false)):
			validation_tickets[int(response.result.jobId)] = int(response.result.revision)
		return response

var _failed := false
var _project_path := ""
var _shell


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-issues-"):
		_check(false, "A disposable Issues workflow output root is required")
		quit(1)
		return
	_project_path = args[0].path_join("project")
	var original_project := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900)
	var shell = load("res://src/editor_shell.tscn").instantiate()
	_shell = shell
	root.add_child(shell)
	await _settle()
	shell._bridge.stop()
	shell._bridge = WorkflowBridge.new(args[0].path_join("settings.cfg"))
	var started: Dictionary = shell._bridge.start_demo()
	if not bool(started.get("ok", false)):
		_check(false, "Native adapter could not start: " + str(started.get("error", "")))
	else:
		await shell._activate_session(started)
		await _exercise(shell)
	shell.free()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", original_project)
	await process_frame
	if not _failed:
		print("PROVIDENCE_ISSUES_WORKFLOW_OK native-adapter repair=applied return=refreshed draft=guarded failure=retained save=explicit-reopened themes=3")
	quit(1 if _failed else 0)


func _exercise(shell) -> void:
	if not _mutate(shell, "message.create", {"nativeId": 29999, "text": "A repaired message."}):
		return
	if not _mutate(shell, "extra-action-point.create", {"nativeId": 31000}):
		return
	var source: Dictionary = shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:31000"})
	var row: Dictionary = source.result.extraActionPoint
	row.actions = [{"slot": 4, "rawOpcode": 1, "targetNativeId": 30000}, {"slot": 5, "rawOpcode": 1, "targetNativeId": 30001}]
	if not _mutate(shell, "extra-action-point.update", {"extraActionPoint": row}):
		return
	var controller = shell._issues
	controller.request_show()
	await _settle()
	var view = controller.workbench
	_check(shell._document_tabs.current_tab == 33 and shell._navigation.active_domain == "linter", "Issues route did not activate its own context")
	_check(view.state.limit == 50, "Full compact shell changed the approved page capacity")
	_check(view.size.y > 700 and view.size.y < 830 and shell._problem_dock.visible, "Full shell changed the approved Issues document height: %s" % view.size)
	view.state.set_filters("extra-action-point:31000", "error")
	await _settle()
	_check(view.state.page.total == 2 and view.state.selected_finding().field == "actions[4].target", "Real validation did not expose both controlled findings")
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	await _settle()
	var macro_editor = shell._documents.view("scripts.macros")
	_check(shell._document_tabs.current_tab == 3 and macro_editor.current_extra_action_point().identity == "extra-action-point:31000", "Open did not reach the exact Extra AP")
	_check(macro_editor._semantic_steps._selected_slot == 4, "Open did not select the exact action slot")
	var target := _semantic_target(macro_editor)
	_check(root.gui_get_focus_owner() == _target_focus(target), "Open did not focus the owning target field")
	await _set_semantic_target(macro_editor, 29999)
	_check(macro_editor.has_unapplied_changes(), "The semantic target edit did not become a draft")
	await shell._navigation.activate_domain("linter")
	await _settle()
	_check(controller.guard.visible and shell._document_tabs.current_tab == 3, "Return lost an unapplied action target")
	_check(shell._navigation.active_domain == "scripts", "Unapplied navigation replaced the source activity context")
	_check(controller.guard.get_cancel_button().has_focus(), "Cancel did not receive initial guard focus")
	controller.guard.get_cancel_button().pressed.emit()
	await _settle()
	_check(shell._document_tabs.current_tab == 3 and ProvidenceActionFieldRenderer.value_of(_semantic_target(macro_editor)) == 29999 and shell._draft_apply.has_draft(), "Cancel failed to retain the exact draft")
	var revision: int = shell._session_view.revision
	controller.request_show()
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(shell._session_view.revision == revision + 1 and shell._document_tabs.current_tab == 33, "Apply and Open did not commit once then return (revision %d, tab %d, draft %s, guard %s)" % [shell._session_view.revision, shell._document_tabs.current_tab, shell._draft_apply.has_draft(), controller.guard.visible])
	_check(view.state.query == "extra-action-point:31000" and view.state.severity == "error" and view.state.page.total == 1, "Return lost filters or retained repaired findings")
	_check(view.state.selected_finding().field == "actions[5].target", "Return did not advance the selected source field")
	_check(shell._status.text.ends_with("Unsaved"), "Repair was presented as saved")
	var current_revision: int = shell._session_view.revision
	await shell._commit_edit()
	_check(shell._session_view.revision == current_revision, "Apply shortcut mutated a hidden document from Issues")
	await shell._navigation.select_tab(2)
	await _settle()
	var draft := "A".repeat(80)
	var response_field: TextEdit = (shell._documents.view("encounters.simple")._response_controls[0] as Dictionary).text
	response_field.text = draft
	controller.request_show()
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(controller.guard.visible and not controller.guard.get_ok_button().visible, "Failed Apply did not retain its recovery state")
	_check(controller.guard.dialog_text.contains("Option 1 exceeds the 79-byte Classic limit"), "Failed Apply lost the field-specific cause and remedy")
	_check(response_field.text == draft and shell._session_view.revision == current_revision and shell._document_tabs.current_tab == 2, "Failed Apply changed the draft, project or destination")
	_check(controller.guard._pending.is_valid(), "Failed Apply lost its pending destination")
	controller.guard.get_cancel_button().pressed.emit()
	await _settle()
	_check(root.gui_get_focus_owner() == response_field and response_field.text == draft, "Keep Editing did not focus the invalid field")
	controller.request_show()
	controller.guard.custom_action.emit(&"discard")
	await _settle()
	_check(shell._document_tabs.current_tab == 33 and shell._session_view.revision == current_revision, "Discard and Open changed applied state")
	await _exercise_other_actions(shell)
	await preload("res://tools/issues_async_navigation_checks.gd").run(shell, _settle, _check)
	await _exercise_apply_failures(shell)
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = Vector2i(1920, 1080)
	await _settle()
	_check(view.state.limit == 50, "Full wide shell changed the approved page capacity")
	var initial_caption: Color = shell._command_bar.get_node("ProvidenceBrand/ApplicationName").get_theme_color("font_color")
	for mode in ["dark", "light", "high-contrast"]:
		controller.set_appearance(mode, "compact")
		await _settle()
		_check(shell._command_bar.get_node("ProvidenceBrand/ApplicationName").get_theme_color("font_color")==initial_caption,"A feature theme changed shared shell ownership")
		_check(view.state.limit==50,"Theme changed the wide bounded capacity")
	controller.set_appearance("dark", "balanced")
	await _exercise_persistence(shell)
	await shell._navigation.select_tab(4)
	await _settle()
	_check(not shell._domain_sidebar.visible and not shell._problem_dock.visible, "Leaving Validate must restore the authoring surface without the diagnostic dock")
	_check(shell._command_bar.get_node("ProvidenceBrand/ApplicationName").get_theme_color("font_color") == initial_caption, "Leaving Issues failed to restore the original label override")
	shell._close_project()
	controller.request_show()
	await _settle()
	_check(view.state.status == "no-project" and view.state.selected_finding().is_empty(), "Closed project retained an actionable finding")


func _exercise_persistence(shell) -> void:
	var created: Dictionary = shell._bridge.create_project("issues-workflow", _project_path)
	_check(bool(created.get("ok", false)), "Could not create the disposable portable project")
	if not bool(created.get("ok", false)):
		return
	await shell._activate_session(created)
	if not _mutate(shell, "message.create", {"nativeId": 29999, "text": "A repaired message."}):
		return
	if not _mutate(shell, "extra-action-point.create", {"nativeId": 31000}):
		return
	var source: Dictionary = shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:31000"})
	var record: Dictionary = source.result.extraActionPoint
	record.actions = [{"slot": 4, "rawOpcode": 1, "targetNativeId": 30000}, {"slot": 5, "rawOpcode": 1, "targetNativeId": 30001}]
	if not _mutate(shell, "extra-action-point.update", {"extraActionPoint": record}):
		return
	shell._bridge.methods.clear()
	shell._issues.request_show()
	await _settle()
	var state = shell._issues.workbench.state
	state.set_filters("extra-action-point:31000", "error")
	await _settle()
	(shell._issues.workbench.get_node("%OpenFinding") as Button).pressed.emit()
	await _settle()
	await _set_semantic_target(shell._documents.view("scripts.macros"), 29999)
	shell._issues.request_show()
	shell._issues.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(state.page.total == 1 and shell._status.text.ends_with("Unsaved"), "Portable repair did not return to refreshed findings")
	_check(not shell._bridge.methods.has("project.save"), "Repair implicitly invoked Save")
	shell._command_bar.get_node("Save").pressed.emit()
	await _settle()
	_check(shell._status.text.ends_with("Saved"), "Explicit Save did not update Issues status")
	_check(shell._bridge.methods.count("project.save") == 1, "Explicit Save did not send exactly one save command")
	shell._close_project()
	var reopened: Dictionary = shell._bridge.start_project(_project_path)
	_check(bool(reopened.get("ok", false)), "Saved project could not reopen")
	if not bool(reopened.get("ok", false)):
		return
	await shell._activate_session(reopened)
	shell._issues.request_show()
	state.set_filters("extra-action-point:31000", "error")
	await _settle()
	_check(state.page.total == 1 and state.selected_finding().field == "actions[5].target", "Reopen lost the applied repair or its remaining finding")
	source = shell._bridge.request("extra-action-point.open", {"identity": "extra-action-point:31000"})
	_check(int(source.result.extraActionPoint.actions[0].targetNativeId) == 29999, "Reopen did not preserve the repaired target")


func _exercise_other_actions(shell) -> void:
	var opened: Dictionary = shell._bridge.request("encounter.open-simple", {"identity": "simple-encounter:3"})
	var encounter: Dictionary = opened.result.encounter
	encounter.actions[0].targetNativeId = 30003
	if not _mutate(shell, "encounter.update-simple", {"encounter": encounter}):
		return
	for source: String in ["action-point:land:0:17", "simple-encounter:3"]:
		var view = shell._issues.workbench
		view.state.set_filters(source, "error")
		await _settle()
		_check(view.state.page.total == 1, "Controlled action problem was not found for " + source)
		(view.get_node("%OpenFinding") as Button).pressed.emit()
		await _settle()
		var expected_tab := 5 if source.begins_with("action-point:") else 2
		var destination = shell._documents.view("scripts.action-points") if source.begins_with("action-point:") else shell._documents.view("encounters.simple")
		_check(shell._document_tabs.current_tab == expected_tab,
			"Source navigation did not open %s (tab %d, destination draft %s, semantic draft %s)" % [source, shell._document_tabs.current_tab, destination.has_unapplied_changes(), destination._semantic_steps.has_unapplied_changes() if source.begins_with("action-point:") else false])
		if shell._document_tabs.current_tab != expected_tab: return
		var editor: Control = shell._document_tabs.get_current_tab_control()
		var field: Control = _semantic_target(editor)
		_check(field != null and field.get_viewport().gui_get_focus_owner() == _target_focus(field), "Source navigation missed the exact action field for " + source)
		await _set_semantic_target(editor, 29999)
		_check(shell._draft_apply.has_draft(), "Pending action target was lost for " + source)
		shell._issues.request_show()
		var revision: int = shell._session_view.revision
		shell._issues.guard.get_ok_button().pressed.emit()
		await _settle()
		_check(shell._session_view.revision == revision + 1 and shell._issues.is_selected() and view.state.page.total == 0, "Apply and return did not repair " + source)
		_check(not shell._draft_apply.has_draft(), "Apply and return retained a draft for " + source)
	opened = shell._bridge.request("encounter.open-simple", {"identity": "simple-encounter:3"})
	encounter = opened.result.encounter
	encounter.promptMessageNativeId = 30004
	if not _mutate(shell, "encounter.update-simple", {"encounter": encounter}):
		return
	var view = shell._issues.workbench
	view.state.refresh(shell._session_view.revision)
	await _settle()
	_check(view.state.selected_finding().field == "promptMessage", "Prompt finding lost its field identity")
	(view.get_node("%OpenFinding") as Button).pressed.emit()
	await _settle()
	var simple_editor: Control = shell._documents.view("encounters.simple")
	var prompt: LineEdit = simple_editor.get_node("%PromptMessage")
	_check(prompt.get_viewport().gui_get_focus_owner() == prompt, "Prompt navigation did not focus the owning field")
	simple_editor._document["promptMessageNativeId"] = 29999
	simple_editor._update_validation()
	shell._issues.request_show()
	shell._issues.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(shell._issues.is_selected() and view.state.page.total == 0, "Prompt repair did not refresh its findings")


func _exercise_apply_failures(shell) -> void:
	var controller = shell._issues
	await shell._navigation.select_tab(2)
	await _settle()
	var response: TextEdit = (shell._documents.view("encounters.simple")._response_controls[2] as Dictionary).text
	response.text = "A non-ASCII café"
	controller.request_show()
	var requests: int = shell._bridge.methods.size()
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(controller.guard.dialog_text.contains("Option 3 contains unsupported characters") and shell._bridge.methods.size() == requests, "Invalid Response 3 lost its cause or sent a mutation")
	controller.guard.get_cancel_button().pressed.emit()
	await _settle()
	_check(root.gui_get_focus_owner() == response and response.text == "A non-ASCII café", "Keep Editing lost the invalid third response")
	controller.request_show()
	controller.guard.custom_action.emit(&"discard")
	await shell._navigation.select_tab(5)
	await shell._scripts.open_action_point("action-point:land:0:17")
	await _settle()
	var ap = shell._documents.view("scripts.action-points")
	ap._placed.button_pressed = true
	ap._trigger_x.value = 0
	ap._trigger_y.value = 0
	ap._trigger_x.get_line_edit().grab_focus()
	controller.request_show()
	requests = shell._bridge.methods.size()
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(controller.guard.dialog_text.contains("cannot be placed at 0,0") and shell._bridge.methods.size() == requests, "Invalid Action Point location lost its cause or sent a mutation")
	controller.guard.get_cancel_button().pressed.emit()
	await _settle()
	_check(root.gui_get_focus_owner() == ap._trigger_x.get_line_edit() and shell._draft_apply.has_draft(), "Location failure focused an unrelated action or discarded the draft")
	controller.request_show()
	controller.guard.custom_action.emit(&"discard")
	await shell._navigation.select_tab(3)
	await shell._scripts.open_extra_action_point("extra-action-point:31000")
	await _settle()
	var xap = shell._documents.view("scripts.macros")
	await _exercise_invalid_xap_target(shell, controller, xap)
	await shell._navigation.select_tab(5)
	await shell._scripts.open_action_point("action-point:land:0:17")
	await _settle()
	await ap._semantic_steps.focus_source_target(0)
	var ap_target := _semantic_target(ap)
	await _set_semantic_target(ap, 29998)
	_target_focus(_semantic_target(ap)).grab_focus()
	var revision: int = shell._session_view.revision
	var newer: Dictionary = shell._bridge.request("message.update", {"expectedRevision": revision, "identity": "message:29999", "text": "A concurrent message edit."})
	_check(bool(newer.get("ok", false)), "Could not create a real stale-revision failure")
	controller._back.grab_focus()
	controller.request_show()
	var ap_mutations := _method_count(shell._bridge.methods, "action-point.apply-draft")
	var impact_queries := _method_count(shell._bridge.methods, "action-form.shared-impact")
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(controller.guard.dialog_text.contains("revision conflict") and shell._session_view.revision == revision, "Failed Apply lost the actual adapter rejection")
	_check(_method_count(shell._bridge.methods, "action-form.shared-impact") == impact_queries + 1 and _method_count(shell._bridge.methods, "action-point.apply-draft") == ap_mutations, "Stale semantic Apply was not rejected by one impact preflight before mutation")
	controller.guard.get_cancel_button().pressed.emit()
	await _settle()
	var retained_ap_target := _semantic_target(ap)
	_check(root.gui_get_focus_owner() == _target_focus(retained_ap_target) and ProvidenceActionFieldRenderer.value_of(retained_ap_target) == 29998, "Adapter rejection focused a fixed fallback or lost the Action Point draft")
	var unchanged: Dictionary = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:17"})
	_check(int(unchanged.result.actionPoint.actions[0].targetNativeId) == 29999, "Rejected Apply changed the stored action")
	shell._session_view.apply(newer.result)
	controller.request_show()
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(controller.is_selected() and shell._session_view.revision == revision + 2, "A corrected retry did not clear the previous failed result")


func _exercise_invalid_xap_target(shell, controller, xap: Control) -> void:
	await xap._semantic_steps.focus_source_target(5)
	var xap_target := _semantic_target(xap)
	var xap_mutations := _method_count(shell._bridge.methods, "extra-action-point.apply-draft")
	await _set_semantic_target(xap, 40000)
	_target_focus(_semantic_target(xap)).grab_focus()
	controller.request_show()
	controller.guard.get_ok_button().pressed.emit()
	await _settle()
	_check(controller.guard.dialog_text.contains("Target must be between -32768 and 32767") and _method_count(shell._bridge.methods, "extra-action-point.apply-draft") == xap_mutations, "Unsupported Extra AP target lost its cause or sent a mutation")
	controller.guard.get_cancel_button().pressed.emit()
	await _settle()
	var retained_xap_target := _semantic_target(xap)
	_check(root.gui_get_focus_owner() == _target_focus(retained_xap_target) and ProvidenceActionFieldRenderer.value_of(retained_xap_target) == 40000, "Keep Editing changed the invalid Extra AP target while focusing it")
	controller.request_show()
	controller.guard.custom_action.emit(&"discard")
	await _settle()


func _mutate(shell, method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = shell._session_view.revision
	var response: Dictionary = shell._bridge.request(method, params)
	_check(bool(response.get("ok", false)), method + " failed: " + str(response.get("error", "")))
	if not bool(response.get("ok", false)):
		return false
	shell._session_view.apply(response.result)
	return true


func _semantic_target(editor: Control) -> Control:
	var workbench = editor._step_dialog._workbench if editor is ProvidenceSimpleEncounterEditor else editor._semantic_steps
	return workbench.draft_focus_control()


func _target_focus(control: Control) -> Control:
	return control.get_line_edit() if control is SpinBox else control


func _set_semantic_target(editor: Control, value: int) -> void:
	var workbench = editor._step_dialog._workbench if editor is ProvidenceSimpleEncounterEditor else editor._semantic_steps
	var descriptor := workbench._field_controls.get("targetNativeId", {}) as Dictionary
	if descriptor.is_empty(): workbench._target_value.value = value
	else: workbench._field_renderer.accept_target("targetNativeId", value)
	await _settle()
	if editor is ProvidenceSimpleEncounterEditor:
		editor._step_dialog.accept()
		await _settle()


func _method_count(methods: Array[String], method: String) -> int:
	return methods.count(method)


func _settle() -> void:
	for _frame in 5:
		await process_frame
	var deadline := Time.get_ticks_msec() + 10000
	while is_instance_valid(_shell) and (_shell._operations.busy or _shell._issues.workbench.state.has_pending_refresh()
			or _shell._issues._source_open_in_progress or _shell._issues.guard._applying
			or _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()):
		if Time.get_ticks_msec() >= deadline:
			_check(false, "Issues validation did not finish")
			return
		await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ISSUES_WORKFLOW_FAILED: " + message)
		quit(1)

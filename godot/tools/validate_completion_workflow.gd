extends SceneTree

class ReadFailureBridge extends "res://src/native_bridge.gd":
	var fail_source := false
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		if fail_source and method == "extra-action-point.open" and params.get("identity") == "extra-action-point:31000":
			return {"ok":false, "error":"Controlled caller read failure"}
		return super._request(method, params)

var shell: Control
var checks: Array[String] = []

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ReadFailureBridge.new(args[0].path_join("completion-settings.cfg"))
	root.add_child(shell); await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	await _callers()
	await _branch_controls()
	await _validation_transitions()
	await _geometry()
	await _session_identity(args[0])
	var receipt := FileAccess.open(args[1], FileAccess.WRITE)
	receipt.store_string(JSON.stringify({"kind":"completion-native-workflow", "checks":checks}, "\t"))
	receipt.close()
	shell._bridge.stop(); shell.free(); await process_frame
	print("PROVIDENCE_COMPLETION_WORKFLOW_OK callers=6 failure=retained retry=explicit exactStep=5 validation=live dock=validate-only cap=persisted session=stale-rejected")
	quit()

func settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 60000
	while idle < 8:
		assert(Time.get_ticks_msec() < deadline, "Completion workflow timed out")
		await process_frame
		idle = 0 if shell._operations.busy else idle + 1

func mutate(method: String, params: Dictionary) -> Dictionary:
	params.expectedRevision = shell._session_view.revision
	var result: Dictionary = shell._bridge.request(method, params)
	assert(result.get("ok", false), str(result))
	shell._session_view.apply(result.result.get("change", result.result), false)
	return result.result

func _callers() -> void:
	for id in [31000,31001]:
		if not shell._bridge.request("extra-action-point.open", {"identity":"extra-action-point:%d" % id}).get("ok",false): mutate("extra-action-point.create", {"nativeId":id})
	var opened: Dictionary = shell._bridge.request("extra-action-point.open", {"identity":"extra-action-point:31000"})
	var row: Dictionary = opened.result.extraActionPoint
	row.actions = [{"slot":4, "rawOpcode":39, "targetNativeId":31001}]
	mutate("extra-action-point.update", {"extraActionPoint":row})
	await shell._navigation.open_script_target("extra-action-point", 31001, "extra-action-point:31001", {})
	await settle()
	var origin: Control = shell._documents.view("scripts.macros")
	var state: Dictionary = origin.read_navigation_state().duplicate(true)
	var history: Array = shell._navigation._back.duplicate(true)
	var button: Button = origin.find_child("Callers", true, false)
	assert(not button.disabled)
	button.pressed.emit(); await settle()
	var discovery = shell._commands._discovery
	var links: Window = discovery._view
	var rows: Tree = links.get_node("%Rows")
	assert(rows.get_root().get_child_count() == 1)
	rows.get_root().get_first_child().select(0); await settle()
	var selected: Dictionary = links._selection.duplicate(true)
	assert(selected.source == "extra-action-point:31000" and selected.field == "actions[4].target")
	shell._bridge.fail_source = true
	links.get_node("%OpenSource").pressed.emit(); await settle()
	assert(links.visible and links._selection == selected, "Failed caller reads must retain selection and allow explicit retry")
	assert(origin.read_navigation_state() == state and shell._navigation._back == history, "Failed caller reads must restore origin and history")
	shell._bridge.fail_source = false
	links.get_node("%OpenSource").pressed.emit(); await settle()
	assert(origin.current_extra_action_point().identity == "extra-action-point:31000")
	assert(origin._semantic_steps._selected_slot == 4)
	assert(not links.visible)
	await shell._navigation.navigate_back(); await settle()
	assert(origin.current_extra_action_point().identity == "extra-action-point:31001")
	checks.append("real XAP callers: failed read retains origin/history/rows; explicit retry reaches UI Step 5 (native slot 4); Back restores target")
	for context in [["scripts.action-points","action-point:land:0:78","open_action_point"], ["encounters.simple","simple-encounter:1","open_simple_encounter"], ["encounters.complex","complex-encounter:3","open_complex_encounter"]]:
		await shell._navigation.select_route(context[0])
		assert(await shell._scripts.call(context[2], context[1])); await settle()
		await _check_caller_route(context[0], context[1])
	for family in ["rogue", "timed"]:
		var created := mutate("encounter.create-" + family, {})
		var identity := str(created.document.encounter.identity)
		await shell._navigation.open_script_target(family + "-encounter", preload("res://src/source_navigation.gd").last_integer(identity), identity, {})
		await settle(); await _check_caller_route("encounters." + family, identity)

func _check_caller_route(route: String, identity: String) -> void:
	var origin: Control = shell._documents.view(route)
	var before: Dictionary = origin.read_navigation_state().duplicate(true)
	var button: Button = origin.find_child("Callers", true, false)
	assert(button != null and not button.disabled)
	button.pressed.emit(); await settle()
	var links: Window = shell._commands._discovery._view
	assert(links.visible and links._record.identity == identity, route)
	links.close_view(); await settle()
	assert(origin.read_navigation_state() == before, "Browsing callers must preserve local selection/draft")
	checks.append(route + " exposes callers for exact record without changing draft")

func _branch_controls() -> void:
	await shell._navigation.open_script_target("same-map-action-point",78,"action-point:land:0:78",{}); await settle()
	var view: Control = shell._documents.view("scripts.action-points")
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(0)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose_fresh(workbench,"realmz.action.40")); await settle()
	var gosub: CheckBox = workbench.get_node("%SemanticGosub")
	assert(gosub.disabled)
	_select_field(workbench,"branchMode",1); await settle()
	assert(not gosub.disabled)
	gosub.button_pressed = true; await settle()
	_select_field(workbench,"branchMode",0); await settle()
	assert(gosub.disabled and gosub.button_pressed and workbench.draft_steps()[0].gosub)
	view.discard_draft(); await settle()
	checks.append("No-branch disables GOSUB; branch mode enables it and inactive stored return remains intact")

func _select_field(workbench: ProvidenceActionStepWorkbench, key: String, value: int) -> void:
	var control: OptionButton = workbench._field_controls[key].control
	for index in range(control.item_count):
		if int(control.get_item_metadata(index)) == value:
			control.select(index); control.item_selected.emit(index); return
	assert(false,"Missing control choice " + key)

func _validation_transitions() -> void:
	for destination in [["same-map-action-point",78,"action-point:land:0:78","scripts.action-points"],["extra-action-point",31000,"extra-action-point:31000","scripts.macros"]]:
		await shell._navigation.open_script_target(destination[0],destination[1],destination[2],{}); await settle()
		var view: Control = shell._documents.view(destination[3])
		var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
		assert(view.can_apply_draft() and view._validation.text.is_empty())
		workbench.focus_slot(0)
		assert(preload("res://tools/divinity_picker_test_actions.gd").choose_fresh(workbench,"realmz.action.3")); await settle()
		assert(view.can_apply_draft() and not shell._command_bar.commit_button.disabled)
		workbench._field_renderer.changed.emit("choiceText",1,"authoring-mode")
		assert(not view.can_apply_draft() and shell._command_bar.commit_button.disabled)
		assert(view._validation.text.contains("Wait for")); await settle()
		assert(not view.can_apply_draft() and not view._validation.text.contains("Ready"))
		var revision: int = shell._session_view.revision
		assert(not (await shell._draft_apply.commit()).get("ok",false))
		assert(shell._session_view.revision == revision and view.has_unapplied_changes())
		workbench._field_renderer.changed.emit("promptA",26,"authoring-selection")
		workbench._field_renderer.changed.emit("promptB",27,"authoring-selection"); await settle()
		assert(view.can_apply_draft() and view._validation.text.is_empty() and not shell._command_bar.commit_button.disabled)
		view.discard_draft(); await settle()
		assert(view.can_apply_draft() and not view.has_unapplied_changes() and view._validation.text.is_empty())
		checks.append(destination[3] + ": clean/dirty/pending/invalid/repaired/discard readiness and both Apply affordances agree; invalid commit preserves draft/revision")

func _geometry() -> void:
	await shell._navigation.select_route("encounters.simple"); await settle()
	var view: Control = shell._documents.view("encounters.simple")
	var original_result: int = view._response_controls[0].result.get_item_metadata(view._response_controls[0].result.selected)
	for viewport in [Vector2i(1600,900), Vector2i(1920,1080)]:
		root.size = viewport; await settle()
		var first: Dictionary = view._response_controls[0]
		view._populate_result_picker(first.result, 0, -4)
		await settle()
		for controls: Dictionary in view._response_controls:
			assert(is_equal_approx(controls.result.size.x, first.result.size.x))
			assert(is_equal_approx(controls.text.size.x, first.text.size.x))
		assert(first.result.tooltip_text == "Auto-run Result 4 (skip prompt)")
	view._populate_result_picker(view._response_controls[0].result, 0, original_result)
	checks.append("Simple response and routing widths equal at both certified sizes, including auto-run")
	for route in ["scripts.action-points","scripts.macros","encounters.simple","encounters.complex","encounters.rogue","encounters.timed","scenario.startup","export.export-plan"]:
		await shell._navigation.select_route(route); await settle()
		assert(shell._navigation.current_route() == route, "Expected route was blocked: " + route)
		assert(not shell._problem_dock.visible, route)
		assert(not shell._status.text.contains("Validate · Issues"), route)
	await shell._navigation.select_route("linter.issues"); await settle()
	assert(shell._problem_dock.visible)
	checks.append("Diagnostic dock is confined to Validate and its diagnostic routes")
	var original: bool = shell._layout.centered_workspace()
	root.size = Vector2i(3440,1392)
	assert(shell._layout.set_centered_workspace(true) == OK); await settle()
	var workspace: Control = shell.get_node("Workspace")
	assert(absf(workspace.size.x - 1392.0 * 16.0 / 9.0) < 1)
	assert(absf(workspace.position.x * 2 + workspace.size.x - 3440) < 1)
	var preferences := ConfigFile.new()
	assert(preferences.load(shell._layout.PREFERENCES) == OK and preferences.get_value("workspace", "centered16By9") == true)
	assert(shell._layout.set_centered_workspace(false) == OK); await settle()
	assert(is_equal_approx(workspace.size.x,3440))
	root.size = Vector2i(1600,900)
	assert(shell._layout.set_centered_workspace(true) == OK); await settle()
	assert(is_equal_approx(workspace.size.x,1600))
	assert(shell._layout.set_centered_workspace(original) == OK)
	checks.append("Centered workspace uses content height, persists, restores full width and leaves 16:9 unchanged")

func _session_identity(project: String) -> void:
	var before: Dictionary = shell._session_view.context()
	var saved: Dictionary = shell._bridge.request("project.save", {"expectedRevision":shell._session_view.revision})
	assert(saved.get("ok", false), str(saved))
	await shell._project_session.open_project(project); await settle()
	var after: Dictionary = shell._session_view.context()
	assert(after.projectId == before.projectId and after.revision == before.revision)
	assert(after.sessionGeneration != before.sessionGeneration)
	shell._commands._discovery._display_context = before
	assert(not await shell._commands._discovery._still_current())
	checks.append("Save/reopen retains authored revision while invalidating previous session callbacks")

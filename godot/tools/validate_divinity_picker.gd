extends SceneTree

const Actions = preload("res://tools/divinity_picker_test_actions.gd")
var shell: Control
var workbench: ProvidenceActionStepWorkbench
var picker: ProvidenceDivinityCodeHelper
var checks: Array[String] = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(args[0].path_join("picker-check-settings.cfg"))
	root.add_child(shell); await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	assert(shell._scripts._action_catalog.items[0].has("availabilityByScriptKind"), "The configured adapter must supply context availability")
	for context in [
		["scripts.action-points", "action-point:land:0:78", "open_action_point", 7],
		["scripts.macros", "extra-action-point:1", "open_extra_action_point", 7],
		["encounters.simple", "simple-encounter:1", "open_simple_encounter", 7],
		["encounters.complex", "complex-encounter:3", "open_complex_encounter", 15]]:
		await _check_context(context, args[0])
	var receipt := FileAccess.open(args[1], FileAccess.WRITE)
	receipt.store_string(JSON.stringify({"kind": "divinity-picker-behavior", "checks": checks}, "\t"))
	receipt.close(); shell._bridge.stop(); shell.free()
	print("PROVIDENCE_DIVINITY_PICKER_OK four-contexts aliases signed category availability preview acceptance cancel same-action stale manual focus apply history save reopen")
	quit()


func settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec() + 120000
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline, "Native picker workflow timed out")
		await process_frame
		idle = 0 if shell._operations.busy else idle + 1


func _open(context: Array) -> Control:
	await shell._navigation.select_route(context[0])
	assert(await shell._scripts.call(context[2], context[1]))
	await settle()
	var view: Control = shell._documents.view(context[0])
	if str(context[0]).begins_with("encounters."):
		view.call("_open_step", context[3]); await settle()
		workbench = view._step_dialog._workbench
	else:
		workbench = view.get_node("%SemanticActionSteps")
		workbench.focus_slot(context[3]); await settle()
	picker = workbench.get_node("%StepActionPicker")
	return view


func _check_context(context: Array, project: String) -> void:
	print("PICKER_WORKFLOW_OPEN ", context[0])
	var view := await _open(context)
	var baseline := view.read_state().draft.duplicate(true) as Dictionary
	workbench.focus_slot(0); await settle()
	var original := workbench.draft_steps().duplicate(true)
	assert(Actions.choose(workbench, workbench._selected_action_identity())); await settle()
	assert(workbench.draft_steps() == original, "Current action preserves existing settings and signed/GOSUB identity")
	workbench.focus_slot(7); await settle()
	await _check_browsing()
	await _check_cancel_and_stale()
	print("PICKER_WORKFLOW_BROWSED ", context[0])
	if str(context[0]).begins_with("encounters."):
		assert(picker.get_parent().get_window() == view._step_dialog)
		assert(Actions.choose(workbench, "realmz.action.1")); await settle()
		view._step_dialog.cancel()
		assert(view.read_state().draft == baseline, "Encounter Cancel discards chosen actions")
		view = await _open(context)
	assert(Actions.choose(workbench, "realmz.action.1")); await settle()
	await _choose_message(51 if int(workbench._current_draft().targetNativeId) == 50 else 50)
	var draft_before := workbench.draft_steps().duplicate(true)
	assert(Actions.choose(workbench, "realmz.action.1")); await settle()
	assert(workbench.draft_steps() == draft_before, "Same action preserves target and settings")
	if str(context[0]).begins_with("encounters."): view._step_dialog.accept()
	print("PICKER_WORKFLOW_APPLY ", context[0], " error=", workbench.draft_error())
	await view.commit_selected(); await settle()
	print("PICKER_WORKFLOW_APPLIED ", context[0])
	assert(not view.has_unapplied_changes(), "Apply commits the complete record")
	var accepted := view.read_state().draft.duplicate(true) as Dictionary
	await shell._execute_history("undo"); await settle()
	assert(await shell._scripts.call(context[2], context[1])); await settle()
	assert(view.read_state().draft == baseline, "Undo restores the complete original record")
	await shell._execute_history("redo"); await settle()
	assert(await shell._scripts.call(context[2], context[1])); await settle()
	assert(view.read_state().draft == accepted, "Redo restores the accepted picker and field edit")
	await shell._project_session.save(); await settle()
	if str(context[0]).begins_with("encounters."):
		view.call("_open_step", context[3]); await settle()
	assert(Actions.preview(workbench, "realmz.action.-14") >= 0)
	var replaced_callback := workbench._picker_callback
	await shell._project_session.open_project(project); await settle()
	assert(not picker.visible, "Session replacement closes its picker")
	var replaced_draft := workbench.draft_steps().duplicate(true)
	replaced_callback.call("realmz.action.-14")
	assert(workbench.draft_steps() == replaced_draft, "A stale session callback is inert")
	view = await _open(context)
	assert(view.read_state().draft == accepted, "Save/reopen preserves the authored record")
	if str(context[0]).begins_with("encounters."): view._step_dialog.cancel()
	checks.append("%s: preview/cancel/same/stale/manual/focus; real message selection, Apply, undo/redo, Save/reopen" % context[0])
	print("PICKER_WORKFLOW_PERSISTED ", context[0])


func _search(query: String) -> void:
	var search := picker.get_node("%CodeSearch") as LineEdit
	search.text = query; search.text_changed.emit(query)


func _check_browsing() -> void:
	var before := workbench.draft_steps().duplicate(true)
	workbench.get_node("%ChooseAction").pressed.emit(); await process_frame
	assert(picker.get_node("%CodeSearch").has_focus())
	var actions := picker._actions
	for code in [-14, -23, 24]:
		_search(str(code))
		assert(picker._visible_entries[0].opcode == code)
		assert(picker._selected_identity() == "realmz.action.%d" % code)
		assert("Code %d" % code in str(picker.get_node("%OriginalName").text))
	_search("Exit Action Point And Keep Codes")
	assert(picker._visible_entries.any(func(e): return e.identity == "realmz.action.24"))
	_search("Show Message")
	assert(picker._visible_entries.any(func(e): return e.identity == "realmz.action.1"))
	_search("party walks onto")
	assert(picker._visible_entries.any(func(e): return e.identity == "realmz.action.24"))
	_search("")
	var category := picker.get_node("%ActionCategory") as OptionButton
	for index in category.item_count:
		if category.get_item_metadata(index) == "Dialogue": category.select(index); category.item_selected.emit(index)
	assert(not picker._visible_entries.is_empty())
	assert(picker._visible_entries.all(func(e): return e.category == "Dialogue"))
	category.select(0); category.item_selected.emit(0)
	var all := picker.get_node("%ShowUnavailable") as CheckBox
	all.button_pressed = true
	_search("34")
	var eligibility := actions.availability(picker._visible_entries[0], workbench._context.scriptKind)
	assert(picker.get_node("%UseAction").disabled == not eligibility.available)
	_search("24"); _search("34")
	assert(picker.get_node("%UseAction").disabled == not eligibility.available)
	_search("Not Used")
	var reference := picker._visible_entries.find_custom(func(e): return str(e.get("identity", "")).is_empty())
	assert(reference >= 0)
	picker.get_node("%CodeEntries").item_selected.emit(reference)
	assert(picker.get_node("%UseAction").disabled)
	_search("no_such_action_723651")
	assert(picker._visible_entries.is_empty() and picker.get_node("%UseAction").disabled)
	assert(picker.get_node("%OriginalName").text.is_empty())
	picker.get_node("%ClearSearch").pressed.emit()
	assert(not picker._visible_entries.is_empty() and not picker.get_node("%ClearSearch").visible)
	assert(workbench.draft_steps() == before, "Browsing is inert")
	_search("-23")
	picker.get_node("%OpenManual").pressed.emit(); await process_frame
	assert(picker._manual.visible and picker._manual.get_parent() == picker)
	picker._manual.close_reader(); await process_frame
	assert(picker._selected_identity() == "realmz.action.-23" and picker.get_node("%CodeSearch").has_focus())
	picker.close_helper(); await process_frame
	assert(workbench.get_node("%ChooseAction").has_focus())


func _check_cancel_and_stale() -> void:
	var before := workbench.draft_steps().duplicate(true)
	for cancel in ["CancelAction", "escape", "close"]:
		assert(Actions.preview(workbench, "realmz.action.-14") >= 0)
		if cancel == "escape": _key(KEY_ESCAPE)
		elif cancel == "close": picker.close_requested.emit()
		else: picker.get_node("%CancelAction").pressed.emit()
		await process_frame
		assert(not picker.visible and workbench.draft_steps() == before)
	assert(Actions.preview(workbench, "realmz.action.-14") >= 0)
	var stale := workbench._picker_callback
	workbench.focus_slot(0)
	stale.call("realmz.action.-14")
	assert(not picker.visible and workbench.draft_steps() == before)
	workbench.focus_slot(7)
	assert(Actions.preview(workbench, "realmz.action.-14") >= 0)
	await process_frame
	_key(KEY_ENTER); await settle()
	assert(not picker.visible and workbench._selected_action_identity() == "realmz.action.-14")
	assert(not workbench._current_draft().gosub)
	assert(Actions.preview(workbench, "realmz.action.-23") >= 0)
	picker.get_node("%CodeEntries").item_activated.emit(picker.get_node("%CodeEntries").get_selected_items()[0])
	await settle()
	assert(workbench._selected_action_identity() == "realmz.action.-23" and not workbench._current_draft().gosub)
	assert(Actions.choose(workbench, "realmz.action.0")); await settle()
	assert(workbench._current_draft().is_empty())
	assert(Actions.choose(workbench, "realmz.action.3")); await settle()
	(workbench.get_node("%SemanticGosub") as CheckBox).button_pressed = true
	var gosub := workbench.draft_steps().duplicate(true)
	assert(Actions.choose(workbench, "realmz.action.3")); await settle()
	assert(workbench.draft_steps() == gosub and workbench._current_draft().gosub)
	workbench.discard_draft(); await settle()
	checks.append("%s: Escape/Cancel/close inert, signed Enter/double-click exact, Empty Step local, stale slot rejected" % workbench._context.scriptKind)


func _key(code: Key) -> void:
	var event := InputEventKey.new(); event.keycode = code; event.pressed = true
	picker.get_node("%CodeSearch").grab_focus()
	picker.push_input(event)


func _choose_message(native_id: int) -> void:
	(workbench._field_controls.targetNativeId.control as Button).pressed.emit(); await settle()
	workbench._target_search.text = str(native_id)
	workbench._target_search.text_submitted.emit(str(native_id)); await settle()
	var selected := false
	for index in workbench._target_results.item_count:
		var item := workbench._target_results.get_item_metadata(index) as Dictionary
		if str(item.identity) != "message:%d" % native_id: continue
		workbench._target_results.item_activated.emit(index); selected = true; break
	await settle()
	assert(selected and int(workbench._current_draft().targetNativeId) == native_id)

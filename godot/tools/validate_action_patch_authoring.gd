extends SceneTree

const XAP_ID := "extra-action-point:530"
const SLOT := 3

var _shell: Control
var _view: Control
var _workbench: ProvidenceActionStepWorkbench


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed())
	await _shell._navigation.select_route("scripts.macros")
	assert(await _shell._scripts.open_extra_action_point(XAP_ID))
	_view = _shell._documents.view("scripts.macros")
	_workbench = _view.get_node("%SemanticActionSteps")
	await _choose_action("realmz.action.7")

	assert(_choice_labels("patchTargetKind") == [
		"Action Point", "Simple Encounter result", "Complex Encounter result"
	])
	await _select_choice("patchTargetKind", 1)
	assert(not _workbench._field_controls.has("levelOrCache"))
	await _select_choice("patchTargetKind", 2)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())

	assert(await _shell._scripts.open_extra_action_point(XAP_ID))
	await _settle()
	_workbench.focus_slot(SLOT)
	await _settle()
	assert(_selected_value("patchTargetKind") == 2)
	var step: Dictionary = _workbench.draft_steps().filter(func(step): return int(step.slot) == SLOT)[0]
	assert(int(step.settings.values.levelOrCache) == -2)

	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_ACTION_PATCH_AUTHORING_OK target=complex-encounter stored=-2 apply-reopen=exact")
	quit()


func _choose_action(action_identity: String) -> void:
	_workbench.focus_slot(SLOT)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, action_identity), "Missing action %s" % action_identity)
	await _settle()



func _select_choice(key: String, value: int) -> void:
	var picker := _workbench._field_controls[key].control as OptionButton
	for index in picker.item_count:
		if int(picker.get_item_metadata(index)) != value: continue
		picker.select(index)
		picker.item_selected.emit(index)
		await _settle()
		return
	assert(false, "Missing choice %s=%d" % [key, value])


func _choice_labels(key: String) -> Array:
	var picker := _workbench._field_controls[key].control as OptionButton
	var labels := []
	for index in picker.item_count: labels.append(picker.get_item_text(index))
	return labels


func _selected_value(key: String) -> int:
	var picker := _workbench._field_controls[key].control as OptionButton
	return int(picker.get_item_metadata(picker.selected))


func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		var pending: bool = _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()
		var ready := not _workbench._form_description.is_empty() or _workbench.draft_steps().is_empty()
		idle = 0 if _shell._operations.busy or pending or not ready else idle + 1

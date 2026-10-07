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
	await _choose_action("realmz.action.13")

	assert(_choice_labels("singleTarget") == ["Do not change", "Change"])
	assert(_choice_labels("landRange") == ["Do not change", "Change"])
	assert(_choice_labels("activationState") == ["Set activation chance", "Disable"])
	await _select_choice("singleTarget", 0)
	await _select_choice("landRange", 1)
	_workbench._field_renderer.accept_target("rangeStartWithSign", 13)
	await _settle()
	_workbench._field_renderer.accept_target("rangeEnd", 18)
	await _settle()
	await _select_choice("activationState", 0)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())

	assert(await _shell._scripts.open_extra_action_point(XAP_ID))
	await _settle()
	_workbench.focus_slot(SLOT)
	await _settle()
	assert(_selected_value("singleTarget") == 0)
	assert(_selected_value("landRange") == 1)
	assert(_selected_value("activationState") == 0)
	var values: Dictionary = _workbench.draft_steps().filter(func(step): return int(step.slot) == SLOT)[0].settings.values
	assert(int(values.singleTrigger) == 0)
	assert(int(values.rangeStartWithSign) == 13)
	assert(int(values.rangeEnd) == 18)
	assert(int(values.percent) == -1)

	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_TRIGGER_MUTATION_AUTHORING_OK single=off land-range=13..18 state=disabled apply-reopen=exact")
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

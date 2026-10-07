extends SceneTree

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
	await _shell._navigation.select_route("scripts.macros")
	assert(await _shell._scripts.open_extra_action_point("extra-action-point:436"))
	_view = _shell._documents.view("scripts.macros")
	_workbench = _view.get_node("%SemanticActionSteps")
	_workbench.focus_slot(1)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, "realmz.action.51"))
	await _settle()
	assert(not _workbench._field_controls.has("shop"))
	assert(_workbench._field_controls.shopSelection.control.get_item_text(0) == "Current shop")
	await _mode(1)
	assert(not _workbench.draft_error().is_empty())
	_workbench._field_controls.shop.control.pressed.emit()
	await _settle()
	var selected := -1
	for index in _workbench._target_results.item_count:
		var item: Dictionary = _workbench._target_results.get_item_metadata(index)
		if int(item.value) > 0:
			selected = int(item.value)
			_workbench._target_results.item_activated.emit(index)
			break
	await _settle()
	assert(selected > 0 and _workbench.draft_error().is_empty())
	var chosen := _workbench.draft_steps().duplicate(true)
	await _mode(0)
	assert(not _workbench._field_controls.has("shop"))
	await _mode(1)
	assert(_workbench.draft_steps() == chosen)
	_workbench._impact_dialog.about_to_popup.connect(func(): _independent.call_deferred())
	await _apply_reopen(selected)
	await _mode(0)
	await _apply_reopen(0)
	assert(not _workbench._field_controls.has("shop"))
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("CURRENT_SHOP_AUTHORING_OK current=caller-dependent specific=picker-apply-reopen retention=preserved")
	quit()


func _mode(value: int) -> void:
	var picker := _workbench._field_controls.shopSelection.control as OptionButton
	picker.select(value)
	picker.item_selected.emit(value)
	await _settle()


func _apply_reopen(shop: int) -> void:
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point("extra-action-point:436"))
	_workbench.focus_slot(1)
	await _settle()
	for step in _workbench.draft_steps():
		if int(step.slot) == 1:
			assert(int(step.settings.values.shop) == shop)
			return
	assert(false, "The authored shop step must remain present")


func _independent() -> void:
	_workbench._impact_dialog.custom_action.emit("independent")


func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		var pending: bool = _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()
		idle = 0 if _shell._operations.busy or pending or _workbench._form_description.is_empty() else idle + 1

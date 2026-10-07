extends SceneTree

var _shell: Control
var _view: Control
var _workbench: ProvidenceActionStepWorkbench
var _capture_completed := false


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	if not OS.get_environment("PROVIDENCE_CHARACTER_CAPTURE_PATH").is_empty():
		root.content_scale_size = DisplayServer.window_get_size()
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed())
	print("ELIGIBILITY_ADAPTER " + _shell._bridge._adapter_path())
	var routes := [true, false]
	if _capture_mode() == "race": routes = [true]
	elif _capture_mode() == "class": routes = [false]
	for ordinary in routes:
		var route := "scripts.action-points" if ordinary else "scripts.macros"
		await _shell._navigation.select_route(route)
		assert(await _open(ordinary))
		_view = _shell._documents.view(route)
		_workbench = _view.get_node("%SemanticActionSteps")
		_workbench._impact_dialog.about_to_popup.connect(func(): _independent.call_deferred())
		for opcode in [50, 60]:
			await _check_action(ordinary, opcode)
			if _capture_completed: break
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	if not _capture_completed:
		print("CHARACTER_ELIGIBILITY_NATIVE_OK ap+xap property=named-modes race-caste=pick-open-return classes=named living!=picked apply-reopen unrelated=preserved")
	quit()


func _open(ordinary: bool) -> bool:
	if ordinary: return await _shell._scripts.open_action_point("action-point:land:0:78")
	return await _shell._scripts.open_extra_action_point("extra-action-point:436")


func _check_action(ordinary: bool, opcode: int) -> void:
	_workbench.focus_slot(6)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, "realmz.action.%d" % opcode))
	await _settle()
	if opcode == 50:
		await _check_character_property_authoring(ordinary)
		if _capture_completed: return
		await _choose("characterProperty", "Gender")
		await _choose("gender", "Male")
	else:
		await _choose("moneyType", "Gold")
	var key := "livingOnly" if opcode == 50 else "pickedOnly"
	var eligibility := "Living characters" if opcode == 50 else "Picked characters"
	var before := _other_steps()
	for label in [eligibility, "Everyone"]:
		await _choose(key, label)
		var expected: Dictionary = _selected_step().settings.values.duplicate(true)
		assert(int(expected[key]) == (0 if label == "Everyone" else 1))
		await _view.commit_selected()
		await _settle()
		assert(not _view.has_unapplied_changes())
		assert(await _open(ordinary))
		_workbench.focus_slot(6)
		await _settle()
		assert(_selected_step().settings.values == expected)
		assert(_other_steps() == before)
		var picker := _workbench._field_controls[key].control as OptionButton
		assert(picker.get_item_text(picker.selected) == label)


func _check_character_property_authoring(ordinary: bool) -> void:
	await _choose("characterProperty", "Race")
	var race := await _choose_target("raceCasteOrClass")
	assert(str(race.identity).begins_with("classic.race."))
	assert(int(_selected_step().settings.values.raceCasteOrClass) == int(race.value))
	if ordinary and _capture_mode() == "race":
		await _capture_character_state()
	if ordinary:
		await _view.commit_selected()
		await _settle()
		assert(await _open(true))
		_workbench.focus_slot(6)
		await _settle()
		_press_field_button("raceCasteOrClass", "Open in Editor")
		var rules: ProvidenceRuleRecordEditor = _shell._documents.view("rules.races")
		var deadline := Time.get_ticks_msec() + 60000
		while rules.current_applied_identity() != str(race.identity):
			assert(Time.get_ticks_msec() < deadline, "Race navigation selected '%s' instead of '%s': %s" % [rules.current_applied_identity(), race.identity, _shell._status.text])
			await process_frame
		assert(rules.current_applied_identity() == str(race.identity), "Race navigation selected '%s' instead of '%s': %s" % [rules.current_applied_identity(), race.identity, _shell._status.text])
		await _shell._navigation.navigate_back()
		await _settle()
		assert(_view.selected_identity() == "action-point:land:0:78")
		assert(_workbench._selected_slot == 6)
	await _choose("characterProperty", "Race class")
	await _choose("raceCasteOrClass", "Short Race")
	assert(not _workbench._field_controls.has("gender"))
	await _choose("characterProperty", "Caste")
	var caste := await _choose_target("raceCasteOrClass")
	assert(str(caste.identity).begins_with("classic.caste."))
	await _choose("characterProperty", "Caste class")
	await _choose("raceCasteOrClass", "Archer")
	assert(not _workbench._field_controls.has("gender"))
	if not ordinary and _capture_mode() == "class":
		await _capture_character_state()


func _capture_mode() -> String:
	return OS.get_environment("PROVIDENCE_CHARACTER_CAPTURE_MODE")


func _capture_character_state() -> void:
	var output_path := OS.get_environment("PROVIDENCE_CHARACTER_CAPTURE_PATH")
	if output_path.is_empty(): return
	await _choose("livingOnly", "Living characters")
	for _frame in range(4): await process_frame
	var image := root.get_viewport().get_texture().get_image()
	assert(image != null, "Character-selection capture requires a rendering display")
	var error := image.save_png(output_path)
	assert(error == OK, "Could not save character-selection capture: %s" % error_string(error))
	_capture_completed = true
	print("CHARACTER_SELECTION_CAPTURE_OK " + output_path)


func _choose_target(key: String) -> Dictionary:
	var picker := _workbench._field_controls[key].control as Button
	assert(picker != null and not picker is OptionButton)
	picker.pressed.emit()
	await _settle()
	for index in _workbench._target_results.item_count:
		var item := _workbench._target_results.get_item_metadata(index) as Dictionary
		if not str(item.get("identity", "")).is_empty():
			_workbench._target_results.item_activated.emit(index)
			await _settle()
			return item
	assert(false, "The project must expose an exact character-rule target")
	return {}


func _press_field_button(key: String, label: String) -> void:
	var row := (_workbench._field_controls[key].control as Control).get_parent()
	for child in row.get_children():
		if child is Button and child.text == label:
			assert(not child.disabled)
			child.pressed.emit()
			return
	assert(false, "The field must expose its exact authoring destination")


func _choose(key: String, label: String) -> void:
	var picker := _workbench._field_controls[key].control as OptionButton
	assert(picker != null)
	for index in picker.item_count:
		if picker.get_item_text(index) == label:
			picker.select(index)
			picker.item_selected.emit(index)
			await _settle()
			return
	assert(false, "Named choice is missing: " + label)


func _selected_step() -> Dictionary:
	for step in _workbench.draft_steps():
		if int(step.slot) == 6: return step
	assert(false, "Authored step is missing")
	return {}


func _other_steps() -> Array:
	return _workbench.draft_steps().filter(func(step): return int(step.slot) != 6).duplicate(true)


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

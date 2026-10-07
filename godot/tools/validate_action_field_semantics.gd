extends SceneTree

var _shell: Control
var _output := ""


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2)
	_output = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed())
	print("FIELD_SEMANTICS_ADAPTER " + _shell._bridge._adapter_path())
	await _shell._navigation.select_route("scripts.action-points")
	var view: Control = _shell._documents.view("scripts.action-points")
	view._page_offset = 50
	assert(await _shell._scripts.reload_action_points("action-point:land:0:71"))
	assert(await _shell._scripts.open_action_point("action-point:land:0:71"))
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(1)
	await _settle(workbench)
	assert(workbench._field_controls.size() == 5)
	for key in ["percent", "successBehavior", "branchMode", "slot"]:
		var field := workbench._field_controls[key] as Dictionary
		assert(field.field.targetKind == null and field.field.preview == null, key)
		assert(not _has_button(field.control.get_parent(), "Find…"), key)
	assert(int(workbench._field_controls.percent.control.value) == 33)
	await _capture_pair("ap-71-percent", workbench)
	await _check_modes(workbench)
	await _check_help(workbench)
	assert(not view.has_unapplied_changes())
	await _check_navigation(workbench)
	await _check_pending_draft_navigation(workbench, view)
	await _shell._navigation.select_route("scripts.macros")
	assert(await _shell._scripts.open_extra_action_point("extra-action-point:7"))
	view = _shell._documents.view("scripts.macros")
	workbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(0)
	await _settle(workbench)
	assert(workbench._field_controls.targetNativeId.field.targetKind == "message")
	await _capture_pair("xap-7-message", workbench)
	await _check_cross_map_draft(workbench)
	await _check_new_preserved_word(workbench)
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("FIELD_SEMANTICS_NATIVE_OK percent=scalar modes=contextual stale-picker=rejected draft=preserved linked-draft=apply-return-exact viewports=1600+1920")
	quit()


func _check_modes(workbench: ProvidenceActionStepWorkbench) -> void:
	var baseline := workbench.draft_steps().duplicate(true)
	var mode := workbench._field_controls.branchMode.control as OptionButton
	mode.select(2)
	mode.item_selected.emit(2)
	await _settle(workbench)
	assert(workbench._field_controls.target.field.targetKind == null)
	assert(workbench._field_controls.target.field.label == "Current Simple Encounter Branch")
	workbench.set_target_page({"requestGeneration": workbench._target_generation - 1,
		"items": [{"value": 99, "identity": "extra-action-point:99"}]})
	assert(not workbench._target_panel.visible)
	mode = workbench._field_controls.branchMode.control as OptionButton
	mode.select(1)
	mode.item_selected.emit(1)
	await _settle(workbench)
	assert(workbench.draft_steps() == baseline)


func _check_navigation(workbench: ProvidenceActionStepWorkbench) -> void:
	await _shell._navigation.open_script_target("extra-action-point", 72, "extra-action-point:72", {})
	assert(_shell._documents.view("scripts.macros").read_state().identity == "extra-action-point:72")
	await _settle(_shell._documents.view("scripts.macros").get_node("%SemanticActionSteps"))
	await _shell._navigation.navigate_back()
	await _settle(workbench)
	assert(_shell._documents.view("scripts.action-points").selected_identity() == "action-point:land:0:71")
	assert(workbench.read_state().selectedSlot == 1)


func _check_pending_draft_navigation(workbench: ProvidenceActionStepWorkbench, view: Control) -> void:
	var original: String = str(view._descriptor.text)
	var changed: String = "Linked navigation draft" if original != "Linked navigation draft" else "Linked navigation draft 2"
	view._descriptor.text = changed
	view._descriptor.text_changed.emit(changed)
	await process_frame
	assert(view.has_unapplied_changes())
	var row: Control = workbench._field_controls.target.control.get_parent()
	var expected_identity := str(workbench._field_controls.target.field.preview.identity)
	assert(expected_identity.begins_with("extra-action-point:"))
	var open := _button(row, "Open in Editor")
	assert(open != null and not open.disabled)
	open.pressed.emit()
	var deadline := Time.get_ticks_msec() + 60000
	while not _shell._unapplied_dialog.visible:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
	assert(view.has_unapplied_changes())
	assert(view.selected_identity() == "action-point:land:0:71")
	await _shell._draft_navigation.apply_and_continue()
	var target: Control = _shell._documents.view("scripts.macros")
	deadline = Time.get_ticks_msec() + 60000
	while str(target.read_state().get("identity", "")) != expected_identity:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
	assert(target.read_state().identity == expected_identity)
	await _shell._navigation.navigate_back()
	await _settle(workbench)
	assert(view.selected_identity() == "action-point:land:0:71")
	assert(workbench.read_state().selectedSlot == 1)
	assert(view._descriptor.text == changed)
	assert(not view.has_unapplied_changes())
	view._descriptor.text = original
	view._descriptor.text_changed.emit(original)
	await process_frame
	var restored: Dictionary = await _shell._draft_apply.commit()
	assert(bool(restored.get("ok", false)), str(restored))
	await _settle(workbench)
	assert(not view.has_unapplied_changes())


func _capture_pair(name: String, workbench: ProvidenceActionStepWorkbench) -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _settle(workbench)
		for frame in 8: await process_frame
		assert(not _shell.get_node("%InspectorHost").visible)
		for field in workbench._field_controls.values():
			var rect: Rect2 = field.control.get_global_rect()
			assert(rect.end.x <= viewport.x and rect.end.y <= viewport.y - 60, str(rect))
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
			var capture := root.get_texture().get_image()
			assert(capture.save_png(_output.path_join("%s-%dx%d.png" % [name, viewport.x, viewport.y])) == OK)


func _check_help(workbench: ProvidenceActionStepWorkbench) -> void:
	var row: Control = workbench._field_controls.percent.control.get_parent()
	var help := row.get_child(row.get_child_count() - 1) as Button
	assert(help.text == "Help" and help.focus_mode == Control.FOCUS_ALL)
	help.grab_focus()
	for pressed in [true, false]:
		var event := InputEventKey.new()
		event.keycode = KEY_ENTER
		event.pressed = pressed
		Input.parse_input_event(event)
		await process_frame
	assert(help.button_pressed)
	assert(row.get_parent().get_child(1).visible)
	help.button_pressed = false


func _check_new_preserved_word(workbench: ProvidenceActionStepWorkbench) -> void:
	workbench.focus_slot(2)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(workbench, "realmz.action.59"))
	await _settle(workbench)
	assert(not workbench._field_controls.has("testA"))
	var created: Dictionary = workbench.draft_steps().filter(func(s): return s.slot == 2)[0]
	assert(created.settings.values.testA == 0)
	assert(workbench.draft_error().is_empty())
	workbench.discard_draft()
	assert(not workbench.has_unapplied_changes())


func _check_cross_map_draft(workbench: ProvidenceActionStepWorkbench) -> void:
	workbench.focus_slot(1)
	await _settle(workbench)
	assert(workbench._field_controls.has("levelOrCache"))
	workbench._field_renderer.accept_target("levelOrCache", 1)
	await _settle(workbench)
	workbench._field_renderer.accept_target("targetRecord", 33)
	await _settle(workbench)
	var kind: OptionButton = workbench._field_controls.levelKind.control
	for index in kind.item_count:
		if int(kind.get_item_metadata(index)) == 1:
			kind.select(index)
			kind.item_selected.emit(index)
			break
	await _settle(workbench)
	var field: Dictionary = workbench._field_controls.targetRecord.field
	assert(field.targetContext.mapIdentity == "land:1", str(field))
	assert(field.preview.identity == "action-point:land:1:33")
	workbench._request_field_targets("targetRecord", "same-map-action-point")
	await _settle(workbench)
	assert(workbench._target_results.item_count > 0)
	for index in workbench._target_results.item_count:
		assert(str(workbench._target_results.get_item_metadata(index).identity).begins_with("action-point:land:1:"))
	workbench.discard_draft()
	assert(not workbench.has_unapplied_changes())


func _has_button(row: Node, text: String) -> bool:
	for child in row.get_children():
		if child is Button and child.text == text: return true
	return false


func _button(row: Node, text: String) -> Button:
	for child in row.get_children():
		if child is Button and child.text == text: return child
	return null


func _settle(workbench: ProvidenceActionStepWorkbench) -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if _shell._operations.busy or workbench._form_description.is_empty() else idle + 1

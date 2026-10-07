extends SceneTree

var _shell: Control
var _output: String


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
	await _shell._navigation.select_route("scripts.action-points")
	var view: Control = _shell._documents.view("scripts.action-points")
	view._page_offset = 75
	assert(await _shell._scripts.reload_action_points("action-point:land:0:78"))
	assert(await _shell._scripts.open_action_point("action-point:land:0:78"))
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(1)
	await _settle(workbench)
	assert(workbench._selected_slot == 1)
	workbench._impact_dialog.about_to_popup.connect(func(): _independent.call_deferred(workbench))
	await _check_response_authoring(workbench, view)
	_check_default(workbench)
	await _capture_states(workbench, "half-truth-ap78-player-option-default")
	await _check_custom_authoring(workbench, view, "action-point:land:0:78", true)
	await _check_linked_edit(workbench, view)
	await _check_xap_authoring()
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("HALF_TRUTH_PLAYER_OPTION_OK ap=78 xap=436 slot=1 defaults=named-choice custom=select-apply-reopen behavior=choose-apply-reopen navigation=edit-return-exact viewports=1600+1920")
	quit()


func _capture_states(workbench: ProvidenceActionStepWorkbench, prefix: String) -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _settle(workbench)
		for frame in 8: await process_frame
		var scroll := workbench.get_node("EditorPanel/Layout/Scroll") as ScrollContainer
		var form := workbench.get_node("%SemanticForm") as GridContainer
		assert(form.get_global_rect().end.y <= scroll.get_global_rect().end.y + 1, "%s %s: form %s exceeds viewport %s" % [prefix, viewport, form.get_global_rect(), scroll.get_global_rect()])
		var gosub := workbench.get_node("%SemanticGosub") as CheckBox
		assert(gosub.has_theme_icon_override("unchecked"))
		assert(gosub.size.x < scroll.size.x / 2, "GOSUB must remain a compact execution option")
		assert(not _shell._status.text.contains("in progress"), "Completed work must not leave a stale busy message")
		if prefix.contains("ap78"):
			var view: Control = _shell._documents.view("scripts.action-points")
			var index: int = view._list.get_selected_items()[0]
			assert(view._list.get_item_text(index).contains("100% / 5"))
			assert(int(view._chance.value) == 100)
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
			var name := "%s-%dx%d.png" % [prefix, viewport.x, viewport.y]
			assert(root.get_texture().get_image().save_png(_output.path_join(name)) == OK)


func _check_default(workbench: ProvidenceActionStepWorkbench) -> void:
	assert(not workbench._field_controls.has("promptA"))
	assert(not workbench._field_controls.has("promptB"))
	var picker := workbench._field_controls.choiceText.control as OptionButton
	assert(picker.get_item_text(picker.selected) == "Default Yes/No")
	var notes: Array = picker.get_parent().get_parent().get_children().filter(func(node): return node is Label and node.text == "Left: Yes     Right: No")
	assert(notes.size() == 1)
	assert(workbench.draft_error().is_empty())


func _choose_mode(workbench: ProvidenceActionStepWorkbench, custom: bool) -> void:
	var picker := workbench._field_controls.choiceText.control as OptionButton
	picker.select(1 if custom else 0)
	picker.item_selected.emit(picker.selected)
	await _settle(workbench)


func _choose_content(workbench: ProvidenceActionStepWorkbench, key: String, skip: int = -1, exact: int = -1) -> int:
	var picker := workbench._field_controls[key].control as Button
	assert(not picker is OptionButton)
	picker.pressed.emit()
	await _settle(workbench)
	if exact >= 0:
		workbench._target_search.text = str(exact)
		workbench._target_search.text_submitted.emit(str(exact))
		await _settle(workbench)
	for index in workbench._target_results.item_count:
		var item: Dictionary = workbench._target_results.get_item_metadata(index)
		if int(item.value) > 0 and int(item.value) != skip and (exact < 0 or int(item.value) == exact) and not str(item.detail).is_empty():
			workbench._target_results.item_activated.emit(index)
			await _settle(workbench)
			return int(item.value)
	assert(false, "The retained Half Truth fixture needs available custom label content")
	return -1


func _check_custom_authoring(workbench: ProvidenceActionStepWorkbench, view: Control, identity: String, ordinary: bool) -> void:
	var baseline := workbench.draft_steps().duplicate(true)
	await _choose_mode(workbench, true)
	assert(not workbench.draft_error().is_empty())
	assert(view.has_unapplied_changes())
	var left := await _choose_content(workbench, "promptA")
	assert(not workbench.draft_error().is_empty(), "The right selection must be explicit")
	var right := await _choose_content(workbench, "promptB", left)
	assert(workbench.draft_error().is_empty())
	var chosen := workbench.draft_steps().duplicate(true)
	await _choose_mode(workbench, false)
	_check_default(workbench)
	assert(workbench.draft_steps() == baseline)
	await _choose_mode(workbench, true)
	assert(workbench.draft_steps() == chosen, "Pending custom selections must survive mode switches")
	if not ordinary: workbench._impact_dialog.about_to_popup.connect(func(): _independent.call_deferred(workbench))
	await view.commit_selected()
	await _settle(workbench)
	assert(not view.has_unapplied_changes())
	assert(int(workbench._field_controls.promptA.field.value) == left)
	assert(int(workbench._field_controls.promptB.field.value) == right)
	await _capture_states(workbench, "half-truth-ap78-player-option-custom" if ordinary else "half-truth-xap436-player-option-custom")
	if ordinary: assert(await _shell._scripts.open_action_point(identity))
	else: assert(await _shell._scripts.open_extra_action_point(identity))
	workbench.focus_slot(1)
	await _settle(workbench)
	assert(int(workbench._field_controls.promptA.field.value) == left)
	assert(int(workbench._field_controls.promptB.field.value) == right)


func _check_response_authoring(workbench: ProvidenceActionStepWorkbench, view: Control) -> void:
	var original_target := int(workbench._field_controls.branchTarget.field.value)
	var other_target := await _choose_content(workbench, "branchTarget", original_target)
	await _choose_response(workbench, 0)
	await view.commit_selected()
	await _settle(workbench)
	assert(not view.has_unapplied_changes())
	assert(await _shell._scripts.open_action_point("action-point:land:0:78"))
	workbench.focus_slot(1)
	await _settle(workbench)
	assert(int(workbench._field_controls.replyPolarity.field.value) == 0)
	assert(int(workbench._field_controls.branchTarget.field.value) == other_target)
	assert(await _choose_content(workbench, "branchTarget", -1, original_target) == original_target)
	await _choose_response(workbench, 1)
	await view.commit_selected()
	await _settle(workbench)
	assert(not view.has_unapplied_changes())


func _choose_response(workbench: ProvidenceActionStepWorkbench, value: int) -> void:
	var picker := workbench._field_controls.replyPolarity.control as OptionButton
	for index in picker.item_count:
		if int(picker.get_item_metadata(index)) == value:
			assert(picker.get_item_text(index).contains("continues"))
			picker.select(index)
			picker.item_selected.emit(index)
			await _settle(workbench)
			return
	assert(false, "The response must be a named choice")


func _check_linked_edit(workbench: ProvidenceActionStepWorkbench, view: Control, identity := "action-point:land:0:78") -> void:
	var left := int(workbench._field_controls.promptA.field.value)
	_press_field_button(workbench, "promptA", "Edit String")
	await _settle(workbench)
	var strings: ProvidenceStringEditor = _shell._strings
	assert(strings.selected_identity() == "message:%d" % left)
	var original := strings._message_editor.text
	for text in [original + "!", original]:
		strings._message_editor.text = text
		strings._message_editor.text_changed.emit()
		assert(strings.has_unapplied_changes())
		await strings.commit_selected()
		assert(not strings.has_unapplied_changes())
		await strings.open_native(left)
		assert(strings._message_editor.text == text)
		await _shell._navigation.navigate_back()
		await _settle(workbench)
		assert(view.selected_identity() == identity)
		assert(workbench._selected_slot == 1)
		assert(str(workbench._field_controls.promptA.field.preview.detail) == text)
		if text != original:
			_press_field_button(workbench, "promptA", "Edit String")
			await _settle(workbench)
	if identity != "action-point:land:0:78": return
	_press_field_button(workbench, "branchTarget", "Open in Editor")
	await _settle(workbench)
	var selected: String = _shell._documents.view("scripts.macros").selected_identity()
	assert(selected == "extra-action-point:436", "Opened %s instead of XAP 436: %s" % [selected, _shell._status.text])
	assert(_shell._documents.view("scripts.macros").current_applied_native_id() == 436)
	await _shell._navigation.navigate_back()
	await _settle(workbench)
	assert(view.selected_identity() == "action-point:land:0:78")
	assert(workbench._selected_slot == 1)


func _press_field_button(workbench: ProvidenceActionStepWorkbench, key: String, label: String) -> void:
	var row := (workbench._field_controls[key].control as Control).get_parent()
	for child in row.get_children():
		if child is Button and child.text == label:
			assert(not child.disabled)
			child.pressed.emit()
			return
	assert(false, "The field must expose its exact authoring destination")


func _check_xap_authoring() -> void:
	await _shell._navigation.select_route("scripts.macros")
	assert(await _shell._scripts.open_extra_action_point("extra-action-point:436"))
	var view: Control = _shell._documents.view("scripts.macros")
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(1)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(workbench, "realmz.action.3"))
	await _settle(workbench)
	_check_default(workbench)
	await _capture_states(workbench, "half-truth-xap436-player-option-default")
	await _check_custom_authoring(workbench, view, "extra-action-point:436", false)
	await _check_linked_edit(workbench, view, "extra-action-point:436")
	await _check_xap_response_authoring(workbench, view)


func _check_xap_response_authoring(workbench: ProvidenceActionStepWorkbench, view: Control) -> void:
	await _choose_response(workbench, 1)
	var otherwise := workbench._field_controls.branchMode.control as OptionButton
	var selected := false
	for index in otherwise.item_count:
		if int(otherwise.get_item_metadata(index)) == 1:
			assert(otherwise.get_item_text(index) == "Extra Action Point")
			otherwise.select(index)
			otherwise.item_selected.emit(index)
			selected = true
			break
	assert(selected)
	await _settle(workbench)
	var target := await _choose_content(workbench, "branchTarget", 436)
	await view.commit_selected()
	await _settle(workbench)
	assert(not view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point("extra-action-point:436"))
	workbench.focus_slot(1)
	await _settle(workbench)
	assert(int(workbench._field_controls.replyPolarity.field.value) == 1)
	assert(int(workbench._field_controls.branchMode.field.value) == 1)
	assert(int(workbench._field_controls.branchTarget.field.value) == target)


func _independent(workbench: ProvidenceActionStepWorkbench) -> void:
	workbench._impact_dialog.custom_action.emit("independent")


func _has_button(row: Node, text: String, disabled := false) -> bool:
	for child in row.get_children():
		if child is Button and child.text == text and child.disabled == disabled: return true
	return false


func _settle(workbench: ProvidenceActionStepWorkbench) -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		var pending: bool = _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()
		idle = 0 if _shell._operations.busy or pending or workbench._form_description.is_empty() else idle + 1

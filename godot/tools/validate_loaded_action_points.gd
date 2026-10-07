extends SceneTree

var _shell: Control


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var project := OS.get_environment("PROVIDENCE_ACTION_POINT_TEST_PROJECT")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	print("PROVIDENCE_LOADED_ACTION_POINTS_ADAPTER " + _shell._bridge._adapter_path())
	var opened: Dictionary = _shell._bridge.start_demo() if project.is_empty() else _shell._bridge.start_project(project)
	assert(opened.get("ok", false), str(opened))
	await _shell._activate_session(opened)
	assert(_shell._document_tabs.current_tab == _shell._documents.tab_for_route("scripts.action-points"))
	var ordinary: Control = _shell._documents.view("scripts.action-points")
	var extra: Control = _shell._documents.view("scripts.macros")
	await _check_route_viewports(ordinary, extra)
	await _check_linked_draft_navigation(ordinary, extra)
	if not project.is_empty():
		assert(await _shell._scripts.open_extra_action_point("extra-action-point:3"))
		var workbench: ProvidenceActionStepWorkbench = extra.get_node("%SemanticActionSteps")
		assert(workbench.focus_slot(4))
		await _settle_steps(workbench)
		assert(workbench._heading.text == "STEP 5  |  Battle")
		assert(workbench._field_controls.soundOrReviveLossMacro.field.label == "Sound To Play Before Battle")
		assert(workbench._field_controls.soundOrReviveLossMacro.field.targetKind == "sound")
		var sound_control: Control = workbench._field_controls.soundOrReviveLossMacro.control
		var sound_play := _button(sound_control.get_parent(), "▶ Play")
		var sound_stop := _button(sound_control.get_parent(), "■ Stop")
		var sound_open := _button(sound_control.get_parent(), "Open in Sounds")
		assert(sound_play.text == "▶ Play" and not sound_play.disabled)
		assert(sound_stop.text == "■ Stop" and not sound_stop.disabled)
		if int(sound_control.value) == 0:
			assert(sound_open.disabled and workbench._field_controls.soundOrReviveLossMacro.field.preview == null)
		else:
			assert(not sound_open.disabled)
			await _check_sound_history(extra, workbench, int(sound_control.value))
		assert(not workbench._target_value.get_parent().is_visible_in_tree())
		var outcome: OptionButton = workbench._field_controls.revivePartyFlag.control
		outcome.select(2)
		outcome.item_selected.emit(2)
		await _settle_steps(workbench)
		assert(workbench._field_controls.soundOrReviveLossMacro.field.label == "Extra Action Point On Revived Loss")
		assert(workbench._field_controls.soundOrReviveLossMacro.field.targetKind == "extra-action-point")
		workbench.discard_draft()
	_shell._close_project()
	_shell.queue_free()
	await process_frame
	print("PROVIDENCE_LOADED_ACTION_POINTS_OK populated=AP+XAP tabs=button-signals viewports=1600+1920 selected-heading=coherent optional-sound=checked linked-draft=apply-target-return")
	quit()


func _check_linked_draft_navigation(ordinary: Control, extra: Control) -> void:
	var target_identity: String = extra.selected_identity()
	assert(target_identity.begins_with("extra-action-point:"))
	var target_native_id := int(target_identity.get_slice(":", 1))
	await _shell._navigation.select_route("scripts.action-points")
	while _shell._operations.busy: await process_frame
	var origin_identity: String = ordinary.selected_identity()
	var original: String = ordinary._descriptor.text
	ordinary._descriptor.text = original + " linked-draft"
	ordinary._descriptor.text_changed.emit(ordinary._descriptor.text)
	await process_frame
	assert(ordinary.has_unapplied_changes())
	assert(_shell._draft_apply.has_draft())
	while _shell._operations.busy: await process_frame
	await _shell._navigation.open_script_target("extra-action-point", target_native_id, target_identity, {})
	var deadline := Time.get_ticks_msec() + 10000
	while not _shell._unapplied_dialog.visible:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
	await _shell._draft_navigation.apply_and_continue()
	deadline = Time.get_ticks_msec() + 10000
	while _shell._documents.identity_for_tab(_shell._document_tabs.current_tab) != "scripts.macros" or extra.selected_identity() != target_identity:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
	await _shell._navigation.navigate_back()
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == "scripts.action-points")
	assert(ordinary.selected_identity() == origin_identity)
	assert(not ordinary.has_unapplied_changes())


func _settle_steps(workbench: ProvidenceActionStepWorkbench) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		idle = 0 if _shell._operations.busy or workbench._form_description.is_empty() else idle + 1


func _check_sound_history(extra: Control, workbench: ProvidenceActionStepWorkbench, native_id: int) -> void:
	workbench._editor_scroll.scroll_vertical = 12
	var xap_identity: String = extra.selected_identity()
	_shell._navigation.clear_history()
	await _shell._open_script_sound(native_id)
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == "assets.sounds")
	assert(_shell._navigation.can_go_back())
	await _shell._navigation.navigate_back()
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == "scripts.macros")
	assert(extra.selected_identity() == xap_identity)
	assert(workbench.read_state().selectedSlot == 4)
	assert(_shell._navigation.can_go_forward())
	await _shell._navigation.navigate_forward()
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab) == "assets.sounds")
	await _shell._navigation.navigate_back()


func _check_route_viewports(ordinary: Control, extra: Control) -> void:
	for dimensions in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = dimensions
		await _press_route(extra, "ActionPointsRouteTab", "scripts.action-points")
		_check_populated(ordinary, true)
		await _press_route(ordinary, "ExtraActionPointsRouteTab", "scripts.macros")
		_check_populated(extra, false)


func _button(row: Control, caption: String) -> Button:
	for child in row.get_children():
		if child is Button and child.text == caption: return child
	assert(false, "Missing " + caption)
	return null


func _press_route(view: Control, name: String, route: String) -> void:
	var button := view.get_node("StoryRouteTabs/" + name) as Button
	assert(not button.disabled)
	button.pressed.emit()
	var expected: int = _shell._documents.tab_for_route(route)
	var deadline := Time.get_ticks_msec() + 10000
	while _shell._document_tabs.current_tab != expected or _shell._operations.busy:
		assert(Time.get_ticks_msec() < deadline, "Route button did not finish opening " + route)
		await process_frame


func _check_populated(view: Control, ordinary: bool) -> void:
	assert(view.get_node("StoryRouteTabs").get_child_count() == 4)
	var document: Dictionary = view.current_action_point() if ordinary else view.current_extra_action_point()
	assert(not document.is_empty())
	var legacy: Control = view.get_node("%ActionPointStepAuthoring" if ordinary else "%ExtraActionPointStepAuthoring")
	assert(not legacy.is_visible_in_tree())
	for name in (["ApplyActionPoint", "DiscardActionPoint"] if ordinary else ["ApplyExtraActionPoint", "DiscardExtraActionPoint"]):
		var button: Button = view.get_node("%" + name)
		assert(button.is_visible_in_tree())
		assert(Rect2(Vector2.ZERO, Vector2(root.size)).encloses(button.get_global_rect()))
	var steps: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	assert(steps.is_visible_in_tree() and steps._step_list.item_count == 8)
	assert(steps.focus_slot(4) and steps._heading.text.begins_with("STEP 5"))
	assert(steps.focus_slot(0) and steps._heading.text.begins_with("STEP 1"))
	assert(not steps.has_node("%SemanticOwnershipPanel"))
	assert(steps._gosub.get_global_rect().end.y <= root.size.y)
	assert(not view.has_unapplied_changes())
	assert(not view._validation.text.contains("Choose"), view._validation.text)
	if ordinary:
		for name in ["ActionPointChance", "ActionPointTriggerX", "ActionPointTriggerY", "ActionPointPostLevel", "ActionPointPostX", "ActionPointPostY"]:
			assert(view.get_node("%" + name).is_visible_in_tree(), name)


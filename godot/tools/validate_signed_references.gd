extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	func _prepare_project_start(path: String, _application: String, _reference: String, _monster: String, _require_snapshot := true) -> Dictionary:
		var library := OS.get_environment("PROVIDENCE_SIGNED_LIBRARY")
		var rules := OS.get_environment("PROVIDENCE_SIGNED_RULES")
		return {"ok": true, "arguments": PackedStringArray(["serve-native-project", path,
			"--native-client-id", "signed-reference-fixture", "--application-library-root", library,
			"--application-rules-root", rules]), "projectPath": path, "applicationLibrary": library,
			"referenceCatalog": "", "monsterLibrary": ""}

var _shell: Control
var _fixture := {}
var _output := ""
var _receipts: Array = []


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3)
	_output = args[1]
	_fixture = JSON.parse_string(FileAccess.get_file_as_string(args[2]))
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	if not _shell.startup_presentable: await _shell.startup_completed
	_shell._bridge.stop()
	_shell._bridge = Bridge.new(_output.path_join("settings.cfg"))
	var opened: Dictionary = _shell._bridge.start_project(args[0])
	assert(opened.get("ok", false), str(opened))
	assert((await _shell._activate_session(opened)).get("ok", false))
	await _placed()
	await _extra()
	for kind in ["simple", "complex"]: await _encounter(kind)
	await _shell._project_session.save()
	_shell._close_project()
	opened = _shell._bridge.start_project(args[0])
	assert(opened.get("ok", false), str(opened))
	assert((await _shell._activate_session(opened)).get("ok", false))
	assert(_read("action-point.open", _fixture.ap).actionPoint.actions[0].targetNativeId == -1103)
	var file := FileAccess.open(_output.path_join("native-result.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"status": "passed", "checks": _receipts, "savedReopened": true}, "\t"))
	file.close()
	_shell._close_project()
	_shell.queue_free()
	await process_frame
	print("SIGNED_REFERENCES_NATIVE_OK AP XAP Simple Complex checkbox resource-preservation history reopen")
	quit()


func _read(method: String, identity: String) -> Dictionary:
	var response: Dictionary = _shell._bridge.request(method, {"identity": identity,
		"expectedRevision": _shell._session_view.revision})
	assert(response.get("ok", false), str(response))
	return response.result


func _settle(workbench: ProvidenceActionStepWorkbench) -> void:
	var deadline := Time.get_ticks_msec() + 15000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline, "Signed form did not settle")
		await process_frame
		var draft: Dictionary = workbench._draft_steps.get(workbench._selected_slot, {})
		idle = 0 if _shell._operations.busy or bool(draft.get("descriptionPending", false)) or workbench._form_description.is_empty() else idle + 1


func _replace(workbench: ProvidenceActionStepWorkbench, slot: int, key: String, resource: int, kind: String, alternate := true) -> void:
	workbench.focus_slot(slot)
	await _settle(workbench)
	var descriptor: Dictionary = workbench._field_controls[key]
	var behavior := descriptor.behaviorControl as CheckBox
	assert(behavior != null and behavior.button_pressed == alternate)
	workbench._request_field_targets(key, kind)
	await _targets(workbench)
	workbench._target_search.text = str(resource)
	workbench._target_panel.hide()
	workbench._request_targets()
	await _targets(workbench)
	var selected := -1
	for index in workbench._target_results.item_count:
		if int(workbench._target_results.get_item_metadata(index).value) == resource: selected = index
	assert(selected >= 0, "Resource absent from the real target catalog: %s %s" % [kind,resource])
	workbench._accept_target(selected)
	assert(not workbench._target_panel.visible)
	assert(not workbench._field_renderer.accept_target(key, resource + 1, kind))
	# A second click before the new description must not restore the old resource.
	behavior.toggled.emit(false)
	await _settle(workbench)
	assert(ProvidenceActionFieldRenderer.value_of(workbench._field_controls[key].control) == (-resource if alternate else resource))


func _targets(workbench: ProvidenceActionStepWorkbench) -> void:
	var deadline := Time.get_ticks_msec() + 15000
	while not workbench._target_panel.visible or _shell._operations.busy:
		assert(Time.get_ticks_msec() < deadline, "Resource picker did not respond")
		await process_frame


func _toggle(workbench: ProvidenceActionStepWorkbench, key: String) -> void:
	var checkbox := workbench._field_controls[key].behaviorControl as CheckBox
	var value := ProvidenceActionFieldRenderer.value_of(workbench._field_controls[key].control)
	assert(not checkbox.disabled)
	checkbox.grab_focus()
	checkbox.button_pressed = not checkbox.button_pressed
	await _settle(workbench)
	assert(ProvidenceActionFieldRenderer.value_of(workbench._field_controls[key].control) == -value)
	var updated := workbench._field_controls[key].behaviorControl as CheckBox
	assert(workbench._field_controls[key].control.has_focus() if updated.disabled else updated.has_focus())


func _cycle(view: Control, method: String, identity: String, record: String, before: Dictionary) -> void:
	await view.commit_selected()
	assert(not view.has_unapplied_changes())
	var after := _state(method, identity, record)
	assert(after != before, "Apply did not change the record")
	await _shell._execute_history("undo")
	assert(_state(method, identity, record) == before)
	await _shell._execute_history("redo")
	assert(_state(method, identity, record) == after)
	_receipts.append({"identity": identity, "applied": true, "undo": true, "redo": true, "settingsHistory": true})


func _state(method: String, identity: String, record: String) -> Dictionary:
	var document := _read(method, identity)
	return {"record": document[record], "steps": document.steps}


func _placed() -> void:
	await _shell._navigation.select_route("scripts.action-points")
	assert(await _shell._scripts.open_action_point(_fixture.ap))
	var view: Control = _shell._documents.view("scripts.action-points")
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	var before := _state("action-point.open", _fixture.ap, "actionPoint")
	for row in [[0,1103,"sound"],[1,int(_fixture.messages[1]),"message"],
		[2,int(_fixture.shops[1]),"shop"],[3,int(_fixture.maps[1]),"player-map"],[4,2,"quest"]]:
		await _replace(workbench, row[0], "targetNativeId", row[1], row[2])
		await _toggle(workbench, "targetNativeId")
		if row[0] == 0:
			await _replace(workbench, 0, "targetNativeId", 1101, "sound", false)
			await _replace(workbench, 0, "targetNativeId", 1103, "sound", false)
		await _toggle(workbench, "targetNativeId")
		if row[0] in [1,4]: await _toggle(workbench, "targetNativeId")
	assert(workbench._field_renderer.accept_target("targetNativeId", 0, "quest"))
	await _settle(workbench)
	assert(workbench._field_controls.targetNativeId.behaviorControl.disabled)
	assert(workbench._field_controls.targetNativeId.behaviorControl.button_pressed)
	await _capture("zero-quest", workbench)
	assert(workbench._field_renderer.accept_target("targetNativeId", 2, "quest"))
	await _settle(workbench)
	await _toggle(workbench, "targetNativeId")
	workbench.focus_slot(0)
	await _settle(workbench)
	await _capture("direct-sound", workbench)
	await _cycle(view, "action-point.open", _fixture.ap, "actionPoint", before)


func _extra() -> void:
	await _shell._navigation.select_route("scripts.macros")
	assert(await _shell._scripts.open_extra_action_point(_fixture.xap))
	var view: Control = _shell._documents.view("scripts.macros")
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	var before := _state("extra-action-point.open", _fixture.xap, "extraActionPoint")
	for row in [[0,"targetNativeId",1103,"sound"], [1,"messageLow",int(_fixture.messages[1]),"message"],
		[1,"messageHigh",int(_fixture.messages[1]),"message"], [2,"shop",int(_fixture.shops[1]),"shop"],
		[3,"failureTarget",int(_fixture.messages[1]),"message"], [4,"soundOrReviveLossMacro",1103,"sound"],
		[4,"message",int(_fixture.messages[1]),"message"], [5,"sound",1103,"sound"],
		[6,"message",int(_fixture.messages[1]),"message"]]:
		await _replace(workbench, row[0], row[1], row[2], row[3])
	workbench.focus_slot(5)
	await _settle(workbench)
	assert(workbench._field_controls.message.get("behaviorControl") == null)
	workbench.focus_slot(4)
	await _settle(workbench)
	await _capture("extra-battle", workbench)
	workbench.focus_slot(2)
	await _settle(workbench)
	await _capture("restricted-shop", workbench)
	await _boundaries(workbench)
	await _cycle(view, "extra-action-point.open", _fixture.xap, "extraActionPoint", before)


func _set_field(workbench: ProvidenceActionStepWorkbench, key: String, value: int) -> void:
	var control: Control = workbench._field_controls[key].control
	if control is OptionButton:
		var selected := -1
		for index in control.item_count:
			if int(control.get_item_metadata(index)) == value: selected = index
		assert(selected >= 0, key)
		control.select(selected)
		control.item_selected.emit(selected)
	else:
		assert(control is SpinBox)
		control.value = value
	await _settle(workbench)


func _boundaries(workbench: ProvidenceActionStepWorkbench) -> void:
	workbench.focus_slot(3)
	await _settle(workbench)
	await _set_field(workbench, "failureBehavior", 1)
	assert(workbench._field_controls.failureTarget.get("behaviorControl") == null)
	await _set_field(workbench, "failureBehavior", 2)
	assert(workbench._field_controls.failureTarget.behaviorControl.button_pressed)
	workbench.focus_slot(4)
	await _settle(workbench)
	await _set_field(workbench, "revivePartyFlag", 10)
	await _toggle(workbench, "soundOrReviveLossMacro")
	var checkbox := workbench._field_controls.soundOrReviveLossMacro.behaviorControl as CheckBox
	assert(checkbox.disabled and not checkbox.button_pressed)
	checkbox.toggled.emit(true)
	assert(ProvidenceActionFieldRenderer.value_of(workbench._field_controls.soundOrReviveLossMacro.control) == 1103)
	await _capture("shared-revive", workbench)
	await _set_field(workbench, "revivePartyFlag", 0)
	await _toggle(workbench, "soundOrReviveLossMacro")
	workbench.focus_slot(6)
	await _settle(workbench)
	await _set_field(workbench, "playSound", 1)
	assert(workbench._field_controls.lowOrSound.behaviorControl.disabled)
	await _capture("shared-minimum", workbench)
	await _set_field(workbench, "playSound", 0)
	_receipts.append({"conditionalMessageRole": true, "sharedWordConstraints": true, "zeroQuest": true})


func _encounter(kind: String) -> void:
	var identity: String = _fixture[kind]
	await _shell._navigation.select_route("encounters." + kind)
	assert(await _shell._scripts.call("open_" + kind + "_encounter", identity))
	var view: Control = _shell._documents.view("encounters." + kind)
	var before := _state("encounter.open-" + kind, identity, "encounter")
	view._open_step(0)
	var workbench: ProvidenceActionStepWorkbench = view._step_dialog._workbench
	await _replace(workbench, 0, "targetNativeId", 1103, "sound")
	await _replace(workbench, 1, "targetNativeId", int(_fixture.messages[1]), "message")
	await _toggle(workbench, "targetNativeId")
	assert(view._step_dialog.accept_local_draft())
	view._step_dialog.hide()
	await _cycle(view, "encounter.open-" + kind, identity, "encounter", before)


func _capture(name: String, workbench: ProvidenceActionStepWorkbench) -> void:
	for size in [Vector2i(1600,900),Vector2i(1920,1080)]:
		root.size = size
		root.content_scale_size = size
		await _settle(workbench)
		for frame in 4: await process_frame
		for descriptor in workbench._field_controls.values():
			var checkbox = descriptor.get("behaviorControl")
			if checkbox is CheckBox:
				assert(checkbox.get_global_rect().end.x <= size.x)
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
			assert(root.get_texture().get_image().save_png(_output.path_join("%s-%d.png" % [name,size.x])) == OK)

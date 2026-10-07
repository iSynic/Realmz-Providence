extends SceneTree

var _workbench: ProvidenceActionStepWorkbench
var _searches: Array = []
var _opens: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_workbench = load("res://src/action_step_workbench.tscn").instantiate()
	root.add_child(_workbench)
	await process_frame
	_bind_core_projections(_workbench)
	_workbench.set_catalog(_catalog())
	_workbench.set_document("action-point:land:0:17", _steps(),
		{"mapIdentity": "land:0", "levelType": "land", "scriptKind": "action-point"})
	await process_frame
	_check_catalog_and_form()
	_check_single_record_draft()
	_check_target_picker()
	_check_map_tile_palette()
	_check_dungeon_cell_features()
	_check_map_tile_source_labels()
	_check_application_sound_controls()
	_check_player_option_defaults()
	_check_direct_authoring_projection()
	await _check_late_descriptions()
	await _check_parent_routes()
	print("PROVIDENCE_ACTION_STEP_WORKBENCH_OK actions=120 slots=8 draft=record semantic=core-described")
	quit()


func _check_player_option_defaults() -> void:
	var text := "Left: Yes · Right: No · Otherwise Extra Action Point 436"
	var summary := ProvidenceActionStepPresentation.outcome_summary(
		{"targetNativeId": 15}, {"opcode": 3}, {"summary": text})
	assert(summary.preview == "PREVIEW · " + text, "Godot must present the Rust summary, not reinterpret words")


func _check_direct_authoring_projection() -> void:
	var draft := {"slot": 0, "actionIdentity": "realmz.action.14", "gosub": false,
		"targetNativeId": 3, "authoringInput": {"modes": {"pickEligibility": 1}},
		"authoringProjection": {"controls": [{"memberFields": ["targetNativeId"]}],
			"resolvedValues": {"targetNativeId": -3}}}
	var ordered: Array = preload("res://src/action_step_draft_projection.gd").ordered({0: draft})
	assert(ordered.size() == 1 and int(ordered[0].targetNativeId) == -3)
	assert(not ordered[0].has("authoringInput") and not ordered[0].has("authoringProjection"))


func _bind_core_projections(workbench: ProvidenceActionStepWorkbench) -> void:
	workbench.form_describe_requested.connect(func(query, request_id, _slot):
		workbench.set_form_description(_description(query), request_id))
	workbench.target_search_requested.connect(func(query): _searches.append(query))
	workbench.peek_requested.connect(func(kind, native_id, identity, _context):
		_opens.append({"kind": kind, "nativeId": native_id, "identity": identity}))


func _check_late_descriptions() -> void:
	var view: ProvidenceActionStepWorkbench = load("res://src/action_step_workbench.tscn").instantiate()
	root.add_child(view)
	var requests: Array = []
	view.form_describe_requested.connect(func(query, request_id, slot):
		requests.append({"query": query, "id": request_id, "slot": slot}))
	view.set_catalog(_catalog())
	var steps := _steps()
	var second := (steps[0] as Dictionary).duplicate(true)
	second.slot = 1
	steps.append(second)
	view.set_document("action-point:land:0:17", steps)
	await process_frame
	var first := requests.back() as Dictionary
	view.focus_slot(1)
	var second_request := requests.back() as Dictionary
	var description := _description(first.query)
	description.authoring = {"controls": [], "resolvedValues": {}, "errors": ["First step needs content"]}
	view.set_form_description(description, first.id)
	assert(not view._draft_steps[0].descriptionPending)
	assert(view._form_description.is_empty(), "A background step response must not paint the selected step")
	view.set_form_description(_description(second_request.query), second_request.id)
	assert(str(view.draft_error_for_authoring().error).contains("First step needs content"))
	view.focus_slot(0)
	var current := requests.back() as Dictionary
	view.set_form_description(_description(current.query), current.id)
	view.set_form_description(description, first.id)
	assert(view.draft_error_for_authoring().is_empty(), "Obsolete response must not restore old errors")
	view.clear_document()
	view.set_form_description(description, current.id)
	assert(view._form_description.is_empty())
	view.queue_free()


func _check_catalog_and_form() -> void:
	var steps := _workbench.get_node("%SemanticStepList") as ProvidenceActionStepList
	assert(_workbench.get_node("%ChooseAction") is Button)
	assert(steps.item_count == 8)
	assert(steps.item_semantic_color(0) == ProvidenceActionStepList.GOLD)
	assert(ProvidenceActionStepList.semantic_color({"category": "Party"}) == ProvidenceActionStepList.BLUE)
	assert(not _workbench.has_node("%SemanticOwnershipPanel"))
	assert(not (_workbench.get_node("%SemanticGosub") as CheckBox).visible)
	_check_contextual_gosub()
	var editor_style := (_workbench.get_node("EditorPanel") as PanelContainer).get_theme_stylebox("panel") as StyleBoxFlat
	assert(editor_style.border_color == ProvidenceActionStepList.GOLD and editor_style.border_width_bottom == 2)
	assert(_workbench.get_node("%SemanticForm").get_child_count() == 2)
	assert(not _workbench.get_node("%SemanticTechnicalDetails").visible)
	assert(_workbench.find_child("SemanticSharedUpdate", true, false) == null)
	assert(not _workbench.has_unapplied_changes())


func _check_contextual_gosub() -> void:
	_workbench.focus_slot(2)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, "test.action.3"))
	assert((_workbench.get_node("%SemanticGosub") as CheckBox).visible)
	_workbench.discard_draft()
	_workbench.focus_slot(0)


func _check_single_record_draft() -> void:
	var baseline := _workbench.draft_steps().duplicate(true)
	(_workbench._field_controls.messageLow.control as SpinBox).value = 33
	assert(_workbench.has_unapplied_changes())
	_workbench.discard_draft()
	assert(_workbench.draft_steps() == baseline, "Discard must not read the discarded controls back into the restored record")
	var controls := _workbench._field_controls
	(controls.messageLow.control as SpinBox).value = 14
	assert(_workbench.has_unapplied_changes())
	_workbench.focus_slot(2)
	assert(_workbench._selected_slot == 2, "Slot navigation must retain, not commit, the record draft")
	_workbench.focus_slot(0)
	assert(int((_workbench._field_controls.messageLow.control as SpinBox).value) == 14)
	(_workbench.get_node("%SemanticMoveDown") as Button).pressed.emit()
	assert(_workbench._selected_slot == 1)
	var draft := _workbench.draft_steps()
	assert(draft.size() == 1 and draft[0].slot == 1)
	assert(draft[0].settings.values.messageLow == 14)
	(_workbench.get_node("%SemanticDuplicate") as Button).pressed.emit()
	draft = _workbench.draft_steps()
	assert(draft.size() == 2 and draft[1].settings.scope.mode == "preserve-references")
	(_workbench.get_node("%SemanticClear") as Button).pressed.emit()
	assert(_workbench.draft_steps().size() == 1)
	_workbench.discard_draft()
	assert(not _workbench.has_unapplied_changes())


func _check_target_picker() -> void:
	_workbench.focus_slot(2)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose(_workbench, "realmz.action.1"))
	var descriptor := _workbench._field_controls.targetNativeId as Dictionary
	var group := (descriptor.control as Control).get_parent()
	var find := descriptor.control as Button
	var open := group.get_child(2) as Button
	assert(open.text == "Edit String" and not open.disabled)
	open.pressed.emit()
	assert(_opens.pop_front() == {"kind": "message", "nativeId": 0, "identity": "message:0"})
	find.pressed.emit()
	var request := _searches.pop_front() as Dictionary
	assert(request.kind == "message")
	_workbench.set_target_page({"requestGeneration": request.requestGeneration, "items": [{"identity": "message:47", "value": 47,
		"label": "String 47", "detail": "Open the reliquary"}]})
	var results := _workbench.get_node("%SemanticTargetResults") as ItemList
	results.item_activated.emit(0)
	assert(_workbench.draft_steps().back().targetNativeId == 47)


func _check_map_tile_palette() -> void:
	var atlas_image := Image.create(64, 32, false, Image.FORMAT_RGBA8)
	atlas_image.fill(Color("496139"))
	_workbench.set_target_page({"requestGeneration": _workbench._target_generation,
		"items": [{"identity": "land:0:tile:2", "value": 2,
			"label": "Terrain tile 2", "detail": "Destination landlook tile.",
			"preview": "terrain:2"}, {"identity": "special-land.-91", "value": -1091,
			"label": "Violet Gate · cicn -91", "detail": "Scenario special tile.",
			"preview": "cicn:-91"}],
		"mapTileAtlas": {"available": true, "columns": 2, "tileWidth": 32,
			"tileHeight": 32, "base64": Marshalls.raw_to_base64(atlas_image.save_png_to_buffer()),
			"overlays": [{"resourceId": -91,
				"base64": Marshalls.raw_to_base64(atlas_image.get_region(Rect2i(0, 0, 32, 32)).save_png_to_buffer())}]}})
	var results := _workbench.get_node("%SemanticTargetResults") as ItemList
	assert(results.item_count == 2)
	assert(results.get_item_icon(0) != null, "Destination landlook choices need visual thumbnails")
	assert(results.get_item_icon(1) != null, "Resolved special-land choices need visual thumbnails")
	assert(results.get_item_text(0).contains("Destination landlook tile."))
	assert(not results.get_item_text(0).contains("terrain:2"))


func _check_dungeon_cell_features() -> void:
	var form := GridContainer.new()
	root.add_child(form)
	var renderer := ProvidenceActionFieldRenderer.new()
	var changes: Array = []
	var opens: Array = []
	renderer.changed.connect(func(key, value, binding): changes.append({"key": key, "value": value, "binding": binding}))
	renderer.open_requested.connect(func(kind, value, identity, context):
		opens.append({"kind": kind, "value": value, "identity": identity, "context": context}))
	var controls: Array = []
	for value in [["dungeon.wall", "Wall", 1], ["dungeon.verticalDoor", "Vertical door", 0],
		["dungeon.allowNorth", "Allow north", 1], ["dungeon.visibleArch", "Visible arch", 0]]:
		controls.append({"key": value[0], "label": value[1], "value": value[2],
			"choices": [{"value": 0, "label": "Off"}, {"value": 1, "label": "On"}],
			"memberFields": [], "activeFields": [], "display": ""})
	renderer.render(form, {"authoring": {"controls": controls}, "fields": [{"key": "tileValue",
		"row": "primary", "label": "Stored dungeon cell value", "value": 4353,
		"control": "integer", "editable": true, "visible": true, "preserved": false,
		"choices": [], "targetKind": null, "valuePickerKind": "map-tile",
		"targetContext": {"mapIdentity": "dungeon:2", "levelType": "dungeon"},
		"valuePickerPreview": {"identity": "dungeon:2:dungeon-cell:4353", "value": 4353,
			"label": "Dungeon cell · wall", "detail": "Classic dungeon bitfield 0x1101.",
			"status": "resolved"}}]})
	assert(renderer.controls.has("dungeon.wall") and renderer.controls.has("dungeon.visibleArch"))
	assert(form.get_child_count() == 2, "Named dungeon features should be grouped ahead of the exact word")
	var wall := renderer.controls["dungeon.wall"].control as OptionButton
	wall.select(0)
	wall.item_selected.emit(0)
	assert(changes.back() == {"key": "dungeon.wall", "value": 0, "binding": "authoring-mode"})
	var row := (renderer.controls.tileValue.control as Control).get_parent()
	var buttons: Array = row.get_children().filter(func(child): return child is Button)
	assert(buttons.map(func(button): return button.text) == ["Dungeon cell · wall", "Open destination map"])
	(buttons[1] as Button).pressed.emit()
	assert(opens == [{"kind": "map-tile", "value": 4353, "identity": "dungeon:2:dungeon-cell:4353",
		"context": {"mapIdentity": "dungeon:2", "levelType": "dungeon", "targetStatus": "resolved"}}])
	form.queue_free()


func _check_map_tile_source_labels() -> void:
	for case in [
		["compatibility-resource", "special-land.-91", "Open in Scenario Assets"],
		["application-resource", "classic-application:family-jewels:cicn:379", "Open in Stock Assets"],
	]:
		var form := GridContainer.new()
		root.add_child(form)
		var renderer := ProvidenceActionFieldRenderer.new()
		renderer.render(form, {"fields": [{"key": "tileValue", "row": "primary",
			"label": "Replacement visual", "value": -1091, "control": "integer",
			"editable": true, "visible": true, "preserved": false, "choices": [],
			"targetKind": null, "valuePickerKind": "map-tile",
			"targetContext": {"mapIdentity": "land:0", "levelType": "land"},
			"valuePickerPreview": {"identity": case[1], "label": "Violet Gate",
				"detail": "Resolved cicn artwork.", "status": case[0]}}]})
		var row := (renderer.controls.tileValue.control as Control).get_parent()
		var buttons: Array = row.get_children().filter(func(child): return child is Button)
		assert((buttons.back() as Button).text == case[2])
		form.queue_free()


func _check_application_sound_controls() -> void:
	var form := GridContainer.new()
	root.add_child(form)
	var renderer := ProvidenceActionFieldRenderer.new()
	var previews: Array = []
	var opens: Array = []
	renderer.preview_requested.connect(func(kind, value, identity, status):
		previews.append({"kind": kind, "value": value, "identity": identity, "status": status}))
	renderer.open_requested.connect(func(kind, value, identity, context):
		opens.append({"kind": kind, "value": value, "identity": identity, "context": context}))
	renderer.render(form, {"fields": [{"key": "targetNativeId", "row": "action",
		"label": "Sound", "value": 147, "control": "target", "targetKind": "sound",
		"editable": true, "preview": {"identity": "classic-application:family-jewels:snd:147",
			"status": "application-resource", "label": "Next/Previous", "detail": "Realmz stock · The Family Jewels"}}]})
	var row := (renderer.controls.targetNativeId.control as Control).get_parent()
	var buttons: Array = row.get_children().filter(func(child): return child is Button)
	assert(buttons.map(func(button): return button.text) == ["Next/Previous", "▶ Play", "■ Stop", "Open in Stock Library"])
	(buttons[1] as Button).pressed.emit()
	(buttons[3] as Button).pressed.emit()
	assert(previews == [{"kind": "sound", "value": 147, "identity": "classic-application:family-jewels:snd:147", "status": "application-resource"}])
	assert(opens[0].kind == "sound" and opens[0].identity == "classic-application:family-jewels:snd:147")
	assert(opens[0].context.targetStatus == "application-resource")
	form.queue_free()


func _check_parent_routes() -> void:
	for path in ["res://src/action_point_editor.tscn", "res://src/extra_action_point_editor.tscn"]:
		var route: Control = load(path).instantiate()
		root.add_child(route)
		await process_frame
		var semantic: ProvidenceActionStepWorkbench = route.find_child("SemanticActionSteps", true, false)
		_bind_core_projections(semantic)
		route.set_action_catalog(_catalog())
		var ordinary: bool = path.contains("/action_point_editor.")
		var record := {"identity": "action-point:land:0:17" if ordinary else "extra-action-point:17",
			"descriptor": "Moon Gate ambush" if ordinary else "Moon Gate battle",
			"nativeId": 17, "recordIndex": 17, "levelIndex": 0, "levelType": "land",
			"classicDoorId": 17, "coordinate": {"x": 4, "y": 5}, "chancePercent": 75,
			"postActionLevel": 0, "postActionX": 6, "postActionY": 7, "actions": []}
		route.set_document({"actionPoint" if ordinary else "extraActionPoint": record,
			"map": {"identity": "land:0", "levelType": "land", "name": "Test Land"},
			"steps": _steps(), "revision": 1})
		await process_frame
		var legacy := route.find_child("ActionPointStepAuthoring", true, false)
		if legacy == null: legacy = route.find_child("ExtraActionPointStepAuthoring", true, false)
		assert(legacy != null and not legacy.visible)
		assert(route.read_state().draft.steps.size() == 1)
		assert(route.read_state().draft.has("header"))
		assert(route.read_state().draft.descriptor == ("Moon Gate ambush" if ordinary else "Moon Gate battle"))
		route.queue_free()


func _description(query: Dictionary) -> Dictionary:
	var identity := str(query.actionIdentity)
	if identity == "realmz.action.19":
		return {"action": _catalog().items[0], "title": "Random Message", "available": true,
			"availabilityReason": null, "unresolvedFieldCount": 0, "editableFieldCount": 2,
			"evidence": {"kind": "source-supported", "status": "source-audited", "sources": [], "note": ""},
			"fields": [_field("messageLow", "First Message", int(query.values.get("messageLow", 0))),
				_field("messageHigh", "Last Message", int(query.values.get("messageHigh", 0)))]}
	return {"action": _catalog().items[1], "title": "Show Message", "available": true,
		"availabilityReason": null, "unresolvedFieldCount": 0, "editableFieldCount": 1,
		"evidence": {"kind": "source-supported", "status": "source-audited", "sources": [], "note": ""},
		"fields": [{"key": "targetNativeId", "index": null, "row": "action", "label": "Message",
			"explanation": "Scenario string displayed by this action.", "control": "target",
			"value": int(query.targetNativeId), "minimum": -32768, "maximum": 32767,
			"units": null, "choices": [], "specialValues": [], "targetKind": "message",
			"editable": true, "availabilityReason": null, "preserved": false,
			"applicableContext": "Any Action Point script.", "preservationPolicy": "Edit only here.",
			"preview": {"kind": "message", "identity": "message:%d" % int(query.targetNativeId),
				"value": int(query.targetNativeId), "label": "String %d" % int(query.targetNativeId), "detail": "Preview"},
			"evidence": {"kind": "source-supported", "status": "source-audited", "sources": [], "note": ""}}]}


func _field(key: String, label: String, value: int) -> Dictionary:
	return {"key": key, "index": 0, "row": "primary", "label": label,
		"explanation": "Inclusive message range endpoint.", "control": "integer", "value": value,
		"minimum": -32768, "maximum": 32767, "units": "message ID", "choices": [],
		"specialValues": [], "targetKind": null, "editable": true, "availabilityReason": null,
		"preserved": false, "applicableContext": "Any Action Point script.",
		"preservationPolicy": "Edit only here.", "preview": null,
		"evidence": {"kind": "source-supported", "status": "source-audited", "sources": [], "note": ""}}


func _catalog() -> Dictionary:
	var actions: Array = []
	for opcode in range(120):
		actions.append({"identity": "test.action.%d" % opcode, "opcode": opcode,
			"label": "Donor Action %03d" % opcode, "category": "Logic", "description": "Author action %d." % opcode,
			"storage": "direct-code-id", "targetKind": null, "formId": null, "selectable": true,
			"authoringLevel": "first-class", "gosubApplicable": opcode == 3})
	actions[0] = {"identity": "realmz.action.19", "opcode": 19, "label": "Show Random Message", "category": "Dialogue",
		"description": "Show one message from an inclusive range.", "storage": "extra-code-row", "targetKind": null,
		"formId": "random-message", "selectable": true, "authoringLevel": "first-class", "gosubApplicable": false}
	actions[1] = {"identity": "realmz.action.1", "opcode": 1, "label": "Show Message", "category": "Dialogue",
		"description": "Show a scenario message.", "storage": "direct-code-id", "targetKind": "message",
		"formId": null, "selectable": true, "authoringLevel": "first-class", "gosubApplicable": false}
	for action: Dictionary in actions:
		action.availabilityByScriptKind = {"action-point": {"available": true, "reason": null},
			"extra-action-point": {"available": true, "reason": null}}
	return {"items": actions, "forms": [_random_message_form()], "documentedActionCount": 120}


func _random_message_form() -> Dictionary:
	return {"identity": "random-message", "companionFormId": null, "fields": [
		{"index": 0, "name": "messageLow", "preserved": false},
		{"index": 1, "name": "messageHigh", "preserved": false},
		{"index": 2, "name": "reserved2", "preserved": true},
		{"index": 3, "name": "reserved3", "preserved": true},
		{"index": 4, "name": "reserved4", "preserved": true}]}


func _steps() -> Array:
	return [{"slot": 0, "rawOpcode": 19, "opcode": 19, "targetNativeId": 400,
		"definition": _catalog().items[0],
		"primarySettings": {"nativeId": 400, "typedValues": {"messageLow": 12, "messageHigh": 18}},
		"primaryUsage": {"status": "shared", "callerCount": 2}}]

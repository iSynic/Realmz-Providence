extends SceneTree


func _initialize() -> void:
	var action_point_scene := load("res://src/action_point_editor.tscn") as PackedScene
	var action_point := action_point_scene.instantiate()
	root.add_child(action_point)
	await process_frame

	var emitted: Array = []
	action_point.action_retarget_requested.connect(func(source: String, slot: int, target: int) -> void:
		emitted.append({"kind": "repair", "source": source, "slot": slot, "target": target})
	)
	action_point.message_open_requested.connect(func(target: int) -> void:
		emitted.append({"kind": "message", "target": target})
	)
	action_point.simple_encounter_open_requested.connect(func(target: int) -> void:
		emitted.append({"kind": "encounter", "target": target})
	)
	action_point.set_document({
		"revision": 1,
		"map": {"identity": "land:0", "name": "Half Truth"},
		"actionPoint": {
			"identity": "action-point:land:0:6",
			"levelIndex": 0,
			"recordIndex": 6,
			"classicDoorId": 6242,
			"coordinate": {"x": 42, "y": 62},
			"chancePercent": 100,
			"postActionLevel": 0,
			"postActionX": 42,
			"postActionY": 62,
			"actions": [
				{"slot": 3, "rawOpcode": 1, "targetNativeId": 19},
				{"slot": 4, "rawOpcode": 4, "targetNativeId": 1},
			],
		},
		"references": [
			{"source": "action-point:land:0:6", "field": "actions[3].target", "targetKind": "message", "targetId": "message:19", "resolution": "resolved"},
			{"source": "action-point:land:0:6", "field": "actions[4].target", "targetKind": "simple-encounter", "targetId": "simple-encounter:1", "resolution": "resolved"},
		],
		"extraCodeAttachments": [],
	})

	var actions := action_point.find_child("ActionPointActions", true, false) as Tree
	if not _select_tree_slot(actions, 3):
		_fail("Action Point slot 3 was not selectable")
		return
	(action_point.find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	if emitted.is_empty() or emitted.pop_front() != {"kind": "message", "target": 19}:
		_fail("Action Point message Peek did not preserve Message 19")
		return

	if not _select_tree_slot(actions, 4):
		_fail("Action Point slot 4 was not selectable")
		return
	(action_point.find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	if emitted.is_empty() or emitted.pop_front() != {"kind": "encounter", "target": 1}:
		_fail("Action Point encounter Peek did not preserve Simple Encounter 1")
		return

	if not _select_tree_slot(actions, 3):
		_fail("Action Point slot 3 could not be reselected")
		return
	(action_point.find_child("ActionPointSelectedTarget", true, false) as SpinBox).value = 20
	(action_point.find_child("RepairActionPointTarget", true, false) as Button).pressed.emit()
	if emitted.is_empty() or emitted.pop_front() != {"kind": "repair", "source": "action-point:land:0:6", "slot": 3, "target": 20}:
		_fail("Action Point repair did not commit the entered Message 20 target")
		return

	var extra_scene := load("res://src/extra_action_point_editor.tscn") as PackedScene
	var extra := extra_scene.instantiate()
	root.add_child(extra)
	await process_frame
	var extra_repairs: Array = []
	extra.action_retarget_requested.connect(func(source: String, slot: int, target: int) -> void:
		extra_repairs.append({"source": source, "slot": slot, "target": target})
	)
	extra.set_document({
		"revision": 2,
		"extraActionPoint": {
			"identity": "extra-action-point:7",
			"nativeId": 7,
			"legacyContext": 0,
			"actions": [{"slot": 0, "rawOpcode": 1, "targetNativeId": 30000}],
		},
		"references": [{"source": "extra-action-point:7", "field": "actions[0].target", "targetKind": "message", "targetId": "message:30000", "resolution": "missing"}],
		"extraCodeAttachments": [],
	})
	var extra_actions := extra.find_child("ExtraActionPointActions", true, false) as Tree
	if not _select_tree_slot(extra_actions, 0):
		_fail("Extra Action Point slot 0 was not selectable")
		return
	(extra.find_child("SelectedActionTarget", true, false) as SpinBox).value = 21
	(extra.find_child("RepairActionTarget", true, false) as Button).pressed.emit()
	if extra_repairs != [{"source": "extra-action-point:7", "slot": 0, "target": 21}]:
		_fail("Extra Action Point repair did not commit the entered Message 21 target")
		return

	if not await _repair_encounter_prompt(): return

	print("PROVIDENCE_REFERENCE_RETARGET_OK ap=20 xap=21 prompt=22")
	action_point.queue_free()
	extra.queue_free()
	await process_frame
	quit(0)


func _repair_encounter_prompt() -> bool:
	var encounter_scene := load("res://src/simple_encounter_editor.tscn") as PackedScene
	var encounter := encounter_scene.instantiate()
	root.add_child(encounter)
	await process_frame
	var prompt_repairs: Array = []
	encounter.encounter_apply_draft_requested.connect(func(draft: Dictionary) -> void:
		prompt_repairs.append({"source": draft.source, "target": draft.promptMessageNativeId})
	)
	encounter.set_document({
		"revision": 3,
		"encounter": {
			"identity": "simple-encounter:1",
			"nativeId": 1,
			"promptMessageNativeId": 30000,
			"texts": ["Continue", "", "", ""],
			"choiceResults": [0, 0, 0, 0],
			"actions": [],
		},
		"references": [{"source": "simple-encounter:1", "field": "promptMessage", "targetKind": "message", "targetId": "message:30000", "resolution": "missing"}],
	})
	encounter.set_prompt_page({"items":[{"nativeId":22,"preview":"Repaired prompt"}]})
	encounter.get_node("%Results").item_activated.emit(0)
	if not prompt_repairs.is_empty() or not encounter.has_unapplied_changes():
		_fail("Prompt picker wrote before Apply or failed to stage the target")
		return false
	encounter.discard_draft()
	if encounter.has_unapplied_changes() or encounter.read_state().draft.promptMessageNativeId != 30000:
		_fail("Discard lost the saved prompt or left its local choice dirty")
		return false
	encounter.get_node("%Results").item_activated.emit(0)
	await encounter.commit_selected()
	if prompt_repairs != [{"source": "simple-encounter:1", "target": 22}]:
		_fail("Simple Encounter prompt repair did not commit the entered Message 22 target")
		return false

	encounter.queue_free()
	return true


func _select_tree_slot(tree: Tree, slot: int) -> bool:
	if tree == null or tree.get_root() == null:
		return false
	var item := tree.get_root().get_first_child()
	while item != null:
		var metadata: Variant = item.get_metadata(0)
		if metadata is Dictionary and int((metadata as Dictionary).get("slot", -1)) == slot:
			item.select(0)
			tree.item_selected.emit()
			return true
		item = item.get_next()
	return false


func _fail(message: String) -> void:
	push_error("PROVIDENCE_REFERENCE_RETARGET_FAILED: %s" % message)
	quit(1)

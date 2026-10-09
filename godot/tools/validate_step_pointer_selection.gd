extends SceneTree

var _view: ProvidenceActionStepWorkbench
var _failed := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport_size
		_view = load("res://src/action_step_workbench.tscn").instantiate()
		root.add_child(_view); _view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		await process_frame
		var action := {"identity": "realmz.action.1", "opcode": 1, "label": "Show Message", "selectable": true}
		_view.set_catalog({"items": [action], "forms": []})
		var steps: Array = []
		for slot in 8: steps.append({"slot": slot, "definition": action, "rawOpcode": 1, "targetNativeId": 50 + slot})
		_view.set_document("action-point:land:0:54", steps)
		await process_frame; await process_frame
		var baseline := _view.draft_steps().duplicate(true)
		for slot in [1, 7, 0, 3, 2, 6, 5, 4, 0, 7, 7]:
			var button: Button = _view.get_node("%SemanticStepList").get_child(slot)
			var point := button.get_global_rect().get_center()
			_mouse(point, true); await process_frame
			# Command-state reads can occur between mouse down and mouse up.
			_view.read_state(); _view.has_unapplied_changes(); _view.draft_steps()
			_view.set_form_description({"action": action, "fields": [], "authoring": {}, "available": true}, _view._describe_generation)
			await process_frame
			_mouse(point, false); await process_frame
			if not _check(_view._selected_slot == slot, "One click did not select step %d" % (slot + 1)): return
			for index in 8:
				if not _check(_view.get_node("%SemanticStepList").get_child(index).button_pressed == (index == slot), "Step highlight does not match the selected detail"): return
			if not _check(_view.get_node("%SemanticStepHeading").text.begins_with("STEP %d " % (slot + 1)), "Detail does not match clicked step"): return
			if not _check(_view.draft_steps() == baseline, "Step selection changed authored values"): return
		for pair in [[KEY_UP, 6], [KEY_HOME, 0], [KEY_END, 7]]:
			var key := InputEventKey.new(); key.keycode = pair[0]; key.pressed = true
			root.push_input(key, true); await process_frame
			if not _check(_view._selected_slot == pair[1], "Keyboard selection lost its focused step after a click"): return
		_view.free(); await process_frame
	print("PROVIDENCE_STEP_POINTER_SELECTION_OK single-click repeated-switch command-reads draft-preserved both-viewports")
	quit(1 if _failed else 0)


func _mouse(point: Vector2, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
	event.position = point; event.global_position = point
	root.push_input(event, true)


func _check(value: bool, message: String) -> bool:
	if value: return true
	_failed = true; push_error(message); quit(1)
	return false

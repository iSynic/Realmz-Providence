extends SceneTree

const FILTERS := "ActionPointEditorSurface/ActionPointMasterDetail/ActionPointMasterPanel/Body/ActionPointFilters/"


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport_size
		var view = load("res://src/action_point_editor.tscn").instantiate()
		root.add_child(view); view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		await process_frame; await process_frame
		var queries: Array = []
		view.catalog_query_requested.connect(func(_identity): queries.append(view.list_query()))
		await _click(view.get_node(FILTERS + "All"))
		if not _check(queries.size() == 1 and queries.back().filter == "all", "All did not request its catalog"): return
		await _click(view.get_node(FILTERS + "CurrentMap"))
		if not _check(queries.size() == 2 and queries.back().filter == "current-map", "Current Map ignored a pointer click"): return
		if not _check(view.get_node(FILTERS + "CurrentMap").button_pressed and not view.get_node(FILTERS + "All").button_pressed, "Filter highlight does not match the request"): return
		view.free(); await process_frame
	print("PROVIDENCE_CURRENT_MAP_FILTER_OK pointer requests and active state at both viewports")
	quit()


func _click(button: Button) -> void:
	var point := button.get_global_rect().get_center()
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
		event.position = point; event.global_position = point
		root.push_input(event, true); await process_frame


func _check(value: bool, message: String) -> bool:
	if value: return true
	push_error(message); quit(1)
	return false

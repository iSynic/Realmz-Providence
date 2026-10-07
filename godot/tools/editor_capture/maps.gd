extends RefCounted

static func action_point(editor: Control, tree: SceneTree) -> bool:
	var map_identity := OS.get_environment("PROVIDENCE_CAPTURE_MAP_IDENTITY")
	var action_point_identity := OS.get_environment("PROVIDENCE_CAPTURE_ACTION_POINT_IDENTITY")
	var map_x := OS.get_environment("PROVIDENCE_CAPTURE_MAP_X").to_int()
	var map_y := OS.get_environment("PROVIDENCE_CAPTURE_MAP_Y").to_int()
	if map_identity.is_empty() or action_point_identity.is_empty():
		push_error("Map Action Point capture requires map and Action Point identities.")
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	editor._navigation.select_tab(1)
	editor._maps.reveal_coordinate(map_identity, map_x, map_y)
	for _frame in range(3):
		await tree.process_frame
	var map_canvas := editor.find_child("LandMapCanvas", true, false)
	if map_canvas == null:
		push_error("Map Action Point capture could not find the map canvas.")
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	map_canvas.call("zoom_in")
	map_canvas.call("activate_selected_action_point")
	for _frame in range(3):
		await tree.process_frame
	var action_point_editor := editor.find_child("Action Points", true, false)
	var opened := action_point_editor.call("current_action_point") as Dictionary if action_point_editor != null else {}
	if str(opened.get("identity", "")) != action_point_identity:
		push_error("Map Action Point capture did not open %s." % action_point_identity)
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	return true


static func linked_target(editor: Control, tree: SceneTree) -> bool:
	var action_point_identity := OS.get_environment("PROVIDENCE_CAPTURE_ACTION_POINT_IDENTITY")
	var slot := OS.get_environment("PROVIDENCE_CAPTURE_ACTION_SLOT").to_int()
	var expected_identity := OS.get_environment("PROVIDENCE_CAPTURE_EXPECTED_IDENTITY")
	if action_point_identity.is_empty() or expected_identity.is_empty():
		push_error("Action Point link capture requires an Action Point and expected target identity.")
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	editor._navigation.select_tab(5)
	if not bool(editor._scripts.open_action_point(action_point_identity)):
		push_error("Action Point link capture could not open %s." % action_point_identity)
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	for _frame in range(2):
		await tree.process_frame
	var action_point_editor := editor.find_child("Action Points", true, false)
	var action_tree := action_point_editor.find_child("ActionPointActions", true, false) as Tree if action_point_editor != null else null
	if not select_tree_slot(action_tree, slot):
		push_error("Action Point link capture could not select slot %d." % slot)
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	(action_point_editor.find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	for _frame in range(3):
		await tree.process_frame
	var actual_identity := ""
	if expected_identity.begins_with("message:"):
		actual_identity = str(editor._strings.selected_identity())
	elif expected_identity.begins_with("simple-encounter:"):
		var encounter_editor := editor.find_child("Simple Encounters", true, false)
		if encounter_editor != null:
			actual_identity = str((encounter_editor.call("current_encounter") as Dictionary).get("identity", ""))
	if actual_identity != expected_identity:
		push_error("Action Point link capture expected %s but opened %s." % [expected_identity, actual_identity])
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	return true


static func land(editor: Control, tree: SceneTree) -> bool:
	var capture_x := 18
	var capture_y := 23
	if not OS.get_environment("PROVIDENCE_CAPTURE_MAP_X").is_empty():
		capture_x = OS.get_environment("PROVIDENCE_CAPTURE_MAP_X").to_int()
	if not OS.get_environment("PROVIDENCE_CAPTURE_MAP_Y").is_empty():
		capture_y = OS.get_environment("PROVIDENCE_CAPTURE_MAP_Y").to_int()
	editor._navigation.select_tab(1)
	editor._maps.reveal_coordinate("land:0", capture_x, capture_y)
	for _frame in range(3):
		await tree.process_frame
	if OS.get_environment("PROVIDENCE_CAPTURE_MAP_MODE") == "paint":
		var map_inspector := editor.find_child("MapInspector", true, false)
		if map_inspector != null:
			var brush_tile := OS.get_environment("PROVIDENCE_CAPTURE_PAINT_TILE")
			if not brush_tile.is_empty():
				map_inspector.call("set_paint_tile_value", brush_tile.to_int())
		editor._maps.set_tool_mode("paint")
		await tree.process_frame
	var map_canvas := editor.find_child("LandMapCanvas", true, false)
	if map_canvas == null or str(map_canvas.call("render_atlas_identity")).is_empty() or int(map_canvas.call("render_overlay_count")) <= 0:
		push_error("Land Map capture requires a resolved source-artwork atlas and map overlays.")
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	return true


static func dungeon(editor: Control, tree: SceneTree) -> bool:
	var map_identity := OS.get_environment("PROVIDENCE_CAPTURE_MAP_IDENTITY")
	if map_identity.is_empty():
		map_identity = "dungeon:0"
	await editor._navigation.select_route("maps.dungeon")
	while editor._operations.busy:
		await editor._operations.completed
	await editor._maps.document.load_map(map_identity)
	for _frame in range(3):
		await tree.process_frame
	var map_canvas := editor.find_child("DungeonMapCanvas", true, false)
	var commit_button := editor.find_child("CommitSelectedTile", true, false) as Button
	if (
		map_canvas == null
		or str(map_canvas.call("render_atlas_identity")) != "dungeon-top-down-302"
		or str(map_canvas.call("render_mode")) != "dungeon-top-down"
		or commit_button == null
		or not commit_button.disabled
	):
		push_error("Dungeon Map capture requires the bounded Classic dungeon composition projection.")
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	return true


static func select_tree_slot(tree: Tree, slot: int) -> bool:
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



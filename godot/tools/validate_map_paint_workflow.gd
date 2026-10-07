extends SceneTree

class CheckedShell extends "res://src/editor_shell.gd":
	var reported_errors: Array[String] = []
	func _show_error(message: String) -> void:
		reported_errors.append(message)
		_status.text = message

class PaintBridge extends "res://src/native_bridge.gd":
	var paints: Array = []
	var reject_next := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "map.paint-cells":
			paints.append(params.duplicate(true))
			if reject_next:
				reject_next = false
				return {"ok": false, "error": "Controlled paint rejection"}
		return super._request(method, params)

var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"):
		_check(false, "A disposable map-paint output root is required")
		quit(1)
		return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	var shell = load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell)
	root.add_child(shell)
	await _frames(3)
	shell._bridge.stop()
	shell._bridge = PaintBridge.new(args[0].path_join("settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("map-paint-workflow", args[0].path_join("project"))
	if _check(created.get("ok", false), "Could not create paint project: " + str(created.get("error", ""))):
		await shell._activate_session(created)
		if await _create_maps(shell):
			await _exercise(shell)
	shell.free()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	await process_frame
	if not _failed: print("PROVIDENCE_MAP_PAINT_WORKFLOW_OK gesture=one-command markers=core-owned undo=visible redo=visible rejection=atomic context=guarded save=reopened")
	quit(1 if _failed else 0)


func _create_maps(shell) -> bool:
	for index in 2:
		if not _mutate(shell, "map.create", {"levelType": "land"}): return false
	if not _mutate(shell, "map.create", {"levelType": "dungeon"}): return false
	if not _mutate(shell, "action-point.create", {"mapIdentity": "land:1", "x": 4, "y": 3}): return false
	await shell._reload_map_catalog()
	await shell._maps.document.load_map("land:1")
	await shell._navigation.select_tab(1)
	return true


func _exercise(shell) -> void:
	await _frames(3)
	shell._maps.set_tool_mode("paint")
	shell._map_inspector.set_paint_tile_value(42)
	var canvas = shell._workbenches.land.get_node("%LandMapCanvas")
	var before := _tiles(shell, "land:1")
	var revision: int = shell._session_view.revision
	var commands: int = shell._bridge.paints.size()
	_press(canvas, Vector2i(2, 3))
	_motion(canvas, Vector2i(8, 3))
	_motion(canvas, Vector2i(3, 3))
	_check(shell._session_view.revision == revision and shell._bridge.paints.size() == commands and _tiles(shell, "land:1") == before, "Preview sent a mutation before release")
	_check(canvas._paint_preview_tile == 42 and canvas._tiles == before, "The canvas preview replaced its applied projection")
	shell._map_inspector.set_paint_tile_value(77)
	_release(canvas, Vector2i(8, 3))
	_check(shell._operations.busy and shell._operations.label == "Paint", "Paint did not show immediate busy feedback")
	await shell._undo()
	await shell._maps.paint.paint_cell(20, 20)
	_check(shell._operations.busy and shell._session_view.revision == revision, "A duplicate gesture or history press replaced the pending paint")
	await _settle(shell)
	_check(shell._session_view.revision == revision + 1 and shell._bridge.paints.size() == commands + 1, "A stroke was not exactly one revision and command")
	var request: Dictionary = shell._bridge.paints.back()
	_check(request.identity == "land:1" and int(request.expectedRevision) == revision and request.cells.size() == 7, "The gesture lost its map, revision or deduplicated cell set")
	var painted := _tiles(shell, "land:1")
	for x in range(2, 9):
		var expected := 1042 if x == 4 else 42
		_check(painted[270 + x] == expected and canvas._tiles[270 + x] == expected, "Core-normalized paint delta did not reach the native canvas at %d" % x)
	_check(painted[271] == before[271] and painted[279] == before[279], "Paint changed a cell outside its stroke")
	_check(shell._map_inspector.paint_tile_value() == 77 and int(request.cells[0].tile) == 42, "Changing the brush during a stroke rewrote its captured value")
	canvas.zoom_in()
	canvas.reveal_cell(40, 40)
	var zoom: int = canvas.zoom_percent()
	var pan: Vector2 = canvas.pan_offset()
	await shell._undo()
	_check(_tiles(shell, "land:1") == before and canvas._tiles == before, "One Undo failed to restore the entire stroke and visible map")
	_check(canvas.zoom_percent() == zoom and canvas.pan_offset() == pan, "Undo reset the author's map view")
	await shell._redo()
	_check(_tiles(shell, "land:1") == painted and canvas._tiles == painted, "One Redo failed to restore the entire stroke and visible map")
	_check(canvas.zoom_percent() == zoom and canvas.pan_offset() == pan, "Redo reset the author's map view")
	canvas.zoom_fit()
	await _exercise_rejections(shell, canvas)
	await _exercise_persistence(shell, canvas)
	await _exercise_viewport_input(shell, canvas)
	await _exercise_full_map(shell, canvas)
	_check(shell.reported_errors == ["Controlled paint rejection"], "The workflow reported an unexpected native or Save failure: " + str(shell.reported_errors))


func _exercise_rejections(shell, canvas) -> void:
	var before := _tiles(shell, "land:1")
	var revision: int = shell._session_view.revision
	var commands: int = shell._bridge.paints.size()
	_press(canvas, Vector2i(12, 13))
	_motion(canvas, Vector2i(18, 13))
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	canvas._input(escape)
	_release(canvas, Vector2i(18, 13))
	await _settle(shell)
	_check(shell._session_view.revision == revision and shell._bridge.paints.size() == commands and _tiles(shell, "land:1") == before, "Escape changed the project or retried on release")
	shell._bridge.reject_next = true
	_press(canvas, Vector2i(12, 13))
	_motion(canvas, Vector2i(18, 13))
	_release(canvas, Vector2i(18, 13))
	await _settle(shell)
	_check(shell._session_view.revision == revision and _tiles(shell, "land:1") == before and canvas._tiles == before, "Rejected stroke left a partial edit or false preview")
	_check(shell.reported_errors.back() == "Controlled paint rejection" and not canvas._paint_stroke.active, "Rejection lost its cause or retained a live gesture")
	commands = shell._bridge.paints.size()
	_press(canvas, Vector2i(12, 13))
	if not _mutate(shell, "map.update-cell", {"identity": "land:0", "x": 1, "y": 1, "tile": 2}): return
	_release(canvas, Vector2i(18, 13))
	await _settle(shell)
	_check(shell._bridge.paints.size() == commands and _tiles(shell, "land:1") == before, "An intervening revision let the draft overwrite newer state")
	_check(shell._status.text.contains("Start a new stroke"), "A stale draft did not explain the need for a new gesture")
	_press(canvas, Vector2i(12, 13))
	await shell._maps.document.load_map("land:0")
	_release(canvas, Vector2i(18, 13))
	await _settle(shell)
	_check(shell._bridge.paints.size() == commands and _tiles(shell, "land:1") == before, "A map switch committed the old stroke")
	await shell._maps.document.load_map("land:1")
	shell._maps.set_tool_mode("paint")
	await _frames(2)
	_press(canvas, Vector2i(12, 13))
	var project: String = shell._bridge.current_project_path()
	var reopened: Dictionary = shell._bridge.start_project(project)
	_check(reopened.get("ok", false), "Reconnect failed")
	_release(canvas, Vector2i(18, 13))
	await _settle(shell)
	_check(shell._bridge.paints.size() == commands and _tiles(shell, "land:1") == before, "An equal-revision reconnect accepted a stale gesture")
	await shell._activate_session(reopened)
	await shell._maps.document.load_map("dungeon:0")
	shell._maps.set_tool_mode("paint")
	await shell._maps.paint.paint_cell(12, 13)
	_check(shell._bridge.paints.size() == commands and shell._maps.mode == "select", "Land paint entered a dungeon through the native shell")
	await shell._maps.document.load_map("land:1")
	await shell._navigation.select_tab(1)
	shell._maps.set_tool_mode("paint")
	await _frames(2)


func _exercise_persistence(shell, canvas) -> void:
	shell._map_inspector.set_paint_tile_value(53)
	var revision: int = shell._session_view.revision
	var before := _tiles(shell, "land:1")
	_press(canvas, Vector2i(12, 13))
	_motion(canvas, Vector2i(18, 16))
	_release(canvas, Vector2i(18, 16))
	await _settle(shell)
	_check(shell._session_view.revision == revision + 1, "A fresh stroke could not follow cancellation and rejection")
	var expected := _tiles(shell, "land:1")
	await shell._project_session.save()
	var project: String = shell._bridge.current_project_path()
	var reopened: Dictionary = shell._bridge.start_project(project)
	_check(reopened.get("ok", false), "Saved map could not reopen")
	await shell._activate_session(reopened)
	await shell._maps.document.load_map("land:1")
	await shell._navigation.select_tab(1)
	await _frames(2)
	_check(_tiles(shell, "land:1") == expected and canvas._tiles == expected, "Save/reopen lost the multi-cell stroke")
	await shell._undo()
	var restored := _tiles(shell, "land:1")
	_check(restored == before and restored != expected and restored == canvas._tiles, "Durable Undo did not restore the whole final stroke")
	await shell._redo()
	_check(_tiles(shell, "land:1") == expected and canvas._tiles == expected, "Durable Redo did not restore the whole final stroke")


func _exercise_viewport_input(shell, canvas) -> void:
	root.size = Vector2i(1920, 1080)
	await _frames(3)
	shell._maps.set_tool_mode("paint")
	shell._map_inspector.set_paint_tile_value(61)
	var revision: int = shell._session_view.revision
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = canvas.get_global_transform_with_canvas() * _position(canvas, Vector2i(20, 20))
	root.push_input(press, true)
	var motion := InputEventMouseMotion.new()
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	motion.position = canvas.get_global_transform_with_canvas() * _position(canvas, Vector2i(26, 20))
	root.push_input(motion, true)
	_check(shell._session_view.revision == revision, "Viewport-routed motion committed before release")
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = motion.position
	root.push_input(release, true)
	await _settle(shell)
	_check(shell._session_view.revision == revision + 1 and _tiles(shell, "land:1")[1826] == 61, "Actual viewport input did not paint its captured stroke")
	_check(shell._bridge.paints.back().cells.size() == 7, "Viewport routing double-committed or missed cells")


func _exercise_full_map(shell, canvas) -> void:
	canvas.zoom_fit()
	shell._map_inspector.set_paint_tile_value(93)
	var before := _tiles(shell, "land:1")
	var revision: int = shell._session_view.revision
	_press(canvas, Vector2i(0, 0))
	for y in 90:
		var endpoint := 89 if y % 2 == 0 else 0
		_motion(canvas, Vector2i(89 - endpoint, y))
		_motion(canvas, Vector2i(endpoint, y))
	_release(canvas, Vector2i(0, 89))
	await _settle(shell)
	_check(shell._session_view.revision == revision + 1 and shell._bridge.paints.back().cells.size() == 8100, "A maximum-size stroke was split or truncated")
	var painted := _tiles(shell, "land:1")
	for index in 8100:
		_check(painted[index] == (1093 if index == 274 else 93), "Whole-map paint lost a cell or Action Point marker")
	await shell._undo()
	_check(_tiles(shell, "land:1") == before and canvas._tiles == before, "One Undo did not restore the maximum-size stroke")


func _mutate(shell, method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = shell._session_view.revision
	var response: Dictionary = shell._bridge.request(method, params)
	if not _check(response.get("ok", false), method + ": " + str(response.get("error", ""))): return false
	shell._session_view.apply(response.result)
	return true


func _tiles(shell, identity: String) -> Array:
	var opened: Dictionary = shell._bridge.request("map.open", {"identity": identity})
	if not _check(opened.get("ok", false), "Could not inspect " + identity): return []
	return opened.result.map.tiles


func _position(canvas, cell: Vector2i) -> Vector2:
	var cell_size: float = canvas._cell_size()
	return canvas._origin(cell_size) + (Vector2(cell) + Vector2(0.5, 0.5)) * cell_size


func _press(canvas, cell: Vector2i) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = _position(canvas, cell)
	canvas._gui_input(event)


func _motion(canvas, cell: Vector2i) -> void:
	var event := InputEventMouseMotion.new()
	event.button_mask = MOUSE_BUTTON_MASK_LEFT
	event.position = _position(canvas, cell)
	canvas._gui_input(event)


func _release(canvas, cell: Vector2i) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = canvas.get_global_transform_with_canvas() * _position(canvas, cell)
	canvas._input(event)


func _frames(count: int) -> void:
	for index in count: await process_frame


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_MAP_PAINT_WORKFLOW_FAILED " + message)
	return condition

func _settle(shell) -> void:
	while shell._operations.busy: await process_frame
	await process_frame

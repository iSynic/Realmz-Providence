extends SceneTree

const Values = preload("res://src/document_value_equality.gd")

class CheckedShell extends "res://src/editor_shell.gd":
	var reported_errors: Array[String] = []
	func _show_error(message: String) -> void:
		reported_errors.append(message)
		_status.text = message

class PaintBridge extends "res://src/native_bridge.gd":
	var paints: Array = []
	var reject_next := false
	var artwork_available := true
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "map.render-atlas":
			if not artwork_available: return {"ok": true, "result": {"available": false, "reason": "Controlled unavailable artwork"}}
			var opened: Dictionary = super._request("map.open", {"identity": params.identity})
			if not opened.get("ok", false): return opened
			var png := Image.create(640, 320, false, Image.FORMAT_RGBA8)
			for index in 200:
				png.fill_rect(Rect2i(Vector2i(index % 20, index / 20) * 32, Vector2i(32, 32)), Color(float(index) / 200.0, 0.3, 0.7))
			return {"ok": true, "result": {"available": true, "mapIdentity": params.identity,
				"tilesetId": opened.result.map.runtime.tilesetId, "renderMode": "outdoor-landlook",
				"sourceRole": "classic-application-fallback", "landlook": 0, "baseTile": 1,
				"tileWidth": 32, "tileHeight": 32, "columns": 20, "rows": 10,
				"base64": Marshalls.raw_to_base64(png.save_png_to_buffer())}}
		if method == "map.paint-terrain":
			paints.append(params.duplicate(true))
			if reject_next:
				reject_next = false
				return {"ok": false, "error": "Controlled terrain rejection"}
		return super._request(method, params)

var _failed := false
var _shell_under_test


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"):
		push_error("A disposable Paint workspace output root is required")
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
	shell._bridge = PaintBridge.new(args[0].path_join("workspace-settings.cfg"))
	print("PROVIDENCE_MAP_PAINT_WORKSPACE_ADAPTER ", shell._bridge._adapter_path())
	var created: Dictionary = shell._bridge.create_project("paint-workspace", args[0].path_join("workspace-project"))
	if _check(created.get("ok", false), "Could not create workspace project"):
		await shell._activate_session(created)
		if await _setup(shell): await _exercise(shell)
	shell.free()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	await process_frame
	if not _failed: print("PROVIDENCE_MAP_PAINT_WORKSPACE_OK atlas=rectangular keyboard=source-order terrain=metadata-safe special=replaceable undo=one-step save=reopened missing=paused")
	quit(1 if _failed else 0)


func _setup(shell) -> bool:
	for method in ["map.create", "map.create"]:
		if not _mutate(shell, method, {"levelType": "land"}): return false
	if not _mutate(shell, "map.update-cell", {"identity": "land:1", "x": 3, "y": 3, "tile": 0x6000 | 1112}): return false
	if not _mutate(shell, "map.update-cell", {"identity": "land:1", "x": 4, "y": 3, "tile": -3112}): return false
	if not _mutate(shell, "action-point.create", {"mapIdentity": "land:1", "x": 3, "y": 3}): return false
	await shell._reload_map_catalog()
	await shell._maps.document.load_map("land:1")
	await shell._navigation.select_tab(1)
	return true


func _exercise(shell) -> void:
	_shell_under_test = shell
	await _frames(4)
	await _layout_bounds(shell)
	await shell._maps.chrome.request_tool("paint")
	await _settle_paint(shell)
	var workspace = shell._maps.paint.workspace
	var dock = workspace.tiles_dock
	var atlas = dock.ui.atlas
	var canvas = shell._workbenches.land.get_node("%LandMapCanvas")
	_check(dock.visible and not shell._map_inspector.visible and dock.is_available(), "The persistent atlas did not replace the long paint inspector")
	_check(canvas.terrain_tiles.size() == 8100, "Core terrain projection was not delivered")
	workspace.show_technical_details()
	await _frames(2)
	_check(shell._map_inspector.is_visible_in_tree() and dock.visible, "Cell details displaced the persistent atlas")
	workspace.close_details()
	await _frames(2)
	_check(shell._map_inspector.get_parent() == shell._maps.chrome.land_inspector.get_node("%InspectorContent") and not shell._map_inspector.visible, "Closing cell details lost the shared inspector")
	await _check_atlas_selection(dock, atlas)
	dock.select_tile(156)
	var before := _tiles(shell)
	var revision: int = shell._session_view.revision
	_pointer(canvas, Vector2i(2, 3), true)
	_motion(canvas, Vector2i(5, 3))
	_check(shell._session_view.revision == revision and canvas._tiles == before, "Visual preview mutated canonical or applied cells")
	_check(canvas.terrain_preview.has(Vector2i(3, 3)) and canvas.terrain_preview.has(Vector2i(4, 3)), "Preview did not show artwork replacement beneath Action Points")
	_pointer(canvas, Vector2i(5, 3), false)
	await _settle_paint(shell)
	var painted := _tiles(shell)
	_check(shell._session_view.revision == revision + 1 and shell._bridge.paints.size() == 1, "Visual stroke was not one terrain command")
	_check(painted[273] == (0x6000 | 1156) and painted[274] == 156 and painted[272] == 156, "Terrain commit lost destination metadata or failed to replace artwork")
	_check(Values.equal(canvas._tiles, painted) and canvas.terrain_tiles[273] == 156, "Authoritative cells and derived terrain preview diverged")
	await shell._undo()
	_check(canvas._tiles == before and _tiles(shell) == before, "Undo did not restore the whole visual stroke")
	await shell._redo()
	_check(canvas._tiles == painted and _tiles(shell) == painted, "Redo did not restore the visual stroke")
	workspace.set_tool("sample")
	_pointer(canvas, Vector2i(3, 3), true)
	await _settle_paint(shell)
	_check(dock.brush.cells == [156] and shell._maps.mode == "paint", "Sampling copied marker bits instead of revealing the terrain tile")
	workspace.set_tool("sample")
	_pointer(canvas, Vector2i(4, 3), true)
	await _settle_paint(shell)
	_check(dock.brush.cells == [156] and shell._maps.mode == "paint", "Sampling replaced artwork did not reveal its current terrain")
	await _rejections(shell, canvas, dock, atlas)
	await _raw_edit_sampling(shell, canvas, dock, workspace)
	await _undo_repaint(shell, canvas, dock)
	await shell._project_session.save()
	var expected := _tiles(shell)
	var reopened: Dictionary = shell._bridge.start_project(shell._bridge.current_project_path())
	_check(reopened.get("ok", false), "Paint workspace could not reopen its saved project")
	await shell._activate_session(reopened)
	await shell._maps.document.load_map("land:1")
	await shell._navigation.select_tab(1)
	await _frames(3)
	_check(_tiles(shell) == expected and canvas._tiles == expected and dock.is_available(), "Reopen lost terrain or the visual atlas")
	_check(shell.reported_errors == ["Controlled terrain rejection"], "Unexpected workspace errors: " + str(shell.reported_errors))
	await _empty_history(shell)
	_check(shell.reported_errors == ["Controlled terrain rejection"], "History transitions reported unexpected errors: " + str(shell.reported_errors))


func _layout_bounds(shell) -> void:
	for viewport_size in [Vector2i(1600, 900), Vector2i(1920, 1080), Vector2i(3440, 1369)]:
		root.size = viewport_size
		root.content_scale_size = Vector2i(1600, 900) if viewport_size.x == 3440 else viewport_size
		await _frames(8)
		await shell._navigation.activate_domain("maps", false)
		shell._maps.present_paint_workspace()
		await _frames(8)
		var sidebar: Control = shell._map_context_sidebar
		var boundary: float = shell._document_inspector_split.get_global_rect().position.x
		_check(is_equal_approx(shell._explorer_panel.size.x, 300.0) and is_equal_approx(boundary - shell.get_node("Workspace").position.x, 312.0), "Land profile lost its approved 300-pixel explorer at " + str(viewport_size))
		print("PROVIDENCE_PAINT_LAYOUT ", JSON.stringify({"window": str(viewport_size), "viewport": str(root.get_visible_rect().size), "sidebar": str(sidebar.get_global_rect()), "explorer": str(shell._explorer_panel.get_global_rect()), "documentLeft": boundary}))
		_check(sidebar.get_global_rect().end.x <= boundary, "Map browser extends beneath the document at " + str(viewport_size))
		_check(shell._explorer_panel.size.x <= shell.get_node("%ExplorerHost").size.x, "Map browser kept its previous route width at " + str(viewport_size))
		var overlaps: Array[String] = []
		for child in sidebar.find_children("*", "Control", true, false):
			if child.is_visible_in_tree():
				if child.get_global_rect().end.x > boundary: overlaps.append(str(child.name))
		_check(overlaps.is_empty(), "Map browser controls overlap the document at %s: %s" % [viewport_size, overlaps])
	root.size = Vector2i(1600, 900)
	root.content_scale_size = root.size
	await _frames(8)


func _undo_repaint(shell, canvas, dock) -> void:
	var before := _tiles(shell)
	dock.select_tile(164)
	_pointer(canvas, Vector2i(24, 24), true)
	_pointer(canvas, Vector2i(24, 24), false)
	await _settle_paint(shell)
	var revision: int = shell._session_view.revision
	await _click_button(shell._undo_button)
	_check(shell._session_view.revision == revision + 1 and Values.equal(canvas._tiles, before), "One toolbar Undo did not visibly restore exactly one stroke")
	dock.select_tile(90)
	_pointer(canvas, Vector2i(25, 24), true)
	_pointer(canvas, Vector2i(25, 24), false)
	await _settle_paint(shell)
	var branched := _tiles(shell)
	_check(shell._session_view.revision == revision + 2 and branched[2185] == 90 and shell._redo_button.disabled, "Painting after Undo lost the map or retained the abandoned redo branch")
	await _history_shortcut(false)
	await _frames(2)
	_check(shell._session_view.revision == revision + 3 and Values.equal(canvas._tiles, before), "One Ctrl+Z did not visibly restore exactly one stroke")
	await _history_shortcut(true)
	await _frames(2)
	_check(shell._session_view.revision == revision + 4 and Values.equal(canvas._tiles, branched), "One Ctrl+Shift+Z did not restore exactly one stroke")


func _empty_history(shell) -> void:
	var project: String = shell._bridge.current_project_path().get_base_dir().path_join("empty-history-project")
	var created: Dictionary = shell._bridge.create_project("empty-map-history", project)
	if not _check(created.get("ok", false), "Could not create map-history project"): return
	await shell._activate_session(created)
	if not _mutate(shell, "map.create", {"levelType": "land"}): return
	await shell._load_first_map()
	await shell._navigation.select_tab(1)
	await _frames(3)
	var workspace = shell._maps.paint.workspace
	var canvas = shell._workbenches.land.get_node("%LandMapCanvas")
	await _click_button(shell._undo_button)
	_check(shell._maps.document.maps.is_empty() and shell._maps.document.identity.is_empty() and canvas._tiles.is_empty(), "Undoing the last map left stale map identity or artwork")
	_check(not workspace.tiles_dock.is_available() and shell._map_context_sidebar.paint_tool.disabled and shell._documents.view("scripts.action-points").current_map_identity().is_empty(), "An absent map retained a usable brush or Action Point target")
	var revision: int = shell._session_view.revision
	await _history_shortcut(false)
	await _frames(2)
	_check(shell._session_view.revision == revision, "Undo crossed the empty history boundary")
	await _click_button(shell._redo_button)
	_check(shell._maps.document.identity == "land:0" and canvas._tiles.size() == 8100 and workspace.tiles_dock.is_available(), "Redo did not restore the map and atlas after an empty state")
	workspace.tiles_dock.select_tile(164)
	_pointer(canvas, Vector2i(10, 10), true)
	_pointer(canvas, Vector2i(10, 10), false)
	await _settle_paint(shell)
	_check(canvas._tiles[910] == 164, "The restored map could not be painted")


func _click_button(button: Button) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = button.get_global_rect().get_center()
	event.pressed = true
	root.push_input(event, true)
	event.pressed = false
	root.push_input(event, true)
	await _frames(2)
	await _wait_history()


func _history_shortcut(redo: bool) -> void:
	root.gui_release_focus()
	var event := InputEventKey.new()
	event.keycode = KEY_Z
	event.ctrl_pressed = true
	event.shift_pressed = redo
	event.pressed = true
	root.push_input(event, true)
	event.pressed = false
	root.push_input(event, true)
	await _frames(2)
	await _wait_history()


func _wait_history() -> void:
	while _shell_under_test != null and _shell_under_test._operations.busy:
		await process_frame


func _raw_edit_sampling(shell, canvas, dock, workspace) -> void:
	shell._map_inspector.set_paint_tile_value(77)
	shell._map_inspector.raw_brush_changed.emit()
	shell._maps.set_tool_mode("paint")
	await shell._maps.paint.paint_cell(12, 12)
	_check(canvas.terrain_tiles[1092] == 77, "Numeric painting did not refresh the core-derived terrain projection")
	workspace.set_tool("sample")
	_pointer(canvas, Vector2i(12, 12), true)
	_check(dock.brush.cells == [77], "Sampling after a numeric edit reused stale terrain")
	shell._map_inspector.set_paint_tile_value(-3112)
	shell._map_inspector.raw_brush_changed.emit()
	shell._maps.set_tool_mode("paint")
	await shell._maps.paint.paint_cell(12, 12)
	_check(canvas.terrain_tiles[1092] == null, "Special artwork retained a stale ordinary-terrain projection")
	workspace.set_tool("sample")
	_pointer(canvas, Vector2i(12, 12), true)
	_check(dock.brush.cells == [77] and shell._status.text.contains("special artwork"), "Special artwork sampled the preceding numeric tile")
	shell._workbenches.land.select_cell(12, 12)
	workspace.show_technical_details()
	await _frames(2)
	shell._map_inspector.set_tile_value(81)
	await shell._maps.paint.commit_cell()
	await _frames(2)
	_check(shell._map_inspector.is_visible_in_tree() and workspace._details.visible, "Applying selected-cell details hid the dialog's controls")
	_check(canvas.terrain_tiles[1092] == 81, "Selected-cell editing did not refresh derived terrain")
	workspace.close_details()
	await _frames(2)
	workspace.set_tool("sample")
	_pointer(canvas, Vector2i(12, 12), true)
	_check(dock.brush.cells == [81], "Sampling after a selected-cell edit reused stale terrain")


func _rejections(shell, canvas, dock, atlas) -> void:
	_atlas_drag(atlas, Vector2i.ZERO, Vector2i.ONE)
	var before := _tiles(shell)
	var revision: int = shell._session_view.revision
	var count: int = shell._bridge.paints.size()
	_pointer(canvas, Vector2i(89, 89), true)
	_pointer(canvas, Vector2i(89, 89), false)
	await _settle_paint(shell)
	_check(shell._session_view.revision == revision and shell._bridge.paints.size() == count and _tiles(shell) == before, "An out-of-map multi-tile brush was partially applied")
	_pointer(canvas, Vector2i(10, 10), true)
	_pointer(canvas, Vector2i(10, 10), false)
	await _settle_paint(shell)
	_check(_tiles(shell)[910] == 1 and _tiles(shell)[911] == 2 and _tiles(shell)[1000] == 21 and _tiles(shell)[1001] == 22, "Multi-tile painting changed source arrangement")
	dock.select_tile(60)
	before = _tiles(shell)
	revision = shell._session_view.revision
	shell._bridge.reject_next = true
	_pointer(canvas, Vector2i(20, 20), true)
	_pointer(canvas, Vector2i(20, 20), false)
	await _settle_paint(shell)
	_check(shell._session_view.revision == revision and _tiles(shell) == before and Values.equal(canvas._tiles, before), "Rejected terrain commit left a false edit")
	_pointer(canvas, Vector2i(20, 20), true)
	shell._bridge.artwork_available = false
	await shell._maps.document.load_map("land:1")
	_pointer(canvas, Vector2i(20, 20), false)
	await _settle_paint(shell)
	count = shell._bridge.paints.size()
	shell._maps.set_tool_mode("paint")
	_pointer(canvas, Vector2i(20, 20), true)
	_pointer(canvas, Vector2i(20, 20), false)
	await _settle_paint(shell)
	_check(not dock.is_available() and shell._bridge.paints.size() == count and _tiles(shell) == before, "Unavailable artwork silently fell back to raw numeric painting")
	shell._bridge.artwork_available = true
	await shell._maps.document.load_map("land:1")
	await shell._maps.chrome.request_tool("paint")
	root.size = Vector2i(1920, 1080)
	await _frames(3)
	_check(dock.visible and dock.size.x >= 352 and canvas.size.x > 600, "Primary viewport lost the persistent atlas or canvas")


func _atlas_drag(atlas, start: Vector2i, finish: Vector2i) -> void:
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = Vector2(start * 32) + Vector2(16, 16)
	atlas._gui_input(press)
	var motion := InputEventMouseMotion.new()
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	motion.position = Vector2(finish * 32) + Vector2(16, 16)
	atlas._gui_input(motion)
	press.pressed = false
	press.position = motion.position
	atlas._gui_input(press)


func _pointer(canvas, cell: Vector2i, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.position = canvas._origin(canvas._cell_size()) + (Vector2(cell) + Vector2(0.5, 0.5)) * canvas._cell_size()
	canvas._gui_input(event)


func _motion(canvas, cell: Vector2i) -> void:
	var event := InputEventMouseMotion.new()
	event.button_mask = MOUSE_BUTTON_MASK_LEFT
	event.position = canvas._origin(canvas._cell_size()) + (Vector2(cell) + Vector2(0.5, 0.5)) * canvas._cell_size()
	canvas._gui_input(event)


func _mutate(shell, method: String, params: Dictionary) -> bool:
	params["expectedRevision"] = shell._session_view.revision
	var response: Dictionary = shell._bridge.request(method, params)
	if not _check(response.get("ok", false), method + ": " + str(response.get("error", ""))): return false
	shell._session_view.apply(response.result)
	return true


func _tiles(shell) -> Array:
	var opened: Dictionary = shell._bridge.request("map.open", {"identity": "land:1"})
	return opened.result.map.tiles if _check(opened.get("ok", false), "Map read failed") else []


func _frames(count: int) -> void:
	for index in count: await process_frame


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_MAP_PAINT_WORKSPACE_FAILED " + message)
	return condition

func _settle_paint(shell) -> void:
	while shell._operations.busy: await process_frame
	await process_frame


func _check_atlas_selection(dock, atlas) -> void:
	dock.select_tile(1)
	await _frames(2)
	var atlas_click := InputEventMouseButton.new()
	atlas_click.button_index = MOUSE_BUTTON_LEFT
	atlas_click.pressed = true
	atlas_click.position = atlas.get_global_transform_with_canvas() * Vector2(48, 80)
	root.push_input(atlas_click, true)
	atlas_click.pressed = false
	root.push_input(atlas_click, true)
	await process_frame
	_check(dock.brush.cells == [42], "Viewport-routed atlas click did not select its source tile")
	_atlas_drag(atlas, Vector2i.ZERO, Vector2i.ONE)
	_check(dock.brush.cells == [1, 2, 21, 22] and int(dock.brush.width) == 2, "Atlas drag lost source rows or rectangular geometry")
	dock.select_tile(1)
	var key := InputEventKey.new()
	key.pressed = true
	key.keycode = KEY_DOWN
	atlas._gui_input(key)
	_check(dock.brush.cells == [21], "Arrow keys did not follow source atlas columns")
	dock.select_tile(23)
	key.keycode = KEY_LEFT
	key.shift_pressed = true
	atlas._gui_input(key)
	atlas._gui_input(key)
	_check(dock.brush.cells == [21, 22, 23], "Repeated Shift+Left did not extend from the keyboard cursor")
	var before_enlarge: Dictionary = dock.brush.duplicate(true)
	dock._enlarge()
	dock._expanded_atlas.select_tile(60)
	dock._expanded.hide()
	_check(dock.brush == before_enlarge, "Canceling the enlarged atlas replaced the active brush")
	dock._enlarge()
	dock._expanded_atlas.select_tile(60)
	dock._expanded.confirmed.emit()
	dock._expanded.hide()
	_check(dock.brush.cells == [60], "Use brush did not accept the enlarged atlas selection")
	key.keycode = KEY_LEFT
	key.shift_pressed = true
	atlas._gui_input(key)
	_check(dock.brush.cells == [59, 60], "Accepting the enlarged selection left a stale keyboard anchor")
	dock.ui.search.text = "tile:156"
	dock.ui.search.text_changed.emit(dock.ui.search.text)
	_check(dock.ui.results.item_count == 1 and int(dock.ui.results.get_item_metadata(0)) == 156, "Exact tile search did not find the source slot")
	dock.ui.results.item_selected.emit(0)
	var active: Dictionary = dock.brush.duplicate(true)
	dock.ui.search.text = "no-such-tile"
	dock.ui.search.text_changed.emit(dock.ui.search.text)
	_check(dock.ui.empty.visible and dock.brush == active, "Empty search replaced the active brush")

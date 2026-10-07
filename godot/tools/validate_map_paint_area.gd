extends "res://tools/validate_map_paint_workspace.gd"

class AreaBridge extends PaintBridge:
	var intent_writes := 0
	var reject_intent := false
	var drop_intent := false
	var drop_before_intent := false
	var drop_preview := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "map.apply-intent" and drop_before_intent:
			drop_before_intent = false
			var other: Dictionary = super._request("map.update-cell", {"identity": "land:0", "expectedRevision": params.expectedRevision, "x":88,"y":88,"tile":14})
			assert(other.ok)
			var original: Dictionary = super._request(method, params)
			assert(not original.ok)
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled unsubmitted area reply loss"}
		if method == "map.apply-intent" and reject_intent:
			reject_intent = false
			return {"ok": false, "error": "Controlled area rejection"}
		var response: Dictionary = super._request(method, params)
		if method == "map.preview-intent" and drop_preview:
			drop_preview = false
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled area preview reply loss"}
		if method == "map.apply-intent" and response.get("ok", false):
			intent_writes += 1
			if drop_intent:
				drop_intent = false
				return {"ok": false, "outcomeUnknown": true, "error": "Controlled area reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"):
		push_error("A disposable Paint area output root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3)
	shell._bridge.stop(); shell._bridge = AreaBridge.new(args[0].path_join("area-settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("land-area", args[0].path_join("area-project"))
	if _check(created.get("ok", false), "Area project could not be created"):
		await shell._activate_session(created)
		if await _setup(shell): await _exercise_area(shell)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_AREA_OK populated-options cancel-focus shapes selection-add-subtract connected-fill preview-pure exact-impact artwork-replaced one-history rejected-retained uncertain-reconciled no-replay stale save-reopen teardown")
	quit(1 if _failed else 0)


func _exercise_area(shell) -> void:
	await shell._maps.document.load_map("land:1"); await shell._navigation.select_tab(1); await _frames(4)
	var author = shell._maps.land_authoring
	var workspace = shell._maps.paint.workspace
	var revision: int = shell._session_view.revision
	workspace.tiles_dock.select_tile(5)
	workspace.set_tool("shapes"); await _frames(2)
	_check(author._options.visible and author._options.get_node("%Shape").has_focus(), "Options did not focus its shape picker")
	author._options.get_node("%Shape").select(2); author._options.close()
	_check(author.options.shape == "freehand" and not author.has_unapplied_changes(), "Cancel changed local options or created a draft")
	_check(shell._workbenches.land.get_node("PaintTools/Shapes").has_focus(), "Options Cancel did not restore focus")
	workspace.set_tool("shapes"); author._options.get_node("%Shape").select(2); author._options._accept()
	_check(author.options.shape == "rectangle", "Use options did not accept rectangle")
	await _shape_selection(shell, author, workspace)
	await _review_and_history(shell, author)
	await _gesture_operations(shell, author, workspace)
	await _failure_recovery(shell, author)
	await _unsubmitted_recovery(shell, author)
	await _read_recovery(shell, author)
	await _pointer_and_keyboard(shell, author)
	_check(shell._session_view.revision > revision, "Area authoring never committed a command")
	await shell._project_session.save()
	var expected := _tiles(shell)
	var reopened: Dictionary = shell._bridge.start_project(shell._bridge.current_project_path())
	_check(reopened.get("ok", false), "Area project could not reopen")
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1"); await shell._navigation.select_tab(1); await _frames(3)
	_check(_tiles(shell) == expected, "Save/reopen lost area writes")
	_check(shell.reported_errors == ["Controlled area rejection", "Controlled area reply loss", "Controlled unsubmitted area reply loss", "Controlled area preview reply loss"], "Unexpected area errors: " + str(shell.reported_errors))


func _shape_selection(shell, author, workspace) -> void:
	workspace.set_tool("select")
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	_start(author, Vector2i(2, 3)); author._overlay.gesture_changed.emit(Vector2i(2, 3), Vector2i(4, 4), [Vector2i(2, 3), Vector2i(4, 4)])
	await _settle_area(shell, author)
	_check(author._overlay.preview.size() == 6 and _tiles(shell) == before and shell._session_view.revision == revision, "Selection preview mutated the map or lost bounds")
	author.cancel_gesture(); _check(author.selected.is_empty(), "Escape accepted provisional selection")
	await _drag(author, Vector2i(2, 3), Vector2i(4, 4))
	_check(author.selected.size() == 6 and shell._session_view.revision == revision, "Rectangle selection was not local")
	author.options.combine = "add"; await _drag(author, Vector2i(6, 3), Vector2i(6, 3))
	_check(author.selected.size() == 7, "Add selection lost existing cells")
	author.options.combine = "subtract"; await _drag(author, Vector2i(6, 3), Vector2i(6, 3))
	_check(author.selected.size() == 6, "Subtract selection did not remove the exact cell")
	author.options.combine = "replace"


func _review_and_history(shell, author) -> void:
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	await author.review_selection("paint")
	_check(author._review.visible and author._review.get_node("%ReviewCounts").text.contains("changed"), "Area impact did not open with change counts")
	_check(_tiles(shell) == before and shell._session_view.revision == revision, "Area impact wrote before acceptance")
	author.discard_draft(); _check(_tiles(shell) == before, "Area Cancel wrote cells")
	await author.review_selection("paint"); var response: Dictionary = await author.commit_selected()
	_check(response.get("ok", false) and shell._session_view.revision == revision + 1, "Area Apply was not one command")
	var painted := _tiles(shell)
	_check(painted[273] == (0x6000 | 1005) and painted[274] == 5 and painted[272] == 5, "Area write lost markers or failed to replace artwork")
	await shell._undo(); _check(_tiles(shell) == before, "Area Undo did not restore exact cells")
	await shell._redo(); _check(_tiles(shell) == painted, "Area Redo did not restore exact cells")


func _gesture_operations(shell, author, workspace) -> void:
	var erase: Dictionary = shell._bridge.request("map.paint-options", {"identity":"land:1", "expectedRevision": shell._session_view.revision})
	_check(erase.get("ok", false), "The configured erase tile was unavailable")
	var base_tile: int = int(erase.result.eraseTile)
	workspace.tiles_dock.select_tile(5)
	workspace.set_tool("paint")
	author.clear_selection(); author.options.shape = "line"; author._accept_options(author.options)
	await _drag(author, Vector2i(10, 10), Vector2i(14, 10))
	_check(_tiles(shell)[910] == 5 and _tiles(shell)[914] == 5, "Line gesture did not paint endpoints")
	workspace.set_tool("erase"); await _drag(author, Vector2i(10, 10), Vector2i(14, 10))
	_check(_tiles(shell)[910] == base_tile and _tiles(shell)[914] == base_tile, "Erase did not use this map's configured base tile")
	author.options.shape = "rectangle"; workspace.set_tool("select")
	await _drag(author, Vector2i(10, 10), Vector2i(14, 10))
	workspace.set_tool("fill"); await _drag(author, Vector2i(10, 10), Vector2i(10, 10))
	_check(_tiles(shell)[910] == 5 and _tiles(shell)[914] == 5 and _tiles(shell)[915] == base_tile, "Flood fill escaped its selected-cell mask")
	var center: int = int(_tiles(shell)[22*90+22])
	author.options.shape = "ellipse"; author.options.filled = false; author._accept_options(author.options)
	await _drag(author, Vector2i(20, 20), Vector2i(24, 24))
	_check(_tiles(shell)[22*90+22] == center, "Outline ellipse filled its interior")


func _failure_recovery(shell, author) -> void:
	author.options.replaceTile = 5
	author.selected = [{"x":10,"y":10}]
	# Choose a different destination without changing the retained source match.
	shell._maps.paint.workspace.tiles_dock.select_tile(6)
	await author.review_selection("replace")
	var before := _tiles(shell); var revision: int = shell._session_view.revision
	shell._bridge.reject_intent = true
	await author.commit_selected()
	_check(author.has_unapplied_changes() and _tiles(shell) == before and shell._session_view.revision == revision, "Rejected area write lost its draft or mutated")
	shell._bridge.drop_intent = true; await author.commit_selected()
	_check(not author._pending.is_empty() and author._view.get_node("%ReconcileArea").visible, "Uncertain area write lacked recovery")
	var writes: int = shell._bridge.intent_writes
	await author.check_original()
	_check(not author.has_unapplied_changes() and shell._bridge.intent_writes == writes and _tiles(shell)[910] == 6, "Original area reconciliation replayed or lost the write")
	var origin: Dictionary = author._origin()
	author._begin_gesture(Vector2i(30, 30)); await shell._maps.document.load_map("land:0")
	await author._gesture_finished(Vector2i(30,30), Vector2i(31,30), [Vector2i(30,30),Vector2i(31,30)])
	_check(shell._bridge.intent_writes == writes and not author._matches(origin), "Stale gesture wrote to a new document")
	await shell._maps.document.load_map("land:1")


func _start(author, start: Vector2i) -> void:
	author._overlay.gesture_started.emit(start)


func _unsubmitted_recovery(shell, author) -> void:
	author.selected = [{"x":10,"y":10}]; author.options.replaceTile = 6
	shell._maps.paint.workspace.tiles_dock.select_tile(7)
	await author.review_selection("replace")
	var before: int = shell._bridge.intent_writes
	shell._bridge.drop_before_intent = true
	await author.commit_selected(); await author.check_original()
	_check(author.has_unapplied_changes() and author._pending.is_empty() and shell._bridge.intent_writes == before and _tiles(shell)[910] == 6, "Unsubmitted reconciliation retried or lost its retained draft")
	await author.commit_selected()
	_check(not author.has_unapplied_changes() and _tiles(shell)[910] == 7 and shell._bridge.intent_writes == before+1, "Explicit Apply after reconciliation did not commit exactly once")


func _pointer_and_keyboard(shell, author) -> void:
	author.options.shape = "rectangle"; shell._maps.paint.workspace.set_tool("select")
	var overlay: Control = author._overlay
	var canvas: ProvidenceMapCanvas = overlay.get_parent()
	var event := InputEventMouseButton.new(); event.button_index = MOUSE_BUTTON_LEFT; event.pressed = true
	event.position = canvas.cell_rect(Vector2i(35, 35)).get_center()
	overlay._gui_input(event)
	var movement := InputEventMouseMotion.new(); movement.position = canvas.cell_rect(Vector2i(37, 36)).get_center()
	overlay._gui_input(movement)
	event.pressed = false; event.position = movement.position; overlay._gui_input(event)
	await _settle_area(shell, author)
	_check(author.selected.size() == 6, "Pointer rectangle did not select exact bounds")
	var key := InputEventKey.new(); key.pressed = true; key.keycode = KEY_ENTER; overlay._gui_input(key)
	key.keycode = KEY_RIGHT; overlay._gui_input(key)
	key.keycode = KEY_ENTER; overlay._gui_input(key)
	await _settle_area(shell, author)
	_check(author.selected.size() == 2, "Keyboard Enter/arrow selection did not mirror pointer acceptance")
	var before: Array = author.selected.duplicate(true)
	key.keycode = KEY_ENTER; overlay._gui_input(key); key.keycode = KEY_DOWN; overlay._gui_input(key)
	key.keycode = KEY_ESCAPE; overlay._gui_input(key); await _settle_area(shell, author)
	_check(author.selected == before, "Keyboard Escape changed the accepted selection")
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport; await _frames(4)
		author._options.open(author.options, author._view.get_node("PaintTools/Shapes")); await _frames(2)
		_check(author._options.size.x <= root.size.x and author._options.size.y <= root.size.y, "Options do not fit certified viewport")
		author._options.close()


func _read_recovery(shell, author) -> void:
	author.selected = [{"x":10,"y":10}]
	var writes: int = shell._bridge.intent_writes
	shell._bridge.drop_preview = true
	await author.review_selection("paint")
	_check(not author._pending.is_empty() and author._pending.readOnly, "Lost preview did not offer read-only recovery")
	await author.check_original()
	_check(not author.has_unapplied_changes() and shell._bridge.intent_writes == writes and author.selected.size() == 1, "Preview recovery mutated or lost the accepted selection")


func _drag(author, start: Vector2i, end: Vector2i) -> void:
	_start(author, start)
	await author._gesture_finished(start, end, [start, end])


func _settle_area(shell, author) -> void:
	for index in 600:
		if not shell._operations.busy and not author._reading and author._queue.is_empty(): await process_frame; return
		await process_frame
	_check(false, "Area preview did not settle")

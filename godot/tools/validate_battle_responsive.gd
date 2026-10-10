extends SceneTree

var _view: ProvidenceBattleEditor
var _failed := false


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080), Vector2i(2560, 1440), Vector2i(3440, 1440)]:
		root.size = viewport
		_view = load("res://src/battle_editor.tscn").instantiate()
		_view.theme = load("res://theme/scenario_controls.tres")
		root.add_child(_view); _view.size = viewport
		_bind(); await _settle()
		var canvas: ProvidenceBattleCanvas = _view.get_node("%BattleCanvas")
		if not _geometry(canvas): return
		if not await _click_grid(canvas): return
		var generation := _view.draft.generation
		var palette: Control = _view.get_node("%MonsterPalette")
		var columns: int = palette.get_node("%Tiles").columns
		var width: float = _view.get_node("%PalettePanel").size.x
		await _drag_divider(180)
		if not _check(_view.get_node("%PalettePanel").size.x > width + 100 and palette.get_node("%Tiles").columns > columns, "Divider did not widen the gallery"): return
		if not _geometry(canvas): return
		if not await _click_grid(canvas): return
		var preferred: float = _view.get_node("%PalettePanel").size.x
		root.size.x += 120; _view.size = root.size; await _settle()
		if not _check(absf(_view.get_node("%PalettePanel").size.x - preferred) <= 1, "Window resize lost the chosen palette width"): return
		if not _check(_view.draft.generation == generation and not _view.has_unapplied_changes(), "Resizing changed the authored Battle"): return
		await _drag_divider(-10000)
		if not _check(_view.get_node("%PalettePanel").size.x >= 300 and _view.get_global_rect().end.x <= root.size.x + 1, "Divider overflowed minimum widths"): return
		await _drag_divider(10000)
		if not _check(canvas.size.x >= 492 and canvas.size.y >= 492, "Widening the palette displaced the usable grid"): return
		_view.free(); await process_frame
	print("PROVIDENCE_BATTLE_RESPONSIVE_OK viewports=4 centered-fit cells=169 real-divider adaptive-columns preserved-width draft-unchanged")
	quit()


func _bind() -> void:
	var grid: Array = []; grid.resize(169); grid.fill(0)
	_view.bind_document({"revision": 1, "battle": {"identity": "battle:2", "nativeId": 2, "grid": grid,
		"distance": 0, "messageBefore": 0, "messageAfter": 0, "battleMacro": 0}})
	var rows: Array = []
	for id in range(1, 218):
		rows.append({"nativeId": id, "label": "Monster %d" % id, "available": true, "reason": "",
			"monster": {"size": 0, "iconId": id}})
	_view.set_palette({"page": {"items": rows, "offset": 0, "total": 217, "placeableTotal": 217}})


func _geometry(canvas: ProvidenceBattleCanvas) -> bool:
	var board := canvas.grid_rect()
	if not _check(board.size.x == board.size.y and board.get_center().distance_to(canvas.size * 0.5) <= 1, "Grid is not centered and square"): return false
	if not _check(canvas.cell_size() == floorf((minf(canvas.size.x, canvas.size.y) - 48) / 13), "Grid did not fit its pane"): return false
	for slot in 169:
		if not _check(canvas._slot_at(canvas.rect_for_slot(slot).get_center()) == slot, "Scaled pointer coordinates changed cell %d" % slot): return false
	return _check(canvas._slot_at(board.position - Vector2.ONE) == -1 and canvas._slot_at(board.end) == -1, "Canvas margins target an authored cell")


func _click_grid(canvas: ProvidenceBattleCanvas) -> bool:
	for slot in [0, 84, 168]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.position = canvas.global_position + canvas.rect_for_slot(slot).get_center()
		for pressed in [true, false]:
			event.pressed = pressed; root.push_input(event, true); await process_frame
		if not _check(canvas.selected_slot == slot, "Actual click missed scaled cell %d" % slot): return false
	return true


func _drag_divider(delta: float) -> void:
	var divider: Control = _view.get_node("%Body").get_drag_area_controls()[0]
	var start := divider.get_global_rect().get_center()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT; press.pressed = true; press.position = start
	root.push_input(press, true); await process_frame
	var motion := InputEventMouseMotion.new()
	motion.position = start + Vector2(delta, 0); motion.relative = Vector2(delta, 0)
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	root.push_input(motion, true); await process_frame
	press.pressed = false; press.position = motion.position
	root.push_input(press, true); await _settle()


func _settle() -> void:
	for frame in 5: await process_frame


func _check(value: bool, message: String) -> bool:
	if value: return true
	_failed = true; push_error("PROVIDENCE_BATTLE_RESPONSIVE_FAILED: " + message); quit(1)
	return false

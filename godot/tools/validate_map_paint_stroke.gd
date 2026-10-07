extends SceneTree

const Stroke = preload("res://src/map_paint_stroke.gd")
const Canvas = preload("res://src/map_canvas.gd")

var _failed := false
var _commits: Array = []
var _cancels := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_check_cells()
	var canvas := Canvas.new()
	canvas.position = Vector2(73, 41)
	canvas.size = Vector2(900, 700)
	root.add_child(canvas)
	await process_frame
	var tiles: Array = []
	tiles.resize(8100)
	tiles.fill(1)
	canvas.set_document(tiles, [])
	canvas.zoom_fit()
	canvas.set_interaction_mode("paint")
	canvas.paint_stroke_started.connect(func(): canvas.set_paint_preview_tile(42))
	canvas.paint_stroke_requested.connect(func(cells: Array): _commits.append(cells))
	canvas.paint_stroke_cancelled.connect(func(): _cancels += 1)
	_press(canvas, Vector2i(2, 3))
	_motion(canvas, Vector2i(8, 3))
	_motion(canvas, Vector2i(2, 3))
	_check(_commits.is_empty() and canvas._tiles[272] == 1 and canvas._paint_stroke.cells.size() == 7, "A preview mutated applied tiles, committed early or repeated coordinates")
	_release_global(canvas, Vector2i(8, 3))
	_check(_commits.size() == 1 and _commits[0].size() == 7 and not canvas._paint_preview_enabled, "Release did not emit one complete deduplicated stroke")
	_release_global(canvas, Vector2i(8, 3))
	_check(_commits.size() == 1, "A repeated release committed again")
	_check_cancellations(canvas, tiles)
	_check_transformed_strokes(canvas)
	canvas.free()
	if not _failed: print("PROVIDENCE_MAP_PAINT_STROKE_OK bounds=8100 interpolation=continuous dedup=exact preview=temporary cancel=guarded capture=global")
	quit(1 if _failed else 0)


func _check_cancellations(canvas, tiles: Array) -> void:
	_press(canvas, Vector2i(3, 4))
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	canvas._input(escape)
	_release_global(canvas, Vector2i(3, 4))
	_check(_cancels == 1 and _commits.size() == 1 and canvas._tiles[363] == 1, "Escape did not cancel without a mutation")
	_press(canvas, Vector2i(3, 4))
	root.focus_exited.emit()
	_check(not canvas._paint_stroke.active and _cancels == 2, "Window focus loss retained a stroke")
	_press(canvas, Vector2i(3, 4))
	canvas.hide()
	_check(not canvas._paint_stroke.active and _cancels == 3, "Hiding the document retained a stroke")
	canvas.show()
	_press(canvas, Vector2i(3, 4))
	canvas.set_document(tiles, [])
	_check(not canvas._paint_stroke.active and _cancels == 4, "Changing the map retained a stroke")
	_press(canvas, Vector2i(3, 4))
	canvas.set_interaction_mode("select")
	_check(not canvas._paint_stroke.active and _cancels == 5, "Changing tools retained a stroke")
	canvas.set_interaction_mode("paint")
	_press(canvas, Vector2i(3, 4))
	var missing_release := InputEventMouseMotion.new()
	canvas._gui_input(missing_release)
	_check(not canvas._paint_stroke.active and _cancels == 6, "Lost left-button capture retained a stroke")


func _check_transformed_strokes(canvas) -> void:
	canvas.zoom_in()
	canvas.reveal_cell(40, 40)
	_press(canvas, Vector2i(40, 40))
	_motion(canvas, Vector2i(44, 43))
	_release_global(canvas, Vector2i(44, 43))
	_check(_commits.size() == 2 and _commits[1].front() == Vector2i(40, 40) and _commits[1].back() == Vector2i(44, 43), "Zoom/pan/global input changed stroke coordinates")
	_press(canvas, Vector2i(40, 40))
	var outside := InputEventMouseButton.new()
	outside.button_index = MOUSE_BUTTON_LEFT
	outside.position = Vector2(-10, -10)
	canvas._input(outside)
	_check(_commits.size() == 3 and _commits[2] == [Vector2i(40, 40)], "Release outside the canvas lost or extended the captured stroke")


func _check_cells() -> void:
	var stroke := Stroke.new()
	stroke.begin(Vector2i(0, 0))
	stroke.append(Vector2i(89, 89))
	_check(stroke.cells.size() == 90, "A fast diagonal stroke left gaps")
	stroke.append(Vector2i(0, 0))
	_check(stroke.cells.size() == 90, "Revisiting cells duplicated the command")
	stroke.append(Vector2i(-1, 4))
	stroke.append(Vector2i(89, 0))
	_check(stroke.cells.size() == 91, "Reentering the map painted a bridge across the outside gap")
	stroke.begin(Vector2i(0, 0))
	for y in 90:
		for x in 90: stroke.append(Vector2i(x, y))
	_check(stroke.cells.size() == 8100, "The whole-map gesture was truncated or unbounded")
	for cell: Vector2i in stroke.cells:
		_check(cell.x >= 0 and cell.y >= 0 and cell.x < 90 and cell.y < 90, "An out-of-map coordinate entered the stroke")
	stroke.clear()
	_check(not stroke.active and stroke.cells.is_empty(), "Clearing the stroke retained draft cells")


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


func _release_global(canvas, cell: Vector2i) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = canvas.get_global_transform_with_canvas() * _position(canvas, cell)
	canvas._input(event)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_MAP_PAINT_STROKE_FAILED " + message)

extends Control

signal gesture_started(cell: Vector2i)
signal gesture_changed(start: Vector2i, end: Vector2i, positions: Array)
signal gesture_finished(start: Vector2i, end: Vector2i, positions: Array)
signal gesture_canceled
signal pointer_cell_changed(cell: Vector2i)

var selected: Array = []
var preview: Array = []
var painted: Array = []
var protected: Array = []
var unresolved: Array = []
var original_mask: Array = []
var added: Array = []
var removed: Array = []
var retiled: Array = []
var _special_textures: Dictionary = {}
var active := false
var _locked := false
var _anchor := Vector2i(-1, -1)
var _endpoint := Vector2i(-1, -1)
var _positions: Array = []
var _cursor := Vector2i.ZERO
var _hover_cell := Vector2i(-1,-1)
var _canvas: ProvidenceMapCanvas
var _outline_cells: Dictionary = {}
var _draw_origin := Rect2()
var _visible_cells := Rect2i()


func _ready() -> void:
	_canvas = get_parent()
	_canvas.draw.connect(queue_redraw)
	focus_mode = FOCUS_ALL
	mouse_filter = MOUSE_FILTER_IGNORE
	clip_contents = true
	mouse_exited.connect(func(): _hover_cell = Vector2i(-1,-1); pointer_cell_changed.emit(_hover_cell))


func set_active(enabled: bool) -> void:
	cancel_gesture()
	active = enabled
	_hover_cell = Vector2i(-1,-1)
	mouse_filter = MOUSE_FILTER_PASS if enabled else MOUSE_FILTER_IGNORE
	if enabled: grab_focus()


func set_locked(locked: bool) -> void:
	_locked = locked
	mouse_filter = MOUSE_FILTER_STOP if locked else MOUSE_FILTER_PASS if active else MOUSE_FILTER_IGNORE


func cancel_gesture() -> void:
	_anchor = Vector2i(-1, -1); _endpoint = _anchor; _positions.clear()
	preview.clear(); painted.clear(); protected.clear(); unresolved.clear()
	original_mask.clear(); added.clear(); removed.clear(); retiled.clear()
	_outline_cells.clear()
	_special_textures.clear()
	queue_redraw()


func show_preview(cells: Array, projection: Dictionary = {}) -> void:
	preview = cells.duplicate(true)
	painted = projection.get("terrainCells", []).duplicate(true)
	protected = projection.get("protectedCells", []).duplicate(true)
	unresolved = projection.get("unresolvedCells", []).duplicate(true)
	original_mask = projection.get("originalMask", []).duplicate(true)
	_outline_cells.clear()
	for cell: Dictionary in original_mask: _outline_cells[Vector2i(int(cell.x), int(cell.y))] = true
	added = projection.get("addedCells", []).duplicate(true)
	removed = projection.get("removedCells", []).duplicate(true)
	retiled = projection.get("retiledNeighbors", []).duplicate(true)
	mouse_filter = MOUSE_FILTER_STOP if _locked else MOUSE_FILTER_PASS if active or not preview.is_empty() else MOUSE_FILTER_IGNORE
	_special_textures = preload("res://src/paint_resource_art.gd").special_textures(projection.get("specialPreviews",[]))
	queue_redraw()


func accept_selection(cells: Array) -> void:
	selected = cells.duplicate(true)
	preview.clear(); painted.clear(); protected.clear(); unresolved.clear()
	original_mask.clear(); added.clear(); removed.clear(); retiled.clear()
	_outline_cells.clear()
	queue_redraw()


func _cell(position: Vector2) -> Vector2i:
	var origin := _canvas.cell_rect(Vector2i.ZERO)
	return Vector2i((position - origin.position) / origin.size).clamp(Vector2i.ZERO, Vector2i(89, 89))


func _gui_input(event: InputEvent) -> void:
	if not active or _locked: return
	if event is InputEventKey: _keyboard(event); return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			var origin := _canvas.cell_rect(Vector2i.ZERO)
			if not Rect2(origin.position, origin.size * 90).has_point(event.position): return
			_anchor = _cell(event.position); _endpoint = _anchor; _positions = [_anchor]
			_cursor = _anchor
			grab_focus(); gesture_started.emit(_anchor)
			gesture_changed.emit(_anchor, _endpoint, _positions.duplicate())
		elif _anchor.x >= 0:
			_add_endpoint(_cell(event.position))
			gesture_finished.emit(_anchor, _endpoint, _positions.duplicate())
			_anchor = Vector2i(-1, -1); _positions.clear()
		accept_event()
	elif event is InputEventMouseMotion and _anchor.x >= 0:
		if _add_endpoint(_cell(event.position)):
			gesture_changed.emit(_anchor, _endpoint, _positions.duplicate())
		accept_event()
	elif event is InputEventMouseMotion:
		var origin := _canvas.cell_rect(Vector2i.ZERO)
		var cell := _cell(event.position) if Rect2(origin.position,origin.size*90).has_point(event.position) else Vector2i(-1,-1)
		if cell != _hover_cell: _hover_cell = cell; pointer_cell_changed.emit(cell)
	elif event.is_action_pressed("ui_cancel"):
		cancel_gesture(); gesture_canceled.emit(); accept_event()


func _add_endpoint(cell: Vector2i) -> bool:
	if cell == _endpoint: return false
	_endpoint = cell
	_cursor = cell
	if (_positions.is_empty() or _positions.back() != cell) and _positions.size() < 8100: _positions.append(cell)
	return true


func _keyboard(event: InputEventKey) -> void:
	if not event.pressed or event.echo or event.ctrl_pressed or event.alt_pressed or event.meta_pressed: return
	var moves := {KEY_LEFT: Vector2i.LEFT, KEY_RIGHT: Vector2i.RIGHT, KEY_UP: Vector2i.UP, KEY_DOWN: Vector2i.DOWN}
	if moves.has(event.keycode):
		_cursor = (_cursor + moves[event.keycode]).clamp(Vector2i.ZERO, Vector2i(89, 89))
		_canvas.select_cell(_cursor.x, _cursor.y, true, false)
		if _anchor.x >= 0:
			_add_endpoint(_cursor); gesture_changed.emit(_anchor, _endpoint, _positions.duplicate())
		accept_event()
	elif event.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]:
		if _anchor.x < 0:
			_anchor = _cursor; _endpoint = _cursor; _positions = [_cursor]
			gesture_started.emit(_cursor); gesture_changed.emit(_anchor, _endpoint, _positions.duplicate())
		else:
			gesture_finished.emit(_anchor, _endpoint, _positions.duplicate()); _anchor = Vector2i(-1, -1); _positions.clear()
		accept_event()
	elif event.keycode == KEY_ESCAPE:
		cancel_gesture(); gesture_canceled.emit(); accept_event()


func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_VISIBILITY_CHANGED] and is_inside_tree():
		cancel_gesture(); gesture_canceled.emit()


func _draw() -> void:
	if _canvas == null: return
	_draw_origin = _canvas.cell_rect(Vector2i.ZERO)
	_visible_cells = _canvas.visible_cell_bounds()
	_draw_cells(selected, Color(0.6, 0.8, 1, 0.65))
	_draw_cells(preview, Color(0.95, 0.76, 0.39, 0.8))
	_draw_cells(protected, Color(0.88, 0.52, 0.44, 0.8))
	# Preview artwork comes from the same source-resolved atlas as the owning map.
	for cell: Dictionary in painted:
		var coordinate := Vector2i(int(cell.x), int(cell.y))
		if not _visible_cells.has_point(coordinate): continue
		var texture: Texture2D = _special_textures.get(int(cell.tile)) if int(cell.tile)<0 else _canvas.terrain_texture(int(cell.tile))
		if texture != null: draw_texture_rect(texture, _rectangle(coordinate), false, Color(1, 1, 1, 0.8))
	_draw_markers(protected, "P", Color(0.95, 0.76, 0.39))
	_draw_cells(added,Color(0.3,0.9,0.6,0.8)); _draw_markers(added,"+",Color(0.3,1,0.6))
	_draw_cells(removed,Color(1,0.55,0.45,0.8)); _draw_markers(removed,"−",Color(1,0.6,0.45))
	_draw_cells(retiled,Color(0.4,0.7,1,0.8)); _draw_markers(retiled,"~",Color(0.4,0.8,1))
	_draw_outline()
	_draw_markers(unresolved, "!", Color(0.95, 0.76, 0.39))


func _draw_markers(cells: Array, marker: String, color: Color) -> void:
	var font := get_theme_default_font()
	for cell: Dictionary in cells:
		var coordinate := Vector2i(int(cell.x), int(cell.y))
		if not _visible_cells.has_point(coordinate): continue
		var rectangle := _rectangle(coordinate)
		draw_rect(rectangle, color, false, 2)
		var font_size := clampi(int(rectangle.size.y * 0.6), 10, 22)
		draw_string(font, rectangle.position + Vector2(3, rectangle.size.y - 3), marker, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)


func _get_tooltip(position: Vector2) -> String:
	if _canvas == null: return ""
	var coordinate := _cell(position)
	for cell: Dictionary in protected:
		if coordinate == Vector2i(int(cell.x), int(cell.y)): return "Cell %d, %d · Protected · Existing special artwork is kept unchanged." % [coordinate.x, coordinate.y]
	for cell: Dictionary in unresolved:
		if coordinate == Vector2i(int(cell.x), int(cell.y)): return "Cell %d, %d · Approximate transition · Apply keeps the previewed tile." % [coordinate.x, coordinate.y]
	return ""


func _draw_cells(cells: Array, color: Color) -> void:
	for cell: Dictionary in cells:
		var coordinate := Vector2i(int(cell.x), int(cell.y))
		if not _visible_cells.has_point(coordinate): continue
		var rectangle := _rectangle(coordinate)
		draw_rect(rectangle, Color(color, 0.16)); draw_rect(rectangle, color, false, 1)


func _draw_outline() -> void:
	for cell: Vector2i in _outline_cells:
		if not _visible_cells.has_point(cell): continue
		var rect := _rectangle(cell)
		var corners := [rect.position,rect.position+Vector2(rect.size.x,0),rect.end,rect.position+Vector2(0,rect.size.y)]
		var directions := [Vector2i.UP,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.LEFT]
		for side in 4:
			if not _outline_cells.has(cell+directions[side]): draw_line(corners[side],corners[(side+1)%4],Color("ffd166"),2)


func _rectangle(cell: Vector2i) -> Rect2:
	return Rect2(_draw_origin.position + Vector2(cell) * _draw_origin.size, _draw_origin.size)

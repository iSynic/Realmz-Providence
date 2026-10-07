class_name ProvidenceBattleCanvas
extends Control

signal cell_selected(slot: int)
signal cell_action(mode: String, slot: int)
signal gesture_started
signal gesture_finished
signal gesture_cancelled

var grid: Array = []
var monsters: Dictionary = {}
var art: Dictionary = {}
var mode := "select"
var brush := 0
var selected_slot := -1
var locked := true
var _hover := -1
var _dragging := false
var _last_slot := -1


func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	focus_exited.connect(cancel_gesture)
	get_window().focus_exited.connect(cancel_gesture)
	mouse_exited.connect(func():
		_hover = -1
		queue_redraw())


func bind(values: Array, rows: Dictionary) -> void:
	grid = values.duplicate()
	monsters = rows.duplicate(true)
	queue_redraw()


func receive_art(icon_id: int, projection: Dictionary) -> void:
	art[icon_id] = projection
	queue_redraw()


func cell_size() -> float:
	return minf(44.0, minf((size.x - 24.0) / 13.0, (size.y - 24.0) / 13.0))


func footprint(id: int) -> Vector2i:
	var row: Dictionary = monsters.get(absi(id), {})
	var record: Dictionary = row.get("monster", {}) if row.get("monster") is Dictionary else {}
	return preload("res://src/battle_monster_presentation.gd").footprint(record)


func rect_for_slot(slot: int, dimensions := Vector2i.ONE) -> Rect2:
	var step := cell_size()
	var cell := Vector2i(slot / 13, slot % 13)
	return Rect2(Vector2(24, 24) + Vector2(cell - dimensions + Vector2i.ONE) * step, Vector2(dimensions) * step)


func visible_anchor(slot: int) -> int:
	if slot < 0 or slot >= grid.size():
		return -1
	var point := rect_for_slot(slot).get_center()
	for index in range(grid.size() - 1, -1, -1):
		if int(grid[index]) != 0 and rect_for_slot(index, footprint(int(grid[index]))).has_point(point):
			return index
	return slot


func _draw() -> void:
	var step := cell_size()
	if step <= 0:
		return
	var text := get_theme_color("font_color", "Label")
	var muted := text.darkened(0.35)
	var panel := get_theme_stylebox("panel", "PanelContainer") as StyleBoxFlat
	var background := panel.bg_color if panel != null else Color("0a1219")
	var border := panel.border_color if panel != null else Color("27313c")
	var selection := get_theme_stylebox("pressed", "Button") as StyleBoxFlat
	var accent := selection.border_color if selection != null else Color("9dcfff")
	draw_rect(Rect2(Vector2(24, 24), Vector2.ONE * step * 13), background)
	for index in 14:
		draw_line(Vector2(24 + step * index, 24), Vector2(24 + step * index, 24 + step * 13), border)
		draw_line(Vector2(24, 24 + step * index), Vector2(24 + step * 13, 24 + step * index), border)
	for index in 13:
		draw_string(get_theme_default_font(), Vector2(24 + step * index + 8, 16), str(index), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, muted)
		draw_string(get_theme_default_font(), Vector2(2, 24 + step * index + 18), str(index), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, muted)
	_draw_occupants(text, accent)
	if selected_slot >= 0:
		draw_rect(rect_for_slot(selected_slot), accent, false, 2)
	if _hover >= 0 and mode in ["paint", "move"] and brush != 0 and not locked:
		var slot := _clamped_anchor(_hover, footprint(brush))
		draw_rect(rect_for_slot(slot, footprint(brush)), accent, false, 2)


func _draw_occupants(text: Color, accent: Color) -> void:
	for slot in grid.size():
		var value := int(grid[slot])
		if value == 0:
			continue
		var row: Dictionary = monsters.get(absi(value), {})
		var record: Dictionary = row.get("monster", {}) if row.get("monster") is Dictionary else {}
		var texture: Texture2D = art.get(int(record.get("iconId", 0)), {}).get("texture")
		var area := rect_for_slot(slot, footprint(value))
		if texture != null and not record.is_empty():
			draw_texture_rect(texture, area.grow(-2), false)
		else:
			draw_string(get_theme_default_font(), area.position + Vector2(3, 18), "?%d" % absi(value), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, text)
		if value < 0:
			draw_rect(area.grow(-1), accent, false, 1)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventKey:
		_handle_key(event)
	elif event is InputEventMouseMotion:
		_hover = _slot_at(event.position)
		if _dragging:
			_act(_hover)
		queue_redraw()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			grab_focus()
			if locked:
				return
			var slot := _slot_at(event.position)
			if slot < 0:
				return
			if mode == "select":
				_select(visible_anchor(slot))
			else:
				_dragging = true
				_last_slot = -1
				gesture_started.emit()
				_act(slot)
		elif _dragging:
			_dragging = false
			gesture_finished.emit()
		accept_event()


func _handle_key(event: InputEvent) -> void:
	if not has_focus() or not event.is_pressed():
		return
	if event.is_action_pressed("ui_cancel"):
		cancel_gesture()
		accept_event()
		return
	if locked:
		return
	var slot := maxi(0, selected_slot)
	var cell := Vector2i(slot / 13, slot % 13)
	if event.is_action_pressed("ui_left"):
		cell.x = maxi(0, cell.x - 1)
	elif event.is_action_pressed("ui_right"):
		cell.x = mini(12, cell.x + 1)
	elif event.is_action_pressed("ui_up"):
		cell.y = maxi(0, cell.y - 1)
	elif event.is_action_pressed("ui_down"):
		cell.y = mini(12, cell.y + 1)
	elif event is InputEventKey and event.keycode == KEY_DELETE:
		gesture_started.emit()
		cell_action.emit("erase", visible_anchor(slot))
		gesture_finished.emit()
	elif event.is_action_pressed("ui_accept"):
		if mode == "select":
			cell_selected.emit(slot)
		else:
			gesture_started.emit()
			_last_slot = -1
			_act(slot)
			gesture_finished.emit()
	else:
		return
	_select(cell.x * 13 + cell.y)
	accept_event()


func cancel_gesture() -> void:
	if not _dragging and mode != "move":
		return
	_dragging = false
	_last_slot = -1
	gesture_cancelled.emit()
	queue_redraw()


func _act(slot: int) -> void:
	if slot < 0 or slot == _last_slot:
		return
	_last_slot = slot
	if mode == "erase":
		slot = visible_anchor(slot)
	elif mode in ["paint", "move"]:
		slot = _clamped_anchor(slot, footprint(brush))
	cell_action.emit(mode, slot)


func _select(slot: int) -> void:
	selected_slot = slot
	cell_selected.emit(slot)
	queue_redraw()


func _slot_at(point: Vector2) -> int:
	var cell := Vector2i(floori((point.x - 24) / cell_size()), floori((point.y - 24) / cell_size()))
	return cell.x * 13 + cell.y if cell.x >= 0 and cell.x < 13 and cell.y >= 0 and cell.y < 13 else -1


func _clamped_anchor(slot: int, dimensions: Vector2i) -> int:
	return maxi(dimensions.x - 1, slot / 13) * 13 + maxi(dimensions.y - 1, slot % 13)
